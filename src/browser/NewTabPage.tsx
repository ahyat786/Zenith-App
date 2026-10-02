/**
 * Laman tab baru — Material 3.
 *
 * Rujukan resmi:
 *  · Tata letak adaptif (kisi pintasan 4/6/8 kolom sesuai kelas ukuran jendela)
 *    https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics
 *  · Bidang pencarian Material 3 (SearchBar 56dp, radius penuh)
 *  · Target sentuh ≥ 48dp + label aksesibilitas untuk TalkBack
 */

import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type DimensionValue } from 'react-native';
import { getAppState, hostOfUrl, useStore } from '../state/store';
import { elevation, radius, sizes, spacing, type as typeScale, type Theme } from '../theme';
import type { Tab } from '../types';
import { Icon } from '../ui/Icon';
import { privateProfileSupported } from '../core/native';
import { useAdaptiveLayout } from '../design/adaptive';
import { isNewTabUrl } from './newtab';
import { beginTabNavigation, commitNavigation, otherTabUrls } from './navIntent';

const DEFAULTS = [
  { label: 'Google', url: 'https://www.google.com' },
  { label: 'YouTube', url: 'https://m.youtube.com' },
  { label: 'Wikipedia', url: 'https://id.wikipedia.org' },
  { label: 'GitHub', url: 'https://github.com' },
];

export function NewTabPage({ theme, tab }: { theme: Theme; tab?: Tab | null }) {
  const { state, dispatch, openNewTab } = useStore();
  const adaptive = useAdaptiveLayout();
  const hour = new Date().getHours();
  const greeting =
    hour < 4 ? 'Selamat malam' : hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  const privateTab = !!tab?.incognito;
  const [isolated, setIsolated] = useState<boolean | null>(null);
  useEffect(() => {
    if (!privateTab) {
      return;
    }
    privateProfileSupported().then(setIsolated).catch(() => setIsolated(false));
  }, [privateTab]);

  const go = (url: string) => {
    const latest = getAppState();
    if (tab && isNewTabUrl(tab.url)) {
      beginTabNavigation(dispatch, tab, url, otherTabUrls(latest.tabs, tab.id, url), latest.activeTabId);
      return;
    }
    const id = openNewTab(url, { incognito: privateTab });
    commitNavigation(id, url, null, otherTabUrls(latest.tabs, id, url));
  };

  const openSearch = () =>
    dispatch({
      type: 'SET_OMNIBOX',
      patch: {
        open: true,
        mode: tab ? 'edit' : 'new',
        initial: '',
        incognito: privateTab,
      },
    });

  const bookmarks = privateTab ? [] : state.bookmarks.slice(0, 8);
  const used = new Set(bookmarks.map((b) => b.url));
  const shortcuts = [
    ...bookmarks.map((b) => ({ label: b.title || hostOfUrl(b.url) || b.url, url: b.url })),
    ...DEFAULTS.filter((d) => !used.has(d.url)),
  ].slice(0, adaptive.shortcutColumns * 2);

  const recent = privateTab ? [] : state.history.filter((h) => /^https?:/i.test(h.url)).slice(0, 6);
  const home = state.settings.homepage?.trim();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: privateTab ? theme.accentSoft : theme.bg }}
      contentContainerStyle={{
        paddingHorizontal: adaptive.screenMargin,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xl,
        maxWidth: adaptive.contentMaxWidth,
        width: '100%',
        alignSelf: 'center',
      }}
      keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <Image
          source={require('../assets/logo.png')}
          style={{ width: 72, height: 72, borderRadius: radius.lg }}
          resizeMode="contain"
        />
        <Text style={{ color: theme.text, ...typeScale.headlineSmall, marginTop: spacing.md }}>
          {greeting}
        </Text>
        <Text
          style={{
            color: theme.subtext,
            ...typeScale.bodyMedium,
            marginTop: 4,
            textAlign: 'center',
            paddingHorizontal: spacing.md,
          }}>
          {privateTab
            ? isolated
              ? 'Mode privat — kuki terpisah, tidak masuk riwayat'
              : isolated === false
                ? 'Mode privat — riwayat tidak disimpan. Perangkat ini belum memisahkan kuki.'
                : 'Mode privat — tidak masuk riwayat'
            : 'Zenith'}
        </Text>
      </View>

      {/* SearchBar Material 3: 56dp, radius penuh, ikon utama + petunjuk */}
      <Pressable
        onPress={openSearch}
        accessibilityRole="search"
        accessibilityLabel="Cari atau ketik alamat web"
        android_ripple={{ color: theme.onSurface + '1f', foreground: true }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.surfaceContainerHigh,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          minHeight: sizes.textField,
          borderWidth: 1,
          borderColor: theme.outlineVariant,
        }}>
        <Icon name="search" size={22} color={theme.onSurfaceVariant} />
        <Text style={{ color: theme.subtext, ...typeScale.bodyLarge, marginLeft: spacing.md, flex: 1 }}>
          Cari atau ketik alamat
        </Text>
      </Pressable>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: spacing.lg,
          marginBottom: spacing.sm,
        }}>
        <Text style={{ flex: 1, color: theme.subtext, ...typeScale.titleSmall }}>
          {privateTab ? 'Situs umum' : 'Pintasan'}
        </Text>
        {privateTab ? null : (
          <Pressable
            onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'bookmarks' })}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan semua bookmark"
            android_ripple={{ color: theme.primary + '1f', borderless: false }}
            style={{ minHeight: 32, paddingHorizontal: spacing.sm, justifyContent: 'center', borderRadius: radius.sm }}>
            <Text style={{ color: theme.accent, ...typeScale.labelLarge }}>Tampilkan semua</Text>
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {home && /^https?:/i.test(home) ? (
          <Shortcut
            theme={theme}
            columns={adaptive.shortcutColumns}
            label="Beranda"
            url={home}
            onPress={() => go(home)}
          />
        ) : null}
        {shortcuts.map((s) => (
          <Shortcut
            key={s.url}
            theme={theme}
            columns={adaptive.shortcutColumns}
            label={s.label}
            url={s.url}
            onPress={() => go(s.url)}
          />
        ))}
      </View>

      {recent.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={{ flex: 1, color: theme.subtext, ...typeScale.titleSmall }}>Baru dikunjungi</Text>
            <Pressable
              onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'history' })}
              accessibilityRole="button"
              accessibilityLabel="Buka riwayat"
              android_ripple={{ color: theme.primary + '1f', borderless: false }}
              style={{ minHeight: 32, paddingHorizontal: spacing.sm, justifyContent: 'center', borderRadius: radius.sm }}>
              <Text style={{ color: theme.accent, ...typeScale.labelLarge }}>Riwayat</Text>
            </Pressable>
          </View>
          <View
            style={{
              backgroundColor: theme.surfaceContainer,
              borderRadius: radius.lg,
              overflow: 'hidden',
            }}>
            {recent.map((h, i) => (
              <Pressable
                key={h.url + h.at}
                onPress={() => go(h.url)}
                accessibilityRole="button"
                accessibilityLabel={`Buka ${h.title || hostOfUrl(h.url) || h.url}`}
                android_ripple={{ color: theme.onSurface + '1f', foreground: true }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: sizes.listItem,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 10,
                  borderBottomWidth: i === recent.length - 1 ? 0 : 1,
                  borderBottomColor: theme.outlineVariant,
                }}>
                <Icon name="clock" size={20} color={theme.onSurfaceVariant} />
                <View style={{ marginLeft: spacing.md, flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: theme.text, ...typeScale.bodyLarge }}>
                    {h.title || hostOfUrl(h.url) || h.url}
                  </Text>
                  <Text numberOfLines={1} style={{ color: theme.subtext, ...typeScale.bodySmall }}>
                    {hostOfUrl(h.url)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'extensions' })}
        accessibilityRole="button"
        accessibilityLabel="Kelola ekstensi"
        android_ripple={{ color: theme.onSurface + '1f', foreground: true }}
        style={{
          marginTop: spacing.lg,
          backgroundColor: theme.surfaceContainerHigh,
          borderRadius: radius.lg,
          padding: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          elevation: elevation.level1,
        }}>
        <Icon name="puzzle" size={22} color={theme.text} />
        <View style={{ marginLeft: spacing.md, flex: 1 }}>
          <Text style={{ color: theme.text, ...typeScale.titleMedium }}>Ekstensi</Text>
          <Text style={{ color: theme.subtext, ...typeScale.bodySmall, marginTop: 2 }}>
            {state.extensions.length > 0 ? `${state.extensions.length} terpasang` : 'Impor ekstensi Chrome'}
          </Text>
        </View>
        <Icon name="chevronRight" size={20} color={theme.subtext} />
      </Pressable>
    </ScrollView>
  );
}

function Shortcut({
  theme,
  label,
  url,
  columns,
  onPress,
}: {
  theme: Theme;
  label: string;
  url: string;
  columns: number;
  onPress: () => void;
}) {
  const host = hostOfUrl(url);
  const [failed, setFailed] = useState(false);
  const letter = (label || host || '?').slice(0, 1).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Buka ${label}`}
      android_ripple={{ color: theme.onSurface + '1f', borderless: false }}
      style={{
        width: `${100 / columns}%` as DimensionValue,
        alignItems: 'center',
        marginBottom: spacing.md,
        paddingVertical: 4,
      }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.surfaceContainerHigh,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {!failed && host ? (
          <Image
            source={{ uri: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` }}
            style={{ width: 30, height: 30 }}
            onError={() => setFailed(true)}
          />
        ) : (
          <Text style={{ color: theme.text, ...typeScale.titleMedium }}>{letter}</Text>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{ color: theme.text, ...typeScale.bodySmall, marginTop: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>
    </Pressable>
  );
}
