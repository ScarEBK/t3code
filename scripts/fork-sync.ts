#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - a tiny git wrapper run by hand.
// Fork: take upstream main in one command (`vp run fork:sync [-- --merge|--check]`).
// Conflicts can only land in the upstream files FORK.md lists.
import * as NodeChildProcess from "node:child_process";

const UPSTREAM_URL = "https://github.com/pingdotgg/t3code.git";
const args = new Set(process.argv.slice(2));

function git(...gitArgs: string[]): string {
  return NodeChildProcess.execFileSync("git", gitArgs, { encoding: "utf8" }).trim();
}

function run(...gitArgs: string[]): number {
  return NodeChildProcess.spawnSync("git", gitArgs, { stdio: "inherit" }).status ?? 1;
}

const remotes = git("remote").split(/\r?\n/);
if (!remotes.includes("upstream")) {
  console.log(`Adding remote upstream -> ${UPSTREAM_URL}`);
  git("remote", "add", "upstream", UPSTREAM_URL);
}

if (git("status", "--porcelain").length > 0) {
  console.error("Working tree has changes. Commit or stash them, then run this again.");
  process.exit(1);
}

console.log("Fetching upstream main…");
if (run("fetch", "upstream", "main") !== 0) process.exit(1);

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const behind = Number(git("rev-list", "--count", "HEAD..upstream/main"));
const ahead = Number(git("rev-list", "--count", "upstream/main..HEAD"));
console.log(`${branch}: ${behind} upstream commits to take, ${ahead} fork commits on top.`);
if (args.has("--check") || behind === 0) process.exit(0);

const mode = args.has("--merge") ? "merge" : "rebase";
const status =
  mode === "merge" ? run("merge", "--no-edit", "upstream/main") : run("rebase", "upstream/main");
if (status !== 0) {
  console.error(
    `\n${mode} stopped on a conflict. Fix the files git lists (they will be ones named in FORK.md), ` +
      `then 'git ${mode === "merge" ? "commit" : "rebase --continue"}', or 'git ${mode} --abort' to undo.`,
  );
  process.exit(status);
}
console.log(
  `\nDone: ${branch} now sits on upstream/main (${git("rev-parse", "--short", "upstream/main")}).`,
);
if (mode === "rebase" && ahead > 0) {
  console.log(
    "Push with: git push --force-with-lease (only for your own feature branches, never main).",
  );
}
