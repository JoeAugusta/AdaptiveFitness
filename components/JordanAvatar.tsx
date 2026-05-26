import Svg, { Circle, Polygon, Rect, Text as SvgText } from 'react-native-svg';

export function JordanAvatar({ size = 48 }: { size?: number }) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const hex = [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const angle = (Math.PI / 180) * (60 * i + 30);
      const hr = r * 0.72;
      return `${cx + hr * Math.cos(angle)},${cy + hr * Math.sin(angle)}`;
    })
    .join(' ');
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={cx}
        cy={cy}
        r={r - 1.5}
        fill="#09090B"
        stroke="#F97316"
        strokeWidth={size > 60 ? 2.5 : size > 40 ? 2 : 1.5}
      />
      <Polygon
        points={hex}
        fill="none"
        stroke="#F97316"
        strokeWidth={size > 60 ? 1.2 : 0.8}
        opacity={0.35}
      />
      <SvgText
        x={cx}
        y={cy + size * 0.18}
        fontSize={size * 0.5}
        fontWeight="700"
        fill="#F97316"
        textAnchor="middle"
      >
        J
      </SvgText>
      <Rect
        x={cx - size * 0.14}
        y={cy + size * 0.22}
        width={size * 0.28}
        height={size > 60 ? 3 : 2}
        rx={size > 60 ? 1.5 : 1}
        fill="#F97316"
        opacity={0.7}
      />
    </Svg>
  );
}
