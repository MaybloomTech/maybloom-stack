// The gallery (the design board) is a second Expo Router root, `gallery/`,
// used only when EXPO_PUBLIC_GALLERY=1 (`pnpm gallery`, `pnpm
// build:gallery`). Every other run and build keeps `app/` as the root, so
// the app's bundle never carries the gallery's files, nor `src/design/`
// that only the gallery imports. app.json stays the config; this only
// switches the root.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_GALLERY !== '1') return config;
  return {
    ...config,
    extra: {
      ...config.extra,
      router: { ...config.extra?.router, root: 'gallery' },
    },
  };
};
