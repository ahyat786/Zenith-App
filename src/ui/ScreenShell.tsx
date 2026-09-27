import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Theme } from '../theme';
import { spacing } from '../theme';
import { IconButton } from './kit';

export function ScreenShell({
  title,
  subtitle,
  onBack,
  theme,
  children,
  scroll = true,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  theme: Theme;
  children: React.ReactNode;
  scroll?: boolean;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.bg,
        zIndex: 20,
      }}>
      <View
        style={{
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: theme.bar,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
          paddingBottom: 8,
        }}>
        <IconButton name="back" onPress={onBack} theme={theme} size={22} />
        <View style={{ flex: 1, marginLeft: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 12 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={{ marginLeft: 8 }}>{right}</View> : null}
      </View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}
