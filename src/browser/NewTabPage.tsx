/**
 * Laman tab baru — bukan sekadar omnibox.
 * Pintasan (Firefox/Opera), pencarian, riwayat singkat (Chrome), ekstensi.
 */

import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { hostOfUrl, useStore } from '../state/store';
import type { Theme } from '../theme';
import { radius, spacing } from '../theme';
import type { Tab } from '../types';
import { Icon } from '../ui/Icon';
import { isNewTabUrl } from './newtab';

const DEFAULTS = [
  { label: 'Google', url: 'https://www.google.com' },
  { label: 'YouTube', url: 'https://m.youtube.com' },
  { label: 'Wikipedia', url: 'https://id.wikipedia.org' },
  { label: 'GitHub', url: 'https://github.com' },
];

export function NewTabPage({ theme, tab }: { theme: Theme; tab?: Tab | null }) {
  const { state, dispatch, openNewTab } = useStore();
  const hour = new Date().getHours();
  const greeting =
    hour < 4 ? 'Selamat malam' : hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  const privateTab = !!tab?.incognito;

  const go = (url: string) => {
    if (tab && isNewTabUrl(tab.url)) {
      dispatch({
        type: 'UPDATE_TAB',
        id: tab.id,
        patch: { url, title: '', loading: true, progress: 0.08 },
      });
      return;
    }
    openNewTab(url, { incognito: privateTab });
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

  const bookmarks = state.bookmarks.slice(0, 8);
  const used = new Set(bookmarks.map((b) => b.url));
  const shortcuts = [
    ...bookmarks.map((b) => ({ label: b.title || hostOfUrl(b.url) || b.url, url: b.url })),
    ...DEFAULTS.filter((d) => !used.has(d.url)),
  ].slice(0, 8);

  const recent = privateTab ? [] : state.history.filter((h) => /^https?:/i.test(h.url)).slice(0, 6);
  const home = state.settings.homepage?.trim();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 18 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.accent,
          }}>
          <Text style={{ fontSize: 34, fontWeight: '900', color: theme.accent }}>Z</Text>
        </View>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', marginTop: 12 }}>{greeting}</Text>
        <Text style={{ color: theme.subtext, fontSize: 13, marginTop: 4 }}>
          {privateTab ? 'Tab privat — tidak masuk riwayat' : 'Zenith'}
        </Text>
      </View>

      <Pressable
        onPress={openSearch}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: pressed ? theme.surface2 : theme.surface,
          borderRadius: radius.pill,
          paddingHorizontal: 16,
          height: 52,
          borderWidth: 1,
          borderColor: theme.border,
        })}>
        <Icon name="search" size={18} color={theme.subtext} />
        <Text style={{ color: theme.subtext, fontSize: 15.5, marginLeft: 10, flex: 1 }}>Cari atau ketik alamat</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 26, marginBottom: 12 }}>
        <Text style={{ flex: 1, color: theme.subtext, fontSize: 14, fontWeight: '600' }}>Pintasan</Text>
        <Pressable onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'bookmarks' })}>
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Tampilkan semua</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {home && /^https?:/i.test(home) ? (
          <Shortcut theme={theme} label="Beranda" url={home} onPress={() => go(home)} />
        ) : null}
        {shortcuts.map((s) => (
          <Shortcut key={s.url} theme={theme} label={s.label} url={s.url} onPress={() => go(s.url)} />
        ))}
      </View>

      {recent.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ flex: 1, color: theme.subtext, fontSize: 14, fontWeight: '600' }}>Baru dikunjungi</Text>
            <Pressable onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'history' })}>
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Riwayat</Text>
            </Pressable>
          </View>
          {recent.map((h) => (
            <Pressable
              key={h.url + h.at}
              onPress={() => go(h.url)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 4,
                backgroundColor: pressed ? theme.surface2 : 'transparent',
                borderRadius: 10,
              })}>
              <Icon name="clock" size={16} color={theme.subtext} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14.5, fontWeight: '600' }}>
                  {h.title || hostOfUrl(h.url) || h.url}
                </Text>
                <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 12 }}>
                  {hostOfUrl(h.url)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'extensions' })}
        style={{
          marginTop: 18,
          backgroundColor: theme.surface,
          borderRadius: 14,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <Icon name="puzzle" size={20} color={theme.text} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: '600' }}>Ekstensi</Text>
          <Text style={{ color: theme.subtext, fontSize: 12.5, marginTop: 2 }}>
            {state.extensions.length > 0 ? `${state.extensions.length} terpasang` : 'Impor ekstensi Chrome'}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={theme.subtext} />
      </Pressable>
    </ScrollView>
  );
}

function Shortcut({
  theme,
  label,
  url,
  onPress,
}: {
  theme: Theme;
  label: string;
  url: string;
  onPress: () => void;
}) {
  const host = hostOfUrl(url);
  const [failed, setFailed] = useState(false);
  const letter = (label || host || '?').slice(0, 1).toUpperCase();
  return (
    <Pressable onPress={onPress} style={{ width: '25%', alignItems: 'center', marginBottom: 16 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {!failed && host ? (
          <Image
            source={{ uri: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` }}
            style={{ width: 28, height: 28 }}
            onError={() => setFailed(true)}
          />
        ) : (
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{letter}</Text>
        )}
      </View>
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, marginTop: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>
    </Pressable>
  );
}
