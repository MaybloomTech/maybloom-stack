import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClientProvider } from '../data/api/client';
import { colors } from '../styles/tokens';
import { ViewportProvider } from '../styles/viewport';
import { type FakeOptions, fakeClient } from './fixtures/backend';
import { heightOf, type Width } from './layout';

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
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <ClientProvider value={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ClientProvider>
  );
}

/**
 * A step of a Play:
 * - a string: press the enabled control with that text or accessibility
 *   label;
 * - `{ fill, text }`: type into the field with that accessibility label (a
 *   TextField's placeholder unless it is given one), and see it hold;
 * - `{ expect }`: wait for that text to show inside the specimen. End a
 *   Play with one, so a press that did nothing is reported instead of
 *   leaving the specimen in its idle state.
 */
export type PlayStep =
  | string
  | { fill: string; text: string }
  | { expect: string };

const describe = (step: PlayStep) =>
  typeof step === 'string'
    ? `press "${step}"`
    : 'fill' in step
      ? `fill "${step.fill}"`
      : `expect "${step.expect}"`;

/**
 * Runs `steps` in order inside the specimen once their targets appear: a
 * state a component reaches only by input (a failed save) is shown by
 * typing and tapping, never by a prop of the gallery's. A step that does
 * not come true within three seconds is shown in red. Web only, like the
 * gallery.
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
    if (Platform.OS !== 'web' || !root?.querySelectorAll) return;
    let cancelled = false;
    // A replay starts clean: a failure from an earlier run is not this one's.
    setMissing(null);
    (async () => {
      for (const step of JSON.parse(script) as PlayStep[]) {
        // Checked after every wait, before acting: a run the effect has
        // cleaned up (StrictMode's double effect, new steps) must not press
        // or type, or the specimen submits twice.
        let done: unknown = null;
        if (typeof step === 'string') {
          const target = await waitFor(() => findControl(root, step));
          if (cancelled) return;
          target?.click();
          done = target;
        } else if ('fill' in step) {
          const field = (await waitFor(() =>
            findField(root, step.fill),
          )) as HTMLInputElement | null;
          if (cancelled) return;
          if (field) fill(field, step.text);
          done =
            field &&
            (await waitFor(() => (field.value === step.text ? field : null)));
        } else {
          done = await waitFor(() =>
            root.textContent?.includes(step.expect) ? root : null,
          );
        }
        if (cancelled) return;
        if (!done) {
          setMissing(describe(step));
          return;
        }
        // Let the input land before the next step.
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [script]);
  return (
    <View ref={ref} style={missing ? styles.missing : undefined}>
      {missing ? (
        <Text style={styles.missingText}>Play step failed: {missing}</Text>
      ) : null}
      {children}
    </View>
  );
}

function findField(root: HTMLElement, label: string): HTMLElement | null {
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>('input, textarea'),
  )) {
    if (el.getAttribute('aria-label') === label) return el;
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
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function findControl(root: HTMLElement, label: string): HTMLElement | null {
  const controls = root.querySelectorAll<HTMLElement>(
    // A Pressable without a role renders as a focusable div.
    '[role="button"], [role="checkbox"], [role="switch"], [role="tab"], [tabindex="0"], button, a',
  );
  for (const el of Array.from(controls)) {
    // A disabled control is not the target yet: wait for it to enable.
    if (
      el.getAttribute('aria-disabled') === 'true' ||
      el.hasAttribute('disabled')
    )
      continue;
    if (
      el.getAttribute('aria-label') === label ||
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

/**
 * A whole page as the app shows it: its own backend, at the board's width
 * and a screen's height, with the frame's size as the size the page lays
 * itself out for (useViewport).
 */
export function PageFrame({
  width,
  children,
  ...options
}: FakeOptions & { width: Width; children: ReactNode }) {
  const height = heightOf(width);
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
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  missing: { borderWidth: 2, borderColor: colors.danger },
  missingText: { color: colors.danger, padding: 4 },
});
