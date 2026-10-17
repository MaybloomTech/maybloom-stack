import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../styles/tokens";

/** One state of a component, with the label that says which. */
export type Specimen = { label: string; node: ReactNode };

/**
 * The sizes a design is checked at: a phone, a tablet, a laptop. The
 * toolbar's widths and a page frame's height both come from this list.
 */
export const frames = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 832 },
] as const;
export type Width = (typeof frames)[number]["width"];
export const heightOf = (width: Width) =>
  frames.find((f) => f.width === width)?.height ?? frames[0].height;

/** What every sheet is given: the width the board is checked at. */
export type SheetProps = { width: Width };

/** The space a specimen's box takes on each side: its padding and border. */
export const specimenInset = spacing.sm + 1;

/** The id of a section's anchor: `components/NoteRow`. */
export const anchorId = (tab: string, title: string) => `${tab}/${title}`;

/**
 * A component's name and its specimens. `wide` gives each specimen the
 * board's whole width (a page, a list); otherwise they wrap side by side.
 */
export function SpecimenSection({
  tab,
  title,
  specimens,
  note,
  wide = false,
}: {
  tab: string;
  title: string;
  specimens: Specimen[];
  note?: string;
  wide?: boolean;
}) {
  return (
    <View style={styles.section} nativeID={anchorId(tab, title)}>
      <Text style={[typography.title, { color: colors.text }]}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.grid}>
        {specimens.map((s, i) => (
          // Labels may repeat, so the position keeps each key its own.
          <View
            key={`${i}:${s.label}`}
            style={[styles.specimen, wide ? styles.wide : null]}
          >
            <Text style={styles.label}>{s.label}</Text>
            {s.node}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A tab's page: its sections at the board's width, scrolled both ways, so
 * a frame wider than the window (1280 on a laptop) is reached by
 * scrolling, never clipped. On the web it is one scroller for both axes,
 * so both scrollbars sit at the window's edges; nested ScrollViews would
 * put the horizontal one at the bottom of a long sheet.
 */
export function Sheet({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  const content = <View style={{ width, gap: spacing.xl }}>{children}</View>;
  if (Platform.OS === "web")
    return (
      <View style={styles.scroller}>
        <View style={[styles.sheet, styles.fit]}>{content}</View>
      </View>
    );
  return (
    <ScrollView>
      <ScrollView horizontal contentContainerStyle={styles.sheet}>
        {content}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: spacing.lg, alignItems: "flex-start" },
  scroller: { flex: 1, overflow: "scroll" },
  // As wide as its content, so the padding holds on the right too.
  fit: { alignSelf: "flex-start" },
  section: { gap: spacing.sm },
  note: { ...typography.caption, color: colors.textSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  specimen: {
    gap: spacing.xs,
    minWidth: 260,
    flexGrow: 1,
    flexBasis: 260,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.screen,
  },
  wide: { flexBasis: "100%" },
  label: { ...typography.caption, color: colors.textSecondary },
});
