/**
 * Riwayat, markah, kata sandi, dan akun.
 * Sandi dan akun jujur: Zenith tidak menyimpan sandi dan tidak punya sinkronisasi.
 */

import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { hostOfUrl, useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import { ListSection, Row } from '../ui/kit';
import type { HistoryItem } from '../types';

function dayLabel(at: number): string {
  const d = new Date(at);
  const now = new Date();
  const start = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diff = start(now) - start(d);
  if (diff <= 0) {
    return 'Hari ini';
  }
  if (diff === 86400000) {
    return 'Kemarin';
  }
  try {
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return 'Lebih lama';
  }
}

export function HistoryScreen() {
  const { state, dispatch, openNewTab } = useStore();
  const theme = useTheme(state.settings.theme);
  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of state.history) {
    const label = dayLabel(item.at);
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) {
      groups.push({ label, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  return (
    <ScreenShell title="Riwayat" onBack={back} theme={theme}>
      {state.history.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <Pressable
            onPress={() =>
              Alert.alert('Hapus semua riwayat?', 'Markah tidak ikut terhapus.', [
                { text: 'Batal', style: 'cancel' },
                { text: 'Hapus', style: 'destructive', onPress: () => dispatch({ type: 'CLEAR_HISTORY' }) },
              ])
            }>
            <Text style={{ color: theme.danger, fontWeight: '700' }}>Hapus semua riwayat</Text>
          </Pressable>
        </View>
      ) : null}
      {groups.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: theme.subtext }}>Belum ada riwayat. Tab privat tidak dicatat.</Text>
        </View>
      ) : (
        groups.map((g) => (
          <ListSection key={g.label} title={g.label} theme={theme}>
            {g.items.map((h) => (
              <Row
                key={h.url + ':' + h.at}
                theme={theme}
                icon="clock"
                title={h.title || hostOfUrl(h.url) || h.url}
                subtitle={h.url}
                onPress={() => {
                  openNewTab(h.url);
                  dispatch({ type: 'SET_SCREEN', screen: 'browser' });
                }}
                onLongPress={() =>
                  Alert.alert(h.title || h.url, undefined, [
                    { text: 'Batal', style: 'cancel' },
                    {
                      text: 'Hapus dari riwayat',
                      style: 'destructive',
                      onPress: () => dispatch({ type: 'DEL_HISTORY', url: h.url, at: h.at }),
                    },
                  ])
                }
              />
            ))}
          </ListSection>
        ))
      )}
    </ScreenShell>
  );
}

export function BookmarksScreen() {
  const { state, dispatch, openNewTab } = useStore();
  const theme = useTheme(state.settings.theme);
  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });
  return (
    <ScreenShell title="Markah" onBack={back} theme={theme}>
      {state.bookmarks.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: theme.subtext }}>Belum ada markah. Tambahkan dari menu halaman.</Text>
        </View>
      ) : (
        <ListSection title={`${state.bookmarks.length} markah`} theme={theme}>
          {state.bookmarks.map((b) => (
            <Row
              key={b.id}
              theme={theme}
              icon="bookmark"
              title={b.title || hostOfUrl(b.url) || b.url}
              subtitle={b.url}
              onPress={() => {
                openNewTab(b.url);
                dispatch({ type: 'SET_SCREEN', screen: 'browser' });
              }}
              onLongPress={() =>
                Alert.alert('Hapus markah?', b.title || b.url, [
                  { text: 'Batal', style: 'cancel' },
                  {
                    text: 'Hapus',
                    style: 'destructive',
                    onPress: () => dispatch({ type: 'DEL_BOOKMARK', id: b.id }),
                  },
                ])
              }
            />
          ))}
        </ListSection>
      )}
    </ScreenShell>
  );
}

export function PasswordsScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  return (
    <ScreenShell title="Kata sandi" onBack={() => dispatch({ type: 'SET_SCREEN', screen: 'browser' })} theme={theme}>
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Zenith tidak menyimpan sandi</Text>
        <Text style={{ color: theme.subtext, fontSize: 14.5, lineHeight: 21 }}>
          Isi formulir di situs memakai pengelola sandi Android (Google, Samsung, atau yang Anda pilih). Tidak ada salinan sandi di aplikasi ini, dan tidak ada yang dikirim ke server Zenith.
        </Text>
      </View>
    </ScreenShell>
  );
}

export function AccountScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  return (
    <ScreenShell title="Masuk" onBack={() => dispatch({ type: 'SET_SCREEN', screen: 'browser' })} theme={theme}>
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Tidak ada akun</Text>
        <Text style={{ color: theme.subtext, fontSize: 14.5, lineHeight: 21 }}>
          Markah, riwayat, ekstensi, dan pengaturan tetap di perangkat ini. Zenith tidak punya sinkronisasi dan tidak memakai akun. Tidak ada telemetri.
        </Text>
      </View>
    </ScreenShell>
  );
}
