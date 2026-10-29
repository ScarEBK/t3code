import type { ScopedThreadRef } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { ArchiveIcon, ArrowLeftRightIcon, Columns2Icon, TrashIcon, XIcon } from "lucide-react";
import { type CSSProperties, type ReactNode, use, useEffect, useRef, useState } from "react";
import ChatView from "~/components/ChatView";
import { BackgroundThreadContext } from "~/components/chat/backgroundThread";
import {
  threadContextDropTargetProps,
  useThreadContextDrop,
  useThreadContextDragGhost,
} from "~/components/chat/threadContextDrag";
import { RightPanelResizeHandle } from "~/components/preview/RightPanelResizeHandle";
import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { ComposerHandleContext } from "~/composerHandleContext";
import type { ChatComposerHandle } from "~/components/chat/ChatComposer";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { shortcutLabelForCommand } from "~/keybindings";
import { observeResize } from "~/lib/observeResize";
import { registerCommands } from "~/shortcuts/dispatcher";
import { useQuietThreadShell } from "~/state/entities";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { useEnvironmentThread } from "~/state/threads";
import { buildThreadRouteParams } from "~/threadRoutes";
import { SplitPaneRoleContext } from "./splitPaneRole";
import { resolveSecondaryPaneState } from "./splitPaneState";
import {
  closeSplit,
  notePrimaryThread,
  openThreadOnRight,
  readPreviousPrimaryThread,
  readSplitRightThread,
  sameThreadRef,
  SPLIT_PANE_MIN_WIDTH,
  SPLIT_WIDTH_STORAGE_KEY,
  splitLayoutMode,
  useSplitRightThread,
} from "./splitViewStore";

const SPLIT_COMMAND = "split.toggle";

const DROP_TARGET_KEY = "fork-split-drop";

/**
 * Wraps the routed chat. With a chat pinned on the right and room for both, renders it beside
 * the routed one; otherwise renders the routed chat untouched (plus a drop zone while a sidebar
 * chat is being dragged).
 */
export function ForkSplitLayout({
  primaryRef,
  background,
  children,
}: {
  readonly primaryRef: ScopedThreadRef | null;
  readonly background: boolean;
  readonly children: ReactNode;
}) {
  const navigate = useNavigate();
  const rightRef = useSplitRightThread();
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the shown chat in a module store after commit, so a discarded render can't pair the shortcut with a chat that never showed
  useEffect(() => {
    notePrimaryThread(primaryRef);
  }, [primaryRef]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the main area so the split can fall back when two chats don't fit
  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    setHostWidth(host.getBoundingClientRect().width);
    return observeResize(host, (entries) => {
      const entry = entries.at(-1);
      if (entry) setHostWidth(entry.contentRect.width);
    });
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the split shortcut with the command registry while the chat area is mounted
  useEffect(() => {
    if (background) return;
    return registerCommands({
      [SPLIT_COMMAND]: (event) => {
        event.preventDefault();
        if (readSplitRightThread()) {
          closeSplit();
          return;
        }
        const previous = readPreviousPrimaryThread();
        if (previous && !sameThreadRef(previous, primaryRef)) {
          openThreadOnRight(previous);
          return;
        }
        toastManager.add({
          type: "info",
          title: "Pick a chat for the right side.",
          description:
            "Right-click a chat in the sidebar → Open on the right, or drag it onto this area.",
        });
      },
    });
  }, [background, primaryRef]);

  const mode = splitLayoutMode(hostWidth);
  const splitOn = rightRef !== null && primaryRef !== null && !sameThreadRef(rightRef, primaryRef);
  const showSplit = splitOn && mode === "split";

  const swap = () => {
    if (!rightRef || !primaryRef) return;
    openThreadOnRight(primaryRef);
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(rightRef) });
  };

  return (
    <>
      <span ref={hostRef} hidden />
      {/* One stable wrapper, so opening/closing the split (or resizing across the breakpoint)
          never remounts the routed chat: that would drop scroll, focus and a live recording. */}
      <div className="flex min-h-0 min-w-0 flex-1" data-fork-split={showSplit ? "on" : "off"}>
        <div className="relative flex min-h-0 min-w-0 flex-1" data-fork-split-pane="primary">
          <SplitPaneRoleContext value={showSplit ? "primary" : null}>
            {children}
          </SplitPaneRoleContext>
        </div>
        {showSplit && rightRef ? (
          <SecondaryPane
            key={`${rightRef.environmentId}:${rightRef.threadId}`}
            threadRef={rightRef}
            hostWidth={hostWidth}
            background={background}
            onSwap={swap}
          />
        ) : null}
      </div>
      {splitOn && mode === "too-narrow" && !background ? <TooNarrowPill /> : null}
      {!background && mode === "split" ? (
        <SplitDropZone primaryRef={primaryRef} rightPaneOpen={showSplit} />
      ) : null}
    </>
  );
}

function SecondaryPane({
  threadRef,
  hostWidth,
  background,
  onSwap,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly hostWidth: number;
  readonly background: boolean;
  readonly onSwap: () => void;
}) {
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const shell = useQuietThreadShell(threadRef);
  const detail = useEnvironmentThread(
    shell ? null : threadRef.environmentId,
    shell ? null : threadRef.threadId,
  );
  const detailThread = Option.getOrNull(detail.data)?.thread ?? null;
  const state = resolveSecondaryPaneState({
    shell,
    detailDeleted: detail.status === "deleted",
    detailThread,
  });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const splitShortcut = shortcutLabelForCommand(keybindings, SPLIT_COMMAND);
  const { width, handlers } = useResizableWidth({
    storageKey: SPLIT_WIDTH_STORAGE_KEY,
    defaultWidth: Math.round(hostWidth / 2),
    minWidth: SPLIT_PANE_MIN_WIDTH,
    maxWidth: Math.max(SPLIT_PANE_MIN_WIDTH, hostWidth - SPLIT_PANE_MIN_WIDTH),
    edge: "left",
  });

  return (
    <div
      className="relative flex min-h-0 shrink-0 flex-col border-s bg-background"
      style={
        {
          [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
          width: `var(${RESIZABLE_WIDTH_PROPERTY})`,
        } as CSSProperties
      }
      data-fork-split-pane="secondary"
      data-fork-split-state={state}
    >
      <RightPanelResizeHandle handlers={handlers} />
      <div className="absolute top-[calc(var(--workspace-topbar-height)+0.5rem)] -left-3.5 z-30 flex flex-col gap-1">
        <PaneControl label="Swap sides" onClick={onSwap} icon={<ArrowLeftRightIcon />} />
        <PaneControl
          label={splitShortcut ? `Close right chat (${splitShortcut})` : "Close right chat"}
          onClick={closeSplit}
          icon={<XIcon />}
        />
      </div>
      {state === "ready" ? (
        <ComposerHandleContext value={composerRef}>
          <SplitPaneRoleContext value="secondary">
            {/* Background mode keeps this pane's global shortcuts from answering for the left chat. */}
            <BackgroundThreadContext value>
              <div className="flex min-h-0 min-w-0 flex-1" inert={background}>
                <ChatView
                  environmentId={threadRef.environmentId}
                  threadId={threadRef.threadId}
                  routeKind="server"
                />
              </div>
            </BackgroundThreadContext>
          </SplitPaneRoleContext>
        </ComposerHandleContext>
      ) : (
        <PaneNotice state={state} />
      )}
    </div>
  );
}

function PaneControl({
  label,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="glass"
            size="icon-xs"
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

function PaneNotice({ state }: { readonly state: "loading" | "archived" | "deleted" }) {
  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
        <Spinner size="sm" tone="muted" />
        Loading chat…
      </div>
    );
  }
  const archived = state === "archived";
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">{archived ? <ArchiveIcon /> : <TrashIcon />}</EmptyMedia>
        <EmptyTitle>{archived ? "This chat is archived" : "This chat was deleted"}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" size="sm" onClick={closeSplit}>
          Close right side
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function TooNarrowPill() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--workspace-topbar-height)+0.5rem)] z-30 flex justify-center">
      <span className="pointer-events-auto">
        <Button
          type="button"
          variant="glass"
          size="xs"
          onClick={closeSplit}
          aria-label="Split hidden, window too small. Close split"
        >
          <Columns2Icon />
          Split hidden, window too small
          <XIcon />
        </Button>
      </span>
    </div>
  );
}

function SplitDropZone({
  primaryRef,
  rightPaneOpen,
}: {
  readonly primaryRef: ScopedThreadRef | null;
  readonly rightPaneOpen: boolean;
}) {
  const ghost = useThreadContextDragGhost();
  if (!ghost || !primaryRef) return null;
  return <SplitDropZoneTarget primaryRef={primaryRef} rightPaneOpen={rightPaneOpen} />;
}

function SplitDropZoneTarget({
  primaryRef,
  rightPaneOpen,
}: {
  readonly primaryRef: ScopedThreadRef;
  readonly rightPaneOpen: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const role = use(SplitPaneRoleContext);
  useThreadContextDrop(ref, primaryRef.environmentId, DROP_TARGET_KEY, (refs, isActive) => {
    const first = refs[0];
    if (!first || !isActive()) return;
    if (sameThreadRef(first, primaryRef)) {
      toastManager.add({ type: "info", title: "That chat is already open on the left." });
      return;
    }
    openThreadOnRight(first);
  });
  return (
    <div
      ref={ref}
      {...threadContextDropTargetProps()}
      data-fork-split-drop={role ?? "root"}
      className="group/drop absolute top-[calc(var(--workspace-topbar-height)+0.5rem)] right-2 bottom-44 z-40 flex w-[min(40%,32rem)] items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-sm text-primary data-[thread-context-over=true]:border-primary data-[thread-context-over=true]:bg-primary/10"
    >
      <span className="flex items-center gap-2 font-medium">
        <Columns2Icon className="size-4" aria-hidden="true" />
        {rightPaneOpen ? "Drop to show on the right instead" : "Drop to open on the right"}
      </span>
    </div>
  );
}
