/**
 * Riwayat, markah, kata sandi, dan akun.
 * Sandi dan akun jujur: Zenith tidak menyimpan sandi dan tidak punya sinkronisasi.
 */

import React, { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { hostOfUrl, useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import { Button, ListSection, Row } from '../ui/kit';
import type { HistoryItem } from '../types';
import { PROFILE_COLORS, uid } from '../state/defaults';

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
  const { state, fullState, dispatch, switchProfile } = useStore();
  const theme = useTheme(state.settings.theme);
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const active = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];

  const counts = (id: string) => ({
    tabs: fullState.tabs.filter((t) => t.profileId === id).length,
    history: fullState.history.filter((h) => h.profileId === id).length,
  });

  const create = async () => {
    const label = name.trim();
    if (!label) {
      Alert.alert('Nama kosong', 'Beri nama profil, misalnya Kerja atau Sekolah.');
      return;
    }
    const id = uid('profile-');
    const color = PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length];
    dispatch({ type: 'ADD_PROFILE', id, name: label, color });
    setName('');
    await switchProfile(id);
  };

  return (
    <ScreenShell title="Profil" onBack={() => dispatch({ type: 'SET_SCREEN', screen: 'browser' })} theme={theme}>
      <View style={{ padding: spacing.lg, paddingBottom: 4 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Profil terpisah, di perangkat ini</Text>
        <Text style={{ color: theme.subtext, fontSize: 13.5, lineHeight: 20, marginTop: 6 }}>
          Setiap profil punya tab, riwayat, markah, skrip, ekstensi, dan kuki sendiri. Pindah profil tidak
          menghapus tab yang sedang terbuka — semuanya tetap tersimpan.
        </Text>
      </View>
      {state.profiles.map((p) => {
        const n = counts(p.id);
        const on = p.id === state.activeProfileId;
        return (
          <Pressable
            key={p.id}
            onPress={() => switchProfile(p.id)}
            style={{
              marginHorizontal: spacing.md,
              marginTop: 10,
              backgroundColor: theme.surface,
              borderRadius: 16,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: on ? p.color : theme.border,
            }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: p.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{p.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{p.name}</Text>
              <Text style={{ color: theme.subtext, fontSize: 12.5, marginTop: 2 }}>
                {n.tabs} tab tersimpan · {n.history} riwayat{on ? ' · sedang dipakai' : ''}
              </Text>
            </View>
            {on ? <Text style={{ color: p.color, fontWeight: '800', fontSize: 12 }}>AKTIF</Text> : null}
          </Pressable>
        );
      })}
      <View style={{ padding: spacing.lg, gap: 10 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nama profil baru"
          placeholderTextColor={theme.subtext}
          style={{
            backgroundColor: theme.surface,
            color: theme.text,
            borderRadius: 12,
            paddingHorizontal: 14,
            height: 46,
            fontSize: 15,
          }}
        />
        <Button label="Buat profil dan pindah" theme={theme} onPress={create} />
        {active ? (
          <>
            <TextInput
              value={rename}
              onChangeText={setRename}
              placeholder={`Ubah nama “${active.name}”`}
              placeholderTextColor={theme.subtext}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderRadius: 12,
                paddingHorizontal: 14,
                height: 46,
                fontSize: 15,
              }}
            />
            <Button
              label="Simpan nama"
              kind="secondary"
              theme={theme}
              onPress={() => {
                const label = rename.trim();
                if (!label) {
                  return;
                }
                dispatch({ type: 'UPDATE_PROFILE', id: active.id, patch: { name: label } });
                setRename('');
              }}
            />
          </>
        ) : null}
        {state.profiles.length > 1 && active ? (
          <Button
            label={`Hapus profil ${active.name}`}
            kind="danger"
            theme={theme}
            onPress={() =>
              Alert.alert(
                `Hapus ${active.name}?`,
                'Tab, riwayat, dan markah profil ini ikut terhapus. Profil lain tidak tersentuh.',
                [
                  { text: 'Batal', style: 'cancel' },
                  {
                    text: 'Hapus',
                    style: 'destructive',
                    onPress: () => dispatch({ type: 'DELETE_PROFILE', id: active.id }),
                  },
                ],
              )
            }
          />
        ) : null}
      </View>
    </ScreenShell>
  );
}
