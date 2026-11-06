// Smart mic route: the composer's mic sends the recording here, to the environment that owns the
// chat, so a PC chat is heard on the PC and a VPS chat on the VPS. This environment's Scar Mic
// helper turns it into words, then Claude rewrites them with this chat's conversation as memory.
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/http";

import { authenticateMediaRequest } from "../auth/http.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import {
  type MicConversationMessage,
  micHelperHealthy,
  rewriteTranscript,
  transcribeWithHelper,
} from "./micRewrite.ts";

const MIC_ROUTE_PREFIX = "/api/fork/mic";
const NO_STORE = { "cache-control": "no-store" };
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

const helperOffline = HttpServerResponse.json(
  { error: "Scar Mic (the speech helper) isn't running on this computer." },
  { status: 503, headers: NO_STORE },
);

interface ChatContext {
  readonly projectKey: string | null;
  readonly projectName: string | null;
  readonly threadTitle: string | null;
  readonly messages: ReadonlyArray<MicConversationMessage>;
}

const EMPTY_CONTEXT: ChatContext = {
  projectKey: null,
  projectName: null,
  threadTitle: null,
  messages: [],
};

/** The chat's project and recent messages. Missing pieces just mean less memory, never an error. */
const loadChatContext = Effect.fn("ForkMicProxy.loadChatContext")(function* (
  threadIdRaw: string | null,
  projectIdRaw: string | null,
) {
  const threads = yield* Effect.serviceOption(ThreadManagementService.ThreadManagementService);
  const projects = yield* Effect.serviceOption(ProjectStore.ProjectStoreV2);
  let projectKey = projectIdRaw;
  let threadTitle: string | null = null;
  let messages: ReadonlyArray<MicConversationMessage> = [];

  if (threadIdRaw && Option.isSome(threads)) {
    const threadId = ThreadId.make(threadIdRaw);
    const shell = yield* threads.value
      .getThreadShell(threadId)
      .pipe(Effect.orElseSucceed(() => null));
    if (shell) {
      threadTitle = shell.title;
      projectKey = shell.projectId;
    }
    const records = yield* threads.value
      .getThreadRecords(threadId, ["messages"], {})
      .pipe(Effect.orElseSucceed(() => null));
    messages = (records?.messages ?? []).flatMap((message) =>
      (message.role === "user" || message.role === "assistant") &&
      !message.workflowScript &&
      message.text.trim().length > 0
        ? [{ role: message.role, text: message.text }]
        : [],
    );
  }

  let projectName: string | null = null;
  if (projectKey && Option.isSome(projects)) {
    const project = yield* projects.value
      .getShell(ProjectId.make(projectKey))
      .pipe(Effect.orElseSucceed(() => Option.none()));
    if (Option.isSome(project)) projectName = project.value.title;
  }
  return { projectKey, projectName, threadTitle, messages } satisfies ChatContext;
});

const handler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const url = HttpServerRequest.toURL(request);
  if (Option.isNone(url)) return HttpServerResponse.text("Bad Request", { status: 400 });
  const path = url.value.pathname.slice(MIC_ROUTE_PREFIX.length);

  if (request.method === "GET" && path === "/health") {
    yield* authenticateMediaRequest(AuthOrchestrationReadScope);
    const ok = yield* Effect.promise(() => micHelperHealthy());
    return yield* HttpServerResponse.json({ ok }, { headers: NO_STORE });
  }

  // POST, not PUT: cross-origin clients (desktop, app.t3.codes) may only send GET and POST.
  if (request.method === "POST" && path === "/transcribe") {
    yield* authenticateMediaRequest(AuthOrchestrationOperateScope);
    const threadId = url.value.searchParams.get("threadId");
    const projectId = url.value.searchParams.get("projectId");
    if ((threadId && !ID_PATTERN.test(threadId)) || (projectId && !ID_PATTERN.test(projectId))) {
      return HttpServerResponse.text("Bad id", { status: 400 });
    }
    const body = yield* request.arrayBuffer.pipe(Effect.orElseSucceed(() => null));
    if (!body || body.byteLength === 0 || body.byteLength > MAX_AUDIO_BYTES) {
      return yield* HttpServerResponse.json(
        { error: "Send the recording as the request body." },
        { status: 400, headers: NO_STORE },
      );
    }
    const contentType = request.headers["content-type"] ?? "audio/webm";
    const heard = yield* Effect.tryPromise(() =>
      transcribeWithHelper(new Uint8Array(body), contentType),
    ).pipe(Effect.result);
    if (heard._tag === "Failure") {
      const healthy = yield* Effect.promise(() => micHelperHealthy());
      if (!healthy) return yield* helperOffline;
      return yield* HttpServerResponse.json(
        {
          error: String(
            heard.failure.cause instanceof Error ? heard.failure.cause.message : heard.failure,
          ),
        },
        { status: 502, headers: NO_STORE },
      );
    }
    const raw = heard.success;
    if (raw.length === 0) {
      return yield* HttpServerResponse.json(
        { raw, text: "", rewritten: false },
        { headers: NO_STORE },
      );
    }
    const context = yield* loadChatContext(threadId, projectId).pipe(
      Effect.orElseSucceed(() => EMPTY_CONTEXT),
    );
    const result = yield* Effect.promise(() => rewriteTranscript({ transcript: raw, ...context }));
    return yield* HttpServerResponse.json(
      { raw, ...result, project: context.projectName },
      { headers: NO_STORE },
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

export const layer = HttpRouter.add("*", `${MIC_ROUTE_PREFIX}/*`, handler);
