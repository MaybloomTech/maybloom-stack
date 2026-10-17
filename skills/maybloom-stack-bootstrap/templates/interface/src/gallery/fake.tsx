import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClientProvider } from "../data/api/client";
import { colors } from "../styles/tokens";
import { ViewportProvider } from "../styles/viewport";
import { type FakeOptions, fakeClient } from "./fixtures/backend";

/**
 * A subtree on its own fake backend and its own query cache: every
 * specimen gets one, so what it changes, or the state it is held in, stays
 * its own. No retries, so the `error` scenario shows its error at once.
 */
export function Fake({
  children,
  ...options
}: FakeOptions & { children: ReactNode }) {
  const [client] = useState(() => fakeClient(options));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <ClientProvider value={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ClientProvider>
  );
}

/**
 * A step of a Play: a control to press, by its text or accessibility
 * label, or a field to type into, by its accessibility label (a
 * TextField's placeholder unless it is given one).
 */
export type PlayStep = string | { fill: string; text: string };

/**
 * Runs `steps` in order inside the specimen once their targets appear: a
 * state a component reaches only by input (a failed save) is shown by
 * typing and tapping, never by a prop of the gallery's. A step whose
 * target never appears is shown in red. Web only, like the gallery.
 */
export function Play({
  steps,
  children,
}: {
  steps: PlayStep[];
  children: ReactNode;
}) {
  const ref = useRef<View>(null);
  const [missing, setMissing] = useState<string | null>(null);
  // By value: a sheet that rebuilds its specimens must not replay them.
  const script = JSON.stringify(steps);
  useEffect(() => {
    const root = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !root?.querySelectorAll) return;
    let cancelled = false;
    (async () => {
      for (const step of JSON.parse(script) as PlayStep[]) {
        const label = typeof step === "string" ? step : step.fill;
        const target = await waitFor(() =>
          typeof step === "string"
            ? findControl(root, step)
            : findField(root, step.fill),
        );
        if (cancelled) return;
        if (!target) {
          setMissing(label);
          return;
        }
        if (typeof step === "string") target.click();
        else fill(target as HTMLInputElement, step.text);
        // Let the input land before looking for the next target.
        await new Promise((r) => setTimeout(r, 50));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [script]);
  return (
    <View ref={ref} style={missing ? styles.missing : undefined}>
      {missing ? (
        <Text style={styles.missingText}>Play step not found: {missing}</Text>
      ) : null}
      {children}
    </View>
  );
}

function findField(root: HTMLElement, label: string): HTMLElement | null {
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>("input, textarea"),
  )) {
    if (el.getAttribute("aria-label") === label) return el;
  }
  return null;
}

/**
 * Types into a field the way React hears it: through the element's own
 * value setter (React's tracker ignores a plain assignment), then an input
 * event.
 */
function fill(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = Object.getPrototypeOf(el) as object;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function findControl(root: HTMLElement, label: string): HTMLElement | null {
  const controls = root.querySelectorAll<HTMLElement>(
    // A Pressable without a role renders as a focusable div.
    '[role="button"], [role="checkbox"], [role="switch"], [role="tab"], [tabindex="0"], button, a',
  );
  for (const el of Array.from(controls)) {
    if (
      el.getAttribute("aria-label") === label ||
      el.textContent?.trim() === label
    )
      return el;
  }
  return null;
}

async function waitFor<T>(
  find: () => T | null,
  timeout = 3000,
): Promise<T | null> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const found = find();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

/** The heights a page is shown at, with each width: a phone, a tablet, a laptop. */
const pageHeights: Record<number, number> = { 390: 844, 768: 1024, 1280: 832 };

/**
 * A whole page as the app shows it: its own backend, at the board's width
 * and a screen's height, with the frame's size as the size the page lays
 * itself out for (useViewport).
 */
export function PageFrame({
  width,
  children,
  ...options
}: FakeOptions & { width: number; children: ReactNode }) {
  const height = pageHeights[width] ?? 832;
  return (
    <Fake {...options}>
      <ViewportProvider value={{ width, height }}>
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width, height },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
          }}
        >
          <View style={[styles.page, { width, height }]}>{children}</View>
        </SafeAreaProvider>
      </ViewportProvider>
    </Fake>
  );
}

const styles = StyleSheet.create({
  page: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  missing: { borderWidth: 2, borderColor: colors.danger },
  missingText: { color: colors.danger, padding: 4 },
});
