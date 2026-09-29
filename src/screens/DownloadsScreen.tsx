/**
 * Unduhan — riwayat tersimpan, dikelompokkan, dan hapus yang bisa
 * memilih baris saja atau ikut menghapus berkas.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import { Button, EmptyState, IconButton, ListSection, Row, TextField } from '../ui/kit';
import { Icon } from '../ui/Icon';
import {
  cancelDownload,
  downloadCategory,
  downloadsAvailable,
  listDownloads,
  openDownload,
  removeDownload,
  shareDownload,
  startDownload,
  subscribeDownloads,
  type DownloadCategory,
  type DownloadJob,
} from '../core/downloads';

const CATEGORIES: DownloadCategory[] = ['APK', 'Gambar', 'Video', 'Audio', 'Dokumen', 'Arsip', 'Lainnya'];

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
    return '';
  }
  if (n < 1048576) {
    return `${(n / 1024).toFixed(0)} KB/s`;
  }
  return `${(n / 1048576).toFixed(1)} MB/s`;
}

function fmtWhen(ms?: number): string {
  if (!ms) {
    return '';
  }
  try {
    return new Date(ms).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function DownloadsScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [url, setUrl] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<'Semua' | DownloadCategory>('Semua');

  const refresh = useCallback(async () => {
    setJobs(await listDownloads());
  }, []);

  useEffect(() => {
    refresh();
    return subscribeDownloads(() => {
      refresh();
    });
  }, [refresh]);

  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });

  const q = query.trim().toLowerCase();
  const filteredBySearch = q
    ? jobs.filter((j) => `${j.filename} ${j.url}`.toLowerCase().includes(q))
    : jobs;

  const shown = selectedCat === 'Semua'
    ? filteredBySearch
    : filteredBySearch.filter((j) => downloadCategory(j) === selectedCat);

  const totalUsedBytes = useMemo(() => {
    return jobs.reduce((acc, j) => acc + (j.total > 0 ? j.total : j.done || 0), 0);
  }, [jobs]);

  const active = shown.filter((j) => j.status === 'connecting' || j.status === 'downloading');
  const failed = useMemo(() => {
    const latest = new Map<string, DownloadJob>();
    for (const job of shown) {
      if (job.status !== 'error' && job.status !== 'canceled') {
        continue;
      }
      const key = job.url || job.filename;
      const prev = latest.get(key);
      if (!prev || (job.finishedAt || 0) >= (prev.finishedAt || 0)) {
        latest.set(key, job);
      }
    }
    return [...latest.values()];
  }, [shown]);
  const done = shown.filter((j) => j.status === 'done');
  const grouped = useMemo(() => {
    const map = new Map<DownloadCategory, DownloadJob[]>();
    for (const job of done) {
      const cat = downloadCategory(job);
      const list = map.get(cat) ?? [];
      list.push(job);
      map.set(cat, list);
    }
    return CATEGORIES.filter((c) => (map.get(c)?.length ?? 0) > 0).map((c) => ({ cat: c, items: map.get(c)! }));
  }, [done]);

  const startManual = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      Alert.alert('URL tidak valid', 'Masukkan URL unduhan http/https.');
      return;
    }
    const id = await startDownload(u);
    if (!id && !downloadsAvailable) {
      Alert.alert('Tidak tersedia', 'Modul unduhan native tidak aktif di build ini.');
      return;
    }
    setUrl('');
    refresh();
  };

  const askRemove = (job: DownloadJob) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus dari daftar', onPress: () => removeDownload(job.id, false).then(refresh) },
    ];
    if (job.fileExists !== false) {
      buttons.push({
        text: 'Hapus berkas',
        style: 'destructive',
        onPress: () => removeDownload(job.id, true).then(refresh),
      });
    }
    Alert.alert(
      'Hapus unduhan?',
      job.fileExists === false
        ? `${job.filename}\nBerkas sudah tidak ada. Hapus baris riwayat ini?`
        : `${job.filename}\nHapus dari daftar saja, atau hapus berkas di perangkat juga?`,
      buttons,
    );
  };

  const openJob = async (job: DownloadJob) => {
    try {
      await openDownload(job.id);
    } catch (e: any) {
      Alert.alert('Tidak dapat membuka', String(e?.message ?? e));
    }
  };

  return (
    <ScreenShell
      title="Unduhan"
      onBack={back}
      theme={theme}
      right={
        <IconButton
          name={searchOpen ? 'close' : 'search'}
          theme={theme}
          onPress={() => {
            setSearchOpen((open) => {
              if (open) {
                setQuery('');
              }
              return !open;
            });
          }}
        />
      }>
      {searchOpen ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <TextField theme={theme} value={query} onChangeText={setQuery} placeholder="Cari berkas atau URL" />
        </View>
      ) : null}

      {/* Info Ruang Terpakai ala Brave */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 6 }}>
        <Text style={{ color: theme.subtext, fontSize: 13, fontWeight: '500' }}>
          {fmtBytes(totalUsedBytes)} terpakai di perangkat
        </Text>
      </View>

      {/* Tabs Kategori ala Brave Download */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8 }}>
        {(['Semua', ...CATEGORIES] as const).map((cat) => {
          const isSel = selectedCat === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => setSelectedCat(cat)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: isSel ? theme.accent : theme.surface2,
                borderWidth: 1,
                borderColor: isSel ? theme.accent : theme.border,
              }}>
              {isSel ? <Icon name="check" size={14} color="#fff" /> : null}
              <Text
                style={{
                  color: isSel ? '#fff' : theme.text,
                  fontSize: 13,
                  fontWeight: isSel ? '700' : '500',
                  marginLeft: isSel ? 6 : 0,
                }}>
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!downloadsAvailable ? (
        <EmptyState
          theme={theme}
          icon="download"
          title="Unduhan native tidak aktif"
          subtitle="Build ini tidak memuat modul unduhan Zenith. Bangun ulang APK dari source lengkap."
        />
      ) : null}

      <ListSection title="Unduh dari URL" theme={theme}>
        <View style={{ padding: spacing.md }}>
          <TextField
            theme={theme}
            value={url}
            onChangeText={setUrl}
            placeholder="https://contoh.com/berkas.apk"
            keyboardType="url"
          />
          <Button label="⬇ Mulai unduhan" theme={theme} onPress={startManual} disabled={!downloadsAvailable} />
        </View>
      </ListSection>

      <ListSection title={`Sedang berlangsung (${active.length})`} theme={theme}>
        {active.length === 0 ? (
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: theme.subtext, fontSize: 13.5 }}>Tidak ada unduhan aktif.</Text>
          </View>
        ) : (
          active.map((job, i) => {
            const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : -1;
            const speed = fmtSpeed(job.speed);
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
                  {job.done <= 0
                    ? 'Menunggu data…'
                    : `${pct >= 0 ? pct + '% · ' : ''}${fmtBytes(job.done)}${job.total > 0 ? ' / ' + fmtBytes(job.total) : ''}${speed ? ' · ' + speed : ''}`}
                </Text>
              </View>
            );
          })
        )}
      </ListSection>

      {grouped.map(({ cat, items }) => (
        <ListSection key={cat} title={`${cat} (${items.length})`} theme={theme}>
          {items.map((job) => (
            <Row
              key={job.id}
              theme={theme}
              icon={cat === 'APK' ? 'phone' : 'check'}
              title={job.filename}
              subtitle={[fmtBytes(job.total > 0 ? job.total : job.done), fmtWhen(job.finishedAt), job.fileExists === false ? 'berkas sudah tidak ada' : 'ketuk untuk membuka']
                .filter(Boolean)
                .join(' · ')}
              onPress={() => openJob(job)}
              right={
                <View style={{ flexDirection: 'row' }}>
                  <Pressable hitSlop={8} onPress={() => shareDownload(job.id).catch((e) => Alert.alert('Tidak dapat berbagi', String(e?.message ?? e)))} style={{ padding: 6 }}>
                    <Icon name="share" size={17} color={theme.subtext} />
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => askRemove(job)} style={{ padding: 6 }}>
                    <Icon name="trash" size={17} color={theme.danger} />
                  </Pressable>
                </View>
              }
            />
          ))}
        </ListSection>
      ))}

      {failed.length > 0 ? (
        <ListSection
          title={`Gagal (${failed.length})`}
          theme={theme}
          right={
            <Pressable
              onPress={() => {
                for (const job of jobs) {
                  if (job.status === 'error' || job.status === 'canceled') {
                    removeDownload(job.id, false).catch(() => {});
                  }
                }
                setTimeout(refresh, 200);
              }}>
              <Text style={{ color: theme.subtext, fontSize: 12, fontWeight: '700' }}>Bersihkan</Text>
            </Pressable>
          }>
          {failed.map((job) => (
            <Row
              key={job.id}
              theme={theme}
              icon="warning"
              title={job.filename}
              subtitle={job.error || (job.status === 'canceled' ? 'Dibatalkan' : 'Gagal')}
              onPress={() => startDownload(job.url, job.filename, job.mime).then(refresh)}
              right={
                <Pressable hitSlop={8} onPress={() => askRemove(job)} style={{ padding: 6 }}>
                  <Icon name="trash" size={17} color={theme.danger} />
                </Pressable>
              }
            />
          ))}
        </ListSection>
      ) : null}

      {done.length === 0 && failed.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <Text style={{ color: theme.subtext, fontSize: 13.5 }}>Belum ada riwayat unduhan.</Text>
        </View>
      ) : null}

      <View style={{ padding: spacing.lg }}>
        <Text style={{ color: theme.subtext, fontSize: 12, lineHeight: 18 }}>
          Riwayat tetap ada setelah aplikasi ditutup. Berkas selesai disimpan di Download/Zenith dan bisa dibuka dari aplikasi File.
          Hapus dari daftar tidak menghapus berkas; pilih hapus berkas bila ingin menghilangkannya.
        </Text>
      </View>
    </ScreenShell>
  );
}
