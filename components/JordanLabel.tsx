import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Fonts, FontSizes, LineHeights, Spacing } from '../constants/design';

type JordanLabelProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function JordanLabel({ children, style }: JordanLabelProps) {
  return (
    <View style={style}>
      <Text style={[styles.label, children != null && styles.labelWithBody]}>
        JORDAN
      </Text>
      {children != null ? (
        typeof children === 'string' ? (
          <Text style={styles.body}>{children}</Text>
        ) : (
          children
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontFamily: Fonts.displaySemi,
    color: Colors.ember,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  labelWithBody: {
    marginBottom: Spacing.xs,
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: LineHeights.body,
  },
});
