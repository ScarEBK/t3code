import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useSyncExternalStore } from "react";

const SPLIT_STORAGE_KEY = "t3code:fork:split-view";
export const SPLIT_WIDTH_STORAGE_KEY = "t3code:fork:split-right-width";
/** Below this main-area width two chats don't fit; above PHONE it says so instead of hiding. */
const SPLIT_MIN_WIDTH = 960;
const SPLIT_PHONE_WIDTH = 640;
export const SPLIT_PANE_MIN_WIDTH = 420;

export type SplitLayoutMode = "split" | "too-narrow" | "phone";

export function splitLayoutMode(mainWidth: number): SplitLayoutMode {
  if (mainWidth >= SPLIT_MIN_WIDTH) return "split";
  if (mainWidth >= SPLIT_PHONE_WIDTH) return "too-narrow";
  return "phone";
}

export function sameThreadRef(
  left: ScopedThreadRef | null,
  right: ScopedThreadRef | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.environmentId === right.environmentId &&
    left.threadId === right.threadId
  );
}

export function parseStoredSplit(raw: string | null): ScopedThreadRef | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "environmentId" in value &&
      "threadId" in value &&
      typeof value.environmentId === "string" &&
      typeof value.threadId === "string" &&
      value.environmentId.length > 0 &&
      value.threadId.length > 0
    ) {
      return scopeThreadRef(value.environmentId as EnvironmentId, value.threadId as ThreadId);
    }
  } catch {}
  return null;
}

function readStorage(): ScopedThreadRef | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredSplit(window.localStorage.getItem(SPLIT_STORAGE_KEY));
  } catch {
    return null;
  }
}

let rightThread: ScopedThreadRef | null = readStorage();
let previousPrimary: ScopedThreadRef | null = null;
let currentPrimary: ScopedThreadRef | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setRight(next: ScopedThreadRef | null) {
  if (next === rightThread || (next !== null && sameThreadRef(next, rightThread))) return;
  rightThread = next;
  try {
    if (next) {
      window.localStorage.setItem(
        SPLIT_STORAGE_KEY,
        JSON.stringify({ environmentId: next.environmentId, threadId: next.threadId }),
      );
    } else {
      window.localStorage.removeItem(SPLIT_STORAGE_KEY);
    }
  } catch {}
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSplitRightThread(): ScopedThreadRef | null {
  return useSyncExternalStore(
    subscribe,
    () => rightThread,
    () => null,
  );
}

export function readSplitRightThread(): ScopedThreadRef | null {
  return rightThread;
}

export function openThreadOnRight(ref: ScopedThreadRef) {
  setRight(ref);
}

export function closeSplit() {
  setRight(null);
}

/** Remembers the last two chats shown on the left so the shortcut can pair them. */
export function notePrimaryThread(ref: ScopedThreadRef | null) {
  if (ref === null || sameThreadRef(ref, currentPrimary)) return;
  previousPrimary = currentPrimary;
  currentPrimary = ref;
}

export function readPreviousPrimaryThread(): ScopedThreadRef | null {
  return previousPrimary;
}

// Storage events keep two windows of the same app in step.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SPLIT_STORAGE_KEY) {
      rightThread = parseStoredSplit(event.newValue);
      notify();
    }
  });
}
