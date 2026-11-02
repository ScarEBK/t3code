import { PROGRESS_FILE_NAME, type ProgressItem, type ProgressSection } from "./progressFile";

// Area hints turn a one-line task into the brief a senior dev would give. They are matched on the
// task, its notes and its section, so "Webhooks" under "Payments" still gets the Stripe advice.
const AREA_HINTS: ReadonlyArray<{ readonly match: RegExp; readonly steps: ReadonlyArray<string> }> =
  [
    {
      match:
        /stripe|payment|checkout|billing|subscription|invoice|refund|pricing|plans?\b|webhook/i,
      steps: [
        "Use Stripe through the project's existing setup. Keep secret keys on the server, read from env, and build in test mode.",
        "Verify webhook signatures and make each handler safe to run twice. Cover checkout.session.completed, invoice.payment_failed and customer.subscription.updated and deleted where they apply.",
        "Test it end to end with the Stripe CLI (stripe listen and stripe trigger) and a test card, including a failed payment.",
      ],
    },
    {
      match: /sign[ -]?in|log[ -]?in|auth|account|session|password|oauth|profile/i,
      steps: [
        "Keep auth on the server: check the user on every protected route and never trust ids sent from the client.",
        "Never log tokens or personal data. Handle signed-out and expired sessions cleanly.",
      ],
    },
    {
      match: /e-?mail|license key|deliver|notification|push|newsletter/i,
      steps: [
        "Send through the provider the project already uses, with retries, and log every failure with enough context to debug it.",
        "Test it with a real delivery, not only a mocked call, and check what happens when sending fails.",
      ],
    },
    {
      match:
        /design|redesign|\bui\b|page|section|hero|layout|landing|navbar|navigation|footer|scroll|animation|style/i,
      steps: [
        "Build only from the existing components, colors, fonts and spacing. Add no new colors, fonts or one-off styles.",
        "Screenshot it at desktop and phone width, compare it with the rest of the app, and fix what looks off before you call it done.",
      ],
    },
    {
      match: /discord|bot|slash command|guild|role|ticket|moderation/i,
      steps: [
        "Follow the bot's existing command and event patterns, check permissions on every action, and respect Discord rate limits.",
      ],
    },
    {
      match: /database|migration|sync|export|delete|offline|backup|storage/i,
      steps: [
        "Change data through a migration, keep existing data safe, and ask me before anything deletes or rewrites real records.",
      ],
    },
  ];

function areaSteps(text: string): ReadonlyArray<string> {
  return AREA_HINTS.filter((hint) => hint.match.test(text)).flatMap((hint) => hint.steps);
}

function listNames(items: ReadonlyArray<ProgressItem>, limit = 4): string {
  const names = items.slice(0, limit).map((item) => item.text);
  const rest = items.length - names.length;
  return rest > 0 ? `${names.join("; ")} and ${rest} more` : names.join("; ");
}

export function buildTaskPrompt(input: {
  readonly projectName: string;
  readonly section: ProgressSection;
  readonly item: ProgressItem;
}): string {
  const { projectName, section, item } = input;
  const done = section.items.filter((entry) => entry.status === "done");
  const open = section.items.filter((entry) => entry.status !== "done" && entry.id !== item.id);
  const resuming = item.status === "doing";

  const lines: string[] = [
    resuming
      ? `Let's finish "${item.text}" in ${projectName} (${section.title}). It's already in progress, so first check what's done in the code and pick up from there.`
      : `Let's build "${item.text}" in ${projectName} (${section.title}).`,
  ];
  if (item.notes.length > 0) lines.push("", `Context: ${item.notes.join(" ")}`);
  lines.push(
    "",
    `Where ${section.title} stands: ${done.length} of ${section.items.length} done.` +
      (done.length > 0 ? ` Already done: ${listNames(done)}.` : "") +
      (open.length > 0 ? ` Still open besides this: ${listNames(open)}.` : ""),
  );

  const steps = [
    "Read the code this touches first, and tell me in two lines how it works today.",
    ...areaSteps(`${item.text} ${item.notes.join(" ")} ${section.title}`),
    "Build it in small steps that follow the project's existing patterns. Ask me before adding a new dependency or service.",
    "Test it for real: run it, try the edge cases, and fix what breaks.",
    `When it works, update ${PROGRESS_FILE_NAME}: mark this task [x] and add any new tasks you found under "## ${section.title}".`,
  ];
  lines.push("", "How to do it:", ...steps.map((step, index) => `${index + 1}. ${step}`));
  lines.push("", "Finish with a short summary of what changed and anything I need to do.");
  return lines.join("\n");
}

export function buildSetupPrompt(projectName: string): string {
  return [
    `Set up progress tracking for ${projectName}.`,
    "",
    `1. Read the code, README and any docs, then create ${PROGRESS_FILE_NAME} at the project root.`,
    "2. Add one `## Section` per feature area, and under it every task as `- [x]` done, `- [~]` in progress or `- [ ]` to do. Use plain words, and keep each task small enough for one session.",
    "3. Only add an indented line under a task when it needs context to be built.",
    `4. Add this rule to the project's CLAUDE.md (or AGENTS.md): "When you finish a task, update ${PROGRESS_FILE_NAME}: tick what you finished and add any new tasks you found."`,
    "",
    "Show me the sections when you're done.",
  ].join("\n");
}
