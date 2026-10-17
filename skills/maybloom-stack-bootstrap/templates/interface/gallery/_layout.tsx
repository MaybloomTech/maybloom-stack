import { Slot } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/**
 * The gallery's root: a router root of its own, used only when
 * EXPO_PUBLIC_GALLERY=1 (see app.config.js). No backend and no query
 * cache of its own: each specimen brings a fake one (src/gallery/fake.tsx).
 */
export default function GalleryLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  );
}
