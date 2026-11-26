import '../background'; // defines the background task at module scope
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDataProvider, useAppData } from '../data/AppData';
import { useTheme } from '../ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppDataProvider>
        <RootStack />
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const t = useTheme();
  const sheet = {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetAllowedDetents: [1],
    sheetCornerRadius: 14,
    contentStyle: { backgroundColor: t.sheet },
  };
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={sheet} />
        <Stack.Screen name="tx/[key]" options={sheet} />
        <Stack.Screen name="review" options={sheet} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
      <Toast />
      <StatusBar style="auto" />
    </>
  );
}

function Toast() {
  const { toast } = useAppData();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{
        paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#111114',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{toast}</Text>
      </View>
    </View>
  );
}
