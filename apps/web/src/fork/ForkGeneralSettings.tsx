import { SettingsRow, SettingsSection } from "~/components/settings/settingsLayout";
import { Switch } from "~/components/ui/switch";
import { useMicEnabled, useUsageMeterVisible } from "./forkSettings";

export function ForkGeneralSettings() {
  const [micEnabled, setMicEnabled] = useMicEnabled();
  const [usageMeterVisible, setUsageMeterVisible] = useUsageMeterVisible();

  return (
    <>
      <SettingsSection id="fork-dictation" title="Dictation">
        <SettingsRow
          title="Mic button"
          description="Talk, and Opus rewrites it using this chat as memory, then sends it. Needs Scar Mic on the computer the chat runs on."
          control={
            <Switch
              checked={micEnabled}
              onCheckedChange={(checked) => setMicEnabled(Boolean(checked))}
              aria-label="Mic button"
            />
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
