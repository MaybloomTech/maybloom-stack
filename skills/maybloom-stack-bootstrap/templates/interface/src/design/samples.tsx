import { Text } from "react-native";
import { colors, typography } from "../styles/tokens";

/**
 * A line of body text to fill cards and rows with, in the passes and on
 * every gallery sheet. It lives here so the import goes one way: the gallery
 * imports src/design, never the reverse.
 */
export const sampleBody = (
  <Text style={[typography.body, { color: colors.textSecondary }]}>
    Ask about Thursday morning, and whether the part is in stock.
  </Text>
);
