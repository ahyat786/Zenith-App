/**
 * TabSwitcher — kisi kartu semua tab terbuka + workspace (Zen).
 *
 * PERBAIKAN v0.2: memakai <Modal> sehingga DIJAMIN tampil di atas
 * WebView (bug v0.1: overlay absolute tertutup/z-order gagal di
 * sebagian perangkat). Juga: bila workspace aktif kosong, tampilkan
 * SEMUA tab sebagai fallback agar daftar tidak pernah kosong.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Theme } from '../theme';
import { radius, spacing } from '../theme';
import { hostOfUrl, useStore } from '../state/store';
import { WORKSPACE_ICONS, uid } from '../state/defaults';
import { Icon } from '../ui/Icon';
import { ActionSheet, Button, type SheetAction } from '../ui/kit';

export function TabSwitcher({ theme }: { theme: Theme }) {
  const { state, dispatch, activeTab } = useStore();
  const [ctxTab, setCtxTab] = useState<string | null>(null);
  const [manageWs, setManageWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const insets = useSafeAreaInsets();

  const open = state.ui.tabSwitcher;
  const close = () => dispatch({ type: 'SET_UI', patch: { tabSwitcher: false } });

  // Fallback: kalau workspace aktif tidak punya tab, tampilkan semua tab
  const wsTabs = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId);
  const showAll = wsTabs.length === 0 && state.tabs.length > 0;
  const tabs = showAll ? state.tabs : wsTabs;

  const ctxTabObj = tabs.find((t) => t.id === ctxTab) ?? null;

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
    for (const ws of state.workspaces.filter((w) => w.id !== ctxTabObj.workspaceId)) {
      actions.push({
        label: `Pindah ke ${ws.icon} ${ws.name}`,
        icon: 'folder',
        onPress: () => dispatch({ type: 'MOVE_TAB', id: ctxTabObj.id, workspaceId: ws.id }),
      });
    }
    actions.push(
      {
        label: 'Tutup tab lain',
        icon: 'close',
        onPress: () => dispatch({ type: 'CLOSE_OTHER_TABS', keepId: ctxTabObj.id }),
      },
      { label: 'Tutup tab ini', icon: 'trash', danger: true, onPress: () => dispatch({ type: 'CLOSE_TAB', id: ctxTabObj.id }) },
    );
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxTabObj?.id, activeTab?.id, state.workspaces]);

  if (!open) {
    return null;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
        {/* ---------- header ---------- */}
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', flex: 1 }}>
              Tab <Text style={{ color: theme.accent }}>{tabs.length}</Text>
              <Text style={{ color: theme.subtext, fontSize: 13, fontWeight: '600' }}>
                {'  '}di {state.workspaces.find((w) => w.id === state.activeWorkspaceId)?.name ?? 'workspace'}
              </Text>
            </Text>
            <Pressable
              onPress={() => setManageWs((v) => !v)}
              hitSlop={8}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 10,
                marginRight: 2,
                backgroundColor: pressed ? theme.surface2 : 'transparent',
              })}>
              <Icon name="folder" size={20} color={manageWs ? theme.accent : theme.text} />
            </Pressable>
            <Pressable
              onPress={close}
              hitSlop={8}
              style={({ pressed }) => ({
                padding: 8,
                borderRadius: 10,
                backgroundColor: pressed ? theme.surface2 : 'transparent',
              })}>
              <Icon name="close" size={20} color={theme.text} />
            </Pressable>
          </View>

          {/* chip workspace */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {state.workspaces.map((ws) => {
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
                  <Text
                    style={{
                      color: active ? theme.accent : theme.subtext,
                      fontSize: 13,
                      fontWeight: '700',
                    }}>
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
                      <Text
                        style={{
                          color: active ? '#fff' : theme.subtext,
                          fontSize: 10.5,
                          fontWeight: '800',
                        }}>
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ---------- panel kelola workspace (inline) ---------- */}
        {manageWs ? (
          <View
            style={{
              margin: spacing.md,
              marginTop: 8,
              backgroundColor: theme.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.border,
              padding: spacing.md,
            }}>
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
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={newWsName}
                onChangeText={setNewWsName}
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
                disabled={!newWsName.trim()}
                onPress={() => {
                  dispatch({
                    type: 'ADD_WORKSPACE',
                    id: uid('ws-'),
                    name: newWsName.trim(),
                    icon: WORKSPACE_ICONS[Math.floor(Math.random() * WORKSPACE_ICONS.length)],
                  });
                  setNewWsName('');
                }}
              />
            </View>
          </View>
        ) : null}

        {/* ---------- kisi kartu tab ---------- */}
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
          {showAll ? (
            <Text style={{ color: theme.warn, fontSize: 12.5, marginBottom: 10 }}>
              Workspace ini kosong — menampilkan semua tab dari semua workspace.
            </Text>
          ) : null}
          {tabs.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
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
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {tabs.map((tab) => {
                const isActive = tab.id === state.activeTabId;
                const host = hostOfUrl(tab.url) || tab.url || 'Tab baru';
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => {
                      dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: tab.workspaceId });
                      dispatch({ type: 'SET_ACTIVE_TAB', id: tab.id });
                      close();
                    }}
                    onLongPress={() => setCtxTab(tab.id)}
                    style={{
                      width: '47%',
                      flexGrow: 1,
                      backgroundColor: theme.surface,
                      borderRadius: radius.md,
                      borderWidth: isActive ? 2 : 1,
                      borderColor: isActive ? theme.accent : theme.border,
                      padding: spacing.md,
                      minHeight: 116,
                    }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          backgroundColor: theme.surface2,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 8,
                        }}>
                        <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 14 }}>
                          {host.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      {tab.incognito ? <Text style={{ fontSize: 12 }}>🕶</Text> : null}
                      {tab.loading ? (
                        <ActivityIndicator size="small" color={theme.accent} style={{ marginLeft: 6 }} />
                      ) : null}
                      <View style={{ flex: 1 }} />
                      <Pressable hitSlop={10} onPress={() => dispatch({ type: 'CLOSE_TAB', id: tab.id })}>
                        <Icon name="close" size={16} color={theme.subtext} />
                      </Pressable>
                    </View>
                    <Text numberOfLines={2} style={{ color: theme.text, fontSize: 13.5, fontWeight: '600' }}>
                      {tab.title || host}
                    </Text>
                    <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 11.5, marginTop: 3 }}>
                      {host}
                    </Text>
                    {isActive ? (
                      <View
                        style={{
                          marginTop: 8,
                          alignSelf: 'flex-start',
                          backgroundColor: theme.accentSoft,
                          borderRadius: 6,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                        }}>
                        <Text style={{ color: theme.accent, fontSize: 10.5, fontWeight: '800' }}>TAB AKTIF</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* ---------- footer ---------- */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
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
            label="Tutup semua"
            theme={theme}
            kind="danger"
            small
            onPress={() => dispatch({ type: 'CLOSE_ALL_TABS' })}
          />
        </View>

        {/* menu konteks tab */}
        <ActionSheet
          visible={!!ctxTab}
          onClose={() => setCtxTab(null)}
          title={ctxTabObj ? ctxTabObj.title || hostOfUrl(ctxTabObj.url) : undefined}
          actions={contextActions}
          theme={theme}
        />
      </View>
    </Modal>
  );
}
