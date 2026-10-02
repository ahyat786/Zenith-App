/**
 * ScreenShell — kerangka layar dengan top app bar Material 3.
 *
 * Rujukan resmi:
 *  · Top app bar (64dp, judul titleLarge, tombol 48dp):
 *    https://developer.android.com/design/ui/mobile/guides/components/material-overview
 *  · Tata letak adaptif — konten dibatasi 720–840dp dan dipusatkan di layar lebar
 *    (tablet/foldable), bukan direntangkan tanpa batas:
 *    https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics
 */

import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, type, type Theme } from '../theme';
import { useAdaptiveLayout } from '../design/adaptive';
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
  const adaptive = useAdaptiveLayout();
  const centered = (
    <View
      style={{
        width: '100%',
        maxWidth: adaptive.contentMaxWidth,
        alignSelf: 'center',
        flexGrow: 1,
      }}>
      {children}
    </View>
  );
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
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.sm,
          paddingBottom: 6,
          minHeight: 64,
        }}>
        <IconButton name="back" onPress={onBack} theme={theme} size={24} label="Kembali" />
        <View style={{ flex: 1, marginLeft: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.text, ...type.titleLarge }}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={{ color: theme.subtext, ...type.bodySmall }}>
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
          {centered}
        </ScrollView>
      ) : (
        centered
      )}
    </View>
  );
}
