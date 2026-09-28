/**
 * ScriptsScreen — manajer userscript.
 * Mendukung format Greasy Fork (`// ==UserScript==` dengan @match,
 * @include/@exclude, @run-at) — diparse oleh inti Rust.
 */

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { hostOfUrl, useStore } from '../state/store';
import { spacing, useTheme } from '../theme';
import { ScreenShell } from '../ui/ScreenShell';
import {
  ActionSheet,
  Button,
  EmptyState,
  Row,
  Sheet,
  TextField,
  ToggleRow,
  type SheetAction,
} from '../ui/kit';
import { Icon } from '../ui/Icon';
import { parseUserScript } from '../core/native';
import { EXAMPLE_SCRIPTS } from '../core/examples';
import { uid } from '../state/defaults';
import { useHardwareBack } from '../browser/backStack';
import type { UserScript } from '../types';

export function ScriptsScreen() {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserScript | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const back = () => dispatch({ type: 'SET_SCREEN', screen: 'browser' });

  useHardwareBack(true, () => {
    if (importOpen) {
      setImportOpen(false);
      return true;
    }
    if (addOpen) {
      setAddOpen(false);
      return true;
    }
    if (editing) {
      setEditing(null);
      return true;
    }
    return false;
  });

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('URL tidak valid', 'Masukkan URL skrip (http/https).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const code = await res.text();
      const parsed = await parseUserScript(code);
      const script: UserScript = {
        id: uid('us-'),
        code,
        body: parsed.body,
        meta: parsed.meta,
        hasHeader: parsed.hasHeader,
        enabled: true,
        matchAll: false,
        updatedAt: Date.now(),
      };
      dispatch({ type: 'ADD_SCRIPT', script });
      setImportOpen(false);
      setImportUrl('');
      Alert.alert(
        'Skrip ditambahkan',
        parsed.hasHeader
          ? `${parsed.meta.name ?? 'Tanpa nama'} v${parsed.meta.version ?? '1.0'}`
          : 'Skrip tanpa header metadata — aktifkan "jalankan di semua situs" bila perlu.',
      );
    } catch (e: any) {
      Alert.alert('Gagal mengimpor', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const blankScript = (): UserScript => ({
    id: '',
    code: '',
    body: '',
    meta: { runAt: 'document-idle', noframes: false, matches: [], includes: [], excludes: [], grants: [], requires: [] },
    hasHeader: false,
    enabled: true,
    matchAll: false,
    updatedAt: 0,
  });

  const installExample = async (code: string) => {
    const parsed = await parseUserScript(code);
    dispatch({
      type: 'ADD_SCRIPT',
      script: {
        id: uid('us-'),
        code,
        body: parsed.body,
        meta: parsed.meta,
        hasHeader: parsed.hasHeader,
        enabled: true,
        matchAll: false,
        updatedAt: Date.now(),
      },
    });
  };

  const addActions: SheetAction[] = [
    {
      label: 'Tempel kode skrip baru',
      icon: 'pencil',
      onPress: () => setEditing(blankScript()),
    },
    { label: 'Impor dari URL', icon: 'download', onPress: () => setImportOpen(true) },
    ...EXAMPLE_SCRIPTS.slice(0, 1).map((ex): SheetAction => ({
      label: `Contoh: ${ex.title}`,
      icon: 'zap',
      onPress: () => installExample(ex.code),
    })),
  ];

  return (
    <ScreenShell
      title="Skrip"
      subtitle={`${state.scripts.filter((x) => x.enabled).length} aktif dari ${state.scripts.length} skrip`}
      onBack={back}
      theme={theme}>
      {state.scripts.length === 0 ? (
        <View style={{ padding: spacing.lg, gap: 10 }}>
          <EmptyState
            theme={theme}
            icon="code"
            title="Belum ada skrip"
            subtitle="Tempel userscript Greasy Fork, impor dari URL, atau pasang contoh bawaan."
          />
          <Button label="Tempel kode skrip" theme={theme} onPress={() => setEditing(blankScript())} />
          <Button
            label={`Contoh: ${EXAMPLE_SCRIPTS[0]?.title ?? 'skrip'}`}
            kind="secondary"
            theme={theme}
            onPress={() => EXAMPLE_SCRIPTS[0] && installExample(EXAMPLE_SCRIPTS[0].code)}
          />
          <Button label="Impor dari URL" kind="secondary" theme={theme} onPress={() => setImportOpen(true)} />
        </View>
      ) : null}

      <ScrollView nestedScrollEnabled>
        {state.scripts.map((script, i) => (
          <View key={script.id} style={{ marginHorizontal: spacing.md, marginTop: i === 0 ? spacing.md : 0 }}>
            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                padding: spacing.md,
                marginBottom: 10,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: '700' }} numberOfLines={1}>
                    {script.meta.name ?? 'Tanpa nama'}
                    {script.meta.version ? (
                      <Text style={{ color: theme.subtext, fontSize: 12 }}> v{script.meta.version}</Text>
                    ) : null}
                  </Text>
                  <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {script.meta.matches.length > 0
                      ? script.meta.matches.join(', ')
                      : script.matchAll
                        ? 'Semua situs (http/https)'
                        : 'Tanpa pola — nonaktif'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ShareMiniButton theme={theme} onPress={() => Share.share({ message: script.code }).catch(() => {})} />
                  <IconMiniButton theme={theme} name="arrowUp" disabled={i === 0} onPress={() => dispatch({ type: 'MOVE_SCRIPT', id: script.id, dir: -1 })} />
                  <IconMiniButton theme={theme} name="arrowDown" disabled={i === state.scripts.length - 1} onPress={() => dispatch({ type: 'MOVE_SCRIPT', id: script.id, dir: 1 })} />
                  <IconMiniButton theme={theme} name="pencil" onPress={() => setEditing(script)} />
                  <MiniSwitch
                    theme={theme}
                    value={script.enabled}
                    onValueChange={(v) => dispatch({ type: 'UPDATE_SCRIPT', id: script.id, patch: { enabled: v } })}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                <Tag theme={theme} label={script.meta.runAt} />
                {script.hasHeader ? null : <Tag theme={theme} label="tanpa header" warn />}
                <View style={{ flex: 1 }} />
                <IconMiniButton
                  theme={theme}
                  name="trash"
                  danger
                  onPress={() =>
                    Alert.alert('Hapus skrip?', script.meta.name ?? 'Tanpa nama', [
                      { text: 'Batal', style: 'cancel' },
                      { text: 'Hapus', style: 'destructive', onPress: () => dispatch({ type: 'DEL_SCRIPT', id: script.id }) },
                    ])
                  }
                />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* tombol tambah mengambang */}
      {state.scripts.length > 0 ? (
        <View style={{ position: 'absolute', right: 20, bottom: 28 }}>
          <Button label="＋ Skrip baru" theme={theme} onPress={() => setAddOpen(true)} />
        </View>
      ) : null}

      <ActionSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Tambah skrip"
        actions={addActions}
        theme={theme}
      />

      <ScriptEditor script={editing} onClose={() => setEditing(null)} />

      <Sheet visible={importOpen} onClose={() => setImportOpen(false)} title="Impor skrip dari URL" theme={theme}>
        <View style={{ padding: spacing.lg }}>
          <TextField
            theme={theme}
            label="URL skrip (.user.js)"
            value={importUrl}
            onChangeText={setImportUrl}
            placeholder="https://greasyfork.org/scripts/…/code/script.user.js"
            keyboardType="url"
          />
          <Button label={busy ? 'Mengunduh…' : 'Unduh & tambahkan'} theme={theme} disabled={busy} onPress={importFromUrl} />
        </View>
      </Sheet>
    </ScreenShell>
  );
}

// ---------------------------------------------------------------- editor

function ScriptEditor({ script, onClose }: { script: UserScript | null; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const theme = useTheme(state.settings.theme);
  const [code, setCode] = useState('');
  const [matchAll, setMatchAll] = useState(false);
  const isNew = !script || script.id === '';

  useEffect(() => {
    if (script) {
      setCode(script.code);
      setMatchAll(script.matchAll);
    }
  }, [script?.id]);

  if (!script) {
    return null;
  }

  const save = async () => {
    if (!code.trim()) {
      Alert.alert('Kode kosong', 'Tempel atau tulis kode skrip terlebih dahulu.');
      return;
    }
    const parsed = await parseUserScript(code);
    const hasNoPattern = parsed.meta.matches.length === 0 && parsed.meta.includes.length === 0;
    if (isNew) {
      dispatch({
        type: 'ADD_SCRIPT',
        script: {
          id: uid('us-'),
          code,
          body: parsed.body,
          meta: parsed.meta,
          hasHeader: parsed.hasHeader,
          enabled: true,
          matchAll: matchAll && hasNoPattern,
          updatedAt: Date.now(),
        },
      });
    } else {
      dispatch({
        type: 'UPDATE_SCRIPT',
        id: script.id,
        patch: {
          code,
          body: parsed.body,
          meta: parsed.meta,
          hasHeader: parsed.hasHeader,
          matchAll: matchAll && hasNoPattern,
          updatedAt: Date.now(),
        },
      });
    }
    onClose();
  };

  return (
    <Sheet
      visible={!!script}
      onClose={onClose}
      title={isNew ? 'Skrip baru' : 'Ubah skrip'}
      theme={theme}>
      <View style={{ padding: spacing.lg }}>
        <TextField
          theme={theme}
          label="Kode (format Via / Greasy Fork)"
          value={code}
          onChangeText={setCode}
          placeholder={'// ==UserScript==\n// @name  Skripku\n// @match https://example.com/*\n// ==/UserScript==\n\nconsole.log("halo");'}
          multiline
          mono
        />
        {matchAll ? (
          <Text style={{ color: theme.subtext, fontSize: 12, marginTop: -6, marginBottom: 8 }}>
            Skrip tanpa pola @match akan dijalankan di semua situs http/https.
          </Text>
        ) : null}
        <ToggleRow
          theme={theme}
          title="Jalankan di semua situs"
          subtitle="Bila tidak ada pola @match/@include"
          value={matchAll}
          onValueChange={setMatchAll}
          last
        />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Button label="Simpan" theme={theme} onPress={save} />
          </View>
          {!isNew ? (
            <View style={{ flex: 1 }}>
              <Button
                label="Hapus"
                kind="danger"
                theme={theme}
                onPress={() => {
                  dispatch({ type: 'DEL_SCRIPT', id: script.id });
                  onClose();
                }}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- mini UI

function IconMiniButton({
  name,
  onPress,
  theme,
  disabled,
  danger,
}: {
  name: any;
  onPress: () => void;
  theme: any;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        padding: 5,
        borderRadius: 8,
        marginLeft: 6,
        opacity: disabled ? 0.3 : 1,
        backgroundColor: pressed ? theme.surface2 : 'transparent',
      })}>
      <Icon name={name} size={16} color={danger ? theme.danger : theme.subtext} />
    </Pressable>
  );
}

function ShareMiniButton({ onPress, theme }: { onPress: () => void; theme: any }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => ({ padding: 5, borderRadius: 8, marginLeft: 4, backgroundColor: pressed ? theme.surface2 : 'transparent' })}>
      <Icon name="share" size={16} color={theme.subtext} />
    </Pressable>
  );
}

function MiniSwitch({
  value,
  onValueChange,
  theme,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  theme: any;
}) {
  // Switch kecil memakai ToggleRow sudah terlalu besar — pakai tombol teks
  return (
    <Text
      onPress={() => onValueChange(!value)}
      style={{
        color: value ? theme.ok : theme.subtext,
        fontWeight: '800',
        fontSize: 13,
        marginLeft: 10,
      }}>
      {value ? 'AKTIF' : 'MATI'}
    </Text>
  );
}

function Tag({ label, theme, warn }: { label: string; theme: any; warn?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: warn ? 'rgba(251,191,36,0.14)' : theme.accentSoft,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
      }}>
      <Text style={{ color: warn ? theme.warn : theme.accent, fontSize: 11, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}
