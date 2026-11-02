import { describe, expect, it } from "vite-plus/test";
import { nextProgressItem, parseProgressFile } from "./progressFile";
import { buildTaskPrompt } from "./progressPrompt";

const SAMPLE = `# 5Hub

Intro text that is not a task.

## Payments
- [x] Pricing page
- [~] Stripe checkout
  Use the existing plans table.
  - Monthly and yearly
- [ ] Webhooks

## Empty

### App
* [X] Login
+ [/] Offline mode
- [-] Sync
- [ ] Push notifications
`;

describe("parseProgressFile", () => {
  it("reads sections, statuses and notes", () => {
    const document = parseProgressFile(SAMPLE);
    expect(document.sections.map((section) => section.title)).toEqual(["Payments", "App"]);
    const payments = document.sections[0]!;
    expect(payments.items.map((item) => item.status)).toEqual(["done", "doing", "todo"]);
    expect(payments.items[1]!.notes).toEqual([
      "Use the existing plans table.",
      "Monthly and yearly",
    ]);
    expect(document.sections[1]!.items.map((item) => item.status)).toEqual([
      "done",
      "doing",
      "doing",
      "todo",
    ]);
    expect(document.counts).toEqual({ done: 2, doing: 3, todo: 2, total: 7, percent: 28 });
  });

  it("puts tasks before any heading under Tasks and handles an empty file", () => {
    expect(parseProgressFile("- [ ] One\n").sections[0]!.title).toBe("Tasks");
    expect(parseProgressFile("").counts).toEqual({
      done: 0,
      doing: 0,
      todo: 0,
      total: 0,
      percent: 0,
    });
  });

  it("picks work in progress before new work", () => {
    const next = nextProgressItem(parseProgressFile(SAMPLE));
    expect(next?.item.text).toBe("Stripe checkout");
    expect(nextProgressItem(parseProgressFile("- [x] Done\n"))).toBeNull();
  });
});

describe("buildTaskPrompt", () => {
  it("writes a Stripe brief with context and the file update step", () => {
    const document = parseProgressFile(SAMPLE);
    const section = document.sections[0]!;
    const prompt = buildTaskPrompt({ projectName: "5Hub", section, item: section.items[2]! });
    expect(prompt).toContain('Let\'s build "Webhooks" in 5Hub (Payments).');
    expect(prompt).toContain("Already done: Pricing page.");
    expect(prompt).toContain("Verify webhook signatures");
    expect(prompt).toContain("mark this task [x]");
  });
});
