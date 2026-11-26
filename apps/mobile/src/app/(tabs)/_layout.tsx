import { useEffect } from 'react';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useAppData } from '../../data/AppData';
import { GLYPHS, Icon } from '../../ui/kit';
import { useTheme } from '../../ui/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { ready, settings } = useAppData();

  // First launch: connect sources before anything else.
  useEffect(() => {
    if (ready && !settings.onboarded) router.push('/onboarding');
  }, [ready, settings.onboarded]);

  const icon = (d: string) => ({ focused }: { focused: boolean }) =>
    <Icon d={d} size={25} color={focused ? t.accent : t.sec} strokeWidth={focused ? 2.4 : 1.8} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.sec,
        tabBarStyle: { backgroundColor: t.bar, borderTopColor: t.sep },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon(GLYPHS.home) }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: icon(GLYPHS.list) }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon(GLYPHS.chart) }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon(GLYPHS.gear) }} />
    </Tabs>
  );
}
