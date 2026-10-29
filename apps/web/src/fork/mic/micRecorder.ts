import { levelFromSamples, pickRecorderMimeType } from "./micLogic";

const LEVEL_INTERVAL_MS = 80;

export interface MicRecording {
  readonly stop: () => Promise<Blob>;
  readonly cancel: () => void;
}

export async function startMicRecording(onLevel: (level: number) => void): Promise<MicRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  const mimeType = pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const levelTimer = window.setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    onLevel(levelFromSamples(samples));
  }, LEVEL_INTERVAL_MS);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    window.clearInterval(levelTimer);
    for (const track of stream.getTracks()) track.stop();
    void audioContext.close().catch(() => undefined);
  };

  recorder.start(250);

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        if (recorder.state === "inactive") {
          release();
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
          return;
        }
        recorder.addEventListener(
          "stop",
          () => {
            release();
            resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
          },
          { once: true },
        );
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
