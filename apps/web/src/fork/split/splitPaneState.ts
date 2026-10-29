export type SecondaryPaneState = "loading" | "ready" | "archived" | "deleted";

interface ThreadDates {
  readonly archivedAt: unknown;
  readonly deletedAt?: unknown;
}

/** The sidebar shell answers first; a chat it doesn't list waits on its own detail load. */
export function resolveSecondaryPaneState(input: {
  readonly shell: ThreadDates | null;
  readonly detailDeleted: boolean;
  readonly detailThread: ThreadDates | null;
}): SecondaryPaneState {
  const known = input.shell ?? input.detailThread;
  if (known) {
    if (known.deletedAt != null) return "deleted";
    if (known.archivedAt != null) return "archived";
    return "ready";
  }
  return input.detailDeleted ? "deleted" : "loading";
}
