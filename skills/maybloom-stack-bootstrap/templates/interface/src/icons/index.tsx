import Svg, { Path } from 'react-native-svg';
import { colors } from '../styles/tokens';

// The app's icons, drawn on a 24-unit grid with a 2-unit stroke. The
// gallery's Icons tab is keyed by these exports, so a new one fails the
// typecheck until it has an entry there.

type IconProps = { size?: number; color?: string };

export function PlusIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ArchiveIcon({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
