# Progress

## 2026-10-28 plan chat

- Forked pingdotgg/t3code to ScarEBK/t3code; plan written. Scar Mic helper already runs on Scar's PC
  (C:\Users\Administrator\Tools\scar-mic\mic.pyw, F9 + floating button, local endpoint on 127.0.0.1:47811).
- Next: build session builds every checklist item.

## 2026-10-28 build session (Ohio time ~21:00)

- Set up: pnpm install, installed the Vite+ `vp` CLI (README's official installer; repo scripts spawn `vp`). Dev server runs
  with `--home-dir <repo>/.t3` (this clone is not a worktree, so the default would have been ~/.t3) and a
  `migrate-dev-db` copy of real data. Driven by a local Playwright script (fake mic fed a spoken WAV clip).
- Mic done first (Scar's 10-28 update): button, recording/transcribing/offline/denied/error states, Ctrl+Alt+M, settings,
  Electron media permission. Proven against the live helper.

### Calls I made

- Mic shortcut is **Ctrl+Alt+M** (Cmd+Alt+M on Mac): the asked-for Ctrl+Shift+M already opens the model picker.
- Mic sits right after Attach on the left of the row (same ghost button as Attach); Send stays on the right.
- Collapsed phone composer (one-line resting row) stays upstream's; the mic shows once the box is expanded, like Attach.
- Fork settings (mic on/off, helper URL, usage meter on/off) live in localStorage so upstream's settings contract is untouched.
- Electron: mic/camera granted only to the app's own windows; every other permission keeps Electron's default.
- ~18:45 PDT: usage meter, split view, Needs you, FORK.md + fork-sync all passing with proof. Installer build running;
  design-critic next, then code review + checks.
- Calls I made: split shortcut is Ctrl+Alt+S (toggles: opens the previous chat on the right, or closes the split).
  Mod-click on a sidebar row stays upstream's multi-select, so "open on the right" from the sidebar is Alt-click or
  middle-click. "Needs you" sits at the top of the sidebar (under the usage meter) so it's seen first; the Working
  shelf stays where upstream has it. Reset times in the meter tooltip are Ohio time (ET). The usage meter tracks
  Claude only (Scar's provider); it hides when no Claude account reports limits.
