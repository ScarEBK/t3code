// The owner's Project Board app answers only loopback callers, so web, desktop and phone
// clients reach it through this environment with its own auth scopes.
import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/http";

import { authenticateMediaRequest } from "../auth/http.ts";

const BOARD_ROUTE_PREFIX = "/api/fork/board";
const BOARD_ORIGIN = process.env.T3CODE_BOARD_URL ?? "http://127.0.0.1:7790";
const CARD_PATH = /^\/cards\/([A-Za-z0-9_-]{1,64})$/;
const OWNER_STATUSES = new Set(["todo", "doing", "review", "done", "skip"]);
const NO_STORE = { "cache-control": "no-store" };

const unavailable = HttpServerResponse.json(
  { error: "The Project Board is not running on this computer." },
  { status: 503, headers: NO_STORE },
);

const relay = Effect.fn("ForkBoardProxy.relay")(
  function* (request: HttpClientRequest.HttpClientRequest) {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(request);
    const body = yield* response.json;
    return yield* HttpServerResponse.json(body, { status: response.status, headers: NO_STORE });
  },
  Effect.catch(() => unavailable),
);

const handler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const url = HttpServerRequest.toURL(request);
  if (Option.isNone(url)) return HttpServerResponse.text("Bad Request", { status: 400 });
  const path = url.value.pathname.slice(BOARD_ROUTE_PREFIX.length);

  if (request.method === "GET" && path === "/all") {
    yield* authenticateMediaRequest(AuthOrchestrationReadScope);
    return yield* relay(HttpClientRequest.get(`${BOARD_ORIGIN}/api/all`));
  }

  const card = CARD_PATH.exec(path);
  if (request.method === "PATCH" && card) {
    yield* authenticateMediaRequest(AuthOrchestrationOperateScope);
    const status = url.value.searchParams.get("status") ?? "";
    if (!OWNER_STATUSES.has(status)) {
      return HttpServerResponse.text("Unknown status", { status: 400 });
    }
    // Whoever holds operate scope on this environment is the board's owner.
    return yield* relay(
      HttpClientRequest.patch(`${BOARD_ORIGIN}/api/cards/${card[1]}`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ status, actor: "owner" }),
      ),
    );
  }

  return HttpServerResponse.text("Not Found", { status: 404 });
}).pipe(
  Effect.catchTags({
    EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
    EnvironmentInternalError: HttpServerRespondable.toResponse,
    EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
  }),
);

export const layer = HttpRouter.add("*", `${BOARD_ROUTE_PREFIX}/*`, handler);
