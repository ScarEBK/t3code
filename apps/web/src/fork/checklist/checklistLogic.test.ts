import { describe, expect, it } from "vite-plus/test";

import {
  type BoardCard,
  type BoardSnapshot,
  groupChecklist,
  parseBoardSnapshot,
  summarizeProjects,
} from "./checklistLogic";

const card = (id: string, patch: Partial<BoardCard>): BoardCard => ({
  id,
  projectId: "site",
  area: "site/pay",
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

const snapshot: BoardSnapshot = {
  projects: [
    { id: "site", name: "Site", color: "#fff", icon: "globe" },
    { id: "bot", name: "Bot", color: "#fff", icon: "bot" },
  ],
  areas: [
    { id: "site/legal", projectId: "site", name: "Legal", icon: "scale", color: "#fff", order: 1 },
    {
      id: "site/pay",
      projectId: "site",
      name: "Payments",
      icon: "credit-card",
      color: "#fff",
      order: 0,
    },
  ],
  cards: [
    card("low-todo", { priority: 3 }),
    card("high-todo", { priority: 1 }),
    card("needs", { status: "review", area: "site/legal" }),
    card("done", { status: "done" }),
    card("gone", { status: "review", deleted: true }),
    card("orphan", { area: "site/removed" }),
    card("other-project", { projectId: "bot", status: "review" }),
  ],
};

describe("groupChecklist", () => {
  it("puts Needs you first, sorts by priority, and drops deleted cards", () => {
    const groups = groupChecklist(snapshot, "site", "status");
    expect(groups.map((g) => [g.label, g.cards.map((c) => c.id)])).toEqual([
      ["Needs you", ["needs"]],
      ["To do", ["high-todo", "orphan", "low-todo"]],
      ["Done", ["done"]],
    ]);
  });

  it("groups by section in board order, open jobs first, cards without a known section last", () => {
    const groups = groupChecklist(snapshot, "site", "section");
    expect(groups.map((g) => [g.label, g.cards.map((c) => c.id), g.doneCount])).toEqual([
      ["Payments", ["high-todo", "low-todo", "done"], 1],
      ["Legal", ["needs"], 0],
      ["Other", ["orphan"], 0],
    ]);
  });
});

describe("summarizeProjects", () => {
  it("lists projects with the most Needs you first", () => {
    expect(
      summarizeProjects(snapshot).map((s) => [s.project.id, s.needsYou, s.done, s.total]),
    ).toEqual([
      ["bot", 1, 0, 1],
      ["site", 1, 1, 5],
    ]);
  });
});

describe("parseBoardSnapshot", () => {
  it("rejects a server that answers with its web page instead of the board", () => {
    expect(() => parseBoardSnapshot(null)).toThrow();
    expect(() => parseBoardSnapshot({ error: "nope" })).toThrow();
    expect(parseBoardSnapshot({ projects: [] })).toEqual({ projects: [], areas: [], cards: [] });
  });
});
