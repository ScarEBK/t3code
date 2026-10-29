import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";

const USAGE_WARNING_PERCENT = 75;
const USAGE_CRITICAL_PERCENT = 90;
export const METER_DRIVER = "claudeAgent";
// Scar's clock: the PC runs on Pacific time but Scar lives in Ohio.
const METER_TIME_ZONE = "America/New_York";

export type UsageLevel = "normal" | "warning" | "critical";

export function usageLevel(usedPercent: number): UsageLevel {
  if (usedPercent >= USAGE_CRITICAL_PERCENT) return "critical";
  if (usedPercent >= USAGE_WARNING_PERCENT) return "warning";
  return "normal";
}

export interface MeterWindow {
  readonly key: "session" | "weekly";
  readonly label: string;
  readonly usedPercent: number;
  readonly resetsAt: number | null;
}

export type MeterState =
  | { readonly kind: "hidden" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly windows: readonly MeterWindow[] };

interface PoolWindowLike {
  readonly kind: ServerProviderUsageWindow["kind"];
  readonly usedPercent: number;
  readonly resets: ReadonlyArray<{ readonly at: number }>;
}

const WINDOW_LABEL = { session: "Session", weekly: "Weekly" } as const;

export function pickMeterWindows(windows: readonly PoolWindowLike[]): MeterWindow[] {
  const picked: MeterWindow[] = [];
  for (const key of ["session", "weekly"] as const) {
    const window = windows.find((candidate) => candidate.kind === key);
    if (!window) continue;
    const resets = window.resets.map((reset) => reset.at).filter(Number.isFinite);
    picked.push({
      key,
      label: WINDOW_LABEL[key],
      usedPercent: Math.round(Math.max(0, Math.min(100, window.usedPercent))),
      resetsAt: resets.length > 0 ? Math.min(...resets) : null,
    });
  }
  return picked;
}

export interface MeterInput {
  /** Every environment is still connecting or hasn't sent its config yet. */
  readonly pending: boolean;
  readonly providers: ReadonlyArray<{
    readonly enabled: boolean;
    readonly usageLimits?: ServerProviderUsageLimits | undefined;
  }>;
  readonly poolWindows: readonly PoolWindowLike[] | null;
}

export function deriveMeterState(input: MeterInput): MeterState {
  const windows = input.poolWindows ? pickMeterWindows(input.poolWindows) : [];
  if (windows.length > 0) return { kind: "ready", windows };
  const providers = input.providers.filter((provider) => provider.enabled);
  if (providers.length === 0) return input.pending ? { kind: "loading" } : { kind: "hidden" };
  if (providers.some((provider) => provider.usageLimits === undefined) || input.pending) {
    return { kind: "loading" };
  }
  const failed = providers.find(
    (provider) => provider.usageLimits?.unavailable?.reason === "probeFailed",
  );
  if (failed) {
    return {
      kind: "error",
      message: failed.usageLimits?.unavailable?.message ?? "Couldn't read limits.",
    };
  }
  return { kind: "hidden" };
}

export function formatResetClock(at: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: METER_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}
