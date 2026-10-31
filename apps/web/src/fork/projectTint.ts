import type { ProjectIconColor, ProjectIconOverride } from "@t3tools/contracts";
import type { CSSProperties } from "react";
import type { ProjectFaviconProject } from "~/components/ProjectFavicon";
import { deriveProjectIdentity } from "~/projectIdentity";

type TintProject = Pick<ProjectFaviconProject, "title" | "projectIcon">;

// The tint is the project icon's color, so it syncs across machines and agents can set it through
// the project tools, with no new field for upstream merges to collide with. A logo file outranks
// the icon when drawing, so a project can keep both. Gray means no tint.
export function resolveProjectTint(project: TintProject): ProjectIconColor {
  const icon = project.projectIcon;
  return icon && icon.kind !== "emoji" ? icon.color : deriveProjectIdentity(project.title).color;
}

// Picking a tint on a project with no chosen icon stores its automatic letters just to hold the
// color. Those letters must not hide a logo found in the project's folder.
export function isTintOnlyProjectIcon(project: TintProject): boolean {
  const icon = project.projectIcon;
  return icon?.kind === "monogram" && icon.text === deriveProjectIdentity(project.title).monogram;
}

export function projectTintProps(project: TintProject | null | undefined) {
  const color = project ? resolveProjectTint(project) : "gray";
  if (color === "gray") return {};
  return {
    "data-project-tint": "",
    style: { "--project-tint": `var(--color-${color}-500)` } as CSSProperties,
  };
}

export function withProjectTint(
  project: TintProject,
  color: ProjectIconColor,
): ProjectIconOverride {
  const icon = project.projectIcon;
  if (icon && icon.kind !== "emoji") return { ...icon, color };
  return { kind: "monogram", text: deriveProjectIdentity(project.title).monogram, color };
}
