# T3 Code nightly — what's new and what you can do (2026-11-14)

Your version: **0.1.10-nightly.20261114.4709** (official, auto-updates). Since Oct 20 Theo's team shipped **~280 new features** and ~2,500 changes since Nov 1. Nothing below is ours: your copy has **zero custom code**.

## 🆕 The biggest new things

- 🎨 **Theme editor** — Settings → Appearance → Themes: pick colors, paste your own style code (up to 50,000 characters), import themes, search them. **Agents can restyle T3 too** (I can set a theme for you directly).
- 🌍 **App language** — Settings → General → Language (Spanish, Chinese, French, German, Japanese, Korean, Russian, Portuguese).
- 🖌️ **New design is on by default** (since Oct 25), with color only where it means something.
- 🎙️ **Built-in mic** — local speech models on your PC, AI cleanup, dictionary, filler-word removal (details at the bottom).
- 💬 **Side chats** — open a small chat beside the main thread without derailing it.
- ↩️ **Reply to one answer** — hover an assistant message → reply; quotes show as a neat inset card.
- 🧹 **/clear** — fresh session in the same thread (no new thread needed).
- 🔮 **Suggest next prompt** (Labs) — after a turn, a guessed next message sits in the empty box; **Tab** uses it.
- 📁 **Group by project** (Labs, "Boring sidebar") — sidebar threads sorted into project folders.
- 🙈 **Hide tool calls** — Settings → Chat → Tool calls in chat: threads read like a normal chat.
- 🧠 **One model + effort picker**, **@-mention a model** in a message, model list auto-checks for new models, **Fable 5.2** added, **Ultracode at any effort**.
- 📊 **Usage** — context meter shows tokens vs. limit; Labs toggle keeps 5-hour / weekly / context limits always visible; Usage page filters by model.
- 🔁 **Out of usage?** — falls back to a backup model, snoozes threads until limits reset, then resumes them.
- 🔍 **Ctrl+K search** finds the right thread first and searches inside messages and settings.

## 🗂️ Sidebar and threads

- 📌 **Pin favorite projects**, archive old ones, **drop a folder** on the sidebar to add it as a project.
- 🏷️ **Tag threads**, and hide tagged ones while screen recording.
- 🧺 **Filter by several projects** at once; "Working" section on by default.
- 😴 **Custom snooze options**; **auto-settle** after N days (yours: 1 day; default 7).
- 🗑️ Delete archived threads from the archive page; **turn a "No project" thread into a project**.
- 🔗 **Copy thread** gives a link that opens the thread, even on your phone.

## 🖥️ PC ↔ VPS ↔ phone

- 🔌 **Linked environments** — @-mention a machine, hand work to the VPS, the @ picker lists VPS threads too.
- 👀 **Guest links** (Labs) — share a thread; a guest watches live and can send messages you approve.
- 🔐 **T3 Connect approvals** — new devices and agent sign-ins need your OK (no codes).
- 🔄 **Switch every machine between Stable and Nightly in one step**; on Windows `t3 service` lets the VPS/PC update remotely.
- 🔋 **Keep the computer awake while agents work** (Settings → Maintenance).
- ♻️ **Threads continue after restarts**; stopped threads resume natively.
- 🧩 **Use T3 Code from another app** (it acts as an MCP tool — e.g. Claude Desktop could start T3 threads).

## ⏰ Scheduled tasks

- 📅 Run once at a set date and time, or repeat.
- 🧼 Repeat in **one thread with a fresh session each run**; move a task to another thread.

## 🛠️ Code, PRs and files

- 💬 **PR comments land in the chat**; watched PRs react the moment checks finish.
- 🧭 **Review guides** (beta) — an AI walkthrough of a PR.
- 🔎 Review local commits in the Diff pane; open any tool-call diff in the diff panel.
- 📄 **Preview almost any file** — Word/Excel/PowerPoint, fonts, diagrams, zip files, databases, e-books, notebooks; audio plays inline; spreadsheet columns resize.
- 🌐 **Browser** — agent browser access, profiles, recordings that show key presses, cookie import (incl. Zen).
- 📸 **SnapShots** — screenshot shortcut that also captures the app's text.
- ⬅️ Back/forward buttons and trackpad swipe in the desktop app.

## ✍️ Writing helpers

- 🤖 **Text generators** — plug in any model service (incl. a **free local one on your PC**) for thread titles, commit messages and mic cleanup.
- 🏷️ **Thread title instructions** — tell it how to name threads.
- 📝 Composer switches between rich text and plain Markdown (**Ctrl+/**); send while files still upload; follow-ups **steer** the running turn by default.

## ⚙️ Every settings page (22)

- **General** — project grouping, project order, Working section, notifications, language, time format, confirmations, quit shortcut.
- **Appearance** — light/dark, **themes**, contrast, glass, chat width, thread details card, fonts and sizes, panel animations.
- **Chat** — tool calls in chat, slash-menu skills, rich text composer, send key, follow-up behavior.
- **Diffs & PRs** — diff colors/layout, hide whitespace, open PRs in T3.
- **Keybindings** — every shortcut, editable.
- **Voice** — mic list + test, shortcut mode, where to transcribe, language, dictionary (device + project), silence filter, filler words, AI cleanup + model, correction cue, model downloads.
- **SnapShots** — capture key, sound, flash.
- **Providers** — Claude/Codex/OpenCode/Cursor/Grok/Kiro/etc., usage sources, **text generators**, idle compaction.
- **Threads** — default + fallback model, permissions, snooze, resume after limits, auto-settle, streaming, title model and instructions.
- **Browser** — agent access, profiles, viewport, recordings, link target, search engine.
- **Devices** — phone simulators for app testing.
- **Scheduled tasks** — list and manage.
- **Projects** — per-project overview and actions.
- **Source control** — auto pull, merge method, PR writing, review guides.
- **Worktrees** — location, cleanup, branch naming.
- **Environments** — this PC, linked machines, load balancing.
- **Sharing & access** — network access, Tailscale, T3 Connect, device approval.
- **Secrets** — password-manager links (hidden behind a flag for now).
- **Maintenance** — free disk space, keep awake, continue after restarts, update checks.
- **Labs** — group by project, two-line rows, guest links, linked environments, **suggest next prompt**, fast worktrees.
- **About** — version, Stable/Nightly track, `t3` command, mobile app.
- **Archive** — archived threads.

## ❓ "Suggest next prompt" and "Group by project" — ours or built in?

- ✅ **Both are built into official T3** (Labs page). We didn't add them — your copy has no custom code.
- 🔮 Suggest next prompt: added Nov 8. Currently **off**. Each suggestion is one extra (cached) request on your Claude plan.
- 📁 Group by project ("Boring sidebar"): added Oct 28. Currently **off**.

## 🎙️ Built-in mic — how it's set up now

- 🗣️ **Speech-to-text:** Parakeet Unified English (T3's top pick, 697 MB) runs **on your PC**, free, private.
- 🧹 **Cleanup:** fixes punctuation, names, lists and "sorry, I mean…" corrections using **Muse Ember 1.0** (Meta, same model and key as Mo) — **not your Claude plan**. ~2-3 s, about $0.0005 per use. Set on both the PC and the VPS.
- 🧯 **Backup:** a free local AI (qwen3 4B through Ollama) is still set up in T3 as a spare "text generator", unused unless you switch back.
- 🔑 **Muse key saved:** Windows setting `MUSE_API_KEY` on the PC, `~/.secrets/muse-api-key` on the VPS, and T3's locked secret store on both.
- 📖 **Dictionary:** 5Hub, Motion Life, T3 Code, Claude, Fable, Opus, Scar, VPS.
- ⌨️ **Key:** **Delete** (also Ctrl+Shift+D). Tap = start/stop, hold = talk while held. Only inside T3.
- 🔁 **OpenWhispr** still runs for other apps: **Insert** = plain dictation (was Delete), **Page Up** = prompt writer.
- ⚠️ Delete no longer deletes forward inside T3's message box (Backspace still works).
- ↩️ **Undo:** backups of the old T3 settings are in `~/.t3-backups/settings-2026-11-14-mic/`; OpenWhispr's old key file is `%APPDATA%\OpenWhispr\.env.bak-2026-11-14`.
