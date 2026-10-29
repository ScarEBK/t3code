import { createContext } from "react";

export type SplitPaneRole = "primary" | "secondary" | null;

// Its own module so the composer's mic button can read the role without importing the split
// layout, which imports ChatView, which imports the composer.
export const SplitPaneRoleContext = createContext<SplitPaneRole>(null);
