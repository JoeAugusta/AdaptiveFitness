import { Image, View } from 'react-native';
import { Colors } from '../constants/design';

const RING_WIDTH = 2;
const RING_PADDING = 3;

type JordanAvatarProps = {
  size?: number;
  ringed?: boolean;
};

export function JordanAvatar({ size = 22, ringed = false }: JordanAvatarProps) {
  const image = (
    <Image
      source={require('../assets/jordan_avatar_256.png')}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
      }}
    />
  );

  if (!ringed) {
    return image;
  }

  const outerSize = size + RING_PADDING * 2 + RING_WIDTH * 2;

  return (
    <View
      style={{
        borderWidth: RING_WIDTH,
        borderColor: Colors.ember,
        borderRadius: outerSize / 2,
        padding: RING_PADDING,
      }}
    >
      {image}
    </View>
  );
}
