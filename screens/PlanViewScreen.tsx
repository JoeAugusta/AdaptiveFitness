import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PlanView'>;

export default function PlanViewScreen() {
  const navigation = useNavigation<NavProp>();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plan View</Text>
      <Text style={styles.subtitle}>Coming soon — S11</Text>
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Dashboard')}
      >
        <Text style={styles.buttonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: TEXT_PRIMARY },
  subtitle: { fontSize: 15, color: TEXT_SECONDARY, marginBottom: 8 },
  button: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY },
});
