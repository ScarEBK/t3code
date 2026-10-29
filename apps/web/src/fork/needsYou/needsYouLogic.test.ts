import { describe, expect, it } from "vite-plus/test";
import { collectNeedsYou, needsYouKind, type NeedsYouCandidate } from "./needsYouLogic";

const candidate = (
  key: string,
  kind: NeedsYouCandidate<string>["kind"],
  overrides: Partial<NeedsYouCandidate<string>> = {},
): NeedsYouCandidate<string> => ({
  key,
  value: key,
  kind,
  updatedAt: "2026-10-28T10:00:00Z",
  archived: false,
  onScreen: false,
  ...overrides,
});

describe("needsYouKind", () => {
  it("follows the sidebar row's status, counting a finished chat only while unread", () => {
    expect(needsYouKind("approval", false)).toBe("approval");
    expect(needsYouKind("input", true)).toBe("input");
    expect(needsYouKind("failed", false)).toBe("failed");
    expect(needsYouKind("limited", false)).toBe("limited");
    expect(needsYouKind("working", true)).toBeNull();
    expect(needsYouKind("ready", true)).toBe("done");
    expect(needsYouKind("ready", false)).toBeNull();
  });
});

describe("collectNeedsYou", () => {
  it("keeps chats waiting on the user, approvals first, newest first within a kind", () => {
    const result = collectNeedsYou([
      candidate("working", null),
      candidate("done-old", "done", { updatedAt: "2026-10-28T09:00:00Z" }),
      candidate("question", "input"),
      candidate("done-new", "done", { updatedAt: "2026-10-28T11:00:00Z" }),
      candidate("approval", "approval"),
      candidate("failed", "failed"),
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
      candidate("archived", "approval", { archived: true }),
      candidate("open-done", "done", { onScreen: true }),
      candidate("open-approval", "approval", { onScreen: true }),
    ]);
    expect(result.map((item) => item.key)).toEqual(["open-approval"]);
  });
});
