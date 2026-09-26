/**
 * Zenith Browser — root aplikasi (v0.2).
 *
 * Arsitektur:
 *  - UI:     React Native (layar ini + src/browser + src/screens)
 *  - Inti:   Rust (rust/zenith-core) via JNI — parser userscript/ekstensi,
 *            ad-block, normalisasi URL
 *  - WebView: react-native-webview + ZenithWebViewClient (blokir jaringan)
 *  - Unduhan: ZenithDownloadModule (multi-thread ala Via)
 *
 * Layar browser selalu ter-mount; layar lain adalah overlay.
 * ErrorBoundary mencegah crash UI mematikan aplikasi.
 */

import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/state/store';
import { useTheme } from './src/theme';
import { BrowserScreen } from './src/browser/BrowserScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ScriptsScreen } from './src/screens/ScriptsScreen';
import { ExtensionsScreen } from './src/screens/ExtensionsScreen';
import { SiteSettingsScreen } from './src/screens/SiteSettingsScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { AboutScreen } from './src/screens/AboutScreen';

interface EBProps {
  children: React.ReactNode;
}
interface EBState {
  error: Error | null;
}

/** Penangkap error render — UI gagal tidak boleh menutup aplikasi. */
class ErrorBoundary extends React.Component<EBProps, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[Zenith] UI error:', error?.message, info);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0c0e13', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Text style={{ color: '#f87171', fontSize: 40, marginBottom: 14 }}>⚠</Text>
          <Text style={{ color: '#e8ebf2', fontSize: 17, fontWeight: '800', textAlign: 'center' }}>
            Ada gangguan pada tampilan
          </Text>
          <Text style={{ color: '#98a2b8', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
            Tab dan data Anda aman. Coba pulihkan tampilan —{'\n'}
            {String(this.state.error?.message ?? '').slice(0, 140)}
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{
              marginTop: 20,
              backgroundColor: '#8b7cf6',
              borderRadius: 14,
              paddingHorizontal: 26,
              paddingVertical: 12,
            }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Pulihkan tampilan</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppShell() {
  const { state } = useStore();
  const theme = useTheme(state.settings.theme);

  if (!state.hydrated) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <BrowserScreen />
      {state.ui.screen === 'settings' ? <SettingsScreen /> : null}
      {state.ui.screen === 'scripts' ? <ScriptsScreen /> : null}
      {state.ui.screen === 'extensions' ? <ExtensionsScreen /> : null}
      {state.ui.screen === 'siteSettings' ? <SiteSettingsScreen /> : null}
      {state.ui.screen === 'downloads' ? <DownloadsScreen /> : null}
      {state.ui.screen === 'about' ? <AboutScreen /> : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
