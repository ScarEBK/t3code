import type { BoardCard } from "./checklistLogic";

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

function listNames(cards: ReadonlyArray<BoardCard>, limit = 4): string {
  const names = cards.slice(0, limit).map((card) => card.title);
  const rest = cards.length - names.length;
  return rest > 0 ? `${names.join("; ")} and ${rest} more` : names.join("; ");
}

const BUILD_STEP =
  "Build it in small steps that follow the project's existing patterns. Ask me before adding a new dependency or service.";

function markDoneStep(cardId: string): string {
  return `When it works, mark card ${cardId} done on the Project Board yourself (board done ${cardId} --proof "..."). Only if it's a look or a choice I must judge, use board review ${cardId} instead and tell me what to check.`;
}

function cardContext(card: BoardCard): string {
  return [card.why, card.status === "review" ? card.needs : ""].filter(Boolean).join(" ");
}

const inProgress = (card: BoardCard) => card.status === "doing" || card.status === "review";

/** A ready-to-send brief for one Project Board card, with its section for context. */
export function buildTaskPrompt(input: {
  readonly projectName: string;
  readonly sectionName: string;
  readonly sectionCards: ReadonlyArray<BoardCard>;
  readonly card: BoardCard;
}): string {
  const { projectName, sectionName, sectionCards, card } = input;
  const done = sectionCards.filter((entry) => entry.status === "done");
  const open = sectionCards.filter(
    (entry) => entry.status !== "done" && entry.status !== "skip" && entry.id !== card.id,
  );
  const lines: string[] = [
    inProgress(card)
      ? `Let's finish "${card.title}" in ${projectName} (${sectionName}). It's already in progress, so first check what's done in the code and pick up from there.`
      : `Let's build "${card.title}" in ${projectName} (${sectionName}).`,
  ];
  const context = cardContext(card);
  if (context) lines.push("", `Context: ${context}`);
  lines.push(
    "",
    `Where ${sectionName} stands: ${done.length} of ${sectionCards.length} done.` +
      (done.length > 0 ? ` Already done: ${listNames(done)}.` : "") +
      (open.length > 0 ? ` Still open besides this: ${listNames(open)}.` : ""),
  );
  const steps = [
    "Read the code this touches first, and tell me in two lines how it works today.",
    ...areaSteps(`${card.title} ${card.why} ${sectionName}`),
    BUILD_STEP,
    "Test it for real: run it, try the edge cases, and fix what breaks.",
    card.proof ? `It's done when this is true: ${card.proof}` : "Tell me how you proved it works.",
    markDoneStep(card.id),
  ];
  lines.push("", "How to do it:", ...steps.map((step, index) => `${index + 1}. ${step}`));
  lines.push("", "Finish with a short summary of what changed and anything I need to do.");
  return lines.join("\n");
}

/** One brief for several cards, worked one after another in the order given. */
export function buildMultiTaskPrompt(input: {
  readonly projectName: string;
  readonly tasks: ReadonlyArray<{ readonly card: BoardCard; readonly sectionName: string }>;
}): string {
  const { projectName, tasks } = input;
  const lines: string[] = [
    `Let's work through these ${tasks.length} tasks in ${projectName}, one at a time and in this order. Finish and prove each one before you start the next.`,
  ];
  tasks.forEach(({ card, sectionName }, index) => {
    lines.push("", `${index + 1}. ${card.title} (${sectionName}, card ${card.id})`);
    if (inProgress(card)) {
      lines.push(
        "   Already in progress: check what's done in the code first and pick up from there.",
      );
    }
    const context = cardContext(card);
    if (context) lines.push(`   Context: ${context}`);
    if (card.proof) lines.push(`   Done when: ${card.proof}`);
  });
  const hints = new Set(
    tasks.flatMap(({ card, sectionName }) => areaSteps(`${card.title} ${card.why} ${sectionName}`)),
  );
  const steps = [
    "First read the code these touch, then tell me in a few lines how it works today and your plan for each task.",
    ...hints,
    BUILD_STEP,
    "Test each task for real before moving on: run it, try the edge cases, and fix what breaks.",
    markDoneStep("<card id>"),
    "If a task is blocked, tell me why, leave its card as it is, and go on to the next one.",
  ];
  lines.push("", "How to do each one:", ...steps.map((step, index) => `${index + 1}. ${step}`));
  lines.push("", "Finish with a short summary per task: what changed and anything I need to do.");
  return lines.join("\n");
}
