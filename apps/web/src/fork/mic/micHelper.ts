import { useSyncExternalStore } from "react";
import { transcriptToInsert } from "./micLogic";

export type MicHelperStatus = "unknown" | "online" | "offline";

const HEALTH_TIMEOUT_MS = 1_500;
const TRANSCRIBE_TIMEOUT_MS = 120_000;
const RECHECK_AFTER_MS = 15_000;

interface HelperEntry {
  status: MicHelperStatus;
  checkedAt: number;
  inflight: Promise<boolean> | null;
}

// One shared health record per endpoint, so every composer on screen asks once.
const entries = new Map<string, HelperEntry>();
const listeners = new Set<() => void>();

function entryFor(endpoint: string): HelperEntry {
  let entry = entries.get(endpoint);
  if (!entry) {
    entry = { status: "unknown", checkedAt: 0, inflight: null };
    entries.set(endpoint, entry);
  }
  return entry;
}

function setStatus(endpoint: string, status: MicHelperStatus) {
  const entry = entryFor(endpoint);
  entry.checkedAt = Date.now();
  if (entry.status === status) return;
  entry.status = status;
  for (const listener of listeners) listener();
}

export function checkMicHelper(endpoint: string, options?: { force?: boolean }): Promise<boolean> {
  const entry = entryFor(endpoint);
  if (entry.inflight) return entry.inflight;
  if (
    !options?.force &&
    entry.status !== "unknown" &&
    Date.now() - entry.checkedAt < RECHECK_AFTER_MS
  ) {
    return Promise.resolve(entry.status === "online");
  }
  const request = fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    .then(async (response) => {
      if (!response.ok) return false;
      const body: unknown = await response.json().catch(() => null);
      return typeof body === "object" && body !== null && "ok" in body && body.ok === true;
    })
    .catch(() => false)
    .then((online) => {
      entry.inflight = null;
      setStatus(endpoint, online ? "online" : "offline");
      return online;
    });
  entry.inflight = request;
  return request;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMicHelperStatus(endpoint: string): MicHelperStatus {
  return useSyncExternalStore(
    subscribe,
    () => entryFor(endpoint).status,
    () => "unknown" as const,
  );
}

export class MicTranscribeError extends Error {
  readonly kind: "offline" | "failed";
  constructor(kind: "offline" | "failed", message: string) {
    super(message);
    this.kind = kind;
  }
}

export async function transcribeWithHelper(endpoint: string, audio: Blob): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${endpoint}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: audio,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
  } catch (error) {
    setStatus(endpoint, "offline");
    throw new MicTranscribeError(
      "offline",
      error instanceof Error && error.name === "TimeoutError"
        ? "The speech helper took too long to answer."
        : "Couldn't reach the speech helper.",
    );
  }
  setStatus(endpoint, "online");
  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    // The timeout also covers reading the body; don't mistake it for an empty transcript.
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new MicTranscribeError("offline", "The speech helper took too long to answer.");
    }
  }
  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
    throw new MicTranscribeError("failed", detail);
  }
  return transcriptToInsert(
    typeof body === "object" && body !== null && "text" in body ? body.text : undefined,
  );
}
