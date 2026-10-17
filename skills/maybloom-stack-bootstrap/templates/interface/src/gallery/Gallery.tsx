import { type ComponentType, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../styles/tokens";
import { ComponentSheet } from "./ComponentSheet";
import { DesignSheet } from "./DesignSheet";
import { IconSheet } from "./IconSheet";
import { ViewportProvider } from "../styles/viewport";
import {
  anchorId,
  frames,
  heightOf,
  type SheetProps,
  type Width,
} from "./layout";
import { PageSheet } from "./PageSheet";
import { PrimitiveSheet } from "./PrimitiveSheet";
import sentinel from "./sentinel.json";
import { TokenSheet } from "./TokenSheet";

// The gallery's sentinel is the testID on its page, read from
// sentinel.json by the scripts too: check:no-gallery fails an app export
// that carries it, gallery-export.mjs refuses an export that does not.

const widths: Width[] = frames.map((f) => f.width);

/** The tabs: the three tiers, then what they are made of, then the passes. */
const tabs = {
  primitives: { label: "Primitives", Sheet: PrimitiveSheet },
  components: { label: "Components", Sheet: ComponentSheet },
  pages: { label: "Pages", Sheet: PageSheet },
  icons: { label: "Icons", Sheet: IconSheet },
  tokens: { label: "Tokens", Sheet: TokenSheet },
  design: { label: "Design passes", Sheet: DesignSheet },
} satisfies Record<string, { label: string; Sheet: ComponentType<SheetProps> }>;
type Tab = keyof typeof tabs;

type BoardView = { tab: Tab; entry: string | null; width: Width };

const fallback: BoardView = { tab: "primitives", entry: null, width: 390 };

/**
 * The view lives in the URL's hash so a link opens it: the tab, an entry
 * on it, and the width (`#components/NoteRow@768`, `#icons@390`).
 */
function readHash(): BoardView {
  if (Platform.OS !== "web" || typeof window === "undefined") return fallback;
  let raw = window.location.hash.slice(1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  const [where, width] = raw.split("@");
  const [tab, ...entry] = (where ?? "").split("/");
  const known = Object.hasOwn(tabs, tab ?? "");
  return {
    tab: known ? (tab as Tab) : fallback.tab,
    entry: known && entry.length > 0 ? entry.join("/") : null,
    width: widths.find((w) => String(w) === width) ?? fallback.width,
  };
}

function hashOf(view: BoardView): string {
  const where = view.entry ? anchorId(view.tab, view.entry) : view.tab;
  return `#${encodeURI(where)}@${view.width}`;
}

export function Gallery() {
  const [view, setView] = useState<BoardView>(readHash);

  // The hash follows the view.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    window.history.replaceState(null, "", hashOf(view));
  }, [view]);

  // A link's entry is scrolled to once the sheet has rendered, when the
  // entry changes; a change of width leaves the scroll where the viewer
  // put it.
  const { tab, entry } = view;
  useEffect(() => {
    if (Platform.OS !== "web" || !entry) return;
    const id = anchorId(tab, entry);
    const timer = setTimeout(
      () => document.getElementById(id)?.scrollIntoView(),
      100,
    );
    return () => clearTimeout(timer);
  }, [tab, entry]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onHash = () => setView(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const { Sheet } = tabs[view.tab];
  return (
    <View style={styles.board} testID={sentinel.testID}>
      <View style={styles.toolbar}>
        <View style={styles.group}>
          {(Object.keys(tabs) as Tab[]).map((tab) => (
            <Choice
              key={tab}
              label={tabs[tab].label}
              selected={view.tab === tab}
              onPress={() => setView({ ...view, tab, entry: null })}
            />
          ))}
        </View>
        <View style={styles.group}>
          {widths.map((width) => (
            <Choice
              key={width}
              label={String(width)}
              selected={view.width === width}
              onPress={() => setView({ ...view, width })}
            />
          ))}
        </View>
      </View>
      {/* Every sheet lays out for the board's width, not the window's: a
          component that branches on useViewport() shows its 390 layout in
          the 390 column. A page's PageFrame provides its own frame. */}
      <ViewportProvider
        value={{ width: view.width, height: heightOf(view.width) }}
      >
        <Sheet key={view.tab} width={view.width} />
      </ViewportProvider>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected ? styles.selected : null]}
    >
      <Text
        style={[
          typography.caption,
          { color: selected ? colors.primary : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  board: { flex: 1, backgroundColor: colors.surface },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  group: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  selected: { backgroundColor: colors.primarySubtle },
});
