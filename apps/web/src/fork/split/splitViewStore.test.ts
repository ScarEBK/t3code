import { describe, expect, it } from "vite-plus/test";
import { parseStoredSplit, sameThreadRef, splitLayoutMode } from "./splitViewStore";

describe("splitLayoutMode", () => {
  it.each([
    [1600, "split"],
    [960, "split"],
    [959, "too-narrow"],
    [640, "too-narrow"],
    [639, "phone"],
    [0, "phone"],
  ] as const)("%dpx -> %s", (width, mode) => {
    expect(splitLayoutMode(width)).toBe(mode);
  });
});

describe("parseStoredSplit", () => {
  it("restores a saved right-hand chat and rejects anything malformed", () => {
    expect(parseStoredSplit('{"environmentId":"env","threadId":"t1"}')).toEqual({
      environmentId: "env",
      threadId: "t1",
    });
    expect(parseStoredSplit(null)).toBeNull();
    expect(parseStoredSplit("not json")).toBeNull();
    expect(parseStoredSplit('{"environmentId":"env"}')).toBeNull();
    expect(parseStoredSplit('{"environmentId":"","threadId":"t1"}')).toBeNull();
  });
});

describe("sameThreadRef", () => {
  it("matches on environment and thread, never on null", () => {
    const ref = parseStoredSplit('{"environmentId":"env","threadId":"t1"}');
    const other = parseStoredSplit('{"environmentId":"env2","threadId":"t1"}');
    expect(sameThreadRef(ref, parseStoredSplit('{"environmentId":"env","threadId":"t1"}'))).toBe(
      true,
    );
    expect(sameThreadRef(ref, other)).toBe(false);
    expect(sameThreadRef(null, null)).toBe(false);
  });
});
