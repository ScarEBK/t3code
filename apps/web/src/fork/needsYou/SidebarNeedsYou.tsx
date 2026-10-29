import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  UserRoundIcon,
} from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
} from "~/components/Sidebar.logic";
import { CollapsibleSectionHeader } from "~/components/ui/collapsible-section-header";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useThreadRouteTarget } from "~/hooks/useThreadRouteTarget";
import { cn } from "~/lib/utils";
import { useQuietThreadShells } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";
import { useUiStateStore } from "~/uiStateStore";
import { openThreadOnRight, sameThreadRef, useSplitRightThread } from "../split/splitViewStore";
import { collectNeedsYou, needsYouKind, type NeedsYouKind } from "./needsYouLogic";

const EXPANDED_KEY = "t3code:fork:needs-you-expanded";
const MAX_ROWS = 6;

// Same icon, word and colour as the thread row's status (SidebarThreadRow topStatus).
const KIND_STATUS: Record<
  NeedsYouKind,
  { readonly label: string; readonly icon: typeof CircleCheckIcon; readonly className: string }
> = {
  approval: { label: "Approval", icon: ShieldQuestionIcon, className: "text-warning-foreground" },
  input: {
    label: "Input",
    icon: MessageCircleQuestionIcon,
    className: "text-indigo-600 dark:text-indigo-300",
  },
  request: { label: "Request", icon: UserRoundIcon, className: "text-guest-foreground" },
  failed: { label: "Failed", icon: CircleAlertIcon, className: "text-error-foreground" },
  limited: { label: "Limited", icon: CircleAlertIcon, className: "text-warning-foreground" },
  done: { label: "Done", icon: CircleCheckIcon, className: "text-success-foreground" },
};

export function SidebarNeedsYou() {
  const router = useRouter();
  const threads = useQuietThreadShells();
  const localVisits = useUiStateStore((state) => state.threadLastVisitedAtById);
  const routeTarget = useThreadRouteTarget();
  const rightRef = useSplitRightThread();
  const [expanded, setExpanded] = useLocalStorage(EXPANDED_KEY, true, Schema.Boolean);
  const primaryRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;

  const items = collectNeedsYou(
    threads.map((thread) => {
      const ref = scopeThreadRef(thread.environmentId, thread.id);
      const key = scopedThreadKey(ref);
      const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localVisits[key]);
      const kind = needsYouKind(
        resolveSidebarThreadStatus(thread),
        hasUnseenCompletion({ ...thread, lastVisitedAt }),
      );
      return {
        key,
        value: { ref, title: thread.title },
        kind,
        updatedAt: thread.updatedAt,
        archived: thread.archivedAt !== null,
        onScreen: sameThreadRef(ref, primaryRef) || sameThreadRef(ref, rightRef),
      };
    }),
  );
  if (items.length === 0) return null;

  const open = (event: ReactMouseEvent, ref: ScopedThreadRef) => {
    if (event.button === 1 || event.altKey) {
      event.preventDefault();
      openThreadOnRight(ref);
      return;
    }
    void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  const shown = items.slice(0, MAX_ROWS);

  return (
    <div className="px-2 pt-2" data-fork-needs-you={items.length}>
      <CollapsibleSectionHeader
        expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        accessory={<span className="font-normal tabular-nums">{items.length}</span>}
        data-testid="fork-needs-you-toggle"
      >
        Needs you
      </CollapsibleSectionHeader>
      {expanded ? (
        <ul className="flex flex-col gap-px">
          {shown.map((item) => {
            const status = KIND_STATUS[item.kind];
            const StatusIcon = status.icon;
            return (
              <li key={item.key}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={(event) => open(event, item.value.ref)}
                        onAuxClick={(event) => {
                          if (event.button === 1) open(event, item.value.ref);
                        }}
                        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        data-needs-you={item.kind}
                      />
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{item.value.title}</span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 font-medium text-xs",
                        status.className,
                      )}
                    >
                      <StatusIcon aria-hidden className="size-3.5 shrink-0" />
                      {status.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipPopup side="right">Alt-click opens it on the right</TooltipPopup>
                </Tooltip>
              </li>
            );
          })}
          {items.length > shown.length ? (
            <li className="px-2.5 py-1 text-muted-foreground text-xs">
              +{items.length - shown.length} more below
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
