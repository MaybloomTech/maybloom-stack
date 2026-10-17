import type { ReactNode } from "react";

/** One component as it is and as a pass proposes it, side by side. */
export type Comparison = {
  label: string;
  current: ReactNode;
  variant: ReactNode;
};

/**
 * A design pass: variants of components under src/design/<pass>/, shown in
 * the gallery next to the components they would replace. Only the gallery
 * imports src/design (check:no-gallery keeps it out of the app's web
 * bundle; Biome flags the alias imports); a variant that is taken
 * moves into the component itself and leaves here.
 */
export type DesignPass = {
  name: string;
  /** What the pass is trying, in a sentence or two. */
  notes: string;
  comparisons: Comparison[];
};
