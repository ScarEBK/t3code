import { describe, expect, it } from "vite-plus/test";
import {
  deriveMeterState,
  formatResetClock,
  pickMeterWindows,
  usageLevel,
} from "./usageMeterLogic";

describe("usageLevel", () => {
  it.each([
    [0, "normal"],
    [74, "normal"],
    [75, "warning"],
    [89, "warning"],
    [90, "critical"],
    [100, "critical"],
  ] as const)("%d%% used -> %s", (used, level) => {
    expect(usageLevel(used)).toBe(level);
  });
});

describe("pickMeterWindows", () => {
  it("keeps the session and first weekly window in that order with the earliest reset", () => {
    expect(
      pickMeterWindows([
        { kind: "weekly", usedPercent: 18.4, resets: [{ at: 900 }, { at: 500 }] },
        { kind: "weekly", usedPercent: 60, resets: [] },
        { kind: "monthly", usedPercent: 10, resets: [] },
        { kind: "session", usedPercent: 101, resets: [] },
      ]),
    ).toEqual([
      { key: "session", label: "Session", usedPercent: 100, resetsAt: null },
      { key: "weekly", label: "Weekly", usedPercent: 18, resetsAt: 500 },
    ]);
  });
});

describe("deriveMeterState", () => {
  const ready = { checkedAt: "2026-10-28T00:00:00Z", windows: [] };
  it("shows windows whenever the pool has them", () => {
    const state = deriveMeterState({
      pending: true,
      providers: [],
      poolWindows: [{ kind: "session", usedPercent: 40, resets: [] }],
    });
    expect(state.kind).toBe("ready");
  });

  it.each([
    ["loading while the config is pending", { pending: true, providers: [] }, "loading"],
    ["hidden without a Claude provider", { pending: false, providers: [] }, "hidden"],
    [
      "hidden when the only Claude provider is disabled",
      { pending: false, providers: [{ enabled: false }] },
      "hidden",
    ],
    [
      "loading before the first limits probe",
      { pending: false, providers: [{ enabled: true }] },
      "loading",
    ],
    [
      "error when the probe failed",
      {
        pending: false,
        providers: [
          {
            enabled: true,
            usageLimits: { ...ready, unavailable: { reason: "probeFailed" as const } },
          },
        ],
      },
      "error",
    ],
    [
      "hidden for accounts without subscription limits",
      {
        pending: false,
        providers: [
          {
            enabled: true,
            usageLimits: { ...ready, unavailable: { reason: "unsupported" as const } },
          },
        ],
      },
      "hidden",
    ],
  ])("%s", (_name, input, kind) => {
    expect(deriveMeterState({ ...input, poolWindows: null }).kind).toBe(kind);
  });
});

describe("formatResetClock", () => {
  it("prints the reset in Ohio time", () => {
    expect(formatResetClock(Date.parse("2026-10-29T01:40:00Z"))).toBe("Wed 9:40 PM");
  });
});
