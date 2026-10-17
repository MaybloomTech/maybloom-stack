import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../styles/tokens';
import { Sheet, type SheetProps, SpecimenSection } from './layout';

// Read from src/styles/tokens.ts as it is: a new token shows here with no
// entry to write.
export function TokenSheet({ width }: SheetProps) {
  return (
    <Sheet width={width}>
      <SpecimenSection
        tab="tokens"
        title="Colors"
        specimens={Object.entries(colors).map(([name, value]) => ({
          label: `${name} ${value}`,
          node: <View style={[styles.swatch, { backgroundColor: value }]} />,
        }))}
      />
      <SpecimenSection
        tab="tokens"
        title="Spacing"
        specimens={Object.entries(spacing).map(([name, value]) => ({
          label: `${name} ${value}`,
          node: <View style={[styles.bar, { width: value * 4 }]} />,
        }))}
      />
      <SpecimenSection
        tab="tokens"
        title="Radii"
        specimens={Object.entries(radii).map(([name, value]) => ({
          label: `${name} ${value}`,
          node: <View style={[styles.box, { borderRadius: value }]} />,
        }))}
      />
      <SpecimenSection
        tab="tokens"
        title="Typography"
        wide
        specimens={Object.entries(typography).map(([name, style]) => ({
          label: `${name} ${style.fontSize}/${style.lineHeight} ${style.fontWeight}`,
          node: (
            <Text style={[style, { color: colors.text }]}>
              The quick brown fox jumps over the lazy dog
            </Text>
          ),
        }))}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  swatch: {
    height: 48,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bar: { height: 12, backgroundColor: colors.primary },
  box: {
    width: 64,
    height: 48,
    borderWidth: 2,
    borderColor: colors.primary,
  },
});
