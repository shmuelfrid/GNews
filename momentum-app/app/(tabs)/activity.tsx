import { ActivityScreen } from '@/features/activity/ActivityScreen';
import { startHealthAutoSync } from '@/features/activity/healthSync';

// Health Connect auto-sync on launch + app foreground (Android build only; no-op elsewhere).
startHealthAutoSync();

export default function ActivityTab() {
  return <ActivityScreen />;
}
