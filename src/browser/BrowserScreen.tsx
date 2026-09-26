/**
 * BrowserScreen — kerangka utama Zenith v0.2.
 *
 * UX final: Zen (omnibox mengambang di atas, workspaces, split, glance,
 * compact, tanpa homepage) + Via (bar bawah ringkas, unduhan cepat)
 * + Brave (tombol shields dengan penghitung blokir + upgrade HTTPS).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  ToastAndroid,
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
import { ActionSheet, IconButton, Row, Sheet, ToggleRow, type SheetAction } from '../ui/kit';
import { adblockStats, type AdblockStats } from '../core/native';
import { DESKTOP_UA, isDesktopUa } from '../core/desktop';
import { subscribeDownloads, type DownloadJob } from '../core/downloads';
import type { Tab } from '../types';

export function BrowserScreen() {
  const { state, dispatch, activeTab, tabsInWorkspace, openNewTab, siteConfigFor } = useStore();
  const theme = useTheme(state.settings.theme);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shieldsOpen, setShieldsOpen] = useState(false);
  const [stats, setStats] = useState<AdblockStats | null>(null);
  const [download, setDownload] = useState<DownloadJob | null>(null);

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
  const host = activeTab ? hostOfUrl(activeTab.url) : '';
  const isDesktopMode = isDesktopUa(siteCfg?.userAgent);
  const toggleDesktopMode = () => {
    if (!host || !activeTab) {
      ToastAndroid.show('Buka situs dulu — mode desktop berlaku per situs', ToastAndroid.SHORT);
      return;
    }
    dispatch({
      type: 'SET_SITE_CONFIG',
      host,
      patch: { userAgent: isDesktopMode ? '' : DESKTOP_UA },
    });
    ToastAndroid.show(
      isDesktopMode ? '📱 Mode mobile — memuat ulang…' : '🖥️ Mode desktop — memuat ulang…',
      ToastAndroid.SHORT,
    );
    setTimeout(() => {
      const wv = getWebView(activeTab.id);
      if (wv) {
        wv.reload();
      }
    }, 180);
  };

  // ---------- sinkron: tab aktif selalu di workspace aktif ----------
  useEffect(() => {
    if (activeTab && activeTab.workspaceId !== state.activeWorkspaceId) {
      dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: activeTab.workspaceId });
    }
  }, [activeTab?.id, activeTab?.workspaceId, state.activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- statistik shields ----------
  const refreshStats = useCallback(async () => {
    setStats(await adblockStats());
  }, []);
  useEffect(() => {
    refreshStats();
    const t = setInterval(refreshStats, 1000);
    return () => clearInterval(t);
  }, [refreshStats, activeTab?.url]);

  // ---------- banner unduhan (Via) ----------
  useEffect(() => {
    const unsub = subscribeDownloads((job) => {
      if (job.status === 'downloading' || job.status === 'connecting') {
        setDownload(job);
      } else if (downloadRef.current?.id === job.id) {
        setDownload(job.status === 'done' ? null : job);
      }
    });
    return unsub;
  }, []);
  const downloadRef = React.useRef<DownloadJob | null>(null);
  useEffect(() => {
    downloadRef.current = download;
  }, [download]);

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
      actions.push({ label: 'Keluar dari split', icon: 'close', onPress: () => dispatch({ type: 'SET_SPLIT', ids: [] }) });
    } else {
      actions.push({ label: 'Split layar', icon: 'split', onPress: doSplit });
    }
    actions.push(
      {
        label: isDesktopMode ? '🔁 Mode mobile (situs ini)' : '🖥 Mode desktop (situs ini)',
        icon: 'expand',
        onPress: toggleDesktopMode,
      },
      {
        label: compact ? 'Keluar mode kompak' : 'Mode kompak (bebas bar)',
        icon: compact ? 'eyeOff' : 'eye',
        onPress: () => dispatch({ type: 'SET_UI', patch: { compact: !compact } }),
      },
      {
        label: bookmark ? 'Hapus bookmark' : 'Bookmark halaman ini',
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
        onPress: () => activeTab?.url && Share.share({ message: activeTab.url }).catch(() => {}),
      },
      { label: 'Muat ulang', icon: 'refresh', onPress: () => activeTab && getWebView(activeTab.id)?.reload() },
      { label: 'Unduhan', icon: 'download', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'downloads' }) },
      { label: 'Skrip', icon: 'code', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'scripts' }) },
      { label: 'Ekstensi', icon: 'puzzle', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'extensions' }) },
      { label: 'Pengaturan situs', icon: 'globe', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'siteSettings' }) },
      { label: 'Pengaturan', icon: 'gear', onPress: () => dispatch({ type: 'SET_SCREEN', screen: 'settings' }) },
    );
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitActive, compact, bookmark, isDesktopMode, activeTab?.id, activeTab?.url]);

  const linkActions: SheetAction[] = useMemo(() => {
    const lm = state.ui.linkMenu;
    if (!lm) {
      return [];
    }
    return [
      { label: 'Buka di tab baru', icon: 'plus', onPress: () => openNewTab(lm.url) },
      { label: 'Buka di tab privat', icon: 'eyeOff', onPress: () => openNewTab(lm.url, { incognito: true }) },
      { label: 'Pratinjau cepat (Glance)', icon: 'eye', onPress: () => dispatch({ type: 'SET_UI', patch: { glanceUrl: lm.url } }) },
      { label: 'Bagikan tautan', icon: 'share', onPress: () => Share.share({ message: lm.url }).catch(() => {}) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ui.linkMenu?.url]);

  const renderTab = (tab: Tab, forceActive = false) => (
    <TabView key={tab.id} tab={tab} active={forceActive || tab.id === state.activeTabId} theme={theme} />
  );

  // ---------- elemen bar ----------
  const progressBar =
    activeTab?.loading && activeTab.progress > 0.02 && activeTab.progress < 1 ? (
      <View style={{ height: 2.5, marginTop: 2 }}>
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
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 4 }}>
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
              borderWidth: 1,
              borderColor: active ? theme.accent : theme.border,
            }}>
            <Text style={{ fontSize: 12.5, marginRight: 5 }}>{ws.icon}</Text>
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

  const addressRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: 2 }}>
      {/* SHIELDS */}
      <Pressable
        onPress={() => setShieldsOpen(true)}
        disabled={!activeTab}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 6,
          backgroundColor: pressed ? theme.surface2 : 'transparent',
        })}>
        <Icon name={adblockOn ? 'shield' : 'shieldOff'} size={19} color={adblockOn ? theme.accent : theme.subtext} />
        {adblockOn && stats && stats.blockedCount > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -1,
              right: -3,
              backgroundColor: theme.accent,
              borderRadius: 7,
              minWidth: 14,
              height: 14,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 3,
            }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
              {stats.blockedCount > 99 ? '99+' : stats.blockedCount}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* PILL alamat */}
      <Pressable
        onPress={activeTab ? openOmniboxEdit : () => openOmniboxNew()}
        android_ripple={{ color: theme.surface2, foreground: true }}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: pressed ? theme.surface2 : theme.pill,
          borderRadius: radius.pill,
          paddingHorizontal: 13,
          height: 42,
          borderWidth: 1,
          borderColor: isDesktopMode ? theme.accent : theme.border,
        })}>
        {activeTab?.url.startsWith('https://') ? (
          <Icon name="lock" size={13} color={theme.ok} />
        ) : (
          <Icon name="globe" size={14} color={theme.subtext} />
        )}
        {isDesktopMode ? (
          <View
            style={{
              backgroundColor: theme.accentSoft,
              borderRadius: 5,
              paddingHorizontal: 5,
              paddingVertical: 1,
              marginLeft: 5,
            }}>
            <Text style={{ color: theme.accent, fontSize: 9, fontWeight: '800' }}>DESKTOP</Text>
          </View>
        ) : null}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: theme.text,
            fontSize: 14.5,
            marginHorizontal: 8,
            fontWeight: '600',
          }}>
          {activeTab ? host || activeTab.url : 'Cari atau ketik URL'}
        </Text>
        {activeTab?.loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      </Pressable>

      {/* BOOKMARK */}
      <Pressable
        onPress={() => {
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
                title: activeTab.title || host,
              },
            });
          }
        }}
        disabled={!activeTab}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 6,
          backgroundColor: pressed ? theme.surface2 : 'transparent',
        })}>
        <Icon name={bookmark ? 'starFilled' : 'star'} size={19} color={bookmark ? theme.warn : theme.subtext} />
      </Pressable>
    </View>
  );

  const toolbar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
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
      {/* Refresh / Stop */}
      <IconButton
        name={activeTab?.loading ? 'close' : 'refresh'}
        theme={theme}
        disabled={!activeTab}
        onPress={() => {
          if (!activeTab) {
            return;
          }
          const wv = getWebView(activeTab.id);
          if (!wv) {
            return;
          }
          if (activeTab.loading) {
            wv.stopLoading();
          } else {
            wv.reload();
          }
        }}
      />
      <Pressable
        onPress={() => openOmniboxNew()}
        hitSlop={4}
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: pressed ? theme.accent + 'd0' : theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
        })}>
        <Icon name="plus" size={24} color="#fff" strokeWidth={2.4} />
      </Pressable>
      <IconButton
        name="tabs"
        theme={theme}
        badge={wsTabs.length || undefined}
        onPress={() => dispatch({ type: 'SET_UI', patch: { tabSwitcher: true } })}
      />
      {/* Mode desktop per-situs */}
      <Pressable
        onPress={toggleDesktopMode}
        hitSlop={4}
        accessibilityLabel="Mode desktop"
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDesktopMode ? theme.accentSoft : pressed ? theme.surface2 : 'transparent',
          borderWidth: 1,
          borderColor: isDesktopMode ? theme.accent : 'transparent',
        })}>
        <Icon name="monitor" size={22} color={isDesktopMode ? theme.accent : theme.text} />
      </Pressable>
      <IconButton name="more" theme={theme} onPress={() => setMenuOpen(true)} />
    </View>
  );

  const bars = compact ? null : (
    <View style={{ backgroundColor: theme.bar, zIndex: 20 }}>
      {workspaceBar}
      {addressRow}
      {progressBar}
      <View style={{ paddingHorizontal: spacing.xs, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 4 }}>
        {toolbar}
      </View>
    </View>
  );

  const empty = state.tabs.length === 0;
  const wsEmptyButTabsExist = !empty && wsTabs.length === 0;

  // ---------- panel SHIELDS (Brave) ----------
  const shieldsSheet = (
    <Sheet visible={shieldsOpen} onClose={() => setShieldsOpen(false)} title={`Shields — ${host || 'tak ada situs'}`} theme={theme}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: 6 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.accentSoft,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: 6,
          }}>
          <Icon name="shield" size={26} color={theme.accent} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
              {stats ? stats.blockedCount.toLocaleString('id-ID') : '—'} permintaan diblokir
            </Text>
            <Text style={{ color: theme.subtext, fontSize: 12.5, marginTop: 2 }}>
              iklan & pelacak di sesi ini • {stats ? stats.hosts.toLocaleString('id-ID') : '—'} host di daftar blokir
            </Text>
          </View>
        </View>
      </View>
      <ToggleRow
        theme={theme}
        icon="shield"
        title="Blokir iklan & pelacak"
        subtitle={activeTab ? `Untuk ${host}` : '—'}
        value={adblockOn}
        onValueChange={(v) => {
          if (host) {
            dispatch({ type: 'SET_SITE_CONFIG', host, patch: { adblockEnabled: v } });
          } else {
            dispatch({ type: 'SET_SETTINGS', patch: { adblockEnabled: v } });
          }
        }}
      />
      <ToggleRow
        theme={theme}
        icon="code"
        title="JavaScript"
        subtitle={activeTab ? `Untuk ${host} (muat ulang diperlukan)` : '—'}
        value={siteCfg?.javascriptEnabled !== false}
        onValueChange={(v) => host && dispatch({ type: 'SET_SITE_CONFIG', host, patch: { javascriptEnabled: v } })}
      />
      <ToggleRow
        theme={theme}
        icon="lock"
        title="Upgrade HTTPS"
        subtitle="Muat ulang untuk menerapkan"
        value={siteCfg?.httpsUpgrades !== false && state.settings.httpsUpgrades}
        onValueChange={(v) => host && dispatch({ type: 'SET_SITE_CONFIG', host, patch: { httpsUpgrades: v } })}
      />
      <ToggleRow
        theme={theme}
        icon="expand"
        title="Mode desktop"
        subtitle={isDesktopMode ? 'UA desktop aktif — matikan untuk mobile' : 'Tampilkan situs versi desktop'}
        value={isDesktopMode}
        onValueChange={() => toggleDesktopMode()}
      />
      <Row
        theme={theme}
        icon="gear"
        title="Semua pengaturan situs"
        subtitle="UA, CSS kustom, dan lainnya"
        onPress={() => {
          setShieldsOpen(false);
          dispatch({ type: 'SET_SCREEN', screen: 'siteSettings' });
        }}
        last
      />
    </Sheet>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />

      {barTop ? bars : null}

      {/* ---------- konten ---------- */}
      <View style={{ flex: 1 }}>
        {empty ? (
          <StartOverlay />
        ) : wsEmptyButTabsExist ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Icon name="folder" size={40} color={theme.subtext} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>
              Tidak ada tab di workspace ini
            </Text>
            <Text style={{ color: theme.subtext, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
              Tab Anda ada di workspace lain — buka daftar tab untuk berpindah, atau tekan ＋ untuk tab baru.
            </Text>
          </View>
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

        {/* banner unduhan (Via) */}
        {download ? (
          <Pressable
            onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'downloads' })}
            style={{
              position: 'absolute',
              top: 6,
              left: 10,
              right: 10,
              backgroundColor: theme.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.border,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 8,
              elevation: 8,
            }}>
            <Icon name="download" size={18} color={theme.accent} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                {download.status === 'connecting' ? 'Menghubungkan…' : download.filename}
              </Text>
              <View style={{ height: 4, backgroundColor: theme.surface2, borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                <View
                  style={{
                    height: 4,
                    width:
                      download.total > 0
                        ? `${Math.min(100, Math.round((download.done / download.total) * 100))}%`
                        : '30%',
                    backgroundColor: theme.accent,
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
                {download.total > 0
                  ? `${(download.done / 1048576).toFixed(1)} / ${(download.total / 1048576).toFixed(1)} MB`
                  : `${(download.done / 1048576).toFixed(1)} MB`}
                {download.speed > 0 ? ` • ${(download.speed / 1048576).toFixed(1)} MB/s` : ''}
                {' • multi-thread'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={theme.subtext} />
          </Pressable>
        ) : null}
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
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 6,
          }}>
          <Icon name="eye" size={21} color={theme.accent} />
        </Pressable>
      ) : null}

      {/* ---------- overlay ---------- */}
      <GlanceView theme={theme} />
      <TabSwitcher theme={theme} />
      {shieldsSheet}
      <ActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" actions={menuActions} theme={theme} />
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

// ---------------------------------------------------------------- awal (Zen: tanpa homepage)

function StartOverlay() {
  const { state, dispatch, openNewTab } = useStore();
  const theme = useTheme(state.settings.theme);
  const hour = new Date().getHours();
  const greeting =
    hour < 4 ? 'Selamat malam' : hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';

  const quickLinks = [
    { label: 'Google', url: 'https://www.google.com' },
    { label: 'Brave', url: 'https://search.brave.com' },
    { label: 'DuckDuckGo', url: 'https://duckduckgo.com' },
    { label: 'Wikipedia', url: 'https://id.wikipedia.org' },
    { label: 'YouTube', url: 'https://m.youtube.com' },
  ];

  const openOmnibox = () =>
    dispatch({ type: 'SET_OMNIBOX', patch: { open: true, mode: 'new', initial: '', incognito: false } });

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
          width: 78,
          height: 78,
          borderRadius: 24,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.accent,
        }}>
        <Text style={{ fontSize: 36, fontWeight: '900', color: theme.accent }}>Z</Text>
        <Text style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 17 }}>🩷</Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: theme.text, fontSize: 23, fontWeight: '800' }}>{greeting}</Text>
        <Text style={{ color: theme.subtext, fontSize: 13.5, marginTop: 4, textAlign: 'center' }}>
          Zenith — ketuk untuk mencari atau mengetik URL
        </Text>
      </View>

      <Pressable
        onPress={openOmnibox}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          maxWidth: 440,
          backgroundColor: pressed ? theme.surface2 : theme.surface,
          borderRadius: radius.pill,
          paddingHorizontal: 18,
          height: 52,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          elevation: 3,
        })}>
        <Icon name="search" size={19} color={theme.subtext} />
        <Text style={{ color: theme.subtext, fontSize: 15.5, marginLeft: 12 }}>Cari atau ketik URL</Text>
        <View style={{ flex: 1 }} />
        <Icon name="forward" size={16} color={theme.accent} />
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
        <View style={{ width: '100%', maxWidth: 440, marginTop: spacing.sm }}>
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
