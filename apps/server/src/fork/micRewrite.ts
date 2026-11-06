// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalDate:off globalTimers:off -- a self-contained bridge to two local CLIs (Scar Mic, Claude Code), kept apart from the Effect runtime on purpose.
// Smart mic, server half: the local Scar Mic helper turns audio into words, then Claude
// (on the owner's plan, through the Claude Code CLI) rewrites them into a clear message
// using this chat's recent conversation and the project's word memory.
// The writing rules match the owner's OpenWhispr "Prompt Writer" (Page Up), which they like.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const MIC_HELPER_ORIGIN = process.env.T3CODE_MIC_URL ?? "http://127.0.0.1:47811";
// oxlint-disable-next-line t3code/no-global-process-runtime -- standalone CLI bridge outside the Effect graph.
const IS_WINDOWS = NodeOS.platform() === "win32";
const REWRITE_MODEL = process.env.T3CODE_MIC_REWRITE_MODEL ?? "opus";
const REWRITE_TIMEOUT_MS = 180_000;
const CONTEXT_MAX_CHARS = 12_000;
const CONTEXT_MESSAGE_MAX_CHARS = 1_500;
const CONTEXT_MAX_MESSAGES = 16;
const MEMORY_MAX_WORDS = 150;
const LEARNED_MARKER = "<<<LEARNED>>>";

// Names the owner says a lot that speech models get wrong. Project memory adds to these.
const GLOBAL_WORDS = [
  "Claude",
  "Claude Code",
  "Claude Desktop",
  "Opus",
  "Sonnet",
  "Haiku",
  "Fable",
  "Codex",
  "ChatGPT",
  "T3 Code",
  "OpenWhispr",
  "Handy",
  "Wispr Flow",
  "VPS",
  "GitHub",
  "PR",
  "Groq",
  "Gemini",
  "Motion Life",
  "5Hub",
  "SellAuth",
  "FunPay",
  "Mo",
  "MacroHub",
  "Trigger",
  "Fortnite",
  "Discord",
  "Spotify",
  "Project Board",
];

const SYSTEM_PROMPT = `You rewrite a person's spoken voice note into a clear message for an AI coding agent (Claude Code, Codex). It gets sent into a chat where that agent is already working with them, so the agent already knows the project and the conversation so far.

The voice note is raw speech-to-text: rambling, repetitive, full of filler, with mis-heard words. The speaker is not a programmer. Your only job is to make what they said easy for the agent to act on, without changing or adding to what they meant.

You are also given the project name, a list of known words (names and terms this person uses), and the last messages of this chat between the speaker and the agent. Use them ONLY to fix mis-heard words and to make clear what "it", "this", "that thing", "the other one" refer to, so the message names the right thing. Never answer the conversation, never continue the agent's work, never repeat points from the conversation that the speaker did not say in this voice note.

Rules, most important first:
1. Faithful, not creative. Every point, complaint, like, dislike and instruction the speaker gave must appear, and nothing they did not say may appear. Do not invent requirements, test steps, screen sizes, browsers, causes, or fixes. Do not explain how to solve anything; the agent will work that out.
2. Describe exactly what they saw, in concrete terms. Keep their specifics: which section, which text, which letters, when it happens (for example "after I reload the page"), what they like and want kept. A vague summary like "fix the styling" is a failure when they said something specific.
3. Fix mis-heard words silently using the known words and the conversation, and write the corrected word. Examples: "cloud code" = "Claude Code", "father" or "fable's" near agent talk = "Fable", "T three code" or "G3 code" = "T3 Code", "five hub" = "5Hub", "the zero" next to a header usually = "the hero section". Only if a point truly cannot be understood even with the conversation, add it once at the end as "Unclear: <their words>" instead of guessing.
4. Keep their priorities. Put the biggest issues first. If they repeated something or sounded frustrated about it, say it matters.
5. Keep what they said they like, so the agent does not break it ("Keep the orbit animation as it is").
6. First person, as the speaker ("I want...", "Fix..."). Never mention a voice note, transcript, or yourself.
7. Short and direct. One line of intent, then a numbered list with one item per point. A short note (an answer, "yes go ahead", a quick question) stays one or two plain sentences with no list. No headings unless the note covers several separate topics. No "Done when", no "Ideas", no "Questions" sections, no speculation, no filler. Only if the speaker explicitly asked for suggestions or for the agent to ask them questions, add that one request at the end.
8. Never reply to the speaker, never ask them what they mean, never refuse. Always output your best faithful rewrite, even for a fragment.

Output only the finished message, ready to send. No preamble, no code fences.
Then, on a new line, write ${LEARNED_MARKER} followed by a comma-separated list of the names or terms you corrected or that were important in this note, spelled correctly (for example: Fable, SellAuth). Write nothing after ${LEARNED_MARKER} if there are none.`;

export interface MicConversationMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

export interface MicRewriteInput {
  readonly transcript: string;
  readonly projectKey: string | null;
  readonly projectName: string | null;
  readonly threadTitle: string | null;
  readonly messages: ReadonlyArray<MicConversationMessage>;
}

export interface MicRewriteResult {
  readonly text: string;
  readonly rewritten: boolean;
  readonly warning?: string;
}

export async function micHelperHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${MIC_HELPER_ORIGIN}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => null)) as { ok?: unknown } | null;
    return body?.ok === true;
  } catch {
    return false;
  }
}

export async function transcribeWithHelper(
  audio: Uint8Array,
  contentType: string,
): Promise<string> {
  const response = await fetch(`${MIC_HELPER_ORIGIN}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": contentType || "audio/webm" },
    body: audio,
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await response.json().catch(() => null)) as {
    text?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : `Speech helper answered ${response.status}.`,
    );
  }
  return typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
}

function micHome(): string {
  if (process.env.SCAR_MIC_HOME) return process.env.SCAR_MIC_HOME;
  if (IS_WINDOWS) {
    return NodePath.join(
      process.env.LOCALAPPDATA ?? NodePath.join(NodeOS.homedir(), "AppData", "Local"),
      "ScarMic",
    );
  }
  return NodePath.join(NodeOS.homedir(), ".local", "share", "scar-mic");
}

function memoryFile(projectKey: string): string {
  const safe = projectKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "unknown";
  return NodePath.join(micHome(), "memory", `${safe}.json`);
}

function readProjectWords(projectKey: string | null): string[] {
  if (!projectKey) return [];
  try {
    const raw = JSON.parse(NodeFS.readFileSync(memoryFile(projectKey), "utf8")) as {
      words?: unknown;
    };
    return Array.isArray(raw.words)
      ? raw.words.filter((w): w is string => typeof w === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberWords(projectKey: string | null, projectName: string | null, learned: string[]) {
  if (!projectKey || learned.length === 0) return;
  const known = readProjectWords(projectKey);
  const seen = new Set([...known, ...GLOBAL_WORDS].map((w) => w.toLowerCase()));
  const fresh = learned.filter((w) => !seen.has(w.toLowerCase()));
  if (fresh.length === 0) return;
  const words = [...fresh, ...known].slice(0, MEMORY_MAX_WORDS);
  const file = memoryFile(projectKey);
  try {
    NodeFS.mkdirSync(NodePath.join(file), { recursive: true });
    NodeFS.writeFileSync(
      file,
      JSON.stringify({ project: projectName, updatedAt: new Date().toISOString(), words }, null, 2),
      "utf8",
    );
  } catch {
    // Memory is a nice-to-have; never fail the dictation over it.
  }
}

function parseLearnedWords(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((w) =>
      w
        .trim()
        .replace(/^[-*•\s]+/, "")
        .replace(/[.;:]+$/, ""),
    )
    .filter((w) => w.length >= 2 && w.length <= 40 && !/^(none|n\/a)$/i.test(w))
    .slice(0, 20);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function buildRecentConversation(messages: ReadonlyArray<MicConversationMessage>): string {
  const lines: string[] = [];
  let total = 0;
  // Newest first until the budget runs out, then put back in reading order.
  for (const message of [...messages].reverse().slice(0, CONTEXT_MAX_MESSAGES)) {
    const line = `${message.role === "user" ? "Speaker" : "Agent"}: ${clip(message.text, CONTEXT_MESSAGE_MAX_CHARS)}`;
    if (total + line.length > CONTEXT_MAX_CHARS) break;
    lines.push(line);
    total += line.length;
  }
  return lines.reverse().join("\n\n");
}

function buildRewriteInput(input: MicRewriteInput): string {
  const words = [...new Set([...readProjectWords(input.projectKey), ...GLOBAL_WORDS])];
  const conversation = buildRecentConversation(input.messages);
  return [
    `<project>${input.projectName ?? "unknown"}${input.threadTitle ? ` (chat: ${input.threadTitle})` : ""}</project>`,
    `<known_words>${words.join(", ")}</known_words>`,
    `<recent_conversation>\n${conversation || "(new chat, nothing said yet)"}\n</recent_conversation>`,
    `<voice_note>\n${input.transcript}\n</voice_note>`,
  ].join("\n\n");
}

// A reply instead of a rewrite ("I'm not sure what you mean...") must never be sent as the owner.
function looksLikeAReply(text: string): boolean {
  return /^(i('m| am) not sure what|i don'?t (know|understand) what|could you (clarify|explain)|what do you mean|sorry,? (but )?i)/i.test(
    text.trim(),
  );
}

function splitRewriteOutput(output: string): { text: string; learned: string[] } {
  const index = output.lastIndexOf(LEARNED_MARKER);
  if (index === -1) return { text: output.trim(), learned: [] };
  return {
    text: output.slice(0, index).trim(),
    learned: parseLearnedWords(output.slice(index + LEARNED_MARKER.length)),
  };
}

function resolveClaude(): { file: string; shell: boolean } {
  if (process.env.T3CODE_MIC_CLAUDE_PATH) {
    const file = process.env.T3CODE_MIC_CLAUDE_PATH;
    return { file, shell: /\.(cmd|bat)$/i.test(file) };
  }
  const home = NodeOS.homedir();
  if (IS_WINDOWS) {
    try {
      const found = NodeChildProcess.execFileSync("where.exe", ["claude"], {
        encoding: "utf8",
        windowsHide: true,
      })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const exe = found.find((f) => /\.exe$/i.test(f));
      if (exe) return { file: exe, shell: false };
      const cmd = found.find((f) => /\.(cmd|bat)$/i.test(f));
      if (cmd) return { file: cmd, shell: true };
    } catch {
      // fall through to the usual install spots
    }
    for (const guess of [NodePath.join(home, ".local", "bin", "claude.exe")]) {
      if (NodeFS.existsSync(guess)) return { file: guess, shell: false };
    }
    return { file: "claude", shell: true };
  }
  const local = NodePath.join(home, ".local", "bin", "claude");
  return { file: NodeFS.existsSync(local) ? local : "claude", shell: false };
}

function runClaude(systemPrompt: string, stdinText: string): Promise<string> {
  const workDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-mic-"));
  const systemPromptFile = NodePath.join(workDir, "system-prompt.txt");
  NodeFS.writeFileSync(systemPromptFile, systemPrompt, "utf8");
  const args = [
    "-p",
    "--model",
    REWRITE_MODEL,
    "--system-prompt-file",
    systemPromptFile,
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--output-format",
    "text",
  ];
  const { file, shell } = resolveClaude();
  const quote = (arg: string) =>
    arg === "" ? '""' : /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;

  return new Promise<string>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = NodeChildProcess.spawn(
      shell ? quote(file) : file,
      shell ? args.map(quote) : args,
      {
        cwd: workDir, // empty folder: no project files leak into the rewrite
        env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" },
        shell,
        windowsHide: true,
      },
    );
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      NodeFS.rm(workDir, { recursive: true, force: true }, () => {});
      if (error) reject(error);
      else resolve(stdout.trim());
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("The rewrite took too long."));
    }, REWRITE_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) finish(null);
      else
        finish(
          new Error(
            stderr.trim().split(/\r?\n/).slice(-2).join(" ") || `claude exited with ${code}`,
          ),
        );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdinText, "utf8");
  });
}

export async function rewriteTranscript(input: MicRewriteInput): Promise<MicRewriteResult> {
  try {
    const output = await runClaude(SYSTEM_PROMPT, buildRewriteInput(input));
    const { text, learned } = splitRewriteOutput(output);
    if (!text || looksLikeAReply(text)) {
      return {
        text: input.transcript,
        rewritten: false,
        warning: "The rewrite didn't come out right, so your exact words were used.",
      };
    }
    rememberWords(input.projectKey, input.projectName, learned);
    return { text, rewritten: true };
  } catch (error) {
    return {
      text: input.transcript,
      rewritten: false,
      warning: `Rewrite failed (${error instanceof Error ? error.message : "unknown error"}), so your exact words were used.`,
    };
  }
}
