import { describe, expect, it } from "vite-plus/test";
import type * as Electron from "electron";
import {
  allowMediaForAppWindow,
  isMediaAllowed,
  resetForkMediaPermissionsForTest,
} from "./ForkMediaPermissions.ts";

type RequestHandler = Parameters<Electron.Session["setPermissionRequestHandler"]>[0];
type CheckHandler = Parameters<Electron.Session["setPermissionCheckHandler"]>[0];

function fakeContents(id: number, session: Electron.Session) {
  const listeners = new Map<string, () => void>();
  const contents = {
    id,
    session,
    once: (event: string, listener: () => void) => listeners.set(event, listener),
  };
  return {
    contents: contents as unknown as Electron.WebContents,
    destroy: () => listeners.get("destroyed")?.(),
  };
}

function fakeSession() {
  const handlers: { request?: RequestHandler; check?: CheckHandler; installs: number } = {
    installs: 0,
  };
  const session = {
    setPermissionRequestHandler: (handler: RequestHandler) => {
      handlers.installs += 1;
      handlers.request = handler;
    },
    setPermissionCheckHandler: (handler: CheckHandler) => {
      handlers.check = handler;
    },
  } as unknown as Electron.Session;
  return { session, handlers };
}

function request(
  handler: RequestHandler | undefined,
  contents: Electron.WebContents | null,
  permission: string,
) {
  let granted: boolean | undefined;
  handler?.(
    contents as Electron.WebContents,
    permission as never,
    (value) => (granted = value),
    {} as never,
  );
  return granted;
}

describe("allowMediaForAppWindow", () => {
  it("grants the mic to app windows only and keeps other permissions at Electron's default", () => {
    resetForkMediaPermissionsForTest();
    const { session, handlers } = fakeSession();
    const app = fakeContents(1, session);
    const webview = fakeContents(2, session);
    allowMediaForAppWindow(app.contents);
    allowMediaForAppWindow(fakeContents(3, session).contents);

    expect(handlers.installs).toBe(1);
    expect(request(handlers.request, app.contents, "media")).toBe(true);
    expect(request(handlers.request, webview.contents, "media")).toBe(false);
    expect(request(handlers.request, null, "media")).toBe(false);
    expect(request(handlers.request, webview.contents, "notifications")).toBe(true);
    expect(handlers.check?.(webview.contents, "media", "", {} as never)).toBe(false);
    expect(handlers.check?.(app.contents, "media", "", {} as never)).toBe(true);

    app.destroy();
    expect(isMediaAllowed(1)).toBe(false);
  });
});
