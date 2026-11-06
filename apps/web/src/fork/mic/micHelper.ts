import { useSyncExternalStore } from "react";
import {
  type DeviceHubAccess,
  resolveDeviceHubAccess,
  withDeviceHubQuery,
} from "@t3tools/client-runtime/state/deviceHubAccess";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentSession } from "~/state/session";
import { transcriptToInsert } from "./micLogic";

// The mic talks to the environment that owns the chat (PC chat -> PC, VPS chat -> VPS).
// Must match MIC_ROUTE_PREFIX in apps/server/src/fork/MicProxy.ts.
const MIC_BASE_PATH = "/api/fork/mic";

export type MicHelperStatus = "unknown" | "online" | "offline";

const TRANSCRIBE_TIMEOUT_MS = 300_000;
const RECHECK_AFTER_MS = 15_000;

interface HelperEntry {
  status: MicHelperStatus;
  checkedAt: number;
  inflight: Promise<boolean> | null;
}

// One shared health record per environment, so every composer on screen asks once.
const entries = new Map<string, HelperEntry>();
const listeners = new Set<() => void>();

function entryFor(environmentId: string): HelperEntry {
  let entry = entries.get(environmentId);
  if (!entry) {
    entry = { status: "unknown", checkedAt: 0, inflight: null };
    entries.set(environmentId, entry);
  }
  return entry;
}

function setStatus(environmentId: string, status: MicHelperStatus) {
  const entry = entryFor(environmentId);
  entry.checkedAt = Date.now();
  if (entry.status === status) return;
  entry.status = status;
  for (const listener of listeners) listener();
}

const micAccessAtom = Atom.family((environmentId: EnvironmentId) =>
  connectionAtomRuntime
    .atom((get) => {
      const prepared = Option.getOrNull(
        get(environmentSession.preparedConnectionValueAtom(environmentId)),
      );
      if (prepared === null) return Effect.never;
      return resolveDeviceHubAccess({ prepared, hubBasePath: MIC_BASE_PATH });
    })
    .pipe(Atom.setIdleTTL(60_000), Atom.withLabel(`fork-mic-access:${environmentId}`)),
);

function readMicAccess(
  environmentId: EnvironmentId,
  refresh: boolean,
): Promise<DeviceHubAccess | null> {
  const atom = micAccessAtom(environmentId);
  if (refresh) appAtomRegistry.refresh(atom);
  return Effect.runPromise(
    AtomRegistry.getResult(appAtomRegistry, atom, { suspendOnWaiting: true }).pipe(
      Effect.timeout("10 seconds"),
      Effect.orElseSucceed(() => null),
    ),
  );
}

async function micRequest(
  environmentId: EnvironmentId,
  path: string,
  init: { method: "GET" | "POST"; body?: Blob; timeoutMs: number },
): Promise<{ response: Response; body: unknown }> {
  // A media ticket can expire between requests; one fresh ticket retries an auth failure.
  for (const refresh of [false, true]) {
    const access = await readMicAccess(environmentId, refresh);
    if (!access) throw new MicTranscribeError("offline", "Can't reach this computer right now.");
    const response = await fetch(withDeviceHubQuery(`${access.httpBase}${path}`, access), {
      method: init.method,
      cache: "no-store",
      credentials: access.credentials ? "include" : "same-origin",
      ...(init.body
        ? { body: init.body, headers: { "Content-Type": init.body.type || "audio/webm" } }
        : {}),
      signal: AbortSignal.timeout(init.timeoutMs),
    });
    if (response.status === 401 && !refresh) continue;
    const body: unknown = await response.json().catch(() => null);
    return { response, body };
  }
  throw new MicTranscribeError("offline", "Can't reach this computer right now.");
}

export function checkMicHelper(
  environmentId: EnvironmentId,
  options?: { force?: boolean },
): Promise<boolean> {
  const entry = entryFor(environmentId);
  if (entry.inflight) return entry.inflight;
  if (
    !options?.force &&
    entry.status !== "unknown" &&
    Date.now() - entry.checkedAt < RECHECK_AFTER_MS
  ) {
    return Promise.resolve(entry.status === "online");
  }
  const request = micRequest(environmentId, "/health", { method: "GET", timeoutMs: 5_000 })
    .then(
      ({ response, body }) =>
        response.ok &&
        typeof body === "object" &&
        body !== null &&
        "ok" in body &&
        body.ok === true,
    )
    .catch(() => false)
    .then((online) => {
      entry.inflight = null;
      setStatus(environmentId, online ? "online" : "offline");
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

export function useMicHelperStatus(environmentId: EnvironmentId): MicHelperStatus {
  return useSyncExternalStore(
    subscribe,
    () => entryFor(environmentId).status,
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

export interface MicResult {
  /** What goes in the message box: the rewrite, or the exact words if the rewrite failed. */
  readonly text: string;
  readonly rewritten: boolean;
  readonly warning: string | null;
}

export async function transcribeWithHelper(
  target: {
    readonly environmentId: EnvironmentId;
    readonly threadId: string | null;
    readonly projectId: string | null;
  },
  audio: Blob,
): Promise<MicResult> {
  const query = new URLSearchParams();
  if (target.threadId) query.set("threadId", target.threadId);
  if (target.projectId) query.set("projectId", target.projectId);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  let result: { response: Response; body: unknown };
  try {
    result = await micRequest(target.environmentId, `/transcribe${suffix}`, {
      method: "POST",
      body: audio,
      timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof MicTranscribeError) throw error;
    setStatus(target.environmentId, "offline");
    throw new MicTranscribeError(
      "offline",
      error instanceof Error && error.name === "TimeoutError"
        ? "Listening took too long."
        : "Couldn't reach this computer.",
    );
  }
  const { response, body } = result;
  const field = (name: string): unknown =>
    typeof body === "object" && body !== null && name in body
      ? (body as Record<string, unknown>)[name]
      : undefined;
  if (response.status === 503) {
    setStatus(target.environmentId, "offline");
    const error = field("error");
    throw new MicTranscribeError(
      "offline",
      typeof error === "string" ? error : "Scar Mic isn't running.",
    );
  }
  setStatus(target.environmentId, "online");
  if (!response.ok) {
    const error = field("error");
    throw new MicTranscribeError(
      "failed",
      typeof error === "string" ? error : `HTTP ${response.status}`,
    );
  }
  const warning = field("warning");
  return {
    text: transcriptToInsert(field("text")),
    rewritten: field("rewritten") === true,
    warning: typeof warning === "string" ? warning : null,
  };
}
