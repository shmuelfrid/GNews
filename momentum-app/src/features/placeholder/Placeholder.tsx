/* Temporary screen body for routes whose feature builder hasn't landed yet. */
import { router } from 'expo-router';
import { Button, Card, EmptyState, ModalSheetScreen, PageHeader, Screen, type IconName } from '@/components';

export function PlaceholderScreen({ title, over, icon = 'sparkle', tabs, safeTop = true }: { title: string; over?: string; icon?: IconName; tabs?: boolean; safeTop?: boolean }) {
  return (
    <Screen tabs={tabs} safeTop={safeTop}>
      <PageHeader over={over} title={title} />
      <Card><EmptyState icon={icon} title={`${title} is on its way`} body="This screen is being built. Everything you log is saved and will show up here." /></Card>
    </Screen>
  );
}
export function PlaceholderSheet({ title, icon = 'sparkle' }: { title: string; icon?: IconName }) {
  return (
    <ModalSheetScreen title={title} footer={<Button label="Close" variant="secondary" block onPress={() => router.back()} />}>
      <EmptyState icon={icon} title={`${title} is on its way`} body="This sheet is being built." compact />
    </ModalSheetScreen>
  );
}
