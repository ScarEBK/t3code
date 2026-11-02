import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { ProjectId } from "@t3tools/contracts";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  ListChecksIcon,
  MessageSquarePlusIcon,
  SquarePenIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ProjectFavicon } from "~/components/ProjectFavicon";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useComposerHandleContext } from "~/composerHandleContext";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { cn } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import {
  PROGRESS_FILE_NAME,
  nextProgressItem,
  type ProgressCounts,
  type ProgressDocument,
  type ProgressItem,
  type ProgressSection,
} from "./progressFile";
import { PROGRESS_ROW_TEXT } from "./progressPanelStyles";
import { buildSetupPrompt, buildTaskPrompt } from "./progressPrompt";
import { useProjectProgress, type ProjectProgressState } from "./useProjectProgress";

// Row and section metrics are Z Code's status panel (ConversationStatusPanel): 32px rows,
// 13px text, 14px state icons, a done/total count that turns green when complete. Colors are
// T3's own tokens only; green is the one accent and always means done.
const ROW_HOVER = "hover:bg-black/[0.035] dark:hover:bg-white/[0.08]";
const SECTION_LABEL = "text-xs text-muted-foreground";

type SendPrompt = (prompt: string, project: EnvironmentProject) => void;

function sortProjects(projects: ReadonlyArray<EnvironmentProject>, currentId: ProjectId | null) {
  return projects
    .filter((project) => !project.archivedAt && !project.isScratch)
    .toSorted((left, right) => {
      if (left.id === currentId) return -1;
      if (right.id === currentId) return 1;
      if (Boolean(left.pinnedAt) !== Boolean(right.pinnedAt)) return left.pinnedAt ? -1 : 1;
      return left.title.localeCompare(right.title);
    });
}

export function ProgressPanel(props: { readonly currentProjectId: ProjectId | null }) {
  const projects = sortProjects(useProjects(), props.currentProjectId);
  // A pick only holds while the chat stays on the project it was made from, so following the chat
  // to another project brings the panel along with it.
  const [pick, setPick] = useState<{ from: ProjectId | null; id: ProjectId | null }>({
    from: props.currentProjectId,
    id: props.currentProjectId,
  });
  const selectedId = pick.from === props.currentProjectId ? pick.id : props.currentProjectId;
  const setSelectedId = (id: ProjectId) => setPick({ from: props.currentProjectId, id });
  const selected = projects.find((project) => project.id === selectedId) ?? projects[0] ?? null;
  const [projectsOpen, setProjectsOpen] = useState(true);
  const send = useSendPrompt(props.currentProjectId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-fork-progress-panel>
      <ScrollArea scrollFade className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2">
          <StatusSection
            title="Projects"
            open={projectsOpen}
            onOpenChange={setProjectsOpen}
            trailing={<span className="tabular-nums">{projects.length}</span>}
          >
            <ul className="flex flex-col">
              {projects.map((project) => (
                <ProjectRow
                  key={`${project.environmentId}:${project.id}`}
                  project={project}
                  selected={project.id === selected?.id}
                  current={project.id === props.currentProjectId}
                  onSelect={() => setSelectedId(project.id)}
                />
              ))}
            </ul>
          </StatusSection>
          {selected ? (
            <ProjectProgress
              key={`${selected.environmentId}:${selected.id}`}
              project={selected}
              isCurrent={selected.id === props.currentProjectId}
              send={send}
            />
          ) : (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Add a project to track its progress here.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Into this chat for its own project; a new chat in the other project otherwise. */
function useSendPrompt(currentProjectId: ProjectId | null): SendPrompt {
  const composerRef = useComposerHandleContext();
  const handleNewThread = useNewThreadHandler();
  return (prompt, project) => {
    const composer = project.id === currentProjectId ? composerRef?.current : null;
    if (composer) {
      if (composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true })) {
        composer.focusAtEnd();
        return;
      }
      toastManager.add({
        type: "error",
        title: "Couldn't add the prompt",
        description: "The chat is busy. Try again once it's ready.",
      });
      return;
    }
    void handleNewThread(scopeProjectRef(project.environmentId, project.id), { prompt }).catch(() =>
      toastManager.add({ type: "error", title: `Couldn't open a new chat in ${project.title}` }),
    );
  };
}

function StatusSection(props: {
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
}) {
  const Chevron = props.open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <section className="min-w-0">
      <div className="flex h-8 min-w-0 items-center gap-1.5 px-2">
        <button
          type="button"
          aria-expanded={props.open}
          onClick={() => props.onOpenChange(!props.open)}
          className="group flex min-w-0 items-center gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className={cn(SECTION_LABEL, "truncate")}>{props.title}</span>
          <Chevron className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
        {props.trailing ? (
          <span className="ms-auto shrink-0 text-xs text-muted-foreground">{props.trailing}</span>
        ) : null}
      </div>
      {props.open ? props.children : null}
    </section>
  );
}

function ProgressRing(props: { readonly state: ProjectProgressState }) {
  const { state } = props;
  if (state.kind !== "ready") {
    return (
      <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-muted-foreground/60" aria-hidden>
        <circle
          cx="8"
          cy="8"
          r="6.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={state.kind === "loading" ? "0" : "2 2.4"}
          opacity={state.kind === "loading" ? 0.35 : 1}
        />
      </svg>
    );
  }
  const { percent, total } = state.document.counts;
  if (total > 0 && percent >= 100) {
    return <CheckCircle2Icon aria-hidden className="size-4 shrink-0 text-success-foreground" />;
  }
  const circumference = 2 * Math.PI * 6.25;
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        className="stroke-foreground/12"
        strokeWidth="1.5"
      />
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        className="stroke-foreground/80"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
      />
    </svg>
  );
}

function ProjectRow(props: {
  readonly project: EnvironmentProject;
  readonly selected: boolean;
  readonly current: boolean;
  readonly onSelect: () => void;
}) {
  const { state } = useProjectProgress(props.project);
  const counts = state.kind === "ready" ? state.document.counts : null;
  const complete = counts !== null && counts.total > 0 && counts.percent >= 100;
  return (
    <li>
      <button
        type="button"
        onClick={props.onSelect}
        aria-current={props.selected ? "true" : undefined}
        className={cn(
          PROGRESS_ROW_TEXT,
          "flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left font-medium text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          ROW_HOVER,
          props.selected && "bg-black/[0.05] text-foreground dark:bg-white/[0.08]",
        )}
      >
        <ProjectFavicon project={props.project} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{props.project.title}</span>
        {props.current ? (
          <span className="shrink-0 text-2xs font-normal text-muted-foreground">This chat</span>
        ) : null}
        <span
          className={cn(
            "w-10 shrink-0 text-right text-xs font-normal tabular-nums",
            complete ? "text-success-foreground" : "text-muted-foreground",
          )}
        >
          {counts ? `${counts.percent}%` : state.kind === "loading" ? "" : "–"}
        </span>
        <ProgressRing state={state} />
      </button>
    </li>
  );
}

function ProjectProgress(props: {
  readonly project: EnvironmentProject;
  readonly isCurrent: boolean;
  readonly send: SendPrompt;
}) {
  const { project, send } = props;
  const { state, refresh } = useProjectProgress(project);
  const sendHere = (prompt: string) => send(prompt, project);
  const destination = props.isCurrent ? "Add to this chat" : `New chat in ${project.title}`;

  return (
    <>
      <div className="mx-0.5 rounded-2xl border border-border bg-card p-3.5 shadow-xs/5">
        <div className="flex min-w-0 items-center gap-2">
          <ProjectFavicon project={project} className="size-4 shrink-0" />
          <span
            className={cn(PROGRESS_ROW_TEXT, "min-w-0 flex-1 truncate font-medium text-foreground")}
          >
            {project.title}
          </span>
          <IconAction
            label={props.isCurrent ? `New chat in ${project.title}` : `Open ${project.title}`}
            onClick={() => send("", project)}
            hidden={props.isCurrent}
          >
            <SquarePenIcon />
          </IconAction>
        </div>
        {state.kind === "ready" ? (
          <ProgressSummary
            counts={state.document.counts}
            document={state.document}
            projectName={project.title}
            destination={destination}
            onSend={sendHere}
          />
        ) : state.kind === "loading" ? (
          <div className="mt-4 flex flex-col gap-2.5" aria-busy>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-1 w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : (
          <EmptyProgress
            failed={state.kind === "error"}
            projectName={project.title}
            destination={destination}
            onRetry={refresh}
            onSetUp={() => sendHere(buildSetupPrompt(project.title))}
          />
        )}
      </div>
      {state.kind === "ready"
        ? state.document.sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              projectName={project.title}
              destination={destination}
              onSend={sendHere}
            />
          ))
        : null}
    </>
  );
}

function ProgressSummary(props: {
  readonly counts: ProgressCounts;
  readonly document: ProgressDocument;
  readonly projectName: string;
  readonly destination: string;
  readonly onSend: (prompt: string) => void;
}) {
  const { counts } = props;
  const next = nextProgressItem(props.document);
  const complete = counts.total > 0 && counts.done === counts.total;
  const left = counts.total - counts.done;
  return (
    <>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-3xl leading-none font-semibold tracking-tight tabular-nums",
              complete ? "text-success-foreground" : "text-foreground",
            )}
          >
            {counts.percent}%
          </span>
          <span className="text-xs text-muted-foreground">done</span>
        </div>
        <span className="pb-px text-xs text-muted-foreground tabular-nums">
          {complete ? "All done" : `${left} left of ${counts.total}`}
        </span>
      </div>
      <div
        className="mt-3 flex h-1 w-full gap-px overflow-hidden rounded-full bg-foreground/8"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={counts.percent}
        aria-label={`${props.projectName} progress`}
      >
        <div
          className="h-full rounded-full bg-success-foreground transition-[width] duration-500 ease-out"
          style={{ width: `${counts.total ? (counts.done / counts.total) * 100 : 0}%` }}
        />
        <div
          className="h-full rounded-full bg-foreground/35 transition-[width] duration-500 ease-out"
          style={{ width: `${counts.total ? (counts.doing / counts.total) * 100 : 0}%` }}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
        <Metric icon={<CheckCircle2Icon className="size-3.5 text-success-foreground" />}>
          <b className="font-medium text-foreground tabular-nums">{counts.done}</b> done
        </Metric>
        <Metric icon={<ArrowRightIcon className="size-3.5 text-foreground" />}>
          <b className="font-medium text-foreground tabular-nums">{counts.doing}</b> in progress
        </Metric>
        <Metric icon={<CircleIcon className="size-3.5 text-muted-foreground/60" />}>
          <b className="font-medium text-foreground tabular-nums">{counts.todo}</b> to do
        </Metric>
      </div>
      {next ? (
        <button
          type="button"
          onClick={() =>
            props.onSend(
              buildTaskPrompt({
                projectName: props.projectName,
                section: next.section,
                item: next.item,
              }),
            )
          }
          className={cn(
            "group/next mt-3 -mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-center gap-2.5 rounded-lg border-t border-border px-1.5 pt-3 pb-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-2xs text-muted-foreground">Up next · {next.section.title}</span>
            <span className={cn(PROGRESS_ROW_TEXT, "truncate font-medium text-foreground")}>
              {next.item.text}
            </span>
          </span>
          <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors group-hover/next:bg-primary/90">
            Continue
            <ArrowRightIcon className="size-3.5" />
          </span>
        </button>
      ) : null}
    </>
  );
}

function Metric(props: { readonly icon: ReactNode; readonly children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {props.icon}
      <span>{props.children}</span>
    </span>
  );
}

function EmptyProgress(props: {
  readonly failed: boolean;
  readonly projectName: string;
  readonly destination: string;
  readonly onRetry: () => void;
  readonly onSetUp: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-2 pt-5 pb-2 text-center">
      <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-background">
        <ListChecksIcon className="size-4 text-muted-foreground" />
      </span>
      <p className={cn(PROGRESS_ROW_TEXT, "mt-3 font-medium text-foreground")}>
        {props.failed ? `Couldn't read ${PROGRESS_FILE_NAME}` : "No progress file yet"}
      </p>
      <p className="mt-1 max-w-64 text-xs leading-5 text-muted-foreground">
        {props.failed
          ? "The project folder may be offline. It retries on its own."
          : `Claude can read ${props.projectName}, list what's done and what's left, and keep it updated after every task.`}
      </p>
      <Button
        className="mt-3.5"
        size="sm"
        variant={props.failed ? "outline" : "default"}
        onClick={props.failed ? props.onRetry : props.onSetUp}
      >
        {props.failed ? "Try again" : "Set up tracking"}
      </Button>
      {props.failed ? null : (
        <span className="mt-2 text-2xs text-muted-foreground">{props.destination}</span>
      )}
    </div>
  );
}

function SectionBlock(props: {
  readonly section: ProgressSection;
  readonly projectName: string;
  readonly destination: string;
  readonly onSend: (prompt: string) => void;
}) {
  const { section } = props;
  const open = section.items.filter((item) => item.status !== "done");
  const done = section.items.filter((item) => item.status === "done");
  const complete = open.length === 0;
  const [expanded, setExpanded] = useState(!complete);
  const [showDone, setShowDone] = useState(false);
  return (
    <div className="border-t border-border pt-2">
      <StatusSection
        title={section.title}
        open={expanded}
        onOpenChange={setExpanded}
        trailing={
          <span className={cn("tabular-nums", complete ? "text-success-foreground" : undefined)}>
            {done.length}/{section.items.length}
          </span>
        }
      >
        <ul className="flex flex-col">
          {open.map((item) => (
            <TaskRow
              key={item.id}
              item={item}
              destination={props.destination}
              onSend={() =>
                props.onSend(buildTaskPrompt({ projectName: props.projectName, section, item }))
              }
            />
          ))}
          {done.length > 0 && !complete ? (
            <li>
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone(!showDone)}
                className={cn(
                  PROGRESS_ROW_TEXT,
                  "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-muted-foreground",
                  ROW_HOVER,
                )}
              >
                {showDone ? (
                  <ChevronDownIcon className="size-3.5 shrink-0" />
                ) : (
                  <ChevronRightIcon className="size-3.5 shrink-0" />
                )}
                {showDone ? "Hide" : "Show"} {done.length} done
              </button>
            </li>
          ) : null}
          {showDone || complete ? done.map((item) => <TaskRow key={item.id} item={item} />) : null}
        </ul>
      </StatusSection>
    </div>
  );
}

function TaskStateIcon({ status }: { readonly status: ProgressItem["status"] }) {
  if (status === "done") {
    return (
      <CheckCircle2Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success-foreground" />
    );
  }
  if (status === "doing") {
    return <ArrowRightIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-foreground" />;
  }
  return <CircleIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />;
}

function TaskRow(props: {
  readonly item: ProgressItem;
  readonly destination?: string;
  readonly onSend?: () => void;
}) {
  const { item } = props;
  const [sent, setSent] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the sent check after a moment
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 1600);
    return () => window.clearTimeout(timer);
  }, [sent]);
  const done = item.status === "done";
  return (
    <li
      data-progress-status={item.status}
      className={cn("group/task flex min-h-8 items-start gap-2 rounded-lg px-2 py-1.5", ROW_HOVER)}
    >
      <TaskStateIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            PROGRESS_ROW_TEXT,
            "line-clamp-2 leading-5 break-words",
            done ? "text-muted-foreground/70 line-through" : "text-foreground",
          )}
        >
          {item.text}
        </p>
        {!done && item.notes.length > 0 ? (
          <p className="mt-0.5 line-clamp-3 text-xs leading-4.5 text-muted-foreground">
            {item.notes.join(" ")}
          </p>
        ) : null}
      </div>
      {props.onSend ? (
        <IconAction
          label={`Write prompt · ${props.destination ?? ""}`}
          className={cn(
            "-my-0.5 opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100",
            sent && "opacity-100",
          )}
          onClick={() => {
            props.onSend?.();
            setSent(true);
          }}
        >
          {sent ? <CheckIcon className="text-success-foreground" /> : <MessageSquarePlusIcon />}
        </IconAction>
      ) : null}
    </li>
  );
}

function IconAction(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly hidden?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  if (props.hidden) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={props.label}
            onClick={props.onClick}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,color] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-3.5",
              ROW_HOVER,
              props.className,
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
