import { Schema } from "effect";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { DEFAULT_MIC_ENDPOINT } from "./mic/micLogic";

// Fork-only preferences live in localStorage so the shared settings contract stays upstream's.
export const MIC_ENABLED_KEY = "t3code:fork:mic-enabled";
export const MIC_ENDPOINT_KEY = "t3code:fork:mic-endpoint";
export const USAGE_METER_VISIBLE_KEY = "t3code:fork:usage-meter-visible";

export function useMicEnabled() {
  return useLocalStorage(MIC_ENABLED_KEY, true, Schema.Boolean);
}

export function useMicEndpointSetting() {
  return useLocalStorage(MIC_ENDPOINT_KEY, DEFAULT_MIC_ENDPOINT, Schema.String);
}

export function useUsageMeterVisible() {
  return useLocalStorage(USAGE_METER_VISIBLE_KEY, true, Schema.Boolean);
}
