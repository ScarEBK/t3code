# Scar's T3 Code: split view, usage always on screen, mic in the chat box

Scar (2026-10-28): "Add the mic option... add split view, basically like different sessions that are currently working
and or things that need me... where it will open up the page next to it on the right of it... the usage limit, how much
limits I have on my left... basically on the right side or the top section." Full quote in docs/OWNER-ASKS.md.

Why: Scar runs several Claude chats at once, dictates by voice, and has ADHD. They need to see at a glance which chats
are working and which need them, keep two chats open side by side, see how much usage is left without opening a page,
and talk instead of type.

## What gets built (full version)
1. **Split view.** Open any chat on the right half, next to the current one, each with its own chat box.
   Ways in: right-click a chat in the sidebar → "Open on the right", drag a chat from the sidebar onto the chat area,
   and a keybinding. Drag the divider to resize, swap sides, close the right one. The split survives a restart.
   States: right chat loading, deleted or archived (pane says so and offers close), window too narrow (falls back to
   one chat with a "split hidden, window too small" pill), phone/web narrow width (no split, nothing breaks).
2. **"Needs you" at a glance.** Sidebar shows chats waiting on Scar (approval, a question, finished and unread) in a
   "Needs you" group above "Working", each with a coloured dot; count badge on the app icon/title where the platform
   allows. Clicking one opens it; middle-click / modifier-click opens it on the right.
3. **Usage meter always visible.** A compact meter pinned at the top of the left sidebar: Claude's 5-hour and weekly
   limits as two thin bars with % used and time to reset (Ohio time is the user's clock). Amber at 75%, red at 90%.
   Click → the existing Usage page. States: loading, provider has no limits (hidden), error (small "usage unavailable").
   Setting to show/hide it (Settings → General). Uses the data the Usage page already fetches; no extra polling cost.
4. **Mic button in the chat box.** Click (or keybinding) to start, click again to stop; live timer + level while
   recording; the words land where the cursor is. Speech-to-text goes to Scar's local helper (Scar Mic, already
   running: `POST http://127.0.0.1:47811/transcribe` with the audio body → `{"text"}`, `GET /health`). Endpoint URL is a
   setting. States: helper not running (button greyed, tooltip says how to start it), mic permission denied,
   recording, transcribing, error toast. The desktop app must allow microphone access for its own window only.
5. **Fork that stays easy to update.** New code in new files, the fewest possible edits to upstream files, and a
   `FORK.md` listing every upstream file touched and why, plus a one-command sync with upstream main.
6. **A Windows installer of the fork**, built and launched against an isolated home to prove it runs. It must keep
   using `~/.t3` data when Scar installs it, and must NOT auto-update itself back to the official build.

## UNCHANGED (never touch)
- Scar's live install: `~/.t3/userdata`, the running T3 Code, its processes. Test only against a copied home (AGENTS.md).
- Everything upstream does today works the same; web and mobile clients don't break; no performance regressions.
- The official app stays installed until Scar has seen the fork built and says yes.

## Calls I made
- Usage meter sits at the top of the **left** sidebar (Scar said "on my left" first).
- Split view is 2 chats (left + right). 3-4 tiles grid is the next piece, not in this round.
- Mic uses the free local helper, not Claude's private voice service (unofficial, could break any time).
- Build on latest upstream main, not v0.1.3.
- No questions asked: Scar's rule 10-28 is "don't ever ask me".

## Proof
See checklist.json. Gates: `vp run check:changed`, `vp run typecheck`, tests beside changed logic, `code-review high
--fix`, screenshots of every new state at 1920 and 390 (web), one `design-critic` run, installer launches.
