import { describe, expect, it } from "vite-plus/test";
import type { BoardCard } from "./checklistLogic";
import { buildTaskPrompt } from "./checklistPrompt";
import {
  countCards,
  nextCard,
  pickChatTarget,
  sameProjectName,
  sectionIconName,
} from "./checklistView";

const card = (id: string, patch: Partial<BoardCard>): BoardCard => ({
  id,
  projectId: "5hub",
  area: "5hub/payments",
  title: id,
  why: "",
  proof: "",
  needs: "",
  cardType: "check",
  status: "todo",
  priority: 2,
  order: 0,
  ...patch,
});

describe("checklist view", () => {
  it("counts without skipped cards", () => {
    const counts = countCards([
      card("a", { status: "done" }),
      card("b", { status: "review" }),
      card("c", { status: "skip" }),
      card("d", { status: "doing" }),
    ]);
    expect(counts).toEqual({ done: 1, doing: 1, review: 1, todo: 0, total: 3, percent: 33 });
  });

  it("puts what waits on the owner first, then work in progress, then top priority", () => {
    expect(nextCard([card("low", { priority: 3 }), card("high", { priority: 1 })])?.id).toBe(
      "high",
    );
    expect(nextCard([card("todo", {}), card("doing", { status: "doing" })])?.id).toBe("doing");
    expect(
      nextCard([card("doing", { status: "doing" }), card("ask", { status: "review" })])?.id,
    ).toBe("ask");
    expect(nextCard([card("x", { status: "done" })])).toBeNull();
  });

  it("gives sections an icon from their name when the board has none", () => {
    expect(sectionIconName(null, "Design")).toBe("palette");
    expect(sectionIconName(null, "Backend")).toBe("server");
    expect(sectionIconName(null, "API")).toBe("plug");
    expect(sectionIconName(null, "Security")).toBe("shield");
    expect(sectionIconName(null, "Something else")).toBe("layers");
  });

  it("matches board and chat project names loosely", () => {
    expect(sameProjectName("Motion Life", "motion-life")).toBe(true);
    expect(sameProjectName("5Hub", "MotionCord")).toBe(false);
  });

  it("writes a Stripe brief with the card's context and proof", () => {
    const target = card("hook", {
      title: "Stripe webhooks",
      why: "Failed renewals keep access.",
      proof: "A failed test payment pauses the plan.",
    });
    const prompt = buildTaskPrompt({
      projectName: "5Hub",
      sectionName: "Payments",
      sectionCards: [card("done", { status: "done", title: "Checkout" }), target],
      card: target,
    });
    expect(prompt).toContain('Let\'s build "Stripe webhooks" in 5Hub (Payments).');
    expect(prompt).toContain("Context: Failed renewals keep access.");
    expect(prompt).toContain("Already done: Checkout.");
    expect(prompt).toContain("Verify webhook signatures");
    expect(prompt).toContain("It's done when this is true: A failed test payment pauses the plan.");
  });
});

describe("pickChatTarget", () => {
  const pc: { environmentId: string } = { environmentId: "pc" };
  const vps: { environmentId: string } = { environmentId: "vps" };
  const pick = (vpsHasRoom: boolean, candidates = [pc, vps]) =>
    pickChatTarget<string, { environmentId: string }>(candidates, {
      localEnvironmentId: "pc",
      remoteHasRoom: (id) => id === "vps" && vpsHasRoom,
    });

  it("opens on the VPS while it has room, then on this PC", () => {
    expect(pick(true)).toBe(vps);
    expect(pick(false)).toBe(pc);
    expect(pick(false, [vps])).toBe(vps);
  });
});
