/**
 * TabSwitcher — kisi kartu tab + kelola workspace (Zen).
 * Tab privat ditandai ikon topeng (via emoji 🕶).
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Theme } from '../theme';
import { radius, spacing } from '../theme';
import { hostOfUrl, useStore } from '../state/store';
import { WORKSPACE_ICONS, uid } from '../state/defaults';
import { Icon } from '../ui/Icon';
import { ActionSheet, Button, IconButton, Row, type SheetAction } from '../ui/kit';

export function TabSwitcher({ theme }: { theme: Theme }) {
  const { state, dispatch, tabsInWorkspace, activeTab } = useStore();
  const [ctxTab, setCtxTab] = useState<string | null>(null);
  const [manageWs, setManageWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  if (!state.ui.tabSwitcher) {
    return null;
  }

  const close = () => dispatch({ type: 'SET_UI', patch: { tabSwitcher: false } });
  const wsTabs = tabsInWorkspace(state.activeWorkspaceId);
  const ctxTabObj = wsTabs.find((t) => t.id === ctxTab) ?? null;

  const contextActions: SheetAction[] = useMemo(() => {
    if (!ctxTabObj) {
      return [];
    }
    const actions: SheetAction[] = [];
    if (activeTab && ctxTabObj.id !== activeTab.id) {
      actions.push({
        label: 'Split dengan tab ini',
        icon: 'split',
        onPress: () => dispatch({ type: 'SET_SPLIT', ids: [activeTab.id, ctxTabObj.id] }),
      });
    }
    for (const ws of state.workspaces.filter((w) => w.id !== ctxTabObj.workspaceId)) {
      actions.push({
        label: `Pindah ke: ${ws.icon} ${ws.name}`,
        icon: 'folder',
        onPress: () => dispatch({ type: 'MOVE_TAB', id: ctxTabObj.id, workspaceId: ws.id }),
      });
    }
    actions.push(
      { label: 'Tutup tab lain di workspace ini', icon: 'close', onPress: () => dispatch({ type: 'CLOSE_OTHER_TABS', keepId: ctxTabObj.id }) },
      { label: 'Tutup tab', icon: 'trash', danger: true, onPress: () => dispatch({ type: 'CLOSE_TAB', id: ctxTabObj.id }) },
    );
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxTabObj?.id, activeTab?.id, state.workspaces]);

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.bg,
        zIndex: 30,
      }}>
      {/* header */}
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
            Tab <Text style={{ color: theme.subtext, fontWeight: '600' }}>({wsTabs.length})</Text>
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <IconButton name="folder" theme={theme} onPress={() => setManageWs(true)} />
            <IconButton name="close" theme={theme} onPress={close} />
          </View>
        </View>

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
                  borderWidth: StyleSheet.hairlineWidth,
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
                  <Text style={{ color: active ? theme.accent : theme.subtext, fontSize: 11.5, marginLeft: 6 }}>
                    {count}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* kisi tab */}
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {wsTabs.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Text style={{ color: theme.subtext, fontSize: 14 }}>Belum ada tab di workspace ini</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {wsTabs.map((tab) => {
              const isActive = tab.id === state.activeTabId;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    dispatch({ type: 'SET_ACTIVE_TAB', id: tab.id });
                    close();
                  }}
                  onLongPress={() => setCtxTab(tab.id)}
                  style={{
                    width: '47%',
                    flexGrow: 1,
                    backgroundColor: theme.surface,
                    borderRadius: radius.md,
                    borderWidth: isActive ? 1.5 : StyleSheet.hairlineWidth,
                    borderColor: isActive ? theme.accent : theme.border,
                    padding: spacing.md,
                    minHeight: 110,
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: theme.surface2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 8,
                      }}>
                      <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 13 }}>
                        {(hostOfUrl(tab.url) || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    {tab.incognito ? (
                      <View
                        style={{
                          backgroundColor: theme.surface2,
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}>
                        <Text style={{ fontSize: 11 }}>🕶</Text>
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Pressable hitSlop={8} onPress={() => dispatch({ type: 'CLOSE_TAB', id: tab.id })}>
                      <Icon name="close" size={15} color={theme.subtext} />
                    </Pressable>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={{ color: theme.text, fontSize: 13.5, fontWeight: '600' }}>
                    {tab.title || hostOfUrl(tab.url) || tab.url || 'Tab baru'}
                  </Text>
                  <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 11.5, marginTop: 3 }}>
                    {hostOfUrl(tab.url) || tab.url}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* footer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingVertical: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          backgroundColor: theme.bar,
        }}>
        <Button
          label="Tab baru"
          theme={theme}
          small
          onPress={() => {
            close();
            dispatch({ type: 'SET_OMNIBOX', patch: { open: true, mode: 'new', initial: '', incognito: false } });
          }}
        />
        <Button
          label="Privat"
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

      {/* kelola workspace */}
      {manageWs ? (
        <ManageWorkspaces theme={theme} onClose={() => setManageWs(false)} />
      ) : null}
    </View>
  );
}

function ManageWorkspaces({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.overlay,
        zIndex: 50,
        justifyContent: 'center',
        padding: spacing.lg,
      }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={{
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          padding: spacing.lg,
          maxHeight: '80%',
        }}>
        <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: spacing.md }}>
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
                <Pressable onPress={() => dispatch({ type: 'DEL_WORKSPACE', id: ws.id })} hitSlop={8}>
                  <Icon name="trash" size={17} color={theme.danger} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
        <View style={{ marginTop: spacing.sm }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nama workspace baru…"
            placeholderTextColor={theme.subtext}
            style={{
              backgroundColor: theme.surface2,
              color: theme.text,
              borderRadius: radius.sm,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 15,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
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
            <View style={{ flex: 1 }}>
              <Button label="Selesai" theme={theme} kind="secondary" small onPress={onClose} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
