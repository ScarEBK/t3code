/** Sidebar row statuses that mean the chat is waiting on the user, most urgent first. */
const NEEDS_YOU_KINDS = ["approval", "input", "request", "failed", "limited", "done"] as const;

export type NeedsYouKind = (typeof NEEDS_YOU_KINDS)[number];

const RANK = new Map<string, number>(NEEDS_YOU_KINDS.map((kind, index) => [kind, index]));

/** Maps the sidebar row's own status (resolveSidebarThreadStatus + unread) to a needs-you kind. */
export function needsYouKind(status: string, isUnread: boolean): NeedsYouKind | null {
  if (status === "ready" || status === "waiting") return isUnread ? "done" : null;
  return RANK.has(status) ? (status as NeedsYouKind) : null;
}

export interface NeedsYouCandidate<T> {
  readonly key: string;
  readonly value: T;
  readonly kind: NeedsYouKind | null;
  readonly updatedAt: string;
  readonly archived: boolean;
  /** The chat already on screen; finished-unread clears itself there, so only asks count. */
  readonly onScreen: boolean;
}

export function collectNeedsYou<T>(
  candidates: readonly NeedsYouCandidate<T>[],
): Array<NeedsYouCandidate<T> & { readonly kind: NeedsYouKind }> {
  return candidates
    .filter(
      (candidate): candidate is NeedsYouCandidate<T> & { kind: NeedsYouKind } =>
        !candidate.archived &&
        candidate.kind !== null &&
        !(candidate.onScreen && candidate.kind === "done"),
    )
    .sort(
      (left, right) =>
        (RANK.get(left.kind) ?? 99) - (RANK.get(right.kind) ?? 99) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
}
