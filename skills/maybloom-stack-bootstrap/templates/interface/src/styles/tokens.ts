// The design tokens: every color, space, radius and type style the
// components use comes from here, so a change shows on the gallery's
// Tokens tab and on every component at once.

export const colors = {
  text: '#1c1f1d',
  textSecondary: '#5b625e',
  textOnPrimary: '#ffffff',
  screen: '#f7f7f5',
  surface: '#ffffff',
  border: '#d9dcd9',
  borderSubtle: '#eceeec',
  primary: '#2f6f5e',
  primarySubtle: '#e3efeb',
  danger: '#b3261e',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
} as const;

export const typography = {
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;
