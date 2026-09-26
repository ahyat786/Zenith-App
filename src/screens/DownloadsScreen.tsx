/**
 * DownloadsScreen — manajer unduhan (ala Via: cepat, multi-thread).
 * Menampilkan unduhan aktif (progres + kecepatan + batal), selesai
 * (buka / bagikan / hapus), dan mulai unduhan manual dari URL.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import { Button, EmptyState, ListSection, Row, TextField } from '../ui/kit';
import { Icon } from '../ui/Icon';
import {
  cancelDownload,
  downloadsAvailable,
  listDownloads,
  openDownload,
  removeDownload,
  shareDownload,
  startDownload,
  subscribeDownloads,
  type DownloadJob,
} from '../core/downloads';

function fmtBytes(n: number): string {
  if (n < 0) {
    return '?';
  }
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1048576) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  if (n < 1073741824) {
    return `${(n / 1048576).toFixed(1)} MB`;
  }
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function fmtSpeed(n: number): string {
  if (n <= 0) {
    return '—';
  }
  if (n < 1048576) {
    return `${(n / 1024).toFixed(0)} KB/s`;
  }
  return `${(n / 1048576).toFixed(1)} MB/s`;
}

export function DownloadsScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [url, setUrl] = useState('');

  const refresh = useCallback(async () => {
    setJobs(await listDownloads());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeDownloads(() => {
      // perbarui daftar (ringan; list() cepat)
      refresh();
    });
    return unsub;
  }, [refresh]);

  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });

  const active = jobs.filter((j) => j.status === 'connecting' || j.status === 'downloading');
  const finished = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'error' || j.status === 'canceled');

  const startManual = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      Alert.alert('URL tidak valid', 'Masukkan URL unduhan http/https.');
      return;
    }
    const ok = await startDownload(u);
    if (!ok && !downloadsAvailable) {
      Alert.alert('Tidak tersedia', 'Modul unduhan native tidak aktif di build ini.');
      return;
    }
    setUrl('');
    refresh();
  };

  return (
    <ScreenShell
      title="Unduhan"
      subtitle={downloadsAvailable ? 'Multi-thread ala Via — 4 koneksi paralel' : 'Modul native tidak tersedia'}
      onBack={back}
      theme={theme}>
      {!downloadsAvailable ? (
        <EmptyState
          theme={theme}
          icon="download"
          title="Unduhan native tidak aktif"
          subtitle="Build ini tidak memuat modul unduhan Zenith. Bangun ulang APK dari source lengkap."
        />
      ) : null}

      {/* mulai manual */}
      <ListSection title="Unduh dari URL" theme={theme}>
        <View style={{ padding: spacing.md }}>
          <TextField
            theme={theme}
            value={url}
            onChangeText={setUrl}
            placeholder="https://contoh.com/berkas.zip"
            keyboardType="url"
          />
          <Button label="⬇ Mulai unduhan" theme={theme} onPress={startManual} disabled={!downloadsAvailable} />
        </View>
      </ListSection>

      {/* aktif */}
      <ListSection title={`Sedang berlangsung (${active.length})`} theme={theme}>
        {active.length === 0 ? (
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: theme.subtext, fontSize: 13.5 }}>Tidak ada unduhan aktif.</Text>
          </View>
        ) : (
          active.map((job, i) => {
            const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : -1;
            return (
              <View
                key={job.id}
                style={{
                  padding: spacing.md,
                  borderBottomWidth: i < active.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: theme.border,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="download" size={18} color={theme.accent} />
                  <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 14, fontWeight: '700', marginLeft: 10 }}>
                    {job.filename}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => cancelDownload(job.id)}>
                    <Icon name="close" size={17} color={theme.danger} />
                  </Pressable>
                </View>
                <View style={{ height: 5, backgroundColor: theme.surface2, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: 5,
                      width: pct >= 0 ? `${pct}%` : '35%',
                      backgroundColor: theme.accent,
                      borderRadius: 3,
                    }}
                  />
                </View>
                <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>
                  {job.status === 'connecting'
                    ? 'Menghubungkan…'
                    : `${pct >= 0 ? pct + '% • ' : ''}${fmtBytes(job.done)}${job.total > 0 ? ' / ' + fmtBytes(job.total) : ''} • ${fmtSpeed(job.speed)}`}
                </Text>
              </View>
            );
          })
        )}
      </ListSection>

      {/* selesai */}
      <ListSection title={`Selesai (${finished.length})`} theme={theme}>
        {finished.length === 0 ? (
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: theme.subtext, fontSize: 13.5 }}>Belum ada unduhan selesai.</Text>
          </View>
        ) : (
          finished.map((job) => (
            <View key={job.id}>
              <Row
                theme={theme}
                icon="check"
                title={job.filename}
                subtitle={`${fmtBytes(job.total > 0 ? job.total : job.done)} • ketuk untuk membuka`}
                onPress={() => openDownload(job.id)}
                right={
                  <View style={{ flexDirection: 'row' }}>
                    <Pressable hitSlop={8} onPress={() => shareDownload(job.id)} style={{ padding: 6 }}>
                      <Icon name="share" size={17} color={theme.subtext} />
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => removeDownload(job.id)} style={{ padding: 6 }}>
                      <Icon name="trash" size={17} color={theme.danger} />
                    </Pressable>
                  </View>
                }
              />
            </View>
          ))
        )}
      </ListSection>

      {/* gagal/dibatalkan */}
      {failed.length > 0 ? (
        <ListSection title={`Dibatalkan / gagal (${failed.length})`} theme={theme}>
          {failed.map((job) => (
            <Row
              key={job.id}
              theme={theme}
              icon="warning"
              title={job.filename}
              subtitle={job.error ? `Gagal: ${job.error}` : 'Dibatalkan'}
              onPress={() => startDownload(job.url)}
              right={
                <Pressable hitSlop={8} onPress={() => removeDownload(job.id)} style={{ padding: 6 }}>
                  <Icon name="trash" size={17} color={theme.danger} />
                </Pressable>
              }
            />
          ))}
          <Row
            theme={theme}
            title="Coba lagi paling atas"
            subtitle="Ketuk item batal/gagal untuk mengunduh ulang"
            last
          />
        </ListSection>
      ) : null}

      <View style={{ padding: spacing.lg }}>
        <Text style={{ color: theme.subtext, fontSize: 12, lineHeight: 18 }}>
          Unduhan disimpan di penyimpanan aplikasi (Android/data/com.zenith.browser/files/Zenith)
          dan dibuka lewat sistem — privasi terjaga tanpa izin penyimpanan tambahan.
        </Text>
      </View>
    </ScreenShell>
  );
}

