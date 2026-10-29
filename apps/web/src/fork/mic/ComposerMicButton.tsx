import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { MicIcon } from "lucide-react";
import { use, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { BackgroundThreadContext } from "~/components/chat/backgroundThread";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useNowSecond } from "~/hooks/useNowSecond";
import { useStableCallback } from "~/hooks/useStableCallback";
import { shortcutLabelForCommand } from "~/keybindings";
import { registerCommands } from "~/shortcuts/dispatcher";
import { useMicEnabled, useMicEndpointSetting } from "../forkSettings";
import { SplitPaneRoleContext } from "../split/splitPaneRole";
import {
  checkMicHelper,
  MicTranscribeError,
  transcribeWithHelper,
  useMicHelperStatus,
} from "./micHelper";
import {
  classifyMicStartError,
  formatRecordingDuration,
  MAX_RECORDING_MS,
  resolveMicEndpoint,
} from "./micLogic";
import { startMicRecording, type MicRecording } from "./micRecorder";

const MIC_COMMAND = "composer.dictate";

type MicPhase = "idle" | "starting" | "recording" | "transcribing";

const LEVEL_BAR_WEIGHTS = [0.55, 1, 0.75, 0.45] as const;

interface ComposerMicButtonProps {
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly disabled: boolean;
  /** Inserts at the composer's caret; false when the composer can't take text right now. */
  readonly onTranscript: (text: string) => boolean;
}

function helperHint(endpoint: string) {
  return `Start Scar Mic (${endpoint.replace(/^https?:\/\//, "")}), then try again.`;
}

export function ComposerMicButton({ keybindings, disabled, onTranscript }: ComposerMicButtonProps) {
  const [micEnabled] = useMicEnabled();
  const [endpointSetting] = useMicEndpointSetting();
  const endpoint = resolveMicEndpoint(endpointSetting);
  const helperStatus = useMicHelperStatus(endpoint);
  const backgroundThread = use(BackgroundThreadContext);
  const splitRole = use(SplitPaneRoleContext);
  const [phase, setPhase] = useState<MicPhase>("idle");
  const [blocked, setBlocked] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);
  const recordingRef = useRef<MicRecording | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- probes the external speech helper on mount and whenever the window regains focus
  useEffect(() => {
    if (!micEnabled) return;
    void checkMicHelper(endpoint);
    const recheck = () => void checkMicHelper(endpoint);
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [endpoint, micEnabled]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases the microphone if the composer unmounts mid-recording
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      recordingRef.current?.cancel();
      recordingRef.current = null;
      if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    };
  }, []);

  const writeLevel = (level: number) => {
    levelRef.current?.style.setProperty("--mic-level", level.toFixed(2));
  };

  const stopAndTranscribe = useStableCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    setPhase("transcribing");
    setStartedAt(null);
    try {
      const audio = await recording.stop();
      const text = await transcribeWithHelper(endpoint, audio);
      if (text.length === 0) {
        toastManager.add({
          type: "info",
          title: "Didn't catch any words.",
          description: "Try again a little closer to the mic.",
        });
        return;
      }
      if (!onTranscript(text)) {
        toastManager.add({
          type: "warning",
          title: "Couldn't put the words in the message box.",
          description: text,
        });
      }
    } catch (error) {
      if (error instanceof MicTranscribeError && error.kind === "offline") {
        toastManager.add({
          type: "error",
          title: "Speech helper isn't answering.",
          description: helperHint(endpoint),
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Transcription failed.",
          description:
            error instanceof Error ? error.message : "The speech helper returned an error.",
        });
      }
    } finally {
      setPhase("idle");
    }
  });

  const start = useStableCallback(async () => {
    setPhase("starting");
    const online = await checkMicHelper(endpoint, { force: true });
    if (!online) {
      setPhase("idle");
      toastManager.add({
        type: "error",
        title: "Speech helper isn't running.",
        description: helperHint(endpoint),
      });
      return;
    }
    try {
      const recording = await startMicRecording(writeLevel);
      if (unmountedRef.current) {
        // The composer went away while the permission prompt was open: release the mic now.
        recording.cancel();
        return;
      }
      recordingRef.current = recording;
      setBlocked(false);
      setStartedAt(Math.floor(Date.now() / 1000) * 1000);
      setPhase("recording");
      autoStopRef.current = window.setTimeout(() => void stopAndTranscribe(), MAX_RECORDING_MS);
    } catch (error) {
      setPhase("idle");
      const failure = classifyMicStartError(error);
      if (failure === "permission-denied") {
        setBlocked(true);
        toastManager.add({
          type: "error",
          title: "Microphone access is blocked.",
          description:
            "Allow T3 Code in Windows Settings → Privacy & security → Microphone (or the browser's site settings), then try again.",
        });
      } else if (failure === "no-microphone") {
        toastManager.add({
          type: "error",
          title: "No microphone found.",
          description: "Plug one in or pick a default input device, then try again.",
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Couldn't start recording.",
          description:
            error instanceof Error ? error.message : "This browser can't record audio here.",
        });
      }
    }
  });

  const toggle = useStableCallback(() => {
    if (disabled) return;
    if (phase === "recording") void stopAndTranscribe();
    else if (phase === "idle") void start();
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the dictation shortcut with the command registry while this composer is mounted
  useEffect(() => {
    // The split's right pane runs in background mode but still owns its own mic.
    if ((backgroundThread && splitRole !== "secondary") || !micEnabled) return;
    return registerCommands(
      {
        [MIC_COMMAND]: (event) => {
          const root = rootRef.current;
          const form = root?.closest("form");
          if (!root || !form) return false;
          const active = document.activeElement;
          const focusInThisComposer = active instanceof Node && form.contains(active);
          const focusInOtherComposer =
            !focusInThisComposer &&
            active instanceof Element &&
            active.closest("form [data-testid='composer-editor']") !== null;
          // Newest scope runs first: pass to the other composer when it owns focus, or when
          // neither does and this one is the split's secondary pane.
          if (focusInOtherComposer) return false;
          if (!focusInThisComposer && splitRole === "secondary") return false;
          event.preventDefault();
          event.stopPropagation();
          toggle();
          return true;
        },
      },
      { capture: true },
    );
  }, [backgroundThread, micEnabled, splitRole, toggle]);

  if (!micEnabled) return null;

  const shortcutLabel = shortcutLabelForCommand(keybindings, MIC_COMMAND, {
    context: { composerFocus: true },
  });
  const withShortcut = (label: string) => (shortcutLabel ? `${label} (${shortcutLabel})` : label);
  const helperOffline = helperStatus === "offline";

  if (phase === "recording") {
    return (
      <div ref={rootRef} className="flex items-center gap-2" data-fork-mic="recording">
        <Tooltip>
          <TooltipTrigger
            render={
              // Same circle as the composer's Interrupt button (ComposerPrimaryActions).
              <button
                type="button"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs shadow-destructive/24 inset-shadow-control-highlight transition-colors duration-150 hover:bg-destructive active:inset-shadow-control-pressed active:shadow-none sm:size-7 [&_svg]:pointer-events-none"
                onPointerDown={(event) => event.preventDefault()}
                onClick={toggle}
                aria-label="Stop dictation"
              />
            }
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" rx="1.5" />
            </svg>
          </TooltipTrigger>
          <TooltipPopup>{withShortcut("Stop and transcribe")}</TooltipPopup>
        </Tooltip>
        <MicRecordingIndicator levelRef={levelRef} startedAt={startedAt} />
      </div>
    );
  }

  const tooltip =
    phase === "transcribing"
      ? "Transcribing…"
      : phase === "starting"
        ? "Starting microphone…"
        : helperOffline
          ? "Scar Mic isn't running"
          : blocked
            ? "Mic blocked"
            : withShortcut("Dictate");

  return (
    <div ref={rootRef} className="flex items-center" data-fork-mic={phase}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={phase === "transcribing" || phase === "starting"}
              aria-disabled={disabled ? true : undefined}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (disabled) return;
                if (helperOffline) {
                  void checkMicHelper(endpoint, { force: true }).then((online) => {
                    if (online) void start();
                    else
                      toastManager.add({
                        type: "error",
                        title: "Speech helper isn't running.",
                        description: helperHint(endpoint),
                      });
                  });
                  return;
                }
                toggle();
              }}
              aria-label={phase === "transcribing" ? "Transcribing" : "Dictate"}
            />
          }
        >
          {phase === "transcribing" || phase === "starting" ? (
            <Spinner size="sm" aria-hidden="true" />
          ) : (
            <MicIcon />
          )}
        </TooltipTrigger>
        <TooltipPopup>{tooltip}</TooltipPopup>
      </Tooltip>
    </div>
  );
}

// Its own component so only an active recording subscribes to the per-second clock.
function MicRecordingIndicator({
  levelRef,
  startedAt,
}: {
  readonly levelRef: RefObject<HTMLSpanElement | null>;
  readonly startedAt: number | null;
}) {
  const now = useNowSecond();
  const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt);
  return (
    <>
      <span
        ref={levelRef}
        className="flex h-4 items-center gap-0.5"
        aria-hidden="true"
        style={{ "--mic-level": "0" } as CSSProperties}
      >
        {LEVEL_BAR_WEIGHTS.map((weight) => (
          <span
            key={weight}
            className="h-4 w-0.5 origin-center rounded-full bg-destructive transition-transform duration-75"
            style={{ transform: `scaleY(calc(0.2 + var(--mic-level) * ${weight * 0.8}))` }}
          />
        ))}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums" role="timer" aria-live="off">
        {formatRecordingDuration(elapsed)}
      </span>
    </>
  );
}
