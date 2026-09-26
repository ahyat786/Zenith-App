/**
 * BrowserScreen — kerangka utama Zenith.
 * Menggabungkan UX Zen (omnibox mengambang, workspace, split, glance,
 * compact mode) dengan kemudahan Via (bar bawah ringkas).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hostOfUrl, isBookmarked, useStore } from '../state/store';
import { radius, spacing, useTheme } from '../theme';
import { TabView } from './TabView';
import { Omnibox } from './Omnibox';
import { TabSwitcher } from './TabSwitcher';
import { GlanceView } from './GlanceView';
import { getWebView } from './refs';
import { Icon } from '../ui/Icon';
import { ActionSheet, IconButton, type SheetAction } from '../ui/kit';
import type { Tab } from '../types';

export function BrowserScreen() {
  const { state, dispatch, activeTab, tabsInWorkspace, openNewTab, siteConfigFor } = useStore();
  const theme = useTheme(state.settings.theme);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const wsTabs = tabsInWorkspace(state.activeWorkspaceId);
  const splitIds = state.splitTabIds;
  const splitA = wsTabs.find((t) => t.id === splitIds[0]) ?? null;
  const splitB = wsTabs.find((t) => t.id === splitIds[1]) ?? null;
  const splitActive = !!(splitA && splitB);
  const compact = state.ui.compact;
  const barTop = state.settings.barPosition === 'top';

  const siteCfg = activeTab ? siteConfigFor(activeTab.url) : undefined;
  const adblockOn = state.settings.adblockEnabled && siteCfg?.adblockEnabled !== false;
  const bookmark = activeTab ? isBookmarked(state, activeTab.url) : undefined;

  // ---------- tombol fisik kembali ----------
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const ui = state.ui;
      if (ui.omnibox.open) {
        dispatch({ type: 'SET_OMNIBOX', patch: { open: false } });
        return true;
      }
      if (ui.glanceUrl) {
        dispatch({ type: 'SET_UI', patch: { glanceUrl: null } });
        return true;
      }
      if (ui.tabSwitcher) {
        dispatch({ type: 'SET_UI', patch: { tabSwitcher: false } });
        return true;
      }
      if (ui.linkMenu) {
        dispatch({ type: 'SET_UI', patch: { linkMenu: null } });
        return true;
      }
      if (ui.compact) {
        dispatch({ type: 'SET_UI', patch: { compact: false } });
        return true;
      }
      if (activeTab?.canGoBack) {
        getWebView(activeTab.id)?.goBack();
        return true;
      }
      if (activeTab) {
        dispatch({ type: 'CLOSE_TAB', id: activeTab.id });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [state.ui, activeTab, dispatch]);

  // ---------- aksi ----------
  const openOmniboxNew = (incognito = false) =>
    dispatch({ type: 'SET_OMNIBOX', patch: { open: true, mode: 'new', initial: '', incognito } });
  const openOmniboxEdit = () =>
    dispatch({
      type: 'SET_OMNIBOX',
      patch: { open: true, mode: 'edit', initial: activeTab?.url ?? '', incognito: false },
    });

  const doSplit = () => {
    if (!activeTab) {
      return;
    }
    const other = wsTabs.find((t) => t.id !== activeTab.id);
    if (!other) {
      Alert.alert('Split layar', 'Butuh minimal 2 tab di workspace ini.');
      return;
    }
    dispatch({ type: 'SET_SPLIT', ids: [activeTab.id, other.id] });
  };

  const menuActions: SheetAction[] = useMemo(() => {
    const actions: SheetAction[] = [
      { label: 'Tab baru', icon: 'plus', onPress: () => openOmniboxNew() },
      { label: 'Tab privat', icon: 'eyeOff', onPress: () => openOmniboxNew(true) },
    ];
    if (splitActive) {
      actions.push({
        label: 'Keluar dari split',
        icon: 'close',
        onPress: () => dispatch({ type: 'SET_SPLIT', ids: [] }),
      });
    } else {
      actions.push({ label: 'Split layar', icon: 'split', onPress: doSplit });
    }
    actions.push(
      {
        label: compact ? 'Keluar mode kompak' : 'Mode kompak',
        icon: compact ? 'eyeOff' : 'eye',
        onPress: () => dispatch({ type: 'SET_UI', patch: { compact: !compact } }),
      },
      {
        label: bookmark ? 'Hapus bookmark' : 'Simpan bookmark',
        icon: bookmark ? 'starFilled' : 'star',
        onPress: () => {
          if (!activeTab?.url) {
            return;
          }
          if (bookmark) {
            dispatch({ type: 'DEL_BOOKMARK', id: bookmark.id });
          } else {
            dispatch({
              type: 'ADD_BOOKMARK',
              bookmark: {
                id: `bm-${Date.now().toString(36)}`,
                url: activeTab.url,
                title: activeTab.title || hostOfUrl(activeTab.url),
              },
            });
          }
        },
      },
      {
        label: 'Bagikan tautan',
        icon: 'share',
        onPress: () => {
          if (activeTab?.url) {
            Share.share({ message: activeTab.url }).catch(() => {});
          }
        },
      },
      { label: 'Muat ulang', icon: 'refresh', onPress: () => activeTab && getWebView(activeTab.id)?.reload() },
      { label: 'Skrip', icon: 'code', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'scripts' }) },
      { label: 'Ekstensi', icon: 'puzzle', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'extensions' }) },
      { label: 'Pengaturan situs', icon: 'globe', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'siteSettings' }) },
      { label: 'Pengaturan', icon: 'gear', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'settings' }) },
    );
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitActive, compact, bookmark, activeTab?.id, activeTab?.url]);

  const linkActions: SheetAction[] = useMemo(() => {
    const lm = state.ui.linkMenu;
    if (!lm) {
      return [];
    }
    return [
      {
        label: 'Buka di tab baru',
        icon: 'plus',
        onPress: () => openNewTab(lm.url),
      },
      {
        label: 'Buka di tab privat',
        icon: 'eyeOff',
        onPress: () => openNewTab(lm.url, { incognito: true }),
      },
      {
        label: 'Pratinjau cepat (Glance)',
        icon: 'eye',
        onPress: () => dispatch({ type: 'SET_UI', patch: { glanceUrl: lm.url } }),
      },
      {
        label: 'Bagikan tautan',
        icon: 'share',
        onPress: () => Share.share({ message: lm.url }).catch(() => {}),
      },
      {
        label: 'Baca: ' + (lm.text ? lm.text.slice(0, 40) : hostOfUrl(lm.url)),
        icon: 'info',
        onPress: () => dispatch({ type: 'SET_UI', patch: { glanceUrl: lm.url } }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ui.linkMenu?.url, state.ui.linkMenu?.text]);

  const renderTab = (tab: Tab, forceActive = false) => (
    <TabView key={tab.id} tab={tab} active={forceActive || tab.id === state.activeTabId} theme={theme} />
  );

  // ---------- bilah alamat ----------
  const addressPill = (
    <Pressable
      onPress={openOmniboxEdit}
      disabled={!activeTab}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: pressed ? theme.surface2 : theme.pill,
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        height: 42,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
      })}>
      {activeTab?.url.startsWith('https://') ? (
        <Icon name="lock" size={14} color={theme.ok} />
      ) : (
        <Icon name="globe" size={15} color={theme.subtext} />
      )}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: theme.text,
          fontSize: 14.5,
          marginHorizontal: 8,
          fontWeight: '500',
        }}>
        {activeTab
          ? hostOfUrl(activeTab.url) || activeTab.url
          : 'Cari atau ketik URL'}
      </Text>
      {activeTab?.loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      {bookmark ? <Icon name="starFilled" size={14} color={theme.warn} /> : null}
    </Pressable>
  );

  const progressBar =
    activeTab?.loading && activeTab.progress > 0.02 && activeTab.progress < 1 ? (
      <View style={{ height: 2.5, backgroundColor: 'transparent', marginTop: 3 }}>
        <View
          style={{
            height: 2.5,
            width: `${Math.round(activeTab.progress * 100)}%`,
            backgroundColor: theme.accent,
            borderRadius: 2,
          }}
        />
      </View>
    ) : null;

  const workspaceBar = state.settings.showWorkspaceBar && state.workspaces.length > 0 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 6 }}>
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
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: radius.pill,
              marginRight: 8,
              backgroundColor: active ? theme.accentSoft : theme.pill,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: active ? theme.accent : theme.border,
            }}>
            <Text style={{ fontSize: 13, marginRight: 5 }}>{ws.icon}</Text>
            <Text
              style={{
                color: active ? theme.accent : theme.subtext,
                fontSize: 12.5,
                fontWeight: '700',
              }}>
              {ws.name}
            </Text>
            {count > 0 ? (
              <Text style={{ color: active ? theme.accent : theme.subtext, fontSize: 11, marginLeft: 5 }}>
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  ) : null;

  const toolbar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton
        name="back"
        theme={theme}
        disabled={!activeTab?.canGoBack}
        onPress={() => activeTab && getWebView(activeTab.id)?.goBack()}
      />
      <IconButton
        name="forward"
        theme={theme}
        disabled={!activeTab?.canGoForward}
        onPress={() => activeTab && getWebView(activeTab.id)?.goForward()}
      />
      <IconButton
        name="plus"
        theme={theme}
        onPress={() => openOmniboxNew()}
      />
      <IconButton
        name="tabs"
        theme={theme}
        badge={wsTabs.length || undefined}
        onPress={() => dispatch({ type: 'SET_UI', patch: { tabSwitcher: true } })}
      />
      <IconButton
        name={adblockOn ? 'shield' : 'shieldOff'}
        theme={theme}
        onPress={() => dispatch({ type: 'SET_SETTINGS', patch: { adblockEnabled: !state.settings.adblockEnabled } })}
        onLongPress={() => dispatch({ type: 'SET_SCREEN', screen: 'settings' })}
      />
      <IconButton name="more" theme={theme} onPress={() => setMenuOpen(true)} />
    </View>
  );


  const bars = compact ? null : (
    <View style={{ backgroundColor: theme.bar }}>
      {workspaceBar}
      <View style={{ paddingHorizontal: spacing.md, paddingTop: 4 }}>
        {addressPill}
        {progressBar}
      </View>
      <View style={{ paddingHorizontal: spacing.sm, paddingBottom: Math.max(insets.bottom, 6), paddingTop: 2 }}>
        {toolbar}
      </View>
    </View>
  );

  const empty = !activeTab && wsTabs.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />

      {barTop ? bars : null}

      {/* ---------- konten ---------- */}
      <View style={{ flex: 1 }}>
        {empty ? (
          <StartOverlay />
        ) : (
          <>
            {wsTabs.filter((t) => !splitIds.includes(t.id)).map((t) => renderTab(t))}
            {splitActive ? (
              <View style={StyleSheet.absoluteFill}>
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <View style={{ flex: 1 }}>{renderTab(splitA!, true)}</View>
                  <Pressable
                    style={{ width: 6, backgroundColor: theme.border }}
                    onPress={() => dispatch({ type: 'SET_SPLIT', ids: [splitIds[1], splitIds[0]] })}
                  />
                  <View style={{ flex: 1 }}>{renderTab(splitB!, true)}</View>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>

      {!barTop ? bars : null}

      {/* tombol keluar mode kompak */}
      {compact ? (
        <Pressable
          onPress={() => dispatch({ type: 'SET_UI', patch: { compact: false } })}
          style={{
            position: 'absolute',
            right: 14,
            bottom: Math.max(insets.bottom, 14) + 8,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 6,
          }}>
          <Icon name="eye" size={20} color={theme.accent} />
        </Pressable>
      ) : null}

      {/* ---------- overlay ---------- */}
      <GlanceView theme={theme} />
      <TabSwitcher theme={theme} />
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
        actions={menuActions}
        theme={theme}
      />
      <ActionSheet
        visible={!!state.ui.linkMenu}
        onClose={() => dispatch({ type: 'SET_UI', patch: { linkMenu: null } })}
        title={state.ui.linkMenu ? hostOfUrl(state.ui.linkMenu.url) : undefined}
        actions={linkActions}
        theme={theme}
      />
      {state.ui.omnibox.open ? <Omnibox theme={theme} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- awal

function StartOverlay() {
  const { state, dispatch, openNewTab } = useStore();
  const theme = useTheme(state.settings.theme);
  const hour = new Date().getHours();
  const greeting =
    hour < 4 ? 'Selamat malam' : hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';

  const quickLinks = [
    { label: 'Google', url: 'https://www.google.com' },
    { label: 'DuckDuckGo', url: 'https://duckduckgo.com' },
    { label: 'Wikipedia', url: 'https://id.wikipedia.org' },
    { label: 'YouTube', url: 'https://m.youtube.com' },
  ];

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.lg,
      }}>
      <View
        style={{
          width: 76,
          height: 76,
          borderRadius: 24,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.accent,
        }}>
        <Text style={{ fontSize: 34, fontWeight: '900', color: theme.accent }}>Z</Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{greeting}</Text>
        <Text style={{ color: theme.subtext, fontSize: 13.5, marginTop: 4 }}>
          Zenith Browser — cepat, ringan, privat
        </Text>
      </View>

      <Pressable
        onPress={() =>
          dispatch({ type: 'SET_OMNIBOX', patch: { open: true, mode: 'new', initial: '', incognito: false } })
        }
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          maxWidth: 420,
          backgroundColor: pressed ? theme.surface2 : theme.surface,
          borderRadius: radius.pill,
          paddingHorizontal: 18,
          height: 50,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        })}>
        <Icon name="search" size={18} color={theme.subtext} />
        <Text style={{ color: theme.subtext, fontSize: 15, marginLeft: 10 }}>
          Cari atau ketik URL
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        {quickLinks.map((l) => (
          <Pressable
            key={l.url}
            onPress={() => openNewTab(l.url)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: theme.pill,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      {state.bookmarks.length > 0 ? (
        <View style={{ width: '100%', maxWidth: 420, marginTop: spacing.sm }}>
          <Text
            style={{
              color: theme.subtext,
              fontSize: 12,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginBottom: 8,
            }}>
            Bookmark
          </Text>
          {state.bookmarks.slice(0, 5).map((b) => (
            <Pressable
              key={b.id}
              onPress={() => openNewTab(b.url)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                borderRadius: radius.sm,
                backgroundColor: pressed ? theme.surface2 : theme.surface,
                marginBottom: 6,
              })}>
              <Icon name="bookmark" size={16} color={theme.accent} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
                  {b.title || b.url}
                </Text>
                <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 11.5 }}>
                  {b.url}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
