/**
 * ExtensionsScreen — manajer ekstensi Chrome.
 * Mengimpor .zip ekstensi Chrome (MV2/MV3), mem-parse manifest di inti Rust,
 * lalu menyuntikkan content scripts (js/css) yang cocok.
 *
 * Catatan subset: background/service worker TIDAK dijalankan (batas WebView);
 * yang didukung: content_scripts + shim chrome.storage/runtime minimal.
 */

import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import JSZip from 'jszip';
import { useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import {
  ActionSheet,
  Button,
  EmptyState,
  Row,
  Sheet,
  TextField,
  type SheetAction,
} from '../ui/kit';
import { parseExtensionManifest } from '../core/native';
import { EXAMPLE_EXTENSIONS } from '../core/examples';
import type { Extension } from '../types';
import { useHardwareBack } from '../browser/backStack';

const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export function ExtensionsScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Extension | null>(null);

  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });

  useHardwareBack(true, () => {
    if (importOpen) {
      setImportOpen(false);
      return true;
    }
    if (detail) {
      setDetail(null);
      return true;
    }
    if (addOpen) {
      setAddOpen(false);
      return true;
    }
    return false;
  });

  const installFromZipData = async (data: ArrayBuffer, _sourceName?: string) => {
    const zip = await JSZip.loadAsync(data);
    const manifestFile = zip.file('manifest.json') ?? zip.file(/(^|\/)manifest\.json$/)[0];
    if (!manifestFile) {
      throw new Error('manifest.json tidak ditemukan di dalam ZIP');
    }
    const manifestText = await manifestFile.async('string');
    const parsed = await parseExtensionManifest(manifestText);
    if (!parsed.ok || !parsed.extension) {
      throw new Error(parsed.error ?? 'manifest tidak valid');
    }
    const ext = parsed.extension;

    // kumpulkan berkas js/css yang dirujuk content_scripts
    const files: Record<string, string> = {};
    let total = 0;
    let count = 0;
    for (const cs of ext.contentScripts ?? []) {
      for (const path of [...(cs.js ?? []), ...(cs.css ?? [])]) {
        if (count >= MAX_FILES || total >= MAX_TOTAL_BYTES) {
          break;
        }
        const entry = zip.file(path) ?? zip.file(new RegExp(`(^|/)${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))[0];
        if (!entry) {
          continue;
        }
        const content = await entry.async('string');
        files[path] = content;
        total += content.length;
        count += 1;
      }
    }

    const extension: Extension = {
      id: ext.id,
      name: ext.name,
      version: ext.version,
      description: ext.description,
      manifestVersion: ext.manifestVersion,
      permissions: ext.permissions ?? [],
      hostPermissions: ext.hostPermissions ?? [],
      contentScripts: ext.contentScripts ?? [],
      enabled: true,
      hasBackground: !!ext.hasBackground,
      iconLetter: (ext.name || '?').charAt(0).toUpperCase(),
      files,
      importedAt: Date.now(),
    };
    dispatch({ type: 'ADD_EXTENSION', extension });
    Alert.alert(
      'Ekstensi terpasang',
      `${extension.name} v${extension.version} • ${Object.keys(files).length} berkas konten${extension.hasBackground ? '\n\n⚠️ Latar (service worker) tidak dijalankan di WebView — hanya content scripts.' : ''}`,
    );
  };

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('URL tidak valid', 'Masukkan URL berkas .zip ekstensi (http/https).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      await installFromZipData(buf, url);
      setImportOpen(false);
      setImportUrl('');
    } catch (e: any) {
      Alert.alert('Gagal mengimpor', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const installExample = async (ex: (typeof EXAMPLE_EXTENSIONS)[number]) => {
    const parsed = await parseExtensionManifest(ex.manifest);
    if (!parsed.ok || !parsed.extension) {
      Alert.alert('Gagal', parsed.error ?? 'manifest contoh tidak valid');
      return;
    }
    const ext = parsed.extension;
    dispatch({
      type: 'ADD_EXTENSION',
      extension: {
        id: ext.id,
        name: ext.name,
        version: ext.version,
        description: ext.description,
        manifestVersion: ext.manifestVersion,
        permissions: ext.permissions ?? [],
        hostPermissions: ext.hostPermissions ?? [],
        contentScripts: ext.contentScripts ?? [],
        enabled: true,
        hasBackground: !!ext.hasBackground,
        iconLetter: (ext.name || '?').charAt(0).toUpperCase(),
        files: ex.files,
        importedAt: Date.now(),
      },
    });
    Alert.alert('Ekstensi contoh dipasang', `${ex.title} aktif di semua situs http/https.`);
  };

  const addActions: SheetAction[] = [
    { label: 'Impor ZIP dari URL', icon: 'download', onPress: () => setImportOpen(true) },
    ...EXAMPLE_EXTENSIONS.map((ex): SheetAction => ({
      label: `Contoh: ${ex.title}`,
      icon: 'zap',
      onPress: () => installExample(ex),
    })),
  ];

  return (
    <ScreenShell
      title="Ekstensi"
      subtitle={`${state.extensions.filter((e) => e.enabled).length} aktif dari ${state.extensions.length}`}
      onBack={back}
      theme={theme}>
      {state.extensions.length === 0 ? (
        <View style={{ padding: spacing.lg, gap: 10 }}>
          <EmptyState
            theme={theme}
            icon="puzzle"
            title="Belum ada ekstensi"
            subtitle="Pasang contoh bawaan, atau impor ZIP Chrome yang berisi manifest.json. Hanya content scripts yang dijalankan."
          />
          {EXAMPLE_EXTENSIONS.map((ex) => (
            <Button key={ex.title} label={`Pasang ${ex.title}`} theme={theme} onPress={() => installExample(ex)} />
          ))}
          <Button label="Impor ZIP dari URL" kind="secondary" theme={theme} onPress={() => setImportOpen(true)} />
        </View>
      ) : null}

      {state.extensions.map((ext, i) => (
        <Row
          key={ext.id + ext.importedAt}
          theme={theme}
          title={`${ext.iconLetter}  ${ext.name}`}
          subtitle={`v${ext.version} • MV${ext.manifestVersion} • ${ext.contentScripts.length} skrip konten${ext.hasBackground ? ' • latar ⚠️' : ''}`}
          right={
            ext.enabled ? (
              <Text style={{ color: theme.ok, fontWeight: '800', fontSize: 12.5 }}>AKTIF</Text>
            ) : (
              <Text style={{ color: theme.subtext, fontWeight: '800', fontSize: 12.5 }}>MATI</Text>
            )
          }
          onPress={() => setDetail(ext)}
          onLongPress={() =>
            Alert.alert('Hapus ekstensi?', `${ext.name} v${ext.version}`, [
              { text: 'Batal', style: 'cancel' },
              { text: 'Hapus', style: 'destructive', onPress: () => dispatch({ type: 'DEL_EXTENSION', id: ext.id }) },
            ])
          }
          last={i === state.extensions.length - 1}
        />
      ))}

      {state.extensions.length > 0 ? (
        <View style={{ padding: spacing.lg, gap: 10 }}>
          <Button label="＋ Pasang ekstensi" theme={theme} onPress={() => setAddOpen(true)} />
        </View>
      ) : null}

      <ActionSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Pasang ekstensi"
        actions={addActions}
        theme={theme}
      />

      <Sheet visible={importOpen} onClose={() => setImportOpen(false)} title="Impor ZIP ekstensi" theme={theme}>
        <View style={{ padding: spacing.lg }}>
          <TextField
            theme={theme}
            label="URL .zip ekstensi"
            value={importUrl}
            onChangeText={setImportUrl}
            placeholder="https://…/ekstensi.zip"
            keyboardType="url"
          />
          <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 12 }}>
            Ekstensi berisi manifest.json (MV2/MV3). Content scripts (js/css) akan disuntik
            otomatis sesuai pola matches. Unduh zip ekstensi dari CWS atau sumber lain.
          </Text>
          <Button label={busy ? 'Mengunduh…' : 'Unduh & pasang'} theme={theme} disabled={busy} onPress={importFromUrl} />
        </View>
      </Sheet>

      {/* detail */}
      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail?.name} theme={theme}>
        {detail ? (
          <View style={{ padding: spacing.lg, gap: 12 }}>
            <Text style={{ color: theme.subtext, fontSize: 13.5, lineHeight: 19 }}>
              {detail.description ?? 'Tanpa deskripsi.'}
            </Text>
            <Info theme={theme} label="Versi" value={`v${detail.version} (Manifest V${detail.manifestVersion})`} />
            <Info
              theme={theme}
              label="Izin"
              value={detail.permissions.length ? detail.permissions.join(', ') : '—'}
            />
            <Info
              theme={theme}
              label="Host"
              value={detail.hostPermissions.length ? detail.hostPermissions.join(', ') : '—'}
            />
            <Info
              theme={theme}
              label="Skrip konten"
              value={detail.contentScripts
                .map((cs) => `${cs.matches.join(' | ')} → ${cs.js.length} js, ${cs.css.length} css (${cs.runAt})`)
                .join('\n') || '—'}
            />
            <Info theme={theme} label="Berkas dimuat" value={`${Object.keys(detail.files).length} berkas`} />
            {detail.hasBackground ? (
              <Text style={{ color: theme.warn, fontSize: 12.5, lineHeight: 18 }}>
                ⚠️ Ekstensi ini punya latar (service worker/scripts) — tidak dijalankan di WebView.
                Hanya content scripts yang aktif.
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={detail.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                  kind="secondary"
                  theme={theme}
                  onPress={() => {
                    dispatch({ type: 'UPDATE_EXTENSION', id: detail.id, patch: { enabled: !detail.enabled } });
                    setDetail(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Hapus"
                  kind="danger"
                  theme={theme}
                  onPress={() => {
                    dispatch({ type: 'DEL_EXTENSION', id: detail.id });
                    setDetail(null);
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}
      </Sheet>
    </ScreenShell>
  );
}

function Info({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View>
      <Text style={{ color: theme.subtext, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ color: theme.text, fontSize: 13.5, lineHeight: 19 }}>{value}</Text>
    </View>
  );
}
