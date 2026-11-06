import { describe, expect, it } from "vite-plus/test";
import {
  classifyMicStartError,
  formatRecordingDuration,
  levelFromSamples,
  pickRecorderMimeType,
  transcriptToInsert,
} from "./micLogic";

describe("formatRecordingDuration", () => {
  it.each([
    [0, "0:00"],
    [7_900, "0:07"],
    [65_000, "1:05"],
    [-50, "0:00"],
  ])("%d ms -> %s", (ms, expected) => {
    expect(formatRecordingDuration(ms)).toBe(expected);
  });
});

describe("pickRecorderMimeType", () => {
  it("prefers webm opus, then falls through to what the browser records", () => {
    expect(pickRecorderMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
  });
});

describe("levelFromSamples", () => {
  it("is zero for silence and capped at one for clipping", () => {
    expect(levelFromSamples(new Uint8Array(64).fill(128))).toBe(0);
    expect(levelFromSamples(new Uint8Array(64).fill(255))).toBe(1);
    expect(levelFromSamples([])).toBe(0);
  });
});

describe("transcriptToInsert", () => {
  it("tidies spaces, keeps line breaks and rejects non-strings", () => {
    expect(transcriptToInsert("  hello   world ")).toBe("hello world");
    expect(transcriptToInsert("Fix it.\r\n\n\n\n1. One  \n2. Two")).toBe(
      "Fix it.\n\n1. One\n2. Two",
    );
    expect(transcriptToInsert(undefined)).toBe("");
    expect(transcriptToInsert(42)).toBe("");
  });
});

describe("classifyMicStartError", () => {
  it.each([
    ["NotAllowedError", "permission-denied"],
    ["SecurityError", "permission-denied"],
    ["NotFoundError", "no-microphone"],
    ["NotReadableError", "no-microphone"],
    ["AbortError", "unknown"],
  ])("%s -> %s", (name, expected) => {
    expect(classifyMicStartError(new DOMException("x", name))).toBe(expected);
  });
});
