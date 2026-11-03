import type { BoardArea, BoardCard, BoardSnapshot } from "./checklistLogic";

export interface ProjectCounts {
  readonly done: number;
  readonly doing: number;
  readonly review: number;
  readonly todo: number;
  /** Skipped cards are left out. */
  readonly total: number;
  readonly percent: number;
}

export function countCards(cards: ReadonlyArray<BoardCard>): ProjectCounts {
  const live = cards.filter((card) => !card.deleted && card.status !== "skip");
  const count = (status: BoardCard["status"]) =>
    live.filter((card) => card.status === status).length;
  const done = count("done");
  return {
    done,
    doing: count("doing"),
    review: count("review"),
    todo: count("todo"),
    total: live.length,
    percent: live.length === 0 ? 0 : Math.floor((done / live.length) * 100),
  };
}

export function projectCards(snapshot: BoardSnapshot, projectId: string) {
  return snapshot.cards.filter((card) => !card.deleted && card.projectId === projectId);
}

const NEXT_ORDER: ReadonlyArray<BoardCard["status"]> = ["review", "doing", "todo"];

/** What to pick up next: anything waiting on the owner, then work in progress, then the top to-do. */
export function nextCard(cards: ReadonlyArray<BoardCard>): BoardCard | null {
  for (const status of NEXT_ORDER) {
    const match = cards
      .filter((card) => card.status === status)
      .toSorted((a, b) => a.priority - b.priority || a.order - b.order)[0];
    if (match) return match;
  }
  return null;
}

// A section keeps the board's own icon; one without gets an icon from its name, so design,
// backend, API and security each read at a glance.
const SECTION_ICON_BY_NAME: ReadonlyArray<readonly [RegExp, string]> = [
  [/design|\bui\b|\bux\b|brand|style|look/i, "palette"],
  [/secur|auth|sign[ -]?in|login|permission|privacy/i, "shield"],
  [/safe|moderat|fraud|abuse|trust/i, "life-buoy"],
  [/\bapi\b|endpoint|webhook|integration/i, "plug"],
  [/back[ -]?end|server|infra|worker|queue/i, "server"],
  [/data|database|storage|migration/i, "database"],
  [/pay|billing|stripe|checkout|subscription|pricing/i, "credit-card"],
  [/store|shop|cart|product/i, "shopping-cart"],
  [/licen|key/i, "key"],
  [/mail|email|notif/i, "mail"],
  [/bot|discord|command/i, "bot"],
  [/site|web|landing|seo/i, "globe"],
  [/app|mobile|ios|android/i, "smartphone"],
  [/dashboard|admin|panel/i, "layout"],
  [/legal|terms|policy/i, "scale"],
  [/launch|release|deploy|ship/i, "rocket"],
  [/perf|speed|fast/i, "gauge"],
  [/test|qa\b/i, "flask"],
  [/analytic|metric|stat/i, "chart"],
  [/doc|guide|help/i, "book-open"],
  [/account|profile|user/i, "user"],
];

export function sectionIconName(area: BoardArea | null, label: string): string {
  if (area?.icon) return area.icon;
  return SECTION_ICON_BY_NAME.find(([match]) => match.test(label))?.[1] ?? "layers";
}

/** Board projects and chat projects are named by the owner, so a loose name match links them. */
export function sameProjectName(left: string, right: string): boolean {
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key(left) !== "" && key(left) === key(right);
}

const normalizePath = (value: string) =>
  value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
const folderName = (value: string) => normalizePath(value).split("/").pop() ?? "";

/**
 * How well a board app fits a chat project: 3 = same folder, 2 = same folder name (the same repo
 * on another computer), 1 = same name, 0 = no link. Folder names beat names because chat projects
 * are usually named after the folder ("motionlife-shop") while the board says "Motion Life website".
 */
export function projectMatchScore(
  board: { readonly name: string; readonly paths?: ReadonlyArray<string> },
  chat: { readonly title: string; readonly workspaceRoot: string },
): number {
  const paths = board.paths ?? [];
  const root = normalizePath(chat.workspaceRoot);
  if (paths.some((path) => normalizePath(path) === root)) return 3;
  const folder = folderName(chat.workspaceRoot);
  if (folder !== "" && paths.some((path) => folderName(path) === folder)) return 2;
  return sameProjectName(board.name, chat.title) ? 1 : 0;
}

/** The best match among `items`, or undefined when none links at all. First wins a tie. */
export function bestProjectMatch<T>(
  items: ReadonlyArray<T>,
  score: (item: T) => number,
): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  for (const item of items) {
    const next = score(item);
    if (next > bestScore) {
      best = item;
      bestScore = next;
    }
  }
  return best;
}
