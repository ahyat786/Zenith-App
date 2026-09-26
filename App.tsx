/**
 * Zenith Browser — root aplikasi.
 *
 * Arsitektur:
 *  - UI:     React Native (layar ini + src/browser + src/screens)
 *  - Inti:   Rust (rust/zenith-core) via JNI — parser userscript/ekstensi,
 *            ad-block, normalisasi URL
 *  - WebView: react-native-webview + ZenithWebViewClient (blokir jaringan)
 *
 * Layar browser selalu ter-mount; layar lain adalah overlay.
 */

import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/state/store';
import { useTheme } from './src/theme';
import { BrowserScreen } from './src/browser/BrowserScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ScriptsScreen } from './src/screens/ScriptsScreen';
import { ExtensionsScreen } from './src/screens/ExtensionsScreen';
import { SiteSettingsScreen } from './src/screens/SiteSettingsScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { ActivityIndicator } from 'react-native';

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
      {state.ui.screen === 'about' ? <AboutScreen /> : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
