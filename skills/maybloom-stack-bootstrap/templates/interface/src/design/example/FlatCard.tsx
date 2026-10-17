import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../../styles/tokens';

/**
 * Card as a flat tinted panel: no border, the subtle primary fill, the
 * small radius. The example pass's one variant, there to show how a pass
 * is laid out.
 */
export function FlatCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySubtle,
    borderRadius: radii.sm,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
