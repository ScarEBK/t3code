# Scar's T3 Code fork

Fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) with six extras: a mic in the
message box, split view, a "Needs you" list, an always-on Claude usage meter, a Z Code look and a
Checklist tab for the Project Board.

New code lives in its own files so upstream updates rebase cleanly:

- `apps/web/src/fork/` (all web features, their tests and settings)
- `apps/server/src/fork/` (the Project Board bridge)
- `apps/desktop/src/window/ForkMediaPermissions.ts` (+ test)
- `scripts/fork-sync.ts`, this file

## Sync with upstream (one command)

`main` is the fork's app. It follows upstream's nightly builds, by merging, so history is never rewritten.

```sh
vp run fork:sync                # merge the newest upstream nightly tag
vp run fork:sync -- --check     # just show how far behind we are
vp run fork:sync -- --main      # merge upstream/main instead of the newest nightly
vp run fork:sync -- --rebase    # rebase a short-lived feature branch instead of merging
```

It adds the `upstream` remote if missing, refuses to run on a dirty tree, and stops on a conflict
with the files to fix. Conflicts can only land in the upstream files listed below.

## Upstream files the fork touches

Keep this list in step with `git diff --stat upstream/main...HEAD`.

| File                                                        | Lines  | Why                                                                                                           |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/chat/ChatComposer.tsx`             | +11 −1 | Renders the mic button next to Attach and gives it the insert-at-caret callback.                              |
| `apps/web/src/components/ThreadRouteView.tsx`               | +4 −1  | Wraps the routed chat in `ForkSplitLayout` so a second chat can sit on the right.                             |
| `apps/web/src/components/Sidebar.tsx`                       | +14    | Usage meter above Search, Needs you below it; "Open on the right" menu case; Alt/middle-click opens it right. |
| `apps/web/src/components/sidebar/SidebarThreadRow.tsx`      | +5     | Forwards middle-click (`auxclick`) to the row click handler.                                                  |
| `apps/web/src/components/threadActionMenu.logic.ts`         | +13    | Adds the "Open on the right" menu item in its own group (sidebar only, read-only safe).                       |
| `apps/web/src/contextMenuFallback.ts`                       | +4     | Icon for that item in the web context menu.                                                                   |
| `apps/web/src/components/settings/SettingsPanels.tsx`       | +2     | Renders the fork's Dictation + Usage meter sections in Settings → General.                                    |
| `packages/contracts/src/keybindings.ts`                     | +2     | Registers `composer.dictate` and `split.toggle` commands.                                                     |
| `packages/shared/src/keybindings.ts`                        | +2     | Default keys: Ctrl/Cmd+Alt+M (mic), Ctrl/Cmd+Alt+S (split).                                                   |
| `apps/desktop/src/window/DesktopWindow.ts`                  | +2     | Grants the microphone to the app's own window only.                                                           |
| `package.json`                                              | +1     | `fork:sync` script, so `vp run fork:sync` runs the sync.                                                      |
| `apps/web/src/rightPanelStore.ts`                           | +6     | Adds the `progress` right-panel surface (Progress panel).                                                     |
| `apps/web/src/components/RightPanelTabs.tsx`                | +29    | "Progress" entry (key R) in both surface launchers, plus its tab title and icon.                              |
| `apps/web/src/components/chat/RightPanelSurfaceContent.tsx` | +3     | Renders `fork/progress/ProgressPanel` for the `progress` surface.                                             |
| `apps/web/src/components/chat/useRightPanelActions.ts`      | +7     | `addProgressSurface` opens it from the launcher.                                                              |
| `apps/web/src/components/ChatView.tsx`                      | +3     | Passes the Progress launcher callback and availability.                                                       |
| `apps/web/src/components/pullRequest/PullRequestsPage.tsx`  | +2     | Progress is unavailable on the global pull requests page.                                                     |
| `apps/web/src/closedViewStore.ts`                           | +1     | Lets a closed Progress tab reopen.                                                                            |

The Z Code look is the one extra that edits upstream files in place, because a reskin has nowhere
else to live: `apps/web/src/index.css` (dark colors), `components/sidebar/*`, `components/chat/Composer*`,
`ChatHeader`, `ChatView`, `BranchToolbar`, `SidebarStageBackdrop`, `T3Wordmark`, `DraftHero*`,
`ProjectFavicon`, `ProjectSettingsPanel`, `AppearanceSettingsPanel`, `ui/sidebar.tsx`, `hooks/useTheme.ts`, `index.html` and the startup color in
`DesktopWindow.ts`. On a sync conflict there, take upstream's behavior and re-apply the styling.

## Checklist tab

The right panel's + menu (and the command palette) opens a Checklist tab that reads the Project Board
(`Desktop/Code/project-board`, port 7790) through `/api/fork/board` on the T3 server, so phones and
other PCs see it too. Reading needs read scope; Done / Not yet / Reopen need operate scope and write as
the owner. Set `T3CODE_BOARD_URL` if the board uses another port; it must stay on this machine, since the
board refuses non-loopback callers. Upstream files touched: `server.ts`
(+2, registers the route), `rightPanelStore.ts` and `closedViewStore.ts` (the `checklist` kind),
`RightPanelTabs.tsx` (menu entries, title, icon), `RightPanelSurfaceContent.tsx`, `useRightPanelActions.ts`,
`ChatView.tsx` and `CommandPalette.tsx`. On a conflict, re-add the `checklist` case next to `side-chat`.

Fork settings (mic on/off, speech helper address, usage meter on/off, split state) are stored in
`localStorage` under `t3code:fork:*`, so upstream's settings contract is untouched.

## Progress panel

The Progress surface in the right panel reads `PROGRESS.md` at each project's root (`## Section`,
then `- [x]` done, `- [~]` in progress, `- [ ]` to do, indented lines as notes) and re-reads it every
15 seconds while open. Each task can write a ready prompt into the chat, or into a new chat when the
task belongs to another project. Code lives in `apps/web/src/fork/progress/`.

## Auto-settle after 4 hours

Idle threads settle after four hours by default, and the setting is edited in hours. Upstream's
schema rejects anything under one day and then ignores all of `settings.json`, so before reinstalling
the official app, remove any saved `sidebarAutoSettleAfterDays` below 1 from that file. The default
is not saved there. Changed files: `packages/contracts/src/settings.ts`, the auto-settle controls in
`SettingsPanels.tsx`, `SettingInheritance.tsx`, `settingsSearch.ts`, and the mobile auto-settle field.

## Windows installer

```sh
cp .env.example .env   # required: without it the build has no T3 Connect, so linked machines stay "not connected"
node scripts/build-desktop-artifact.ts --platform win --target nsis --arch x64
```

No elevated Visual Studio installer for the Spectre libraries? Build the resource monitor first
(`cargo build --locked --release --manifest-path native/resource-monitor/Cargo.toml --target
x86_64-pc-windows-msvc`) and run the command with `T3CODE_DESKTOP_REUSE_RESOURCE_MONITOR=true`.
The installer uses the same app id as the official build, so installing it replaces the official
app in place (same data in `~/.t3`); reinstall the official one to go back.

Built unsigned (signing is off unless `T3CODE_DESKTOP_SIGNED` is set). Leave
`GITHUB_REPOSITORY` / `T3CODE_DESKTOP_UPDATE_REPOSITORY` unset: with no publish feed the build
has no `app-update.yml`, so the installed app never auto-updates back to the official release.
It keeps using `~/.t3` like the official app (override with `T3CODE_HOME`).
