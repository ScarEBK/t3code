import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  ArrowRightIcon,
  BookOpen,
  Bot,
  ChartLine,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleIcon,
  CreditCard,
  Database,
  Download,
  FlaskConical,
  Gauge,
  Gift,
  Globe,
  Hash,
  House,
  Image,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  ListChecksIcon,
  Mail,
  MessageCircle,
  MessageSquarePlusIcon,
  Monitor,
  Package,
  Palette,
  Plug,
  RefreshCwIcon,
  Rocket,
  RotateCcwIcon,
  Scale,
  Search,
  Server,
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
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useComposerHandleContext } from "~/composerHandleContext";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import fiveHubLogo from "./5hub-logo.png";
import motionLifeLogo from "./motion-life-logo.png";
import { loadBoard, setCardStatus } from "./boardClient";
import {
  PRIORITY_LABEL,
  groupChecklist,
  startsCollapsed,
  summarizeProjects,
  type BoardCard,
  type BoardProject,
  type BoardSnapshot,
  type ChecklistGroup,
} from "./checklistLogic";
import { buildTaskPrompt } from "./checklistPrompt";
import { ROW_TEXT } from "./checklistStyles";
import {
  countCards,
  nextCard,
  projectCards,
  bestProjectMatch,
  projectMatchScore,
  sectionIconName,
  type ProjectCounts,
} from "./checklistView";

// Layout follows Z Code's status panel (32px rows, 13px text, 14px icons, quiet section labels).
// Colors are T3's tokens: green only means done, amber only means it waits on you.
const POLL_MS = 15_000;
const PROJECT_KEY = "t3code:fork:checklist:project";
const ROW_HOVER = "hover:bg-black/[0.035] dark:hover:bg-white/[0.08]";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  bot: Bot,
  chart: ChartLine,
  "credit-card": CreditCard,
  database: Database,
  download: Download,
  flask: FlaskConical,
  gauge: Gauge,
  gift: Gift,
  globe: Globe,
  hash: Hash,
  home: House,
  image: Image,
  key: KeyRound,
  layers: Layers,
  layout: LayoutDashboard,
  "life-buoy": LifeBuoy,
  mail: Mail,
  "message-circle": MessageCircle,
  monitor: Monitor,
  package: Package,
  palette: Palette,
  plug: Plug,
  rocket: Rocket,
  scale: Scale,
  search: Search,
  server: Server,
  settings: Settings,
  shield: Shield,
  "shopping-cart": ShoppingCart,
  smartphone: Smartphone,
  star: Star,
  user: User,
  users: Users,
  zap: Zap,
};

const LOGOS: ReadonlyArray<readonly [string, string]> = [
  ["5hub", fiveHubLogo],
  ["motion-life", motionLifeLogo],
];

function readStoredProject(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

function storeProject(id: string) {
  try {
    window.localStorage.setItem(PROJECT_KEY, id);
  } catch {
    // Remembering the pick is a convenience only.
  }
}

function AppMark(props: { readonly project: BoardProject; readonly size: "sm" | "md" | "lg" }) {
  const { project } = props;
  const logo = LOGOS.find(([prefix]) => project.id.startsWith(prefix))?.[1] ?? null;
  const box = { sm: "size-4 rounded-sm", md: "size-7 rounded-lg", lg: "size-10 rounded-xl" }[
    props.size
  ];
  if (logo) {
    return <img src={logo} alt="" className={cn(box, "shrink-0 object-cover")} />;
  }
  const Icon = ICONS[project.icon] ?? Package;
  return (
    <span
      className={cn(box, "flex shrink-0 items-center justify-center")}
      style={{ backgroundColor: `${project.color}26`, color: project.color }}
    >
      <Icon
        className={props.size === "sm" ? "size-3" : props.size === "md" ? "size-4" : "size-5"}
      />
    </span>
  );
}

/** Into this chat for its own app; a new chat in the matching app otherwise. */
function useSendPrompt(currentProjectId: ProjectId | null) {
  const composerRef = useComposerHandleContext();
  const handleNewThread = useNewThreadHandler();
  const projects = useProjects();
  return (prompt: string, boardProject: BoardProject) => {
    const target =
      bestProjectMatch(
        projects.filter((project) => !project.archivedAt),
        (project) => projectMatchScore(boardProject, project),
      ) ?? null;
    if (target && target.id !== currentProjectId) {
      void handleNewThread(scopeProjectRef(target.environmentId, target.id), { prompt }).catch(() =>
        toastManager.add({ type: "error", title: `Couldn't open a new chat in ${target.title}` }),
      );
      return;
    }
    const composer = composerRef?.current ?? null;
    if (composer?.insertTextAtEnd(prompt, { ensureLeadingBoundary: true })) {
      composer.focusAtEnd();
      return;
    }
    toastManager.add({
      type: "error",
      title: "Couldn't add the prompt",
      description: "The chat is busy. Try again once it's ready.",
    });
  };
}

export function ChecklistPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly visible: boolean;
  readonly currentProjectId?: ProjectId | null;
}) {
  const { environmentId, visible } = props;
  const currentProjectId = props.currentProjectId ?? null;
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A tile click holds only while this chat's project stays open; switching projects follows the chat.
  const [picked, setPicked] = useState<{ id: string; forProject: ProjectId | null } | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const currentProject = useProjects().find((project) => project.id === currentProjectId) ?? null;
  const send = useSendPrompt(currentProjectId);

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

  const changeStatus = async (card: BoardCard, status: BoardCard["status"]) => {
    setBusyCardId(card.id);
    try {
      await setCardStatus(environmentId, card.id, status);
      await pull();
    } catch (cause) {
      toastManager.add({
        type: "error",
        title: "That change did not save",
        description: cause instanceof Error ? cause.message : undefined,
      });
    }
    setBusyCardId(null);
  };

  if (!snapshot) {
    return (
      <PanelMessage
        title={error ? "Project Board isn't reachable" : "Loading your apps"}
        body={error ?? undefined}
        action={
          error ? (
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              Try again
            </Button>
          ) : null
        }
      />
    );
  }

  const summaries = summarizeProjects(snapshot).toSorted((left, right) =>
    left.project.name.localeCompare(right.project.name),
  );
  const fromChat = currentProject
    ? bestProjectMatch(summaries, (entry) => projectMatchScore(entry.project, currentProject))
    : undefined;
  const pickedHere =
    picked && picked.forProject === currentProjectId
      ? summaries.find((entry) => entry.project.id === picked.id)
      : undefined;
  const lastPicked = summaries.find((entry) => entry.project.id === readStoredProject());
  const selected = pickedHere ?? fromChat ?? lastPicked ?? summaries[0] ?? null;

  if (!selected) {
    return <PanelMessage title="No apps on the board yet" />;
  }

  const cards = projectCards(snapshot, selected.project.id);
  const counts = countCards(cards);
  const groups = groupChecklist(snapshot, selected.project.id, "section");
  const waiting = cards
    .filter((card) => card.status === "review")
    .toSorted((a, b) => a.priority - b.priority || a.order - b.order);
  const promptFor = (card: BoardCard) => {
    const group = groups.find((entry) => entry.cards.some((item) => item.id === card.id));
    return buildTaskPrompt({
      projectName: selected.project.name,
      sectionName: group?.label ?? "Other",
      sectionCards: group?.cards ?? [card],
      card,
    });
  };
  const rowProps: RowProps = {
    busyCardId,
    onPrompt: (card) => send(promptFor(card), selected.project),
    onStatus: (card, status) => void changeStatus(card, status),
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-fork-checklist-panel>
      <ScrollArea scrollFade className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-2">
          <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Apps">
            {summaries.map((entry) => (
              <AppTile
                key={entry.project.id}
                project={entry.project}
                counts={countCards(projectCards(snapshot, entry.project.id))}
                selected={entry.project.id === selected.project.id}
                onSelect={() => {
                  setPicked({ id: entry.project.id, forProject: currentProjectId });
                  storeProject(entry.project.id);
                }}
              />
            ))}
          </div>

          <Hero
            project={selected.project}
            counts={counts}
            next={nextCard(cards)}
            loading={loading}
            onRefresh={() => void refresh()}
            onContinue={rowProps.onPrompt}
          />

          <div className="flex flex-col gap-1">
            {waiting.length > 0 ? (
              <Section
                icon={<CircleAlertIcon className="size-3" />}
                tone="attention"
                title="Needs you"
                trailing={<span className="tabular-nums">{waiting.length}</span>}
                defaultOpen
              >
                {waiting.map((card) => (
                  <TaskRow key={card.id} card={card} showNeeds {...rowProps} />
                ))}
              </Section>
            ) : null}

            {groups.map((group) => (
              <GroupSection key={group.key} group={group} rowProps={rowProps} />
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function PanelMessage(props: {
  readonly title: string;
  readonly body?: string | undefined;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="flex size-9 items-center justify-center rounded-xl border border-border">
        <ListChecksIcon className="size-4 text-muted-foreground" />
      </span>
      <p className={cn(ROW_TEXT, "font-medium text-foreground")}>{props.title}</p>
      {props.body ? <p className="max-w-64 text-xs text-muted-foreground">{props.body}</p> : null}
      {props.action}
    </div>
  );
}

function Ring(props: { readonly percent: number; readonly className?: string }) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const complete = props.percent >= 100;
  return (
    <svg viewBox="0 0 48 48" className={cn("-rotate-90", props.className)} aria-hidden>
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        className="stroke-foreground/10"
        strokeWidth="2"
      />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        className={cn(
          "transition-[stroke-dasharray] duration-500 ease-out",
          complete ? "stroke-success-foreground" : "stroke-foreground/70",
        )}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(props.percent / 100) * circumference} ${circumference}`}
      />
    </svg>
  );
}

function AppTile(props: {
  readonly project: BoardProject;
  readonly counts: ProjectCounts;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { counts } = props;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            role="tab"
            aria-selected={props.selected}
            onClick={props.onSelect}
            className={cn(
              "relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 pt-2 pb-1.5",
              ROW_HOVER,
              FOCUS_RING,
              props.selected && "bg-black/[0.05] dark:bg-white/[0.08]",
            )}
          />
        }
      >
        <span className="relative flex size-11 items-center justify-center">
          <Ring percent={counts.percent} className="absolute inset-0 size-11" />
          <AppMark project={props.project} size="md" />
          {counts.review > 0 ? (
            <span className="absolute top-0 right-0 size-2.5 rounded-full border-2 border-background bg-warning" />
          ) : null}
        </span>
        <span
          className={cn(
            "max-w-full truncate text-2xs",
            props.selected ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {props.project.name}
        </span>
      </TooltipTrigger>
      <TooltipPopup>
        {props.project.name} · {counts.percent}%
        {counts.review > 0 ? ` · ${counts.review} need you` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

function Hero(props: {
  readonly project: BoardProject;
  readonly counts: ProjectCounts;
  readonly next: BoardCard | null;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly onContinue: (card: BoardCard) => void;
}) {
  const { counts, next } = props;
  const complete = counts.total > 0 && counts.done === counts.total;
  const share = (value: number) => (counts.total ? (value / counts.total) * 100 : 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-xs/5">
      <div className="flex min-w-0 items-center gap-3">
        <AppMark project={props.project} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold text-foreground">
            {props.project.name}
          </span>
          <span className="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
            <Stat label="done" icon={<CheckCircle2Icon className="text-success-foreground" />}>
              {counts.done}
            </Stat>
            <Stat label="in progress" icon={<ArrowRightIcon className="text-foreground" />}>
              {counts.doing}
            </Stat>
            {counts.review > 0 ? (
              <Stat label="need you" icon={<CircleAlertIcon className="text-warning-foreground" />}>
                {counts.review}
              </Stat>
            ) : null}
            <Stat label="to do" icon={<CircleIcon className="text-muted-foreground/60" />}>
              {counts.todo}
            </Stat>
          </span>
        </div>
        <span
          className={cn(
            "text-3xl leading-none font-semibold tracking-tight tabular-nums",
            complete ? "text-success-foreground" : "text-foreground",
          )}
        >
          {counts.percent}%
        </span>
      </div>
      <div
        className="mt-3.5 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-foreground/8"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={counts.percent}
        aria-label={`${props.project.name} progress`}
      >
        <Segment className="bg-success-foreground" share={share(counts.done)} />
        <Segment className="bg-warning" share={share(counts.review)} />
        <Segment className="bg-foreground/35" share={share(counts.doing)} />
      </div>
      {next ? (
        <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-border pt-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-2xs text-muted-foreground">Up next</span>
            <span className={cn(ROW_TEXT, "truncate font-medium text-foreground")}>
              {next.title}
            </span>
          </div>
          <IconAction label="Refresh" onClick={props.onRefresh}>
            <RefreshCwIcon className={cn(props.loading && "animate-spin")} />
          </IconAction>
          <Button size="sm" onClick={() => props.onContinue(next)}>
            Continue
            <ArrowRightIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Stat(props: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 [&_svg]:size-3" aria-label={props.label}>
      {props.icon}
      {props.children}
    </span>
  );
}

function Segment(props: { readonly className: string; readonly share: number }) {
  if (props.share === 0) return null;
  return (
    <div
      className={cn(
        "h-full rounded-full transition-[width] duration-500 ease-out",
        props.className,
      )}
      style={{ width: `${props.share}%` }}
    />
  );
}

function Section(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly trailing: ReactNode;
  readonly defaultOpen: boolean;
  readonly tone?: "attention";
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen);
  return (
    <section className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "group flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1.5",
          ROW_HOVER,
          FOCUS_RING,
        )}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded",
            props.tone === "attention"
              ? "bg-warning/12 text-warning-foreground"
              : "bg-foreground/[0.06] text-foreground/80",
          )}
        >
          {props.icon}
        </span>
        <span className={cn(ROW_TEXT, "truncate font-medium text-foreground")}>{props.title}</span>
        {open ? (
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="ms-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {props.trailing}
        </span>
      </button>
      {open ? <ul className="flex flex-col">{props.children}</ul> : null}
    </section>
  );
}

type RowProps = {
  readonly busyCardId: string | null;
  readonly onPrompt: (card: BoardCard) => void;
  readonly onStatus: (card: BoardCard, status: BoardCard["status"]) => void;
};

function GroupSection(props: { readonly group: ChecklistGroup; readonly rowProps: RowProps }) {
  const { group } = props;
  const Icon = ICONS[group.area?.icon ?? ""] ?? ICONS[sectionIconName(null, group.label)] ?? Layers;
  const open = group.cards.filter((card) => card.status !== "done" && card.status !== "skip");
  const closed = group.cards.filter((card) => card.status === "done" || card.status === "skip");
  const complete = open.length === 0;
  const [showDone, setShowDone] = useState(false);
  const percent = group.cards.length ? (group.doneCount / group.cards.length) * 100 : 0;
  return (
    <Section
      icon={<Icon className="size-3" />}
      title={group.label}
      defaultOpen={!startsCollapsed(group)}
      trailing={
        <>
          <span className="h-1 w-10 overflow-hidden rounded-full bg-foreground/8" aria-hidden>
            <span
              className={cn(
                "block h-full rounded-full",
                complete ? "bg-success-foreground" : "bg-foreground/50",
              )}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span
            className={cn("w-7 text-right tabular-nums", complete && "text-success-foreground")}
          >
            {group.doneCount}/{group.cards.length}
          </span>
        </>
      }
    >
      {open
        .filter((card) => card.status !== "review")
        .map((card) => (
          <TaskRow key={card.id} card={card} {...props.rowProps} />
        ))}
      {closed.length > 0 && !complete ? (
        <li>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone(!showDone)}
            className={cn(
              "flex h-6 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs text-muted-foreground",
              ROW_HOVER,
              FOCUS_RING,
            )}
          >
            {showDone ? (
              <ChevronDownIcon className="size-3.5 shrink-0" />
            ) : (
              <ChevronRightIcon className="size-3.5 shrink-0" />
            )}
            {closed.length} done
          </button>
        </li>
      ) : null}
      {showDone || complete
        ? closed.map((card) => <TaskRow key={card.id} card={card} {...props.rowProps} />)
        : null}
    </Section>
  );
}

function StatusIcon({ status }: { readonly status: BoardCard["status"] }) {
  const base = "mt-0.5 size-3.5 shrink-0";
  if (status === "done") {
    return <CheckCircle2Icon aria-hidden className={cn(base, "text-success-foreground")} />;
  }
  if (status === "review") {
    return <CircleAlertIcon aria-hidden className={cn(base, "text-warning-foreground")} />;
  }
  if (status === "doing") {
    return <ArrowRightIcon aria-hidden className={cn(base, "text-foreground")} />;
  }
  return <CircleIcon aria-hidden className={cn(base, "text-muted-foreground/60")} />;
}

function PriorityBars({ priority }: { readonly priority: number }) {
  const level = 4 - Math.min(3, Math.max(1, priority));
  return (
    <span
      className="mt-1 flex h-2.5 shrink-0 items-end gap-px"
      role="img"
      aria-label={`${PRIORITY_LABEL[priority] ?? "Medium"} priority`}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-0.5 rounded-full",
            bar === 1 ? "h-1" : bar === 2 ? "h-1.5" : "h-2.5",
            bar <= level ? "bg-foreground/60" : "bg-foreground/15",
          )}
        />
      ))}
    </span>
  );
}

function TaskRow(props: RowProps & { readonly card: BoardCard; readonly showNeeds?: boolean }) {
  const { card } = props;
  const [expanded, setExpanded] = useState(false);
  const [sent, setSent] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the sent check after a moment
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 1600);
    return () => window.clearTimeout(timer);
  }, [sent]);
  const closed = card.status === "done" || card.status === "skip";
  const busy = props.busyCardId === card.id;
  const details = [
    card.status === "review" && card.needs ? card.needs : null,
    card.why || null,
    card.proof ? `Done when: ${card.proof}` : null,
  ].filter((line): line is string => line !== null);
  return (
    <li
      data-board-status={card.status}
      className={cn("group/task flex min-h-7 items-start gap-2 rounded-md px-1.5 py-1", ROW_HOVER)}
    >
      <StatusIcon status={card.status} />
      <button
        type="button"
        aria-expanded={details.length > 0 ? expanded : undefined}
        disabled={details.length === 0}
        onClick={() => setExpanded(!expanded)}
        className={cn("min-w-0 flex-1 rounded-sm text-left disabled:cursor-default", FOCUS_RING)}
      >
        <span
          className={cn(
            ROW_TEXT,
            "block leading-5",
            expanded ? "break-words" : "truncate",
            closed ? "text-muted-foreground/70 line-through" : "text-foreground",
          )}
        >
          {card.title}
        </span>
        {props.showNeeds && card.needs && !expanded ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{card.needs}</span>
        ) : null}
        {expanded ? (
          <span className="mt-1 flex flex-col gap-1 text-xs leading-4.5 text-muted-foreground">
            {details.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        ) : null}
      </button>
      {closed ? null : <PriorityBars priority={card.priority} />}
      <div
        className={cn(
          "-my-0.5 flex shrink-0 items-center opacity-0 transition-opacity group-hover/task:opacity-100 focus-within:opacity-100",
          (sent || busy) && "opacity-100",
        )}
      >
        {closed ? (
          <IconAction label="Reopen" disabled={busy} onClick={() => props.onStatus(card, "todo")}>
            <RotateCcwIcon />
          </IconAction>
        ) : (
          <>
            <IconAction
              label="Mark done"
              disabled={busy}
              onClick={() => props.onStatus(card, "done")}
            >
              <CheckIcon />
            </IconAction>
            <IconAction
              label="Write prompt"
              onClick={() => {
                props.onPrompt(card);
                setSent(true);
              }}
            >
              {sent ? <CheckIcon className="text-success-foreground" /> : <MessageSquarePlusIcon />}
            </IconAction>
          </>
        )}
      </div>
    </li>
  );
}

function IconAction(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={props.label}
            disabled={props.disabled}
            onClick={props.onClick}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5",
              ROW_HOVER,
              FOCUS_RING,
            )}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup>{props.label}</TooltipPopup>
    </Tooltip>
  );
}
