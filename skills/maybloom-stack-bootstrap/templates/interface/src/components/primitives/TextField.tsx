import { StyleSheet, TextInput } from 'react-native';
import { colors, radii, spacing, typography } from '../../styles/tokens';

export function TextField({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <TextInput
      style={[styles.input, multiline ? styles.multiline : null]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      multiline={multiline}
      accessibilityLabel={accessibilityLabel ?? placeholder}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
});
