/**
 * AboutScreen — versi, kredit, dan lisensi Zenith.
 */

import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import { ListSection, Row } from '../ui/kit';
import { coreVersion, nativeAvailable } from '../core/native';
import { ListSection as LS } from '../ui/kit';

export function AboutScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const [core, setCore] = useState<{ version: string; engine: string } | null>(null);

  useEffect(() => {
    coreVersion().then(setCore);
  }, []);

  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });

  return (
    <ScreenShell title="Tentang" onBack={back} theme={theme}>
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: 8 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.accent,
          }}>
          <Text style={{ fontSize: 32, fontWeight: '900', color: theme.accent }}>Z</Text>
          <Text style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 15 }}>🩷</Text>
        </View>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Zenith Browser</Text>
        <Text style={{ color: theme.subtext, fontSize: 13 }}>
          v0.3.0 • Rust + React Native • Android 7.0+
        </Text>
        <Text style={{ color: theme.subtext, fontSize: 12.5, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
          Zenith — cepat, ringan, privat. Tanpa telemetri.
        </Text>
        <Text style={{ color: theme.accent, fontSize: 12.5, marginTop: 8, fontWeight: '700' }}>
          Built with 🩷 Pistis Litae
        </Text>
      </View>

      <ListSection title="Pembuat" theme={theme}>
        <Row
          theme={theme}
          icon="zap"
          title="Built with 🩷 Pistis Litae"
          subtitle="Rust + React Native — terinspirasi Zen, Via, Kiwi, dan Brave"
          onPress={() => Linking.openURL('https://github.com/ahyat786/Zenith-App').catch(() => {})}
          last
        />
      </ListSection>

      <ListSection title="Inti" theme={theme}>
        <Row
          theme={theme}
          icon="zap"
          title="Zenith Core (Rust)"
          subtitle={core ? `v${core.version} • mesin ${core.engine === 'rust' ? 'Rust aktif (JNI)' : 'JS fallback'}` : nativeAvailable ? 'memuat…' : 'JS fallback (lib .so tidak ditemukan)'}
          last
        />
      </ListSection>

      <LS title="Kredit & inspirasi" theme={theme}>
        <Row
          theme={theme}
          icon="info"
          title="Zen Browser (docs)"
          subtitle="Konsep UX: workspaces, compact mode, split view, glance, omnibox"
          onPress={() => Linking.openURL('https://github.com/zen-browser/docs').catch(() => {})}
        />
        <Row
          theme={theme}
          icon="info"
          title="Via Browser (tuyafeng)"
          subtitle="Format userscript, pengaturan per-situs, filosofi ringan"
          onPress={() => Linking.openURL('https://github.com/tuyafeng/Via').catch(() => {})}
        />
        <Row
          theme={theme}
          icon="info"
          title="Kiwi Browser (src.next)"
          subtitle="Model dukungan ekstensi Chrome (content scripts)"
          onPress={() => Linking.openURL('https://github.com/kiwibrowser/src.next').catch(() => {})}
        />
        <Row
          theme={theme}
          icon="info"
          title="Brave Browser"
          subtitle="Shields per-situs, penghitung blokir, upgrade HTTPS, Brave Search"
          onPress={() => Linking.openURL('https://github.com/brave/brave-browser').catch(() => {})}
          last
        />
      </LS>

      <ListSection title="Lisensi" theme={theme}>
        <View style={{ padding: spacing.md }}>
          <Text style={{ color: theme.subtext, fontSize: 13, lineHeight: 19 }}>
            Kode Zenith dilisensikan MIT. Zenith adalah proyek independen — bukan produk resmi
            Zen Browser, Via, maupun Kiwi. Nama dan proyek di atas adalah milik pemiliknya
            masing-masing, dipakai sebagai atribusi inspirasi.
          </Text>
        </View>
      </ListSection>
    </ScreenShell>
  );
}
