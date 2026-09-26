/**
 * TabSwitcher — kisi kartu tab + GRUP TAB + workspace (Zenith).
 *
 * - Grup tab: kartu grup expandable (warna, jumlah, pratinjau tab),
 *   tambah tab langsung ke grup, pindah tab antar grup (tekan-lama).
 * - Tab switcher memakai <Modal> sehingga selalu tampil di atas WebView.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tab } from '../types';
import type { Theme } from '../theme';
import { radius, spacing } from '../theme';
import { hostOfUrl, useStore } from '../state/store';
import { WORKSPACE_ICONS, uid } from '../state/defaults';
import { Icon } from '../ui/Icon';
import { ActionSheet, Button, TextField, type SheetAction } from '../ui/kit';

const GROUP_COLORS = ['#8b7cf6', '#60a5fa', '#4ade80', '#fbbf24', '#f472b6', '#f87171'];

/** Warna stabil per-host untuk ubin "favicon" huruf (Chrome-style). */
const HOST_COLORS = ['#8b7cf6', '#60a5fa', '#4ade80', '#fbbf24', '#f472b6', '#f87171', '#2dd4bf', '#fb923c'];
function hostColor(host: string): string {
  let h = 0;
  for (let i = 0; i < host.length; i++) {
    h = (h * 31 + host.charCodeAt(i)) >>> 0;
  }
  return HOST_COLORS[h % HOST_COLORS.length];
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

export function TabSwitcher({ theme }: { theme: Theme }) {
  const { state, dispatch, activeTab } = useStore();
  const [ctxTab, setCtxTab] = useState<string | null>(null);
  const [ctxGroup, setCtxGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState(GROUP_COLORS[0]);
  const [manageWs, setManageWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const insets = useSafeAreaInsets();
  // Chrome-style: telusuri tab + item tidak aktif + urungkan tutup tab
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [undo, setUndo] = useState<Tab | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
    };
  }, []);

  const open = state.ui.tabSwitcher;
  const close = () => dispatch({ type: 'SET_UI', patch: { tabSwitcher: false } });

  const wsTabs = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId);
  const showAll = wsTabs.length === 0 && state.tabs.length > 0;
  const tabs = showAll ? state.tabs : wsTabs;
  const groups = state.tabGroups;
  const ctxTabObj = tabs.find((t) => t.id === ctxTab) ?? null;
  const ctxGroupObj = groups.find((g) => g.id === ctxGroup) ?? null;

  const selectTab = (t: Tab) => {
    dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: t.workspaceId });
    dispatch({ type: 'SET_ACTIVE_TAB', id: t.id });
    close();
  };

  // ---------- tutup + urungkan (Chrome-style) ----------
  const closeTab = (t: Tab) => {
    dispatch({ type: 'CLOSE_TAB', id: t.id });
    setUndo(t);
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
    }
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };
  const restoreTab = () => {
    if (!undo) {
      return;
    }
    dispatch({
      type: 'ADD_TAB',
      id: undo.id,
      url: undo.url,
      incognito: undo.incognito,
      workspaceId: undo.workspaceId,
    });
    if (undo.groupId) {
      dispatch({ type: 'SET_TAB_GROUP', tabId: undo.id, groupId: undo.groupId });
    }
    dispatch({ type: 'SET_ACTIVE_TAB', id: undo.id });
    setUndo(null);
  };

  // ---------- menu konteks TAB ----------
  const contextActions: SheetAction[] = useMemo(() => {
    if (!ctxTabObj) {
      return [];
    }
    const actions: SheetAction[] = [];
    if (activeTab && ctxTabObj.id !== activeTab.id) {
      actions.push({
        label: 'Split layar dengan tab ini',
        icon: 'split',
        onPress: () => dispatch({ type: 'SET_SPLIT', ids: [activeTab.id, ctxTabObj.id] }),
      });
    }
    if (ctxTabObj.groupId) {
      actions.push({
        label: 'Keluarkan dari grup',
        icon: 'folder',
        onPress: () => dispatch({ type: 'SET_TAB_GROUP', tabId: ctxTabObj.id, groupId: null }),
      });
    }
    for (const g of groups) {
      if (g.id !== ctxTabObj.groupId) {
        actions.push({
          label: `Masukkan ke grup: ${g.name}`,
          icon: 'folder',
          onPress: () => dispatch({ type: 'SET_TAB_GROUP', tabId: ctxTabObj.id, groupId: g.id }),
        });
      }
    }
    actions.push({
      label: 'Buat grup baru dari tab ini…',
      icon: 'plus',
      onPress: () => {
        setGroupName(ctxTabObj.title ? ctxTabObj.title.slice(0, 24) : 'Grup baru');
        setGroupColor(GROUP_COLORS[groups.length % GROUP_COLORS.length]);
        setNewGroupOpen(true);
        // setelah dibuat, tab ini dimasukkan (lihat createGroup)
        (globalThis as any).__ZENITH_PENDING_GROUP_TAB = ctxTabObj.id;
      },
    });
    for (const ws of state.workspaces.filter((w) => w.id !== ctxTabObj.workspaceId)) {
      actions.push({
        label: `Pindah ke workspace ${ws.icon} ${ws.name}`,
        icon: 'globe',
        onPress: () => dispatch({ type: 'MOVE_TAB', id: ctxTabObj.id, workspaceId: ws.id }),
      });
    }
    actions.push(
      {
        label: 'Tutup tab lain',
        icon: 'close',
        onPress: () => dispatch({ type: 'CLOSE_OTHER_TABS', keepId: ctxTabObj.id }),
      },
      { label: 'Tutup tab ini', icon: 'trash', danger: true, onPress: () => ctxTabObj && closeTab(ctxTabObj) },
    );
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxTabObj?.id, activeTab?.id, groups, state.workspaces]);

  // ---------- menu konteks GRUP ----------
  const groupActions: SheetAction[] = useMemo(() => {
    if (!ctxGroupObj) {
      return [];
    }
    return [
      {
        label: 'Ganti nama grup…',
        icon: 'pencil',
        onPress: () => {
          setGroupName(ctxGroupObj.name);
          setGroupColor(ctxGroupObj.color);
          setNewGroupOpen(true);
          (globalThis as any).__ZENITH_EDIT_GROUP_ID = ctxGroupObj.id;
        },
      },
      {
        label: 'Tutup semua tab dalam grup',
        icon: 'trash',
        danger: true,
        onPress: () => {
          for (const t of state.tabs.filter((t) => t.groupId === ctxGroupObj.id)) {
            dispatch({ type: 'CLOSE_TAB', id: t.id });
          }
        },
      },
      {
        label: 'Hapus grup (tab tetap ada)',
        icon: 'close',
        danger: true,
        onPress: () => dispatch({ type: 'DEL_GROUP', id: ctxGroupObj.id }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxGroupObj?.id, state.tabs]);

  const createGroup = () => {
    const name = groupName.trim() || 'Grup baru';
    const editId = (globalThis as any).__ZENITH_EDIT_GROUP_ID as string | undefined;
    const pendingTab = (globalThis as any).__ZENITH_PENDING_GROUP_TAB as string | undefined;
    if (editId) {
      dispatch({ type: 'UPDATE_GROUP', id: editId, patch: { name, color: groupColor } });
      delete (globalThis as any).__ZENITH_EDIT_GROUP_ID;
    } else {
      const id = uid('grp-');
      dispatch({ type: 'ADD_GROUP', id, name, color: groupColor });
      if (pendingTab) {
        dispatch({ type: 'SET_TAB_GROUP', tabId: pendingTab, groupId: id });
        delete (globalThis as any).__ZENITH_PENDING_GROUP_TAB;
      }
      setExpandedGroup(id);
    }
    setGroupName('');
    setNewGroupOpen(false);
  };

  if (!open) {
    return null;
  }

  const ungrouped = tabs.filter((t) => !t.groupId);
  const tabsInGroup = (gid: string) => tabs.filter((t) => t.groupId === gid);

  // ---------- telusuri tab (Chrome-style: cari di semua workspace) ----------
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const results = searching
    ? state.tabs.filter(
        (t) => t.url.toLowerCase().includes(q) || (t.title || '').toLowerCase().includes(q),
      )
    : [];

  // ---------- item tidak aktif (Chrome declutter: 7+ hari belum dipakai) ----------
  const now = Date.now();
  const isStale = (t: Tab) => !!t.lastActiveAt && now - t.lastActiveAt > STALE_MS && t.id !== state.activeTabId;
  const staleUngrouped = ungrouped.filter(isStale);
  const freshUngrouped = ungrouped.filter((t) => !isStale(t));

  return (
    <Modal visible animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
        {/* ================= header ================= */}
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }}>
              {searching ? (
                <Text style={{ color: theme.subtext, fontSize: 16 }}>
                  Hasil <Text style={{ color: theme.accent }}>{results.length}</Text>
                </Text>
              ) : (
                <>
                  Tab <Text style={{ color: theme.accent }}>{tabs.length}</Text>
                  {groups.length > 0 ? (
                    <Text style={{ color: theme.subtext, fontSize: 13, fontWeight: '600' }}>
                      {'  '}• {groups.length} grup
                    </Text>
                  ) : null}
                </>
              )}
            </Text>
            <Pressable
              onPress={() => setNewGroupOpen(true)}
              hitSlop={8}
              style={({ pressed }) => ({
                padding: 9,
                borderRadius: 10,
                marginRight: 2,
                backgroundColor: pressed ? theme.surface2 : theme.accentSoft,
              })}>
              <Icon name="folder" size={19} color={theme.accent} />
            </Pressable>
            <Pressable
              onPress={() => setManageWs((v) => !v)}
              hitSlop={8}
              style={({ pressed }) => ({
                padding: 9,
                borderRadius: 10,
                marginRight: 2,
                backgroundColor: pressed ? theme.surface2 : 'transparent',
              })}>
              <Icon name="globe" size={19} color={manageWs ? theme.accent : theme.text} />
            </Pressable>
            <Pressable
              onPress={close}
              hitSlop={8}
              style={({ pressed }) => ({ padding: 9, borderRadius: 10, backgroundColor: pressed ? theme.surface2 : 'transparent' })}>
              <Icon name="close" size={20} color={theme.text} />
            </Pressable>
          </View>

          {/* chip workspace */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {searching ? null : state.workspaces.map((ws) => {
              const active = ws.id === state.activeWorkspaceId;
              const count = state.tabs.filter((t) => t.workspaceId === ws.id).length;
              return (
                <Pressable
                  key={ws.id}
                  onPress={() => dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: ws.id })}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    marginRight: 8,
                    marginTop: 4,
                    backgroundColor: active ? theme.accentSoft : theme.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.border,
                  }}>
                  <Text style={{ fontSize: 13, marginRight: 6 }}>{ws.icon}</Text>
                  <Text style={{ color: active ? theme.accent : theme.subtext, fontSize: 13, fontWeight: '700' }}>
                    {ws.name}
                  </Text>
                  {count > 0 ? (
                    <View
                      style={{
                        marginLeft: 6,
                        backgroundColor: active ? theme.accent : theme.surface2,
                        borderRadius: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                      }}>
                      <Text style={{ color: active ? '#fff' : theme.subtext, fontSize: 10.5, fontWeight: '800' }}>
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Telusuri tab Anda (Chrome/Kiwi-style) */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.surface2,
              borderRadius: radius.pill,
              paddingHorizontal: 12,
              marginTop: 8,
              marginBottom: 2,
            }}>
            <Icon name="search" size={16} color={theme.subtext} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Telusuri tab Anda…"
              placeholderTextColor={theme.subtext}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, color: theme.text, fontSize: 14.5, paddingVertical: 9, paddingHorizontal: 8 }}
            />
            {query.length > 0 ? (
              <Pressable hitSlop={10} onPress={() => setQuery('')} style={{ padding: 4 }}>
                <Icon name="close" size={15} color={theme.subtext} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 24 }}>
          {searching ? (
            <View>
              {results.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Icon name="search" size={30} color={theme.subtext} />
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700', marginTop: 10 }}>
                    Tidak ada tab yang cocok
                  </Text>
                  <Text style={{ color: theme.subtext, fontSize: 12.5, marginTop: 3 }}>
                    Coba kata kunci lain dari judul atau alamat tab.
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                  {results.map((t) => {
                    const g = groups.find((x) => x.id === t.groupId);
                    return (
                      <TabCard
                        key={t.id}
                        tab={t}
                        theme={theme}
                        active={t.id === state.activeTabId}
                        onSelect={() => selectTab(t)}
                        onContext={() => setCtxTab(t.id)}
                        onClose={() => closeTab(t)}
                        groupName={g?.name}
                        groupColor={g?.color}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            <>
          {showAll ? (
            <Text style={{ color: theme.warn, fontSize: 12.5, marginBottom: 10 }}>
              Workspace ini kosong — menampilkan semua tab.
            </Text>
          ) : null}

          {/* ================= GRUP ================= */}
          {groups.map((g) => {
            const gTabs = tabsInGroup(g.id);
            const expanded = expandedGroup === g.id;
            return (
              <View
                key={g.id}
                style={{
                  backgroundColor: expanded ? g.color + '12' : theme.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: expanded ? g.color : theme.border,
                  marginBottom: spacing.md,
                  overflow: 'hidden',
                }}>
                <Pressable
                  onPress={() => setExpandedGroup(expanded ? null : g.id)}
                  onLongPress={() => setCtxGroup(g.id)}
                  android_ripple={{ color: theme.surface2 }}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      backgroundColor: g.color + '26',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}>
                    <Icon name="folder" size={17} color={g.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15.5, fontWeight: '800' }}>
                      {g.name}
                    </Text>
                    <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 1 }}>
                      {gTabs.length} tab
                    </Text>
                  </View>
                  {/* pratinjau Chrome-style: 2 tab pertama + chip +N */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                    {gTabs.slice(0, 2).map((t, i) => {
                      const h = hostOfUrl(t.url) || '?';
                      return (
                        <View
                          key={t.id}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            backgroundColor: hostColor(h) + '2e',
                            borderWidth: 1,
                            borderColor: theme.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: i === 0 ? 0 : -7,
                          }}>
                          <Text style={{ color: hostColor(h), fontSize: 11, fontWeight: '800' }}>
                            {h.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      );
                    })}
                    {gTabs.length > 2 ? (
                      <View
                        style={{
                          marginLeft: -7,
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          backgroundColor: g.color,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                          +{gTabs.length - 2}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={17} color={theme.subtext} />
                </Pressable>

                {expanded ? (
                  <View style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.sm }}>
                    {gTabs.length === 0 ? (
                      <Text style={{ color: theme.subtext, fontSize: 12.5, padding: 8 }}>
                        Grup kosong — tambah tab dengan tombol di bawah atau tekan-lama sebuah tab.
                      </Text>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {gTabs.map((t) => (
                          <TabCard
                            key={t.id}
                            tab={t}
                            theme={theme}
                            active={t.id === state.activeTabId}
                            groupColor={g.color}
                            onSelect={() => selectTab(t)}
                            onContext={() => setCtxTab(t.id)}
                            onClose={() => closeTab(t)}
                          />
                        ))}
                      </View>
                    )}
                    <Pressable
                      onPress={() => {
                        dispatch({
                          type: 'SET_OMNIBOX',
                          patch: { open: true, mode: 'new', initial: '', incognito: false },
                        });
                        // omnibox membuka tab baru di workspace aktif; tandai grup
                        (globalThis as any).__ZENITH_NEXT_GROUP = g.id;
                        close();
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        marginTop: 8,
                        borderRadius: radius.sm,
                        backgroundColor: pressed ? g.color + '40' : g.color + '1f',
                        borderWidth: 1,
                        borderColor: g.color + '66',
                      })}>
                      <Icon name="plus" size={15} color={g.color} />
                      <Text style={{ color: g.color, fontWeight: '800', fontSize: 13, marginLeft: 6 }}>
                        Tab baru di grup ini
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* ================= tab tanpa grup ================= */}
          {freshUngrouped.length > 0 || (groups.length === 0 && tabs.length > 0) ? (
            <Text
              style={{
                color: theme.subtext,
                fontSize: 12,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginBottom: 8,
              }}>
              {groups.length > 0 ? 'Tab tanpa grup' : 'Semua tab'}
            </Text>
          ) : null}
          {tabs.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: theme.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}>
                <Icon name="tabs" size={28} color={theme.subtext} />
              </View>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Belum ada tab</Text>
              <Text style={{ color: theme.subtext, fontSize: 13, marginTop: 4 }}>
                Tekan “Tab baru” di bawah untuk mulai menjelajah.
              </Text>
            </View>
          ) : freshUngrouped.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {freshUngrouped.map((t) => (
                <TabCard
                  key={t.id}
                  tab={t}
                  theme={theme}
                  active={t.id === state.activeTabId}
                  onSelect={() => selectTab(t)}
                  onContext={() => setCtxTab(t.id)}
                  onClose={() => closeTab(t)}
                />
              ))}
            </View>
          ) : null}

          {/* ================= item tidak aktif (Chrome-style) ================= */}
          {staleUngrouped.length > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <Pressable
                onPress={() => setShowInactive((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, marginBottom: 8 }}>
                <Icon name="clock" size={15} color={theme.subtext} />
                <Text
                  style={{ color: theme.subtext, fontSize: 12.5, fontWeight: '700', marginLeft: 6, flex: 1 }}>
                  Item tidak aktif — {staleUngrouped.length} tab belum dipakai 7+ hari
                </Text>
                <Icon name={showInactive ? 'chevronDown' : 'chevronRight'} size={15} color={theme.subtext} />
              </Pressable>
              {showInactive ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                  {staleUngrouped.map((t) => (
                    <TabCard
                      key={t.id}
                      tab={t}
                      theme={theme}
                      active={false}
                      dimmed
                      onSelect={() => selectTab(t)}
                      onContext={() => setCtxTab(t.id)}
                      onClose={() => closeTab(t)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
            </>
          )}
        </ScrollView>

        {/* ================= urungkan tutup tab ================= */}
        {undo ? (
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}>
              <Icon name="tabs" size={15} color={theme.subtext} />
              <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 13, flex: 1, marginLeft: 8 }}>
                “{undo.title || hostOfUrl(undo.url) || 'Tab'}” ditutup
              </Text>
              <Pressable
                onPress={restoreTab}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: theme.accentSoft,
                }}>
                <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 13 }}>Urungkan</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ================= footer ================= */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-evenly',
            paddingVertical: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.border,
            backgroundColor: theme.bar,
          }}>
          <Button
            label="＋ Tab baru"
            theme={theme}
            small
            onPress={() => {
              close();
              dispatch({ type: 'SET_OMNIBOX', patch: { open: true, mode: 'new', initial: '', incognito: false } });
            }}
          />
          <Button
            label="🕶 Privat"
            theme={theme}
            kind="secondary"
            small
            onPress={() => {
              close();
              dispatch({ type: 'SET_OMNIBOX', patch: { open: true, mode: 'new', initial: '', incognito: true } });
            }}
          />
          <Button
            label="＋ Grup"
            theme={theme}
            kind="secondary"
            small
            onPress={() => {
              setGroupName('');
              setGroupColor(GROUP_COLORS[groups.length % GROUP_COLORS.length]);
              setNewGroupOpen(true);
            }}
          />
          <Button
            label="Tutup semua"
            theme={theme}
            kind="danger"
            small
            onPress={() => dispatch({ type: 'CLOSE_ALL_TABS' })}
          />
        </View>

        {/* dialog grup baru / ganti nama */}
        {newGroupOpen ? (
          <Modal transparent visible animationType="fade" onRequestClose={() => setNewGroupOpen(false)}>
            <Pressable
              style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', padding: spacing.lg }}
              onPress={() => setNewGroupOpen(false)}>
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: 12 }}>
                  {(globalThis as any).__ZENITH_EDIT_GROUP_ID ? 'Ganti nama grup' : 'Grup tab baru'}
                </Text>
                <TextField
                  theme={theme}
                  label="Nama grup"
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Misalnya: Belanja, Riset…"
                  autoCapitalize="sentences"
                  autoCorrect
                />
                <Text style={{ color: theme.subtext, fontSize: 12.5, fontWeight: '600', marginBottom: 8 }}>
                  Warna
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  {GROUP_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setGroupColor(c)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: c,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: groupColor === c ? 3 : 0,
                        borderColor: '#fff',
                      }}>
                      {groupColor === c ? <Icon name="check" size={16} color="#fff" /> : null}
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Simpan" theme={theme} onPress={createGroup} disabled={!groupName.trim()} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Batal"
                      theme={theme}
                      kind="secondary"
                      onPress={() => {
                        delete (globalThis as any).__ZENITH_EDIT_GROUP_ID;
                        delete (globalThis as any).__ZENITH_PENDING_GROUP_TAB;
                        setNewGroupOpen(false);
                      }}
                    />
                  </View>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}

        {/* menu konteks */}
        <ActionSheet
          visible={!!ctxTab}
          onClose={() => setCtxTab(null)}
          title={ctxTabObj ? ctxTabObj.title || hostOfUrl(ctxTabObj.url) : undefined}
          actions={contextActions}
          theme={theme}
        />
        <ActionSheet
          visible={!!ctxGroup}
          onClose={() => setCtxGroup(null)}
          title={ctxGroupObj ? `Grup: ${ctxGroupObj.name}` : undefined}
          actions={groupActions}
          theme={theme}
        />

        {/* kelola workspace (inline) */}
        {manageWs ? <ManageWorkspaces theme={theme} onClose={() => setManageWs(false)} /> : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- kartu tab

function TabCard({
  tab,
  theme,
  active,
  dimmed,
  groupColor,
  groupName,
  onSelect,
  onContext,
  onClose,
}: {
  tab: Tab;
  theme: Theme;
  active: boolean;
  dimmed?: boolean;
  groupColor?: string;
  groupName?: string;
  onSelect: () => void;
  onContext: () => void;
  onClose: () => void;
}) {
  const host = hostOfUrl(tab.url) || tab.url || 'Tab baru';
  const hc = hostColor(host);
  return (
    <Pressable
      onPress={onSelect}
      onLongPress={onContext}
      android_ripple={{ color: theme.surface2, foreground: true }}
      style={({ pressed }) => ({
        width: '47%',
        flexGrow: 1,
        backgroundColor: pressed ? theme.surface2 : theme.surface,
        borderRadius: radius.md,
        borderWidth: active ? 2 : 1,
        borderColor: active ? groupColor ?? theme.accent : theme.border,
        padding: spacing.md,
        minHeight: 118,
        opacity: dimmed ? 0.62 : 1,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 9 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: hc + '2e',
            borderWidth: 1,
            borderColor: hc + '55',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
          }}>
          <Text style={{ color: hc, fontWeight: '800', fontSize: 14 }}>
            {host.charAt(0).toUpperCase()}
          </Text>
        </View>
        {tab.incognito ? <Text style={{ fontSize: 12 }}>🕶</Text> : null}
        {tab.loading ? <ActivityIndicator size="small" color={theme.accent} style={{ marginLeft: 6 }} /> : null}
        <View style={{ flex: 1 }} />
        <Pressable
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => ({
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.danger + '30' : 'transparent',
          })}>
          <Icon name="close" size={15} color={theme.subtext} />
        </Pressable>
      </View>
      <Text numberOfLines={2} style={{ color: theme.text, fontSize: 13.5, fontWeight: '600' }}>
        {tab.title || host}
      </Text>
      <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 11.5, marginTop: 3 }}>
        {host}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        {active ? (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: (groupColor ?? theme.accent) + '26',
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}>
            <Text style={{ color: groupColor ?? theme.accent, fontSize: 10.5, fontWeight: '800' }}>TAB AKTIF</Text>
          </View>
        ) : null}
        {groupName && groupColor ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: groupColor + '1c',
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2,
              marginLeft: active ? 6 : 0,
            }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: groupColor, marginRight: 4 }} />
            <Text numberOfLines={1} style={{ color: groupColor, fontSize: 10.5, fontWeight: '700' }}>
              {groupName}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- workspace

function ManageWorkspaces({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', padding: spacing.lg }}
        onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: '80%' }}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: 12 }}>
            Kelola Workspace
          </Text>
          <ScrollView nestedScrollEnabled>
            {state.workspaces.map((ws) => (
              <View
                key={ws.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.surface2,
                  borderRadius: radius.sm,
                  paddingHorizontal: 10,
                  marginBottom: 8,
                }}>
                <Pressable
                  onPress={() => {
                    const idx = WORKSPACE_ICONS.indexOf(ws.icon);
                    const next = WORKSPACE_ICONS[(idx + 1) % WORKSPACE_ICONS.length];
                    dispatch({ type: 'UPDATE_WORKSPACE', id: ws.id, patch: { icon: next } });
                  }}
                  style={{ padding: 8 }}>
                  <Text style={{ fontSize: 20 }}>{ws.icon}</Text>
                </Pressable>
                <TextInput
                  value={ws.name}
                  onChangeText={(t) => dispatch({ type: 'UPDATE_WORKSPACE', id: ws.id, patch: { name: t } })}
                  style={{ flex: 1, color: theme.text, fontSize: 15, paddingVertical: 8 }}
                  placeholder="Nama workspace"
                  placeholderTextColor={theme.subtext}
                />
                {state.workspaces.length > 1 ? (
                  <Pressable onPress={() => dispatch({ type: 'DEL_WORKSPACE', id: ws.id })} hitSlop={8} style={{ padding: 8 }}>
                    <Icon name="trash" size={17} color={theme.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Workspace baru…"
              placeholderTextColor={theme.subtext}
              style={{
                flex: 1,
                backgroundColor: theme.surface2,
                color: theme.text,
                borderRadius: radius.sm,
                paddingHorizontal: 12,
                fontSize: 14.5,
              }}
            />
            <Button
              label="Tambah"
              theme={theme}
              small
              disabled={!name.trim()}
              onPress={() => {
                dispatch({
                  type: 'ADD_WORKSPACE',
                  id: uid('ws-'),
                  name: name.trim(),
                  icon: WORKSPACE_ICONS[Math.floor(Math.random() * WORKSPACE_ICONS.length)],
                });
                setName('');
              }}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <Button label="Selesai" theme={theme} kind="secondary" small onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
