import { useAtomValue } from "@effect/atom-react";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import {
  collectLimitAccounts,
  collectLimitPools,
  formatDuration,
} from "@t3tools/shared/usageLimits";
import { useNavigate } from "@tanstack/react-router";
import { CircleAlertIcon } from "lucide-react";
import { useEffect } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { environmentPresentations } from "~/state/presentation";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { useUsageMeterVisible } from "../forkSettings";
import {
  deriveMeterState,
  formatResetClock,
  METER_DRIVER,
  type MeterState,
  type MeterWindow,
  usageLevel,
} from "./usageMeterLogic";

const FIXTURE_KEY = "t3code:fork:usage-fixture";

const LEVEL_BAR_CLASS = {
  normal: "bg-foreground/55",
  warning: "bg-warning",
  critical: "bg-destructive",
} as const;

const LEVEL_TEXT_CLASS = {
  normal: "text-foreground",
  warning: "text-warning-foreground",
  critical: "text-destructive",
} as const;

// Dev-only seeded states for screenshots; production builds strip this branch.
function readFixture(now: number): MeterState | null {
  if (!import.meta.env.DEV) return null;
  const raw = window.localStorage.getItem(FIXTURE_KEY);
  if (!raw) return null;
  try {
    const fixture = JSON.parse(raw) as {
      kind: MeterState["kind"];
      session?: number;
      weekly?: number;
    };
    if (fixture.kind !== "ready") {
      return fixture.kind === "error"
        ? { kind: "error", message: "Couldn't read Claude's limits." }
        : { kind: fixture.kind };
    }
    return {
      kind: "ready",
      windows: [
        {
          key: "session",
          label: "5-hour",
          usedPercent: fixture.session ?? 0,
          resetsAt: now + 2.2 * 3_600_000,
        },
        {
          key: "weekly",
          label: "Weekly",
          usedPercent: fixture.weekly ?? 0,
          resetsAt: now + 3.4 * 86_400_000,
        },
      ],
    };
  } catch {
    return null;
  }
}

function useMeterState(now: number): MeterState {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const entries = Array.from(presentations);
  const providers = entries.flatMap(([, presentation]) =>
    (presentation.serverConfig?.providers ?? []).filter(
      (provider) => provider.driver === METER_DRIVER,
    ),
  );
  const pool = collectLimitPools(collectLimitAccounts(presentations), now).find(
    (candidate) => candidate.driver === METER_DRIVER,
  );
  const state = deriveMeterState({
    pending:
      entries.length === 0 ||
      entries.every(([, presentation]) => presentation.serverConfig === null),
    providers,
    poolWindows: pool?.windows ?? null,
  });

  const unprobed = entries
    .filter(
      ([, presentation]) =>
        presentation.connection.phase === "connected" &&
        presentation.serverConfig?.providers.some(
          (provider) =>
            provider.driver === METER_DRIVER &&
            provider.enabled &&
            provider.usageLimits === undefined,
        ) === true,
    )
    .map(([environmentId]) => environmentId);
  const unprobedKey = unprobed.join(",");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks a connected server for Claude's limits once when none were probed yet; shares the Usage page's 5-minute throttle
  useEffect(() => {
    if (unprobedKey.length === 0) return;
    for (const environmentId of unprobed) {
      void refreshUsageLimits(
        environmentId,
        () => refreshProviders({ environmentId, input: {} }),
        true,
      ).catch(() => undefined);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed by the joined ids
  }, [unprobedKey]);

  return readFixture(now) ?? state;
}

export function SidebarUsageMeter() {
  const [visible] = useUsageMeterVisible();
  if (!visible) return null;
  return <SidebarUsageMeterContent />;
}

function SidebarUsageMeterContent() {
  useNowMinute();
  const now = Date.now();
  const state = useMeterState(now);
  const navigate = useNavigate();
  if (state.kind === "hidden") return null;

  const openUsage = () => void navigate({ to: "/usage" });

  return (
    <div className="px-2 pb-1" data-fork-usage-meter={state.kind}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={openUsage}
              aria-label="Claude usage limits. Open Usage"
              className="flex w-full cursor-pointer flex-col gap-2 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          {state.kind === "loading" ? (
            <>
              <MeterSkeletonRow />
              <MeterSkeletonRow />
            </>
          ) : state.kind === "error" ? (
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
              Usage unavailable
            </span>
          ) : (
            state.windows.map((window) => <MeterRow key={window.key} window={window} now={now} />)
          )}
        </TooltipTrigger>
        <TooltipPopup side="right">
          {state.kind === "ready" ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-foreground">Claude usage</span>
              {state.windows.map((window) => (
                <span key={window.key} className="text-muted-foreground tabular-nums">
                  {window.label}: {window.usedPercent}% used
                  {window.resetsAt !== null
                    ? ` · resets ${formatResetClock(window.resetsAt)} ET`
                    : ""}
                </span>
              ))}
              <span className="text-muted-foreground">Click to open Usage</span>
            </div>
          ) : state.kind === "error" ? (
            state.message
          ) : (
            "Reading Claude's limits…"
          )}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

function MeterRow({ window, now }: { readonly window: MeterWindow; readonly now: number }) {
  const level = usageLevel(window.usedPercent);
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-baseline gap-1.5 text-xs tabular-nums">
        <span className="text-muted-foreground">{window.label}</span>
        <span className={cn("ms-auto font-medium", LEVEL_TEXT_CLASS[level])}>
          {window.usedPercent}% used
        </span>
        {window.resetsAt !== null ? (
          <span className="text-muted-foreground">· {formatDuration(window.resetsAt - now)}</span>
        ) : null}
      </span>
      <span className="relative h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_BAR_CLASS[level])}
          style={{ width: `${window.usedPercent}%` }}
        />
      </span>
    </span>
  );
}

function MeterSkeletonRow() {
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-20" />
      </span>
      <Skeleton className="h-1 w-full" />
    </span>
  );
}
