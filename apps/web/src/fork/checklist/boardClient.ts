import {
  type DeviceHubAccess,
  resolveDeviceHubAccess,
  withDeviceHubQuery,
} from "@t3tools/client-runtime/state/deviceHubAccess";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentSession } from "~/state/session";
import type { BoardSnapshot, BoardStatus } from "./checklistLogic";

// Must match BOARD_ROUTE_PREFIX in apps/server/src/fork/BoardProxy.ts.
const BOARD_BASE_PATH = "/api/fork/board";

const boardAccessAtom = Atom.family((environmentId: EnvironmentId) =>
  connectionAtomRuntime
    .atom((get) => {
      const prepared = Option.getOrNull(
        get(environmentSession.preparedConnectionValueAtom(environmentId)),
      );
      if (prepared === null) return Effect.never;
      return resolveDeviceHubAccess({ prepared, hubBasePath: BOARD_BASE_PATH });
    })
    .pipe(Atom.setIdleTTL(60_000), Atom.withLabel(`fork-board-access:${environmentId}`)),
);

function readBoardAccess(
  environmentId: EnvironmentId,
  refresh: boolean,
): Promise<DeviceHubAccess | null> {
  const atom = boardAccessAtom(environmentId);
  if (refresh) appAtomRegistry.refresh(atom);
  return Effect.runPromise(
    AtomRegistry.getResult(appAtomRegistry, atom, { suspendOnWaiting: true }).pipe(
      Effect.timeout("10 seconds"),
      Effect.orElseSucceed(() => null),
    ),
  );
}

async function boardRequest(
  environmentId: EnvironmentId,
  path: string,
  method: "GET" | "POST",
): Promise<unknown> {
  // A media ticket can expire between requests; one fresh ticket retries an auth failure.
  for (const refresh of [false, true]) {
    const access = await readBoardAccess(environmentId, refresh);
    if (!access) throw new Error("Can't reach this computer right now.");
    const response = await fetch(withDeviceHubQuery(`${access.httpBase}${path}`, access), {
      method,
      cache: "no-store",
      credentials: access.credentials ? "include" : "same-origin",
    });
    if (response.status === 401 && !refresh) continue;
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `The board answered ${response.status}.`;
      throw new Error(message);
    }
    return body;
  }
  throw new Error("Can't reach this computer right now.");
}

export async function loadBoard(environmentId: EnvironmentId): Promise<BoardSnapshot> {
  const body = (await boardRequest(environmentId, "/all", "GET")) as Partial<BoardSnapshot> | null;
  return { projects: body?.projects ?? [], areas: body?.areas ?? [], cards: body?.cards ?? [] };
}

export async function setCardStatus(
  environmentId: EnvironmentId,
  cardId: string,
  status: BoardStatus,
): Promise<void> {
  await boardRequest(
    environmentId,
    `/cards/${encodeURIComponent(cardId)}/status?status=${status}`,
    "POST",
  );
}
