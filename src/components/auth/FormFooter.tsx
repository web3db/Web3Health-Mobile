import Button from '@/src/components/ui/Button';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Text, View } from 'react-native';

type Props = {
  submitText: string;
  onSubmit: () => void;
  disabled?: boolean;
  hint?: string;
};

export default function FormFooter({ submitText, onSubmit, disabled, hint }: Props) {
  const c = useThemeColors();
  return (
    <View style={{ gap: 8 }}>
      {hint ? <Text style={{ color: c.text.muted }}>{hint}</Text> : null}
      <Button title={submitText} onPress={onSubmit} disabled={!!disabled} />
    </View>
  );
}
