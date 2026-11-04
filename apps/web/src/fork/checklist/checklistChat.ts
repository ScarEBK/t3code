import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";

import { toastManager } from "~/components/ui/toast";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useRightPanelStore } from "~/rightPanelStore";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { readProjects, useProjects } from "~/state/entities";
import { readEnvironment, readPrimaryEnvironmentId } from "~/state/environments";
import { environmentThreadShells } from "~/state/threads";
import { peekBoard } from "./boardClient";
import { REMOTE_CHAT_LIMIT, pickChatTarget, sameProjectName } from "./checklistView";

const APP_KEY = "t3code:fork:checklist:app";

export interface PickedApp {
  readonly id: string;
  readonly name: string;
}

export function readPickedApp(): PickedApp | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(APP_KEY) ?? "null");
    if (value && typeof value === "object" && "id" in value && "name" in value) {
      return { id: String(value.id), name: String(value.name) };
    }
  } catch {
    // Remembering the pick is a convenience only.
  }
  return null;
}

export function storePickedApp(app: PickedApp) {
  try {
    window.localStorage.setItem(APP_KEY, JSON.stringify({ id: app.id, name: app.name }));
  } catch {
    // Remembering the pick is a convenience only.
  }
}

// Read at click time: thread shells change on every push and must not re-render the panel.
function remoteHasRoom(environmentId: EnvironmentId): boolean {
  if (readEnvironment(environmentId)?.connection.phase !== "available") return false;
  const running = appAtomRegistry
    .get(environmentThreadShells.threadShellsAtom)
    .filter(
      (shell) => shell.environmentId === environmentId && threadRuntimeIsActive(shell.runtime),
    );
  return running.length < REMOTE_CHAT_LIMIT;
}

type ChatPlace = {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
} | null;

function projectTitle(projects: ReturnType<typeof readProjects>, place: ChatPlace) {
  return (
    projects.find(
      (project) =>
        project.environmentId === place?.environmentId && project.id === place?.projectId,
    )?.title ?? null
  );
}

/** Opens a new chat in the T3 project matching a board app, keeping the Checklist beside it. */
function useOpenNewAppChat() {
  const handleNewThread = useNewThreadHandler();
  return (app: PickedApp, prompt?: string) => {
    const target = pickChatTarget(
      readProjects().filter(
        (project) => !project.archivedAt && sameProjectName(project.title, app.name),
      ),
      { localEnvironmentId: readPrimaryEnvironmentId(), remoteHasRoom },
    );
    if (!target) {
      toastManager.add({
        type: "error",
        title: `No project named ${app.name}`,
        description: "Add its folder as a project in T3 Code first.",
      });
      return;
    }
    handleNewThread(scopeProjectRef(target.environmentId, target.id), prompt ? { prompt } : {})
      .then((created) => {
        if (created) {
          useRightPanelStore
            .getState()
            .open(scopeThreadRef(target.environmentId, created.threadId), "checklist");
        }
      })
      .catch(() =>
        toastManager.add({ type: "error", title: `Couldn't open a new chat in ${target.title}` }),
      );
  };
}

export function useOpenAppChat(current: ChatPlace) {
  const openChat = useOpenNewAppChat();
  const currentTitle = projectTitle(useProjects(), current);
  const isCurrent = (app: PickedApp) =>
    currentTitle !== null && sameProjectName(currentTitle, app.name);
  return { openChat, isCurrent, currentTitle };
}

/** Insert: a chat in a board app gets the Checklist; any other chat moves to the last picked app. */
export function useOpenChecklist(current: ChatPlace) {
  const openChat = useOpenNewAppChat();
  // Read at press time so the chat view does not re-render on project changes.
  return (threadRef: ScopedThreadRef) => {
    const picked = readPickedApp();
    const title = projectTitle(readProjects(), current);
    const board = peekBoard();
    const inApp =
      title !== null &&
      (board
        ? board.projects.some((app) => !app.deleted && sameProjectName(app.name, title))
        : picked !== null && sameProjectName(picked.name, title));
    if (picked && !inApp) {
      openChat(picked);
      return;
    }
    useRightPanelStore.getState().open(threadRef, "checklist");
  };
}
