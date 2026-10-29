import { describe, expect, it } from "vite-plus/test";
import { collectNeedsYou, type NeedsYouCandidate } from "./needsYouLogic";

const candidate = (
  key: string,
  pillLabel: string | null,
  overrides: Partial<NeedsYouCandidate<string>> = {},
): NeedsYouCandidate<string> => ({
  key,
  value: key,
  pillLabel,
  updatedAt: "2026-10-28T10:00:00Z",
  archived: false,
  onScreen: false,
  ...overrides,
});

describe("collectNeedsYou", () => {
  it("keeps chats waiting on the user, approvals first, newest first within a kind", () => {
    const result = collectNeedsYou([
      candidate("working", "Working"),
      candidate("done-old", "Completed", { updatedAt: "2026-10-28T09:00:00Z" }),
      candidate("question", "Awaiting Input"),
      candidate("done-new", "Completed", { updatedAt: "2026-10-28T11:00:00Z" }),
      candidate("approval", "Pending Approval"),
      candidate("quiet", null),
      candidate("failed", "Failed"),
    ]);
    expect(result.map((item) => item.key)).toEqual([
      "approval",
      "question",
      "failed",
      "done-new",
      "done-old",
    ]);
  });

  it("drops archived chats and the on-screen chat's finished badge, but not its approval", () => {
    const result = collectNeedsYou([
      candidate("archived", "Pending Approval", { archived: true }),
      candidate("open-done", "Completed", { onScreen: true }),
      candidate("open-approval", "Pending Approval", { onScreen: true }),
    ]);
    expect(result.map((item) => item.key)).toEqual(["open-approval"]);
  });
});
