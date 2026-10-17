import { Text } from "react-native";
import { passes } from "../design/passes";
import { type SheetProps, Sheet, SpecimenSection } from "./layout";

/** The design passes, each comparison as current beside variant. */
export function DesignSheet({ width }: SheetProps) {
  return (
    <Sheet width={width}>
      <Text>Variants under src/design, beside the components they would replace.</Text>
      {passes.map((pass) =>
        pass.comparisons.map((c) => (
          <SpecimenSection
            key={`${pass.name}/${c.label}`}
            tab="design"
            title={`${pass.name}: ${c.label}`}
            note={pass.notes}
            specimens={[
              { label: "current", node: c.current },
              { label: "variant", node: c.variant },
            ]}
          />
        )),
      )}
    </Sheet>
  );
}
