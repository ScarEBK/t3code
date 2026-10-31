import {
  ArchiveIcon,
  FolderIcon,
  FolderPlusIcon,
  ListIcon,
  MessageCirclePlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useNavigate } from "@tanstack/react-router";

import { updateClientSettings, useBoringSidebarEnabled } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { SidebarInput, SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarNavLinks } from "./SidebarChrome";

export interface SidebarThreadHeaderProps {
  searchFieldRef?: RefObject<HTMLDivElement | null>;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  newThreadInProjectShortcutLabel: string | null | undefined;
  showNewThreadInProjectHint: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
}

export function SidebarThreadHeader({
  searchFieldRef,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
}: SidebarThreadHeaderProps) {
  const resultsVisible = isSearching && searchResultCount > 0;
  // Shrinking results can remove the active option; never leave aria-activedescendant pointing at it.
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;
  const newThreadLabel = newThreadShortcutLabel
    ? `New thread (${newThreadShortcutLabel})`
    : "New thread";

  return (
    <div className="flex flex-col gap-px">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              aria-label="New thread"
              disabled={newThreadDisabled}
              onClick={onNewThread}
              size="nav"
              type="button"
              variant="nav"
            />
          }
        >
          <MessageCirclePlusIcon />
          <span className="min-w-0 flex-1 truncate">New thread</span>
          {newThreadShortcutLabel ? (
            <span className="ms-auto shrink-0 text-sidebar-muted-foreground/70 text-xs">
              {newThreadShortcutLabel}
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="top">
          {showNewThreadInProjectHint ? (
            <span className="flex flex-col gap-0.5">
              <span>{newThreadLabel}</span>
              <span className="text-muted-foreground">
                New thread in current project: Shift+click
                {newThreadInProjectShortcutLabel ? ` (${newThreadInProjectShortcutLabel})` : ""}
              </span>
            </span>
          ) : (
            newThreadLabel
          )}
        </TooltipPopup>
      </Tooltip>
      <div
        ref={searchFieldRef}
        className="flex h-9 min-w-0 items-center gap-2 rounded-(--control-radius) px-2 text-sm text-sidebar-foreground hover:bg-sidebar-row-hover focus-within:bg-sidebar-row-hover focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70"
      >
        <SearchIcon className="size-[1.125rem] shrink-0 text-sidebar-foreground/80" />
        <SidebarInput
          ref={searchInputRef}
          nativeInput
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search"
          aria-label="Search threads"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={resultsVisible}
          aria-controls={resultsVisible ? "sidebar-thread-search-results" : undefined}
          aria-activedescendant={
            activeResultExists
              ? `sidebar-thread-search-result-${activeSearchResultIndex}`
              : undefined
          }
          className="min-w-0 flex-1"
        />
        {isSearching ? (
          <Button
            type="button"
            size="icon-micro"
            variant="ghost-muted"
            className="shrink-0"
            aria-label="Clear thread search"
            onClick={() => {
              onClearSearch();
              searchInputRef.current?.focus();
            }}
          >
            <XIcon className="size-3" />
          </Button>
        ) : null}
      </div>
      <SidebarNavLinks />
    </div>
  );
}

/** The row above the thread list: how threads are grouped, the project filter, and Archived. */
export function SidebarThreadListControls({
  hasProjects,
  projectScope,
  onNewProject,
}: {
  hasProjects: boolean;
  projectScope: ReactNode;
  onNewProject: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-0.5 pt-2.5 pb-1">
      <SidebarGroupingSwitch />
      <div className="ms-auto flex shrink-0 items-center">
        {hasProjects ? (
          <>
            {projectScope}
            <SidebarHeaderIconButton label="Add project" onClick={onNewProject}>
              <FolderPlusIcon />
            </SidebarHeaderIconButton>
          </>
        ) : null}
        <SidebarHeaderIconButton
          label="Archived threads"
          onClick={() => void navigate({ to: "/settings/archived" })}
        >
          <ArchiveIcon />
        </SidebarHeaderIconButton>
      </div>
    </div>
  );
}

function SidebarGroupingSwitch() {
  const groupedByProject = useBoringSidebarEnabled();
  const setGrouped = (grouped: boolean) => {
    // Leaving the project view also clears the opt-in of the removed legacy sidebar.
    void updateClientSettings({ boringSidebarEnabled: grouped, legacySidebarEnabled: false });
  };
  return (
    <div
      role="group"
      aria-label="Group threads"
      className="flex h-7 shrink-0 items-center rounded-full bg-sidebar-control-surface p-0.5 text-xs"
    >
      <SidebarGroupingOption
        active={!groupedByProject}
        icon={<ListIcon aria-hidden className="size-3.5" />}
        label="All"
        onClick={() => setGrouped(false)}
      />
      <SidebarGroupingOption
        active={groupedByProject}
        icon={<FolderIcon aria-hidden className="size-3.5" />}
        label="Project"
        onClick={() => setGrouped(true)}
      />
    </div>
  );
}

function SidebarGroupingOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-6 cursor-pointer items-center gap-1 rounded-full px-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active
          ? "bg-white font-medium text-sidebar-foreground dark:bg-black/60"
          : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative size-7 shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
