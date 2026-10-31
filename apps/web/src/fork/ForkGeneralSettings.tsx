import { useEffect, useRef } from "react";
import {
  SettingResetButton,
  SettingsRow,
  SettingsSection,
} from "~/components/settings/settingsLayout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { useMicEnabled, useMicEndpointSetting, useUsageMeterVisible } from "./forkSettings";
import { checkMicHelper, useMicHelperStatus } from "./mic/micHelper";
import { DEFAULT_MIC_ENDPOINT, normalizeMicEndpoint, resolveMicEndpoint } from "./mic/micLogic";

const HELPER_STATUS_LABEL = {
  unknown: "Checking…",
  online: "Connected",
  offline: "Not running",
} as const;

export function ForkGeneralSettings() {
  const [micEnabled, setMicEnabled] = useMicEnabled();
  const [endpointSetting, setEndpointSetting] = useMicEndpointSetting();
  const [usageMeterVisible, setUsageMeterVisible] = useUsageMeterVisible();
  const endpoint = resolveMicEndpoint(endpointSetting);
  const helperStatus = useMicHelperStatus(endpoint);
  const endpointInvalid = normalizeMicEndpoint(endpointSetting) === null;
  const inputRef = useRef<HTMLInputElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- probes the external speech helper so the row shows a real status
  useEffect(() => {
    if (micEnabled) void checkMicHelper(endpoint);
  }, [endpoint, micEnabled]);

  return (
    <>
      <SettingsSection id="fork-dictation" title="Dictation">
        <SettingsRow
          title="Mic button"
          description="Mic next to Attach in the message box."
          control={
            <Switch
              checked={micEnabled}
              onCheckedChange={(checked) => setMicEnabled(Boolean(checked))}
              aria-label="Mic button"
            />
          }
        />
        <SettingsRow
          title="Speech helper"
          description={
            endpointInvalid
              ? `Not a valid http(s) address, so ${DEFAULT_MIC_ENDPOINT} is used.`
              : "Address of Scar Mic, the local speech-to-text app."
          }
          status={
            micEnabled ? (
              <span className={helperStatus === "offline" ? "text-destructive" : undefined}>
                {HELPER_STATUS_LABEL[helperStatus]}
              </span>
            ) : null
          }
          resetAction={
            endpointSetting !== DEFAULT_MIC_ENDPOINT ? (
              <SettingResetButton
                label="speech helper"
                onClick={() => {
                  setEndpointSetting(DEFAULT_MIC_ENDPOINT);
                  if (inputRef.current) inputRef.current.value = DEFAULT_MIC_ENDPOINT;
                }}
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                key={endpointSetting}
                aria-label="Speech helper address"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={endpointSetting}
                placeholder={DEFAULT_MIC_ENDPOINT}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== endpointSetting) setEndpointSetting(value || DEFAULT_MIC_ENDPOINT);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void checkMicHelper(endpoint, { force: true })}
              >
                Test
              </Button>
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection id="fork-usage-meter" title="Usage meter">
        <SettingsRow
          title="Show usage in the sidebar"
          description="Claude session and weekly limits at the top of the sidebar."
          control={
            <Switch
              checked={usageMeterVisible}
              onCheckedChange={(checked) => setUsageMeterVisible(Boolean(checked))}
              aria-label="Show usage in the sidebar"
            />
          }
        />
      </SettingsSection>
    </>
  );
}
