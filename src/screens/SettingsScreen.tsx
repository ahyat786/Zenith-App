/**
 * SettingsScreen — pengaturan Zenith.
 * Bagian mesin pencari mengikuti manual Zen (templat URL dengan %s,
 * kata kunci, saran), bagian situs mengikuti Via (JS/UA/iklan per situs).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Icon } from '../ui/Icon';
import { SettingsHome, type SettingsPanel, type SettingsRow } from './SettingsHome';

import { useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import {
  Button,
  IconButton,
  ListSection,
  Row,
  SegmentedControl,
  Sheet,
  TextField,
  ToggleRow,
} from '../ui/kit';
import { adblockInit, adblockResetStats, adblockStats, openPrivateDnsSettings, type AdblockStats } from '../core/native';
import { uid } from '../state/defaults';
import { useHardwareBack } from '../browser/backStack';
import type { SearchEngine } from '../types';
import {
  DNS_PRESETS,
  DNS_SERVERS,
  dnsServerById,
  runDnsTest,
  type DnsTestResult,
} from '../core/dns';

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
  const [panel, setPanel] = useState<SettingsPanel>('home');
  const [filtering, setFiltering] = useState(false);
  const [settingsQuery, setSettingsQuery] = useState('');

  // ---------- Jaringan & DNS Aman (Shield Guard) ----------
  const dns = s.dns;
  const [picker, setPicker] = useState<{ group: 'ns' | 'fb'; slot: number } | null>(null);
  const [testHost, setTestHost] = useState('google.com');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DnsTestResult | null>(null);

  useHardwareBack(true, () => {
    if (picker) {
      setPicker(null);
      return true;
    }
    if (addEngine) {
      setAddEngine(false);
      return true;
    }
    if (importList) {
      setImportList(false);
      return true;
    }
    if (panel !== 'home') {
      setPanel('home');
      return true;
    }
    return false;
  });

  const setDns = (patch: Partial<typeof dns>) =>
    dispatch({ type: 'SET_SETTINGS', patch: { dns: { ...dns, ...patch } } });

  const applyPreset = (preset: 'id' | 'global' | 'adguard') =>
    setDns({ preset, nameservers: [...DNS_PRESETS[preset].nameservers], fallbacks: [...DNS_PRESETS[preset].fallbacks] });

  const pickServer = (id: string) => {
    if (!picker) {
      return;
    }
    const key = picker.group === 'ns' ? 'nameservers' : 'fallbacks';
    const arr = [...dns[key]];
    arr[picker.slot] = id;
    setDns({ [key]: arr, preset: 'custom' } as Partial<typeof dns>);
    setPicker(null);
  };

  const runTest = async () => {
    const host = testHost.trim().replace(/^https?:\/\//, '').split('/')[0];
    if (!host) {
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await runDnsTest(dns, host));
    } finally {
      setTesting(false);
    }
  };

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

  const engineName = s.engines.find((e) => e.id === s.defaultEngineId)?.name ?? 'Mesin pencari';
  const themeLabel = s.theme === 'dark' ? 'Gelap' : s.theme === 'light' ? 'Terang' : 'Mengikuti sistem';
  const settingsRows: SettingsRow[] = [
    { id: 'tentang', title: 'Tentang Zenith', subtitle: 'v0.5.2 · Browser Cepat & Privat', screen: 'about' },
    { id: 'umum', title: 'Umum', subtitle: themeLabel, panel: 'tampilan' },
    { id: 'cari', title: 'Cari', subtitle: engineName, panel: 'cari' },
    { id: 'tab', title: 'Tab', subtitle: s.barPosition === 'top' ? 'Bar di atas' : 'Bar di bawah', panel: 'tab' },
    { id: 'beranda', title: 'Beranda', subtitle: 'Laman tab baru', panel: 'beranda' },
    { id: 'ubahsuai', title: 'Ubahsuai', subtitle: 'Ekstensi, skrip, situs', panel: 'ubahsuai' },
    { id: 'privasi', title: 'Privasi dan keamanan', subtitle: s.httpsUpgrades ? 'HTTPS hidup' : 'HTTPS mati', panel: 'privasi' },
    { id: 'perisai', title: 'Pemblokir iklan', subtitle: s.adblockEnabled ? 'Aktif' : 'Mati', panel: 'perisai' },
    { id: 'jaringan', title: 'Jaringan & DNS', subtitle: 'Shield Guard', panel: 'jaringan' },
    { id: 'data', title: 'Data', subtitle: `${state.history.length} riwayat`, panel: 'data' },
    { id: 'sandi', title: 'Sandi', subtitle: 'Tidak disimpan di Zenith', screen: 'passwords' },
    { id: 'unduh', title: 'Unduhan', subtitle: 'Riwayat berkas', screen: 'downloads' },
  ];
  const panelTitle: Record<SettingsPanel, string> = {
    home: 'Pengaturan',
    tampilan: 'Umum',
    tab: 'Tab',
    cari: 'Cari',
    perisai: 'Pemblokir iklan',
    privasi: 'Privasi dan keamanan',
    jaringan: 'Jaringan & DNS',
    data: 'Data',
    beranda: 'Beranda',
    ubahsuai: 'Ubahsuai',
  };

  return (
    <ScreenShell
      title={panelTitle[panel]}
      onBack={() => (panel === 'home' ? dispatch({ type: 'SET_SCREEN', screen: 'browser' }) : setPanel('home'))}
      theme={theme}
      right={
        panel === 'home' ? (
          <IconButton name="search" theme={theme} onPress={() => setFiltering((v) => !v)} />
        ) : undefined
      }>
      {panel === 'home' ? (
        <SettingsHome
          theme={theme}
          rows={settingsRows}
          filtering={filtering}
          query={settingsQuery}
          onQuery={setSettingsQuery}
          onAccount={() => dispatch({ type: 'SET_SCREEN', screen: 'account' })}
          onRow={(row) => {
            if (row.screen) {
              dispatch({ type: 'SET_SCREEN', screen: row.screen });
              return;
            }
            if (row.panel) {
              setPanel(row.panel);
            }
          }}
        />
      ) : null}
      {/* ---------------- Tampilan / Tab ---------------- */}
      {panel === 'tampilan' || panel === 'tab' ? (
      <ListSection title={panel === 'tab' ? 'Tab' : 'Tampilan'} theme={theme}>
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
              { value: 'bottom', label: 'Bawah' },
              { value: 'top', label: 'Atas' },
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
      ) : null}

      {/* ---------------- Pencarian ---------------- */}
      {panel === 'cari' ? (
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
          subtitle="URL dengan %s untuk kueri"
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
      ) : null}

      {/* ---------------- Pemblokir iklan ---------------- */}
      {panel === 'perisai' ? (
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
      ) : null}

      {/* ---------------- Privasi & unduhan (Brave + Via) ---------------- */}
      {panel === 'privasi' ? (
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
          title="Unduhan cepat"
          subtitle="Kecepatan penuh. Matikan untuk memakai unduhan sistem"
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
      ) : null}

      {/* ---------------- Jaringan & DNS Aman (Shield Guard) ---------------- */}
      {panel === 'jaringan' ? (
      <ListSection title="Jaringan & DNS Aman (Shield Guard)" theme={theme}>
        <View style={{ paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 4 }}>
          <Text style={{ color: theme.subtext, fontSize: 12.5, fontWeight: '600', marginBottom: 8 }}>
            Preset kelompok server
          </Text>
          <SegmentedControl
            theme={theme}
            value={dns.preset === 'custom' ? 'custom' : dns.preset}
            onValueChange={(v) => {
              if (v === 'id' || v === 'global' || v === 'adguard') {
                applyPreset(v);
              }
            }}
            options={[
              { value: 'id', label: 'ID' },
              { value: 'global', label: 'Quad9' },
              { value: 'adguard', label: 'AdGuard' },
              { value: 'custom', label: 'Kustom' },
            ]}
          />
          {dns.preset === 'custom' ? (
            <Text style={{ color: theme.subtext, fontSize: 11.5, marginTop: 6 }}>
              Susunan kustom — ubah slot server di bawah untuk menyesuaikan.
            </Text>
          ) : null}
        </View>

        {/* --- kelompok server --- */}
        {([
          { key: 'ns' as const, title: 'NameServer — utama', ids: dns.nameservers, hint: 'Ditanya lebih dulu' },
          { key: 'fb' as const, title: 'FallBack — cadangan', ids: dns.fallbacks, hint: 'Dipakai bila utama gagal / terindikasi dibajak' },
        ]).map((g) => (
          <View key={g.key} style={{ paddingHorizontal: spacing.md, paddingTop: 10 }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 10 }}>
              <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '800' }}>{g.title}</Text>
              <Text style={{ color: theme.subtext, fontSize: 11.5, marginBottom: 4 }}>{g.hint}</Text>
              {g.ids.map((id, i) => {
                const d = dnsServerById(id);
                return (
                  <Pressable
                    key={`${g.key}-${i}`}
                    onPress={() => setPicker({ group: g.key, slot: i })}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: pressed ? theme.surface2 : theme.pill,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      marginTop: 6,
                    })}>
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        marginRight: 10,
                        backgroundColor: g.key === 'ns' ? theme.accent : theme.warn,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '700' }}>
                        {d?.name ?? 'Pilih server…'}
                      </Text>
                      <Text style={{ color: theme.subtext, fontSize: 11.5 }}>
                        {d ? `${d.type} • ${d.ip ?? d.endpoint.replace(/^https?:\/\//, '')} : ${d.port}` : 'ketuk untuk memilih'}
                        {d?.note ? ` — ${d.note}` : ''}
                      </Text>
                    </View>
                    <Icon name="chevronDown" size={15} color={theme.subtext} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {/* --- uji resolusi --- */}
        <View style={{ paddingHorizontal: spacing.md, paddingTop: 12 }}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 10 }}>
            <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '800' }}>Uji resolusi DNS (DoH)</Text>
            <Text style={{ color: theme.subtext, fontSize: 11.5, marginBottom: 6 }}>
              Kueri wireformat asli (RFC 8484) — kompatibel semua server di atas.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={testHost}
                onChangeText={setTestHost}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="google.com"
                placeholderTextColor={theme.subtext}
                style={{
                  flex: 1,
                  color: theme.text,
                  fontSize: 14,
                  backgroundColor: theme.pill,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              />
              <View style={{ marginLeft: 8 }}>
                <Button label={testing ? 'Menguji…' : 'Uji'} theme={theme} small disabled={testing} onPress={runTest} />
              </View>
            </View>

            {testing ? (
              <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 8 }}>Menghubungi kelompok utama lalu cadangan…</Text>
            ) : null}

            {testResult ? (
              <View style={{ marginTop: 8 }}>
                <View
                  style={{
                    backgroundColor: testResult.hijacked
                      ? theme.warn + '22'
                      : testResult.answerIp
                        ? theme.ok + '1c'
                        : theme.surface2,
                    borderRadius: 8,
                    padding: 8,
                    marginBottom: 6,
                  }}>
                  <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '700' }}>
                    {testResult.hijacked ? '⚠️ ' : testResult.answerIp ? '✅ ' : '❌ '}
                    {testResult.verdict}
                  </Text>
                </View>
                {testResult.entries.map((e, i) => (
                  <View
                    key={`${e.serverId}-${i}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 4,
                    }}>
                    <Text
                      style={{
                        color: e.group === 'UTAMA' ? theme.accent : theme.warn,
                        fontSize: 10,
                        fontWeight: '800',
                        width: 62,
                      }}>
                      {e.group}
                    </Text>
                    <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '600', width: 110 }} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={{ color: theme.subtext, fontSize: 11.5, flex: 1 }} numberOfLines={2}>
                      {e.ok
                        ? e.ips.length
                          ? `${e.ms} ms • ${e.ips.slice(0, 2).join(', ')}${e.ips.length > 2 ? ` +${e.ips.length - 2}` : ''}${e.suspicious ? ' • ⚠️ IP privat/tercadang' : ''}`
                          : `${e.ms} ms • tanpa jawaban`
                        : e.note ?? e.error ?? 'gagal'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {/* --- DNS Privat + catatan jujur --- */}
        {(() => {
          const dot = [...dns.nameservers, ...dns.fallbacks].map(dnsServerById).find((d) => d?.type === 'DoT');
          return (
            <Row
              theme={theme}
              icon="lock"
              title="Buka Pengaturan DNS Privat (DoT)"
              subtitle={dot ? `Isi hostname: ${dot.endpoint}` : 'Aktifkan DoT Android untuk semua koneksi'}
              onPress={() => openPrivateDnsSettings()}
            />
          );
        })()}
        <Row
          theme={theme}
          icon="info"
          title="GEOIP & GEOSite"
          subtitle="geoip: true · geoip-code: ID · domain +.google.com +.facebook.com +.youtube.com +.googlevideo.com +.* — setiap hostname dibandingkan dan masuk log koneksi"
        />
        <Row
          theme={theme}
          icon="warning"
          title="Catatan jujur"
          subtitle="Server di atas dipakai untuk uji resolusi & panduan DoT. Menerapkan DNS ke SEMUA koneksi lewat DNS Privat Android. Blokir DPI/SNI tak bisa dilewati browser mana pun tanpa VPN."
          last
        />
      </ListSection>
      ) : null}

      {/* ---------------- Data ---------------- */}
      {panel === 'data' ? (
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
      ) : null}

      {panel === 'beranda' ? (
        <ListSection title="Laman tab baru" theme={theme}>
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: theme.subtext, fontSize: 13.5, lineHeight: 20, marginBottom: 12 }}>
              Tombol + membuka laman tab baru lengkap — pencarian, pintasan, dan riwayat. Bukan hanya bilah alamat.
            </Text>
            <TextField
              theme={theme}
              label="Pintasan beranda (opsional)"
              value={s.homepage}
              onChangeText={(t) => dispatch({ type: 'SET_SETTINGS', patch: { homepage: t } })}
              placeholder="https://"
              keyboardType="url"
            />
          </View>
        </ListSection>
      ) : null}

      {panel === 'ubahsuai' ? (
        <ListSection title="Ubahsuai" theme={theme}>
          <Row
            theme={theme}
            icon="puzzle"
            title="Ekstensi"
            subtitle={`${state.extensions.length} terpasang`}
            onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'extensions' })}
          />
          <Row
            theme={theme}
            icon="code"
            title="Skrip"
            subtitle={`${state.scripts.length} skrip`}
            onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'scripts' })}
          />
          <Row
            theme={theme}
            icon="globe"
            title="Pengaturan situs"
            subtitle="JS, iklan, UA, CSS per situs"
            onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'siteSettings' })}
            last
          />
        </ListSection>
      ) : null}

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

      {/* ---------------- lembar: pilih server DNS ---------------- */}
      <Sheet
        visible={!!picker}
        onClose={() => setPicker(null)}
        title={picker ? `Server ${picker.group === 'ns' ? 'utama' : 'cadangan'} #${picker.slot + 1}` : undefined}
        theme={theme}>
        <View style={{ padding: spacing.md }}>
          {DNS_SERVERS.map((d) => {
            const active =
              picker && (picker.group === 'ns' ? dns.nameservers : dns.fallbacks)[picker.slot] === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => pickServer(d.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: active ? theme.accentSoft : pressed ? theme.surface2 : theme.surface,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: active ? theme.accent : theme.border,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  marginBottom: 6,
                })}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    backgroundColor: (d.type === 'DoH' ? theme.accent : theme.warn) + '26',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}>
                  <Icon name={d.type === 'DoH' ? 'globe' : 'lock'} size={16} color={d.type === 'DoH' ? theme.accent : theme.warn} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{d.name}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 11.5 }}>
                    {d.type} • {d.ip ?? d.endpoint.replace(/^https?:\/\//, '')} : {d.port}
                    {d.note ? ` — ${d.note}` : ''}
                  </Text>
                </View>
                {active ? <Icon name="check" size={17} color={theme.accent} /> : null}
              </Pressable>
            );
          })}
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
