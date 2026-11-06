import { Schema } from "effect";
import { useLocalStorage } from "~/hooks/useLocalStorage";

// Fork-only preferences live in localStorage so the shared settings contract stays upstream's.
const MIC_ENABLED_KEY = "t3code:fork:mic-enabled";
const USAGE_METER_VISIBLE_KEY = "t3code:fork:usage-meter-visible";

export function useMicEnabled() {
  return useLocalStorage(MIC_ENABLED_KEY, true, Schema.Boolean);
}

export function useUsageMeterVisible() {
  return useLocalStorage(USAGE_METER_VISIBLE_KEY, true, Schema.Boolean);
}
