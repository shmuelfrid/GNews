/* Workaround: the kit's <Field> uses flex:1, which collapses/overflows in an auto-height column (seen on web).
   Wrapping a field in a row makes flex:1 act horizontally, so its height follows its content. */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

export function FormRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'flex-start' }, style]}>{children}</View>;
}
