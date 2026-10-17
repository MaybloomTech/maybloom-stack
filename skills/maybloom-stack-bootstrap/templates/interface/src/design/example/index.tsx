import { Card } from "../../components/primitives";
import { sampleBody } from "../samples";
import type { DesignPass } from "../types";
import { FlatCard } from "./FlatCard";

/**
 * The shape of a pass, kept as the template for real ones: copy the
 * folder, rename it, add it to passes.ts.
 */
export const examplePass: DesignPass = {
  name: "Example",
  notes:
    "A template, not a proposal: one variant beside the component it would replace.",
  comparisons: [
    {
      label: "Card",
      current: <Card>{sampleBody}</Card>,
      variant: <FlatCard>{sampleBody}</FlatCard>,
    },
  ],
};
