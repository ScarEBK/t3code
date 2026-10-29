/** Status pills that mean the chat is waiting on the user, most urgent first. */
export const NEEDS_YOU_LABELS = [
  "Pending Approval",
  "Awaiting Input",
  "Guest Request",
  "Failed",
  "Plan Ready",
  "Completed",
] as const;

export type NeedsYouLabel = (typeof NEEDS_YOU_LABELS)[number];

const RANK = new Map<string, number>(NEEDS_YOU_LABELS.map((label, index) => [label, index]));

export const NEEDS_YOU_SHORT_LABEL: Record<NeedsYouLabel, string> = {
  "Pending Approval": "Approve",
  "Awaiting Input": "Question",
  "Guest Request": "Guest",
  Failed: "Failed",
  "Plan Ready": "Plan ready",
  Completed: "Done",
};

export interface NeedsYouCandidate<T> {
  readonly key: string;
  readonly value: T;
  readonly pillLabel: string | null;
  readonly updatedAt: string;
  readonly archived: boolean;
  /** The chat already on screen; finished-unread clears itself there, so only asks count. */
  readonly onScreen: boolean;
}

export function isNeedsYouLabel(label: string | null): label is NeedsYouLabel {
  return label !== null && RANK.has(label);
}

export function collectNeedsYou<T>(
  candidates: readonly NeedsYouCandidate<T>[],
): Array<NeedsYouCandidate<T> & { readonly pillLabel: NeedsYouLabel }> {
  return candidates
    .filter(
      (candidate): candidate is NeedsYouCandidate<T> & { pillLabel: NeedsYouLabel } =>
        !candidate.archived &&
        isNeedsYouLabel(candidate.pillLabel) &&
        !(candidate.onScreen && candidate.pillLabel === "Completed"),
    )
    .sort(
      (left, right) =>
        (RANK.get(left.pillLabel) ?? 99) - (RANK.get(right.pillLabel) ?? 99) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
}
