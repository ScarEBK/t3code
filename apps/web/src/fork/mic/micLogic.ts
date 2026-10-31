export const DEFAULT_MIC_ENDPOINT = "http://127.0.0.1:47811";
export const MAX_RECORDING_MS = 10 * 60 * 1000;

export function normalizeMicEndpoint(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function resolveMicEndpoint(raw: string): string {
  return normalizeMicEndpoint(raw) ?? DEFAULT_MIC_ENDPOINT;
}

export function formatRecordingDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export function pickRecorderMimeType(isSupported: (mimeType: string) => boolean) {
  return RECORDER_MIME_TYPES.find((mimeType) => isSupported(mimeType));
}

/** RMS of 8-bit time-domain samples (silence = 128), mapped to 0..1 with speech near the top. */
export function levelFromSamples(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = ((samples[index] ?? 128) - 128) / 128;
    sum += centered * centered;
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, rms * 4);
}

export function transcriptToInsert(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

export type MicStartFailure = "permission-denied" | "no-microphone" | "unsupported" | "unknown";

export function classifyMicStartError(error: unknown): MicStartFailure {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "permission-denied";
    case "NotFoundError":
    case "OverconstrainedError":
    case "NotReadableError":
      return "no-microphone";
    case "TypeError":
      return "unsupported";
    default:
      return "unknown";
  }
}
