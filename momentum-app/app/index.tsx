import { Redirect } from 'expo-router';
import { store, useProfile } from '@/lib/store';

export default function Index() {
  const p = useProfile();
  return <Redirect href={store.profileComplete(p) ? '/today' : '/onboarding'} />;
}
