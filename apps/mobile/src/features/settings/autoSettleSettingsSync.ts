import {
  type EnvironmentId,
  type ProjectId,
  type ServerSettings,
  sidebarAutoSettlePatch,
} from "@t3tools/contracts";

export type AutoSettleSettings = Pick<
  ServerSettings,
  "sidebarAutoSettleAfterDays" | "sidebarAutoSettleAfterHours" | "sidebarAutoSettleOnMerge"
>;

interface AutoSettleSyncTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId?: ProjectId | null;
  readonly label: string;
  readonly settings: AutoSettleSettings | null;
}

export function planAutoSettleSettingsSync(
  reference: {
    readonly environmentId: EnvironmentId;
    readonly projectId?: ProjectId | null;
    readonly settings: AutoSettleSettings;
  },
  targets: readonly AutoSettleSyncTarget[],
) {
  const patch: AutoSettleSettings = {
    ...sidebarAutoSettlePatch(reference.settings.sidebarAutoSettleAfterHours),
    sidebarAutoSettleOnMerge: reference.settings.sidebarAutoSettleOnMerge,
  };
  const mismatches = targets.filter(
    (target) =>
      (target.environmentId !== reference.environmentId ||
        target.projectId !== reference.projectId) &&
      target.settings !== null &&
      (target.settings.sidebarAutoSettleAfterHours !== patch.sidebarAutoSettleAfterHours ||
        target.settings.sidebarAutoSettleOnMerge !== patch.sidebarAutoSettleOnMerge),
  );
  return { patch, mismatches };
}
