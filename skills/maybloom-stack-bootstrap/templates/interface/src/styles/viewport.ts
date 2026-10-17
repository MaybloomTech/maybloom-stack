import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

export type Viewport = { width: number; height: number };

const ViewportContext = createContext<Viewport | null>(null);

// The gallery shows a page at a phone's, a tablet's and a laptop's width
// inside one window, and gives the page its frame's size through this
// provider. The app never mounts it.
export const ViewportProvider = ViewportContext.Provider;

// The size a screen lays itself out for. Use this, never
// useWindowDimensions (Biome refuses it outside this file): the window is
// the gallery's, not the page's frame.
export function useViewport(): Viewport {
  const window = useWindowDimensions();
  const frame = useContext(ViewportContext);
  return frame ?? { width: window.width, height: window.height };
}
