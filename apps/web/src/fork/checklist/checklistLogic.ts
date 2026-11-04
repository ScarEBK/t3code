export type BoardStatus = "todo" | "doing" | "review" | "done" | "skip";

export interface BoardProject {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly deleted?: boolean;
}

export interface BoardArea {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly order: number;
  readonly deleted?: boolean;
}

export interface BoardCard {
  readonly id: string;
  readonly projectId: string;
  readonly area: string | null;
  readonly title: string;
  readonly why: string;
  readonly proof: string;
  readonly needs: string;
  readonly cardType: string;
  readonly status: BoardStatus;
  readonly priority: number;
  readonly order: number;
  readonly deleted?: boolean;
}

export interface BoardSnapshot {
  readonly projects: ReadonlyArray<BoardProject>;
  readonly areas: ReadonlyArray<BoardArea>;
  readonly cards: ReadonlyArray<BoardCard>;
}

export type ChecklistGrouping = "status" | "section";

const STATUS_ORDER: ReadonlyArray<BoardStatus> = ["review", "doing", "todo", "done", "skip"];

const STATUS_LABEL: Record<BoardStatus, string> = {
  review: "Needs you",
  doing: "In progress",
  todo: "To do",
  done: "Done",
  skip: "Skipped",
};

export const PRIORITY_LABEL: Record<number, string> = { 1: "High", 2: "Medium", 3: "Low" };

export interface ChecklistGroup {
  readonly key: string;
  readonly label: string;
  readonly status: BoardStatus | null;
  readonly area: BoardArea | null;
  readonly cards: ReadonlyArray<BoardCard>;
  readonly doneCount: number;
}

export interface ProjectSummary {
  readonly project: BoardProject;
  readonly total: number;
  readonly done: number;
  readonly needsYou: number;
}

export const isOpenCard = (card: BoardCard) => card.status !== "done" && card.status !== "skip";

const byPriorityThenOrder = (a: BoardCard, b: BoardCard) =>
  a.priority - b.priority || a.order - b.order || a.title.localeCompare(b.title);

export function summarizeProjects(snapshot: BoardSnapshot): ReadonlyArray<ProjectSummary> {
  const live = snapshot.cards.filter((card) => !card.deleted && card.status !== "skip");
  return snapshot.projects
    .filter((project) => !project.deleted)
    .map((project) => {
      const cards = live.filter((card) => card.projectId === project.id);
      return {
        project,
        total: cards.length,
        done: cards.filter((card) => card.status === "done").length,
        needsYou: cards.filter((card) => card.status === "review").length,
      };
    })
    .toSorted((a, b) => b.needsYou - a.needsYou || a.project.name.localeCompare(b.project.name));
}

export function groupChecklist(
  snapshot: BoardSnapshot,
  projectId: string,
  grouping: ChecklistGrouping,
): ReadonlyArray<ChecklistGroup> {
  const cards = snapshot.cards.filter((card) => !card.deleted && card.projectId === projectId);
  if (grouping === "status") {
    return STATUS_ORDER.map((status) => {
      const inGroup = cards.filter((card) => card.status === status).toSorted(byPriorityThenOrder);
      return {
        key: `status:${status}`,
        label: STATUS_LABEL[status],
        status,
        area: null,
        cards: inGroup,
        doneCount: status === "done" ? inGroup.length : 0,
      };
    }).filter((group) => group.cards.length > 0);
  }
  const areas = snapshot.areas
    .filter((area) => !area.deleted && area.projectId === projectId)
    .toSorted((a, b) => a.order - b.order);
  const statusRank = (card: BoardCard) => STATUS_ORDER.indexOf(card.status);
  const groups = areas.map((area) => ({ area, cards: cards.filter((c) => c.area === area.id) }));
  const known = new Set(areas.map((area) => area.id));
  const loose = cards.filter((card) => !card.area || !known.has(card.area));
  return [...groups, { area: null, cards: loose }]
    .filter((group) => group.cards.length > 0)
    .map(({ area, cards: inGroup }) => ({
      key: `area:${area?.id ?? "none"}`,
      label: area?.name ?? "Other",
      status: null,
      area,
      cards: inGroup.toSorted((a, b) => statusRank(a) - statusRank(b) || byPriorityThenOrder(a, b)),
      doneCount: inGroup.filter((card) => !isOpenCard(card)).length,
    }));
}

/** Done and skipped groups start folded; everything else starts open. */
export function startsCollapsed(group: ChecklistGroup): boolean {
  if (group.status !== null) return group.status === "done" || group.status === "skip";
  return group.doneCount === group.cards.length;
}

/** A server without the board bridge answers with the web page, which must not read as an empty board. */
export function parseBoardSnapshot(body: unknown): BoardSnapshot {
  if (!body || typeof body !== "object" || !("projects" in body) || !Array.isArray(body.projects)) {
    throw new Error("This computer can't reach the Project Board.");
  }
  const snapshot = body as Partial<BoardSnapshot>;
  return {
    projects: snapshot.projects ?? [],
    areas: snapshot.areas ?? [],
    cards: snapshot.cards ?? [],
  };
}
