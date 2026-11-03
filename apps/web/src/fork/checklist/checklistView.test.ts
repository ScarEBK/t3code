import { describe, expect, it } from "vite-plus/test";
import type { BoardCard } from "./checklistLogic";
import { buildTaskPrompt } from "./checklistPrompt";
import {
  bestProjectMatch,
  countCards,
  nextCard,
  projectMatchScore,
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

  it("links the open chat to its board app by folder first, then by name", () => {
    const shop = {
      name: "Motion Life website",
      paths: [
        "C:/Users/Administrator/Desktop/Code/motionlife-shop",
        "/home/dev/Code/motionlife-shop",
      ],
    };
    const discord = { name: "Motion Life Discord", paths: [] };
    const laptopShop = {
      title: "motionlife-shop",
      workspaceRoot: "C:\\Users\\piceo\\Desktop\\motionlife-shop",
    };
    expect(
      projectMatchScore(shop, { title: "x", workspaceRoot: "/home/dev/Code/motionlife-shop/" }),
    ).toBe(3);
    expect(projectMatchScore(shop, laptopShop)).toBe(2);
    expect(projectMatchScore(discord, { title: "motionlife-discord", workspaceRoot: "D:/x" })).toBe(
      1,
    );
    expect(projectMatchScore(discord, laptopShop)).toBe(0);
    expect(bestProjectMatch([discord, shop], (board) => projectMatchScore(board, laptopShop))).toBe(
      shop,
    );
    expect(
      bestProjectMatch([discord], (board) => projectMatchScore(board, laptopShop)),
    ).toBeUndefined();
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
