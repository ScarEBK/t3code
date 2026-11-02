import type { EnvironmentId } from "@t3tools/contracts";
import {
  BookOpen,
  Bot,
  ChevronDownIcon,
  Circle,
  CreditCard,
  Database,
  Download,
  Gauge,
  Gift,
  Globe,
  Hash,
  House,
  Image,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  MessageCircle,
  Monitor,
  Package,
  Palette,
  Rocket,
  Scale,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Smartphone,
  Star,
  User,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";
import fiveHubLogo from "./5hub-logo.png";
import motionLifeLogo from "./motion-life-logo.png";
import { loadBoard, setCardStatus } from "./boardClient";
import {
  type BoardCard,
  type BoardProject,
  type BoardSnapshot,
  type BoardStatus,
  type ChecklistGroup,
  type ChecklistGrouping,
  PRIORITY_LABEL,
  groupChecklist,
  startsCollapsed,
  summarizeProjects,
} from "./checklistLogic";

const POLL_MS = 60_000;
const PROJECT_KEY = "t3code:fork:checklist:project";
const GROUPING_KEY = "t3code:fork:checklist:grouping";

const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  bot: Bot,
  "credit-card": CreditCard,
  database: Database,
  download: Download,
  gauge: Gauge,
  gift: Gift,
  globe: Globe,
  hash: Hash,
  home: House,
  image: Image,
  layout: LayoutDashboard,
  "life-buoy": LifeBuoy,
  mail: Mail,
  "message-circle": MessageCircle,
  monitor: Monitor,
  package: Package,
  palette: Palette,
  rocket: Rocket,
  scale: Scale,
  search: Search,
  settings: Settings,
  shield: Shield,
  "shopping-cart": ShoppingCart,
  smartphone: Smartphone,
  star: Star,
  user: User,
  users: Users,
  zap: Zap,
};

function ProjectMark({ project }: { project: BoardProject }) {
  const logo = project.id.startsWith("5hub")
    ? fiveHubLogo
    : project.id.startsWith("motion-life")
      ? motionLifeLogo
      : null;
  if (logo) return <img src={logo} alt="" className="size-4 shrink-0 rounded-sm" />;
  const Icon = ICONS[project.icon] ?? Circle;
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center rounded-sm"
      style={{ backgroundColor: `${project.color}33`, color: project.color }}
    >
      <Icon className="size-3" />
    </span>
  );
}

function StatusIcon({ status }: { status: BoardStatus }) {
  const common = "size-3.5 shrink-0";
  switch (status) {
    case "review":
      return (
        <svg viewBox="0 0 14 14" className={cn(common, "text-warning")} aria-hidden>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        </svg>
      );
    case "doing":
      return (
        <svg viewBox="0 0 14 14" className={cn(common, "text-info")} aria-hidden>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 14 14" className={cn(common, "text-success")} aria-hidden>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path
            d="M4.4 7.2l1.8 1.8 3.4-3.6"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "skip":
      return (
        <svg viewBox="0 0 14 14" className={cn(common, "text-muted-foreground/60")} aria-hidden>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 10l6-6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "todo":
      return (
        <svg viewBox="0 0 14 14" className={cn(common, "text-muted-foreground")} aria-hidden>
          <circle
            cx="7"
            cy="7"
            r="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.2 1.6"
          />
        </svg>
      );
  }
}

function PriorityBars({ priority }: { priority: number }) {
  const filled = Math.max(1, 4 - priority);
  return (
    <svg
      viewBox="0 0 14 14"
      className="size-3.5 shrink-0 text-foreground/80"
      role="img"
      aria-label={`${PRIORITY_LABEL[priority] ?? "Medium"} priority`}
    >
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={2 + bar * 4}
          y={9 - bar * 3}
          width="2.4"
          height={3 + bar * 3}
          rx="0.6"
          fill="currentColor"
          opacity={bar < filled ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

function GroupIcon({ group }: { group: ChecklistGroup }) {
  if (group.status) return <StatusIcon status={group.status} />;
  const Icon = (group.area && ICONS[group.area.icon]) ?? Circle;
  return <Icon className="size-3.5 shrink-0" style={{ color: group.area?.color }} aria-hidden />;
}

function CardDetail(props: {
  card: BoardCard;
  busy: boolean;
  onStatus: (status: BoardStatus) => void;
}) {
  const { card } = props;
  return (
    <div className="ms-[2.6rem] me-2 mb-2 flex flex-col gap-2 border-s border-border ps-3 pt-1 text-xs">
      {card.status === "review" && card.needs ? (
        <div className="rounded-md bg-warning-surface px-2.5 py-2 text-warning-foreground">
          <div className="font-medium">What you need to do</div>
          <div className="mt-0.5 text-foreground">{card.needs}</div>
        </div>
      ) : null}
      {card.why ? <p className="text-muted-foreground">{card.why}</p> : null}
      {card.proof ? (
        <div>
          <div className="text-muted-foreground">What the agent checked</div>
          <p className="mt-0.5 text-foreground/90">{card.proof}</p>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        {card.status === "done" ? (
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={props.busy}
            onClick={() => props.onStatus("todo")}
          >
            Reopen
          </Button>
        ) : (
          <>
            <Button
              size="xs"
              variant="secondary"
              disabled={props.busy}
              onClick={() => props.onStatus("done")}
            >
              Done
            </Button>
            {card.status === "review" ? (
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={props.busy}
                onClick={() => props.onStatus("todo")}
              >
                Not yet
              </Button>
            ) : null}
          </>
        )}
        {card.cardType === "check" ? null : (
          <span className="ms-auto text-muted-foreground capitalize">{card.cardType}</span>
        )}
      </div>
    </div>
  );
}

function CardRow(props: {
  card: BoardCard;
  areaName: string | null;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatus: (status: BoardStatus) => void;
}) {
  const { card } = props;
  return (
    <li>
      <button
        type="button"
        aria-expanded={props.open}
        onClick={props.onToggle}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          props.open && "bg-accent",
        )}
      >
        <PriorityBars priority={card.priority} />
        <StatusIcon status={card.status} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            card.status === "done" || card.status === "skip"
              ? "text-muted-foreground"
              : "text-foreground",
          )}
        >
          {card.title}
        </span>
        {props.areaName ? (
          <span className="max-w-[40%] shrink-0 truncate rounded-full border border-border px-1.5 text-2xs leading-4 text-muted-foreground">
            {props.areaName}
          </span>
        ) : card.cardType === "bug" ? (
          <span className="shrink-0 text-2xs text-destructive-foreground">Bug</span>
        ) : null}
      </button>
      {props.open ? <CardDetail card={card} busy={props.busy} onStatus={props.onStatus} /> : null}
    </li>
  );
}

function readStored<T extends string>(key: string, allowed: ReadonlyArray<T> | null): T | null {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    return allowed === null || allowed.includes(value as T) ? (value as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows refuse storage; the choice just won't stick.
  }
}

export function ChecklistPanel(props: { environmentId: EnvironmentId; visible: boolean }) {
  const { environmentId, visible } = props;
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState(() => readStored<string>(PROJECT_KEY, null));
  const [grouping, setGrouping] = useState<ChecklistGrouping>(
    () => readStored(GROUPING_KEY, ["status", "section"] as const) ?? "status",
  );
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  const pull = async () => {
    try {
      setSnapshot(await loadBoard(environmentId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The board could not be loaded.");
    }
  };

  const refresh = async () => {
    setLoading(true);
    await pull();
    setLoading(false);
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the board server while the tab is on screen
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const poll = () => {
      loadBoard(environmentId).then(
        (next) => {
          if (cancelled) return;
          setSnapshot(next);
          setError(null);
        },
        (cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : "The board could not be loaded.");
          }
        },
      );
    };
    poll();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visible, environmentId]);

  const summaries = snapshot ? summarizeProjects(snapshot) : [];
  const current = summaries.find((entry) => entry.project.id === projectId) ?? summaries[0] ?? null;
  const groups = snapshot && current ? groupChecklist(snapshot, current.project.id, grouping) : [];
  const areaNames = new Map(snapshot?.areas.map((area) => [area.id, area.name]) ?? []);

  const changeStatus = async (card: BoardCard, status: BoardStatus) => {
    setBusyCardId(card.id);
    try {
      await setCardStatus(environmentId, card.id, status);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That change did not save.");
    } finally {
      setBusyCardId(null);
    }
  };

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {error ?? "Loading your checklist…"}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-1">
          <Menu>
            <MenuTrigger
              render={
                <Button variant="ghost" size="sm">
                  {current ? <ProjectMark project={current.project} /> : null}
                  <span className="truncate font-medium">{current?.project.name ?? "No apps"}</span>
                  <ChevronDownIcon className="size-3 text-muted-foreground" />
                </Button>
              }
            />
            <MenuPopup align="start">
              {summaries.map((entry) => (
                <MenuItem
                  key={entry.project.id}
                  onClick={() => {
                    setProjectId(entry.project.id);
                    setOpenCardId(null);
                    store(PROJECT_KEY, entry.project.id);
                  }}
                >
                  <ProjectMark project={entry.project} />
                  <span className="flex-1">{entry.project.name}</span>
                  {entry.needsYou > 0 ? (
                    <span className="text-xs text-warning-foreground">{entry.needsYou}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {entry.done}/{entry.total}
                    </span>
                  )}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <div className="ms-auto">
            <Button
              variant="ghost-muted"
              size="icon-xs"
              aria-label="Refresh checklist"
              onClick={() => void refresh()}
            >
              <RefreshIcon refreshing={loading} />
            </Button>
          </div>
        </div>
        {current ? (
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${current.total ? (current.done / current.total) * 100 : 0}%` }}
              />
            </div>
            <span>
              {current.done}/{current.total} done
            </span>
            {current.needsYou > 0 ? (
              <span className="text-warning-foreground">· {current.needsYou} need you</span>
            ) : null}
          </div>
        ) : null}
        <ToggleGroup
          aria-label="Group by"
          className="w-full *:flex-1"
          value={[grouping]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "status" || value === "section") {
              setGrouping(value);
              store(GROUPING_KEY, value);
            }
          }}
        >
          <Toggle value="status">Status</Toggle>
          <Toggle value="section">Section</Toggle>
        </ToggleGroup>
        {error ? <p className="px-2 text-xs text-destructive-foreground">{error}</p> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {groups.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nothing on this list yet.</p>
        ) : null}
        {groups.map((group) => {
          const collapsed = folded[group.key] ?? startsCollapsed(group);
          return (
            <section key={group.key} className="mb-1">
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => setFolded((prev) => ({ ...prev, [group.key]: !collapsed }))}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md bg-muted/50 px-2 text-left text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
              >
                <ChevronDownIcon
                  aria-hidden
                  className={cn(
                    "size-3 shrink-0 text-muted-foreground transition-transform",
                    collapsed && "-rotate-90",
                  )}
                />
                <GroupIcon group={group} />
                <span className="truncate text-foreground">{group.label}</span>
                <span className="text-muted-foreground">
                  {group.status ? group.cards.length : `${group.doneCount}/${group.cards.length}`}
                </span>
              </button>
              {collapsed ? null : (
                <ul className="mt-0.5 flex flex-col">
                  {group.cards.map((card) => (
                    <CardRow
                      key={card.id}
                      card={card}
                      areaName={
                        grouping === "status" && card.area
                          ? (areaNames.get(card.area) ?? null)
                          : null
                      }
                      open={openCardId === card.id}
                      busy={busyCardId === card.id}
                      onToggle={() => setOpenCardId(openCardId === card.id ? null : card.id)}
                      onStatus={(status) => void changeStatus(card, status)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
