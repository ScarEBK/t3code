// PROGRESS.md is a checklist at a project's root that agents keep up to date: "## Section", then
// "- [x]" done, "- [~]" in progress, "- [ ]" to do; an indented line under a task is its note.

export const PROGRESS_FILE_NAME = "PROGRESS.md";

export type ProgressStatus = "done" | "doing" | "todo";

export interface ProgressItem {
  readonly id: string;
  readonly text: string;
  readonly status: ProgressStatus;
  readonly notes: ReadonlyArray<string>;
}

export interface ProgressSection {
  readonly id: string;
  readonly title: string;
  readonly items: ReadonlyArray<ProgressItem>;
}

export interface ProgressCounts {
  readonly done: number;
  readonly doing: number;
  readonly todo: number;
  readonly total: number;
  /** Whole percent of tasks done; 0 when there are none. */
  readonly percent: number;
}

export interface ProgressDocument {
  readonly sections: ReadonlyArray<ProgressSection>;
  readonly counts: ProgressCounts;
}

const TASK_LINE = /^(\s*)[-*+]\s+\[([ xX~/-])\]\s+(.*\S)\s*$/;
const SECTION_LINE = /^#{2,3}\s+(.*\S)\s*$/;
const FALLBACK_SECTION = "Tasks";

function statusOf(mark: string): ProgressStatus {
  if (mark === "x" || mark === "X") return "done";
  if (mark === " ") return "todo";
  return "doing";
}

function countProgress(items: ReadonlyArray<ProgressItem>): ProgressCounts {
  let done = 0;
  let doing = 0;
  for (const item of items) {
    if (item.status === "done") done += 1;
    else if (item.status === "doing") doing += 1;
  }
  const total = items.length;
  return {
    done,
    doing,
    todo: total - done - doing,
    total,
    percent: total === 0 ? 0 : Math.floor((done / total) * 100),
  };
}

export function parseProgressFile(contents: string): ProgressDocument {
  const sections: Array<{ id: string; title: string; items: ProgressItem[] }> = [];
  let current: (typeof sections)[number] | null = null;
  let lastItem: { notes: string[]; indent: number } | null = null;

  const ensureSection = () => {
    if (current) return current;
    current = { id: `s${sections.length}`, title: FALLBACK_SECTION, items: [] };
    sections.push(current);
    return current;
  };

  for (const rawLine of contents.split(/\r?\n/)) {
    const sectionMatch = SECTION_LINE.exec(rawLine);
    if (sectionMatch) {
      current = { id: `s${sections.length}`, title: sectionMatch[1]!, items: [] };
      sections.push(current);
      lastItem = null;
      continue;
    }
    const taskMatch = TASK_LINE.exec(rawLine);
    if (taskMatch) {
      const section = ensureSection();
      const notes: string[] = [];
      section.items.push({
        id: `${section.id}:${section.items.length}`,
        text: taskMatch[3]!,
        status: statusOf(taskMatch[2]!),
        notes,
      });
      lastItem = { notes, indent: taskMatch[1]!.length };
      continue;
    }
    // A note belongs to the task above when it is indented deeper than that task's bullet.
    const indent = rawLine.length - rawLine.trimStart().length;
    const text = rawLine.trim().replace(/^[-*+>]\s+/, "");
    if (lastItem && text.length > 0 && indent > lastItem.indent) {
      lastItem.notes.push(text);
    } else if (text.length > 0 || rawLine.startsWith("#")) {
      lastItem = null;
    }
  }

  const nonEmpty = sections.filter((section) => section.items.length > 0);
  return {
    sections: nonEmpty,
    counts: countProgress(nonEmpty.flatMap((section) => section.items)),
  };
}

/** The task to pick up next: one already in progress, else the first one not started. */
export function nextProgressItem(
  document: ProgressDocument,
): { section: ProgressSection; item: ProgressItem } | null {
  for (const status of ["doing", "todo"] as const) {
    for (const section of document.sections) {
      const item = section.items.find((entry) => entry.status === status);
      if (item) return { section, item };
    }
  }
  return null;
}
