"""Scar Mic: a small local speech-to-text helper for the T3 Code fork's mic button.

It listens on 127.0.0.1 only. The T3 Code server on the same machine sends it the
recording after you stop talking and gets plain text back.

  GET  /health      -> {"ok": true, "model": "..."}
  POST /transcribe  -> body = audio (webm/ogg/wav/mp4), answer {"text": "...", "ms": 123}

Model: NVIDIA Parakeet TDT 0.6B v3 (int8, offline, via sherpa-onnx). It hears the
whole recording at once, which is far more accurate than the live streaming model.

Settings come from environment variables (all optional):
  SCAR_MIC_HOME     runtime folder holding models/ (default: %LOCALAPPDATA%/ScarMic or ~/.local/share/scar-mic)
  SCAR_MIC_PORT     port to listen on (default 47811)
  SCAR_MIC_THREADS  CPU threads for the model (default: half the cores, at least 2)
  SCAR_MIC_FFMPEG   path to ffmpeg (default: "ffmpeg" on PATH)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import sherpa_onnx

SAMPLE_RATE = 16_000
MAX_BODY_BYTES = 64 * 1024 * 1024
MODEL_DIR_NAME = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
# Parakeet is happiest with chunks well under a minute; cut at quiet spots near this length.
CHUNK_TARGET_S = 24.0
CHUNK_SEARCH_S = 6.0


def default_home() -> Path:
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "ScarMic"
    return Path.home() / ".local" / "share" / "scar-mic"


HOME = Path(os.environ.get("SCAR_MIC_HOME") or default_home())
PORT = int(os.environ.get("SCAR_MIC_PORT") or 47811)
THREADS = int(os.environ.get("SCAR_MIC_THREADS") or max(2, (os.cpu_count() or 4) // 2))
FFMPEG = os.environ.get("SCAR_MIC_FFMPEG") or "ffmpeg"


def load_recognizer() -> sherpa_onnx.OfflineRecognizer:
    model_dir = HOME / "models" / MODEL_DIR_NAME
    if not model_dir.is_dir():
        sys.exit(f"Speech model not found at {model_dir}. Run the install script first.")
    return sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=str(model_dir / "encoder.int8.onnx"),
        decoder=str(model_dir / "decoder.int8.onnx"),
        joiner=str(model_dir / "joiner.int8.onnx"),
        tokens=str(model_dir / "tokens.txt"),
        num_threads=THREADS,
        sample_rate=SAMPLE_RATE,
        feature_dim=128,
        decoding_method="greedy_search",
        model_type="nemo_transducer",
    )


def decode_audio(data: bytes) -> np.ndarray:
    """Any browser recording -> 16 kHz mono float32, via ffmpeg."""
    result = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "pipe:1"],
        input=data,
        capture_output=True,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0:
        raise ValueError("Couldn't read the recording: " + result.stderr.decode(errors="replace")[-300:])
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def normalize(samples: np.ndarray) -> np.ndarray:
    """Quiet mics (the owner's peaks sit near -17 dB) get lifted to a steady level."""
    if samples.size == 0:
        return samples
    peak = float(np.percentile(np.abs(samples), 99.9))
    if peak <= 1e-4:
        return samples
    gain = min(0.5 / peak, 20.0)
    return np.clip(samples * gain, -1.0, 1.0)


def split_at_pauses(samples: np.ndarray) -> list[np.ndarray]:
    """Cut long recordings into ~24 s pieces, each cut placed at the quietest 100 ms nearby."""
    target = int(CHUNK_TARGET_S * SAMPLE_RATE)
    search = int(CHUNK_SEARCH_S * SAMPLE_RATE)
    frame = SAMPLE_RATE // 10
    chunks: list[np.ndarray] = []
    start = 0
    while samples.size - start > target + search:
        lo = start + target - search
        hi = start + target + search
        window = samples[lo:hi]
        frames = window[: (window.size // frame) * frame].reshape(-1, frame)
        quietest = int(np.argmin((frames**2).mean(axis=1)))
        cut = lo + quietest * frame + frame // 2
        chunks.append(samples[start:cut])
        start = cut
    chunks.append(samples[start:])
    return [c for c in chunks if c.size > SAMPLE_RATE // 10]


RECOGNIZER: sherpa_onnx.OfflineRecognizer | None = None
LOCK = threading.Lock()


def transcribe(data: bytes) -> str:
    samples = normalize(decode_audio(data))
    chunks = split_at_pauses(samples)
    if not chunks:
        return ""
    assert RECOGNIZER is not None
    with LOCK:
        streams = []
        for chunk in chunks:
            stream = RECOGNIZER.create_stream()
            stream.accept_waveform(SAMPLE_RATE, chunk)
            streams.append(stream)
        RECOGNIZER.decode_streams(streams)
        parts = [s.result.text.strip() for s in streams]
    return " ".join(p for p in parts if p)


class Handler(BaseHTTPRequestHandler):
    server_version = "ScarMic/1"

    def log_message(self, fmt: str, *args: object) -> None:  # quiet by default
        if os.environ.get("SCAR_MIC_VERBOSE"):
            super().log_message(fmt, *args)

    def _json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        if self.path.split("?")[0] == "/health":
            self._json(200, {"ok": True, "model": MODEL_DIR_NAME})
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path.split("?")[0] != "/transcribe":
            self._json(404, {"error": "Not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(400, {"error": "Send the recording as the request body."})
            return
        data = self.rfile.read(length)
        started = time.perf_counter()
        try:
            text = transcribe(data)
        except ValueError as error:
            self._json(400, {"error": str(error)})
            return
        except Exception as error:  # noqa: BLE001 - report, never crash the helper
            self._json(500, {"error": f"Transcription failed: {error}"})
            return
        self._json(200, {"text": text, "ms": int((time.perf_counter() - started) * 1000)})


def main() -> None:
    global RECOGNIZER
    if len(sys.argv) > 1 and sys.argv[1] != "serve":
        # Command-line test: python scar_mic.py file1.webm [file2 ...]
        RECOGNIZER = load_recognizer()
        for name in sys.argv[1:]:
            started = time.perf_counter()
            text = transcribe(Path(name).read_bytes())
            print(f"== {name} ({time.perf_counter() - started:.1f}s)\n{text}\n", flush=True)
        return
    RECOGNIZER = load_recognizer()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Scar Mic listening on http://127.0.0.1:{PORT} ({THREADS} threads)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
