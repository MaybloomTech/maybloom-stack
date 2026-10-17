import { StyleSheet, Text, View } from "react-native";
import * as icons from "../icons";
import { colors, spacing, typography } from "../styles/tokens";
import { type SheetProps, Sheet, SpecimenSection } from "./layout";

// Keyed by every export of src/icons, so a new icon fails the typecheck
// until it says here what it stands for.
const meaning: Record<keyof typeof icons, string> = {
  ArchiveIcon: "Archive: take an item out of the default list.",
  PlusIcon: "Add: create a new item.",
};

export function IconSheet({ width }: SheetProps) {
  return (
    <Sheet width={width}>
      <Text>The icons, from src/icons, at 16, 24 and 32.</Text>
      {(Object.keys(meaning) as (keyof typeof icons)[]).map((name) => {
        const Icon = icons[name];
        return (
          <SpecimenSection
            key={name}
            tab="icons"
            title={name}
            note={meaning[name]}
            specimens={[
              {
                label: "sizes, then primary",
                node: (
                  <View style={styles.row}>
                    <Icon size={16} />
                    <Icon size={24} />
                    <Icon size={32} />
                    <Icon size={24} color={colors.primary} />
                  </View>
                ),
              },
            ]}
          />
        );
      })}
      <Text style={[typography.caption, { color: colors.textSecondary }]}>
        {Object.keys(meaning).length} icons
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
