import type * as Electron from "electron";

// Fork: the composer mic records in the app window. Media is granted to app windows only;
// webviews and any other contents on the default session get no microphone or camera.
// Every non-media permission keeps Electron's default (granted), as upstream had no handler.
const appWindowContents = new Set<number>();
const configuredSessions = new WeakSet<Electron.Session>();

export function isMediaAllowed(webContentsId: number | null | undefined): boolean {
  return webContentsId != null && appWindowContents.has(webContentsId);
}

export function allowMediaForAppWindow(webContents: Electron.WebContents): void {
  const id = webContents.id;
  appWindowContents.add(id);
  webContents.once("destroyed", () => {
    appWindowContents.delete(id);
  });

  const session = webContents.session;
  if (configuredSessions.has(session)) return;
  configuredSessions.add(session);
  session.setPermissionRequestHandler((contents, permission, callback) => {
    callback(permission === "media" ? isMediaAllowed(contents?.id) : true);
  });
  session.setPermissionCheckHandler((contents, permission) =>
    permission === "media" ? isMediaAllowed(contents?.id) : true,
  );
}

export function resetForkMediaPermissionsForTest(): void {
  appWindowContents.clear();
}
