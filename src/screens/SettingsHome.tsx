/**
 * Indeks pengaturan — daftar bergaya Firefox (judul + subjudul),
 * hanya menuju pengaturan yang benar-benar ada.
 */

import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Theme } from '../theme';
import { spacing } from '../theme';
import type { Screen } from '../types';
import { Icon } from '../ui/Icon';

export type SettingsPanel = 'home' | 'tampilan' | 'tab' | 'cari' | 'perisai' | 'privasi' | 'jaringan' | 'data' | 'beranda' | 'ubahsuai';

export interface SettingsRow {
  id: string;
  title: string;
  subtitle?: string;
  panel?: SettingsPanel;
  screen?: Screen;
}

export function SettingsHome({
  theme,
  rows,
  filtering,
  query,
  onQuery,
  onRow,
  onAccount,
}: {
  theme: Theme;
  rows: SettingsRow[];
  filtering: boolean;
  query: string;
  onQuery: (q: string) => void;
  onRow: (row: SettingsRow) => void;
  onAccount: () => void;
}) {
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => `${r.title} ${r.subtitle ?? ''}`.toLowerCase().includes(q))
    : rows;

  return (
    <View>
      {filtering ? (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Cari pengaturan"
            placeholderTextColor={theme.subtext}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              backgroundColor: theme.surface,
              color: theme.text,
              borderRadius: 12,
              paddingHorizontal: 14,
              height: 44,
              fontSize: 15,
            }}
          />
        </View>
      ) : null}

      <Pressable
        onPress={onAccount}
        style={{
          marginHorizontal: spacing.md,
          marginTop: spacing.lg,
          backgroundColor: theme.surface,
          borderRadius: 14,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="user" size={24} color="#fff" />
        </View>
        <View style={{ marginLeft: 14, flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Di perangkat ini</Text>
          <Text style={{ color: theme.subtext, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
            Markah, riwayat, dan unduhan tidak disinkronkan. Tidak ada akun.
          </Text>
        </View>
      </Pressable>

      <View style={{ marginTop: spacing.md }}>
        {visible.map((row, i) => (
          <Pressable
            key={row.id}
            onPress={() => onRow(row)}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.lg,
              paddingVertical: 14,
              backgroundColor: pressed ? theme.surface2 : 'transparent',
              borderBottomWidth: i < visible.length - 1 ? 0 : 0,
            })}>
            <Text style={{ color: theme.text, fontSize: 16 }}>{row.title}</Text>
            {row.subtitle ? (
              <Text style={{ color: theme.subtext, fontSize: 13, marginTop: 2 }}>{row.subtitle}</Text>
            ) : null}
          </Pressable>
        ))}
        {visible.length === 0 ? (
          <Text style={{ color: theme.subtext, padding: spacing.lg }}>Tidak ada pengaturan yang cocok.</Text>
        ) : null}
      </View>
    </View>
  );
}
