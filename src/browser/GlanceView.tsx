/**
 * GlanceView — pratinjau situs di atas tab saat ini (Zen Glance).
 * Dipicu dari menu tekan-lama tautan → "Pratinjau cepat (Glance)".
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';
import { radius, spacing } from '../theme';
import { hostOfUrl, useStore } from '../state/store';
import { WebView as WebViewComponent } from 'react-native-webview';

const Wv: any = WebViewComponent;
import { BRIDGE_SCRIPT } from '../core/inject';
import { Icon } from '../ui/Icon';

export function GlanceView({ theme }: { theme: Theme }) {
  const { state, dispatch, activeTab, openNewTab } = useStore();
  const url = state.ui.glanceUrl;
  if (!url) {
    return null;
  }

  const close = () => dispatch({ type: 'SET_UI', patch: { glanceUrl: null } });

  const expand = () => {
    openNewTab(url);
    close();
  };

  const split = () => {
    const id = openNewTab(url, { activate: false });
    if (activeTab) {
      dispatch({ type: 'SET_SPLIT', ids: [activeTab.id, id] });
      dispatch({ type: 'SET_ACTIVE_TAB', id: activeTab.id });
    }
    close();
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.overlay,
        zIndex: 40,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      <View
        style={{
          width: '100%',
          height: '78%',
          backgroundColor: theme.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        }}>
        {/* header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.md,
            paddingVertical: 8,
            backgroundColor: theme.bar,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.border,
            gap: 4,
          }}>
          <Icon name="eye" size={16} color={theme.accent} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: theme.text, fontSize: 13.5, fontWeight: '700', marginLeft: 4 }}>
            {hostOfUrl(url) || url}
          </Text>
          <Pressable
            onPress={split}
            hitSlop={6}
            style={({ pressed }) => ({
              padding: 6,
              borderRadius: 8,
              backgroundColor: pressed ? theme.surface2 : 'transparent',
            })}>
            <Icon name="split" size={16} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={expand}
            hitSlop={6}
            style={({ pressed }) => ({
              padding: 6,
              borderRadius: 8,
              backgroundColor: pressed ? theme.surface2 : 'transparent',
            })}>
            <Icon name="expand" size={16} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={close}
            hitSlop={6}
            style={({ pressed }) => ({
              padding: 6,
              borderRadius: 8,
              backgroundColor: pressed ? theme.surface2 : 'transparent',
            })}>
            <Icon name="close" size={16} color={theme.text} />
          </Pressable>
        </View>

        <Wv
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: theme.bg }}
          originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={BRIDGE_SCRIPT}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
        />

        <Text
          style={{
            textAlign: 'center',
            color: theme.subtext,
            fontSize: 11.5,
            paddingVertical: 6,
            backgroundColor: theme.bar,
          }}>
          Pratinjau cepat (Glance) — tidak menambah riwayat
        </Text>
      </View>
    </View>
  );
}
