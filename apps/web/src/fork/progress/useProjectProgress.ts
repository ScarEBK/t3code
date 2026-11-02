import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, type ProjectReadFileResult, WS_METHODS } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { connectionAtomRuntime } from "~/connection/runtime";
import { useFilesystemReadAccess } from "~/state/filesystem";
import { PROGRESS_FILE_NAME, parseProgressFile, type ProgressDocument } from "./progressFile";

// Its own family so the panel can poll: agents tick tasks in the file while a turn runs, and the
// panel should follow without a reload. Polling stops when no panel is mounted.
const progressFileQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "fork:progress-file",
  tag: WS_METHODS.projectsReadFile,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
  refreshIntervalMs: 15_000,
});

const IDLE_QUERY = Atom.make(AsyncResult.initial<ProjectReadFileResult, never>(false)).pipe(
  Atom.withLabel("fork:progress-file:idle"),
);

export type ProjectProgressState =
  | { readonly kind: "loading" }
  | { readonly kind: "missing" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly document: ProgressDocument };

export function useProjectProgress(project: {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
}): { readonly state: ProjectProgressState; readonly refresh: () => void } {
  const { canReadFiles, isPending } = useFilesystemReadAccess(project.environmentId);
  const atom = canReadFiles
    ? progressFileQuery({
        environmentId: project.environmentId,
        input: { cwd: project.workspaceRoot, relativePath: PROGRESS_FILE_NAME, allowMissing: true },
      })
    : IDLE_QUERY;
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const data = AsyncResult.getOrElse(result, () => null);
  const contents = data && data.exists !== false ? data.contents : null;
  const document = contents === null ? null : parseProgressFile(contents);

  let state: ProjectProgressState;
  if (document) state = { kind: "ready", document };
  else if (data?.exists === false) state = { kind: "missing" };
  else if (isPending || result.waiting || AsyncResult.isInitial(result))
    state = { kind: "loading" };
  else
    state = canReadFiles && AsyncResult.isFailure(result) ? { kind: "error" } : { kind: "missing" };
  return { state, refresh };
}
