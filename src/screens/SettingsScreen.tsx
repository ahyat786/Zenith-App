/**
 * SettingsScreen — pengaturan Zenith.
 * Bagian mesin pencari mengikuti manual Zen (templat URL dengan %s,
 * kata kunci, saran), bagian situs mengikuti Via (JS/UA/iklan per situs).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import {
  Button,
  ListSection,
  Row,
  SegmentedControl,
  Sheet,
  TextField,
  ToggleRow,
} from '../ui/kit';
import { adblockInit, adblockResetStats, adblockStats, type AdblockStats } from '../core/native';
import { uid } from '../state/defaults';
import type { SearchEngine } from '../types';

export function SettingsScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const s = state.settings;
  const [stats, setStats] = useState<AdblockStats | null>(null);
  const [addEngine, setAddEngine] = useState(false);
  const [importList, setImportList] = useState(false);
  const [engineForm, setEngineForm] = useState({ name: '', url: '', suggest: '' });
  const [listUrl, setListUrl] = useState('');
  const [listMode, setListMode] = useState<'replace' | 'merge'>('replace');
  const [importing, setImporting] = useState(false);

  const refreshStats = useCallback(async () => {
    setStats(await adblockStats());
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const saveEngine = () => {
    const name = engineForm.name.trim();
    let url = engineForm.url.trim();
    if (!name || !url) {
      Alert.alert('Lengkapi data', 'Nama dan URL mesin pencari wajib diisi.');
      return;
    }
    if (!url.includes('%s')) {
      url += (url.includes('?') ? '&' : '?') + 'q=%s';
    }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    const engine: SearchEngine = {
      id: uid('eng-'),
      name,
      urlTemplate: url,
      suggestUrl: engineForm.suggest.trim() || undefined,
      builtin: false,
    };
    dispatch({ type: 'SET_SETTINGS', patch: { engines: [...s.engines, engine] } });
    setEngineForm({ name: '', url: '', suggest: '' });
    setAddEngine(false);
  };

  const doImportList = async () => {
    const url = listUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('URL tidak valid', 'Masukkan URL berkas hosts (http/https).');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.length < 8) {
        throw new Error('berkas kosong');
      }
      if (listMode === 'replace') {
        dispatch({ type: 'SET_USER_BLOCKLIST', text });
      } else {
        dispatch({ type: 'SET_USER_BLOCKLIST', text: state.userBlocklist + '\n' + text });
      }
      await adblockInit(text, listMode);
      await refreshStats();
      setImportList(false);
      setListUrl('');
      Alert.alert('Berhasil', `Daftar blokir dimuat (${text.split('\n').length} baris).`);
    } catch (e: any) {
      Alert.alert('Gagal mengimpor', String(e?.message ?? e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScreenShell
      title="Pengaturan"
      onBack={() => dispatch({ type: 'SET_SCREEN', screen: 'browser' })}
      theme={theme}>
      {/* ---------------- Tampilan ---------------- */}
      <ListSection title="Tampilan" theme={theme}>
        <View style={{ paddingHorizontal: spacing.md, paddingTop: 10 }}>
          <Text style={{ color: theme.subtext, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>
            Tema
          </Text>
          <SegmentedControl
            theme={theme}
            value={s.theme}
            onValueChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { theme: v } })}
            options={[
              { value: 'dark', label: 'Gelap' },
              { value: 'light', label: 'Terang' },
              { value: 'system', label: 'Sistem' },
            ]}
          />
        </View>
        <View style={{ paddingHorizontal: spacing.md, paddingTop: 12 }}>
          <Text style={{ color: theme.subtext, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>
            Posisi bar alat
          </Text>
          <SegmentedControl
            theme={theme}
            value={s.barPosition}
            onValueChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { barPosition: v } })}
            options={[
              { value: 'bottom', label: 'Bawah (ala Via)' },
              { value: 'top', label: 'Atas (ala Zen)' },
            ]}
          />
        </View>
        <ToggleRow
          theme={theme}
          icon="folder"
          title="Bar workspace"
          subtitle="Tampilkan pemilih workspace di atas bar alat"
          value={s.showWorkspaceBar}
          onValueChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { showWorkspaceBar: v } })}
          last
        />
      </ListSection>

      {/* ---------------- Pencarian ---------------- */}
      <ListSection title="Pencarian" theme={theme}>
        {s.engines.map((engine, i) => (
          <Row
            key={engine.id}
            theme={theme}
            title={engine.name}
            subtitle={engine.urlTemplate}
            last={i === s.engines.length - 1 && s.searchSuggestions}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {engine.id === s.defaultEngineId ? (
                  <Text style={{ color: theme.accent, fontWeight: '800' }}>✓</Text>
                ) : null}
              </View>
            }
            onPress={() => dispatch({ type: 'SET_SETTINGS', patch: { defaultEngineId: engine.id } })}
            onLongPress={
              engine.builtin
                ? undefined
                : () => {
                    Alert.alert('Hapus mesin?', engine.name, [
                      { text: 'Batal', style: 'cancel' },
                      {
                        text: 'Hapus',
                        style: 'destructive',
                        onPress: () =>
                          dispatch({
                            type: 'SET_SETTINGS',
                            patch: {
                              engines: s.engines.filter((x) => x.id !== engine.id),
                              defaultEngineId:
                                s.defaultEngineId === engine.id ? 'google' : s.defaultEngineId,
                            },
                          }),
                      },
                    ]);
                  }
            }
          />
        ))}
        <Row
          theme={theme}
          icon="plus"
          title="Tambah mesin pencari"
          subtitle="URL dengan %s untuk kueri — ala Zen"
          last
          onPress={() => setAddEngine(true)}
        />
        <ToggleRow
          theme={theme}
          icon="search"
          title="Saran pencarian"
          subtitle="Kirim kueri ke mesin pencari untuk saran"
          value={s.searchSuggestions}
          onValueChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { searchSuggestions: v } })}
          last
        />
      </ListSection>

      {/* ---------------- Pemblokir iklan ---------------- */}
      <ListSection title="Pemblokir iklan" theme={theme}>
        <ToggleRow
          theme={theme}
          icon="shield"
          title="Aktifkan pemblokiran"
          subtitle="Blokir iklan & pelacak di level jaringan (Rust)"
          value={s.adblockEnabled}
          onValueChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { adblockEnabled: v } })}
        />
        <Row
          theme={theme}
          icon="info"
          title={`Host terblokir: ${stats ? stats.hosts.toLocaleString('id-ID') : '—'}`}
          subtitle={`Permintaan diblokir sesi ini: ${stats ? stats.blockedCount.toLocaleString('id-ID') : '—'}`}
          onPress={refreshStats}
        />
        <Row
          theme={theme}
          icon="download"
          title="Impor daftar blokir dari URL"
          subtitle="Format hosts (mis. StevenBlack, adAway)"
          onPress={() => setImportList(true)}
        />
        <Row
          theme={theme}
          icon="refresh"
          title="Reset penghitung blokir"
          onPress={async () => {
            await adblockResetStats();
            refreshStats();
          }}
          last
        />
      </ListSection>

      {/* ---------------- Privasi & unduhan (Brave + Via) ---------------- */}
      <ListSection title="Privasi & unduhan" theme={theme}>
        <ToggleRow
          theme={theme}
          icon="lock"
          title="Upgrade HTTPS"
          subtitle="Muat ulang untuk menerapkan — ala Brave"
          value={s.httpsUpgrades}
          onValueChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { httpsUpgrades: v } })}
        />
        <ToggleRow
          theme={theme}
          icon="download"
          title="Unduhan cepat multi-thread"
          subtitle="4 koneksi paralel — ala Via; matikan untuk pakai sistem"
          value={s.fastDownloads}
          onValueChange={(v) => dispatch({ type: 'SET_SETTINGS', patch: { fastDownloads: v } })}
        />
        <Row
          theme={theme}
          icon="folder"
          title="Lihat unduhan"
          subtitle="Progres, kecepatan, buka & bagikan berkas"
          onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'downloads' })}
          last
        />
      </ListSection>

      {/* ---------------- Data ---------------- */}
      <ListSection title="Data & privasi" theme={theme}>
        <Row
          theme={theme}
          icon="clock"
          title="Bersihkan riwayat"
          subtitle={`${state.history.length} entri`}
          onPress={() => dispatch({ type: 'CLEAR_HISTORY' })}
        />
        <Row
          theme={theme}
          icon="globe"
          title="Pengaturan situs"
          subtitle="JS, iklan, UA, CSS kustom per situs"
          onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'siteSettings' })}
        />
        <Row
          theme={theme}
          icon="warning"
          danger
          title="Hapus SEMUA data aplikasi"
          subtitle="Tab, bookmark, skrip, ekstensi, pengaturan"
          onPress={() =>
            Alert.alert('Hapus semua data?', 'Tindakan ini tidak bisa dibatalkan.', [
              { text: 'Batal', style: 'cancel' },
              {
                text: 'Hapus',
                style: 'destructive',
                onPress: () => dispatch({ type: 'RESET_ALL' }),
              },
            ])
          }
          last
        />
      </ListSection>

      {/* ---------------- Tentang ---------------- */}
      <ListSection title="Tentang" theme={theme}>
        <Row
          theme={theme}
          icon="info"
          title="Tentang Zenith"
          subtitle="Versi, kredit, lisensi"
          onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'about' })}
          last
        />
      </ListSection>

      {/* ---------------- lembar: tambah mesin ---------------- */}
      <Sheet visible={addEngine} onClose={() => setAddEngine(false)} title="Mesin pencari baru" theme={theme}>
        <View style={{ padding: spacing.lg }}>
          <TextField
            theme={theme}
            label="Nama"
            value={engineForm.name}
            onChangeText={(t) => setEngineForm({ ...engineForm, name: t })}
            placeholder="Contoh: Qwant"
          />
          <TextField
            theme={theme}
            label="URL pencarian (pakai %s untuk kueri)"
            value={engineForm.url}
            onChangeText={(t) => setEngineForm({ ...engineForm, url: t })}
            placeholder="https://www.qwant.com/?q=%s"
            keyboardType="url"
          />
          <TextField
            theme={theme}
            label="URL saran (opsional)"
            value={engineForm.suggest}
            onChangeText={(t) => setEngineForm({ ...engineForm, suggest: t })}
            placeholder="https://api.aco.qwant.com/v3/suggest?q=%s"
            keyboardType="url"
          />
          <Button label="Simpan" theme={theme} onPress={saveEngine} />
        </View>
      </Sheet>

      {/* ---------------- lembar: impor daftar blokir ---------------- */}
      <Sheet visible={importList} onClose={() => setImportList(false)} title="Impor daftar blokir" theme={theme}>
        <View style={{ padding: spacing.lg }}>
          <TextField
            theme={theme}
            label="URL berkas hosts"
            value={listUrl}
            onChangeText={setListUrl}
            placeholder="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
            keyboardType="url"
          />
          <Text style={{ color: theme.subtext, fontSize: 12.5, marginBottom: 10 }}>
            Mode:
          </Text>
          <SegmentedControl
            theme={theme}
            value={listMode}
            onValueChange={setListMode}
            options={[
              { value: 'replace', label: 'Ganti' },
              { value: 'merge', label: 'Tambahkan' },
            ]}
          />
          <View style={{ marginTop: 16 }}>
            <Button
              label={importing ? 'Mengimpor…' : 'Impor'}
              theme={theme}
              disabled={importing}
              onPress={doImportList}
            />
          </View>
        </View>
      </Sheet>
    </ScreenShell>
  );
}
