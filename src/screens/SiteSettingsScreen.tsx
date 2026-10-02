/**
 * SiteSettingsScreen — pengaturan per-situs ala Via:
 * JavaScript on/off, pemblokir iklan on/off, user-agent, CSS kustom.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { hostOfUrl, useStore } from '../state/store';
import { spacing, useTheme, type as typeScale } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import { Button, ListSection, SegmentedControl, TextField, ToggleRow } from '../ui/kit';
import { DESKTOP_UA, isDesktopUa } from '../core/desktop';

export function SiteSettingsScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const [newHost, setNewHost] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });

  const hosts = Array.from(
    new Set([
      ...Object.keys(state.siteConfigs),
      ...state.tabs.map((t) => hostOfUrl(t.url)).filter(Boolean),
    ]),
  ).sort();

  const cfg = selected ? state.siteConfigs[selected] : undefined;

  const setPatch = (patch: Partial<NonNullable<typeof cfg>>) => {
    if (!selected) {
      return;
    }
    dispatch({ type: 'SET_SITE_CONFIG', host: selected, patch });
  };

  return (
    <ScreenShell
      title="Pengaturan situs"
      subtitle="JS, iklan, UA, dan CSS per host — ala Via"
      onBack={back}
      theme={theme}>
      {/* pilih host */}
      <View style={{ padding: spacing.md }}>
        <TextField
          theme={theme}
          label="Tambah host"
          value={newHost}
          onChangeText={setNewHost}
          placeholder="example.com"
          keyboardType="url"
        />
        {newHost.trim() ? (
          <Button
            label="Pilih host ini"
            theme={theme}
            small
            onPress={() => {
              const h = newHost.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
              if (h) {
                setSelected(h);
                setNewHost('');
              }
            }}
          />
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 4 }}>
        {hosts.length === 0 ? (
          <Text style={{ color: theme.subtext, ...typeScale.bodyMedium}}>
            Belum ada situs — buka halaman dulu atau ketik host di atas.
          </Text>
        ) : (
          hosts.map((h) => (
            <Pressable
              key={h}
              onPress={() => setSelected(h)}
              style={{
                paddingHorizontal: 13,
                paddingVertical: 7,
                borderRadius: 999,
                marginRight: 8,
                backgroundColor: selected === h ? theme.accentSoft : theme.surface,
                borderWidth: 1,
                borderColor: selected === h ? theme.accent : theme.border,
              }}>
              <Text
                style={{
                  color: selected === h ? theme.accent : theme.subtext,
                  ...typeScale.bodySmall, fontWeight: '700',
                }}>
                {h}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {selected ? (
        <ListSection title={selected} theme={theme}>
          <ToggleRow
            theme={theme}
            title="JavaScript"
            subtitle="Matikan JS untuk situs ini"
            value={cfg?.javascriptEnabled !== false}
            onValueChange={(v) => setPatch({ javascriptEnabled: v })}
          />
          <ToggleRow
            theme={theme}
            title="Blokir iklan & pelacak"
            subtitle="Matikan untuk memasukkan host ke daftar pengecualian"
            value={cfg?.adblockEnabled !== false}
            onValueChange={(v) => setPatch({ adblockEnabled: v })}
          />
          <View style={{ paddingHorizontal: spacing.md, paddingTop: 12 }}>
            <Text style={{ color: theme.subtext, ...typeScale.bodySmall, fontWeight: '600', marginBottom: 6 }}>
              Mode user-agent
            </Text>
            <SegmentedControl
              theme={theme}
              value={!cfg?.userAgent ? 'default' : isDesktopUa(cfg.userAgent) ? 'desktop' : 'custom'}
              onValueChange={(v) =>
                setPatch({ userAgent: v === 'default' ? '' : v === 'desktop' ? DESKTOP_UA : cfg?.userAgent || '' })
              }
              options={[
                { value: 'default', label: 'Bawaan' },
                { value: 'desktop', label: 'Desktop' },
                { value: 'custom', label: 'Kustom' },
              ]}
            />
            {cfg?.userAgent && !isDesktopUa(cfg.userAgent) ? (
              <View style={{ marginTop: 10 }}>
                <TextField
                  theme={theme}
                  label="UA kustom"
                  value={cfg.userAgent}
                  onChangeText={(t) => setPatch({ userAgent: t })}
                  mono
                />
              </View>
            ) : null}
          </View>
          <View style={{ paddingHorizontal: spacing.md, paddingTop: 12 }}>
            <TextField
              theme={theme}
              label="CSS kustom untuk situs ini (userstyle)"
              value={cfg?.customCss ?? ''}
              onChangeText={(t) => setPatch({ customCss: t })}
              placeholder={'/* contoh */\nbody { filter: invert(1); }'}
              multiline
              mono
            />
          </View>
          <View style={{ flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: 12, gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Simpan CSS" theme={theme} onPress={() => back()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Hapus pengaturan"
                kind="danger"
                theme={theme}
                onPress={() => {
                  dispatch({ type: 'DEL_SITE_CONFIG', host: selected });
                  setSelected(null);
                }}
              />
            </View>
          </View>
        </ListSection>
      ) : (
        <ListSection title="Cara pakai" theme={theme}>
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: theme.subtext, ...typeScale.bodyMedium, lineHeight: 20 }}>
              Pilih host dari daftar (situs yang pernah dibuka) atau ketik manual. Anda dapat
              mematikan JavaScript, menonaktifkan pemblokir iklan, memakai UA desktop, atau
              menyuntik CSS kustom — persis pengaturan situs Via Browser.
            </Text>
          </View>
        </ListSection>
      )}
    </ScreenShell>
  );
}
