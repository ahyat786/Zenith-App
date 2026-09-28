/**
 * BrowserScreen — kerangka utama Zenith v0.2.
 *
 * UX final: Zen (omnibox mengambang di atas, workspaces, split, glance,
 * compact, tanpa homepage) + Via (bar bawah ringkas, unduhan cepat)
 * + Brave (tombol shields dengan penghitung blokir + upgrade HTTPS).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FirefoxMenu } from './FirefoxMenu';
import { NewTabPage } from './NewTabPage';
import { getWebView } from './refs';
import { consumeHardwareBack, noteBackHandled, wasBackJustHandled } from './backStack';
import { NEW_TAB_URL, isNewTabUrl } from './newtab';
import { blankTabHeld, freshTabId, releaseBlankTab } from './navIntent';
import { Icon } from '../ui/Icon';
import { ActionSheet, IconButton, Row, Sheet, ToggleRow, type SheetAction } from '../ui/kit';
import {
  adblockClearConnectionLog,
  adblockConnectionLog,
  adblockStats,
  clearPrivateSession,
  type AdblockStats,
  type ConnLogEntry,
} from '../core/native';
import { DESKTOP_UA, isDesktopUa } from '../core/desktop';
import { subscribeDownloads, type DownloadJob } from '../core/downloads';
import type { Tab } from '../types';

export function BrowserScreen() {
  const { state, fullState, dispatch, switchProfile, activeTab, tabsInWorkspace, openNewTab, siteConfigFor } = useStore();
  const theme = useTheme(state.settings.theme);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shieldsOpen, setShieldsOpen] = useState(false);
  const [stats, setStats] = useState<AdblockStats | null>(null);
  const [download, setDownload] = useState<DownloadJob | null>(null);
  const [connLog, setConnLog] = useState<ConnLogEntry[]>([]);
  const [profilesOpen, setProfilesOpen] = useState(false);


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
      dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: activeTab.workspaceId, tabId: activeTab.id });
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

  // ---------- log koneksi Shield Guard (hostname) ----------
  const refreshConnLog = useCallback(async () => {
    setConnLog(await adblockConnectionLog());
  }, []);
  useEffect(() => {
    if (!shieldsOpen) {
      return;
    }
    refreshConnLog();
    const t = setInterval(refreshConnLog, 1500);
    return () => clearInterval(t);
  }, [shieldsOpen, refreshConnLog, activeTab?.url]);

  // ---------- banner unduhan ----------
  // error/canceled tidak boleh menempel. X atau 0-byte yang macet disembunyikan.
  const dismissedBanner = useRef<string | null>(null);
  const lastReloadAt = useRef(0);
  useEffect(() => {
    const unsub = subscribeDownloads((job) => {
      if (job.status === 'downloading' || job.status === 'connecting') {
        if (dismissedBanner.current !== job.id) {
          setDownload(job);
        }
        return;
      }
      if (downloadRef.current?.id === job.id) {
        setDownload(null);
      }
    });
    return unsub;
  }, []);
  const downloadRef = useRef<DownloadJob | null>(null);
  useEffect(() => {
    downloadRef.current = download;
  }, [download]);

  const privateCount = fullState.tabs.filter((t) => t.incognito).length;
  useEffect(() => {
    if (!state.hydrated || privateCount > 0) {
      return;
    }
    clearPrivateSession();
  }, [privateCount, state.hydrated]);

  const backRef = useRef({
    menuOpen,
    shieldsOpen,
    profilesOpen,
    ui: state.ui,
    tabId: activeTab?.id ?? null,
    canGoBack: !!activeTab?.canGoBack,
  });
  backRef.current = {
    menuOpen,
    shieldsOpen,
    profilesOpen,
    ui: state.ui,
    tabId: activeTab?.id ?? null,
    canGoBack: !!activeTab?.canGoBack,
  };

  // ---------- tombol fisik kembali ----------
  // Menu dan layar yang dibuka dari Zenith ditutup dulu. Tab tidak pernah
  // ditutup. Jika tidak ada yang ditutup, aktivitas tidak di-finish — aplikasi
  // hanya pindah ke latar supaya akun dan tab tetap hidup.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (wasBackJustHandled()) {
        return true;
      }
      if (consumeHardwareBack()) {
        return true;
      }
      const cur = backRef.current;
      const close = () => {
        noteBackHandled();
        return true;
      };
      if (cur.menuOpen) {
        setMenuOpen(false);
        return close();
      }
      if (cur.shieldsOpen) {
        setShieldsOpen(false);
        return close();
      }
      if (cur.profilesOpen) {
        setProfilesOpen(false);
        return close();
      }
      const ui = cur.ui;
      if (ui.omnibox.open) {
        dispatch({ type: 'SET_OMNIBOX', patch: { open: false } });
        return close();
      }
      if (ui.glanceUrl) {
        dispatch({ type: 'SET_UI', patch: { glanceUrl: null } });
        return close();
      }
      if (ui.tabSwitcher) {
        dispatch({ type: 'SET_UI', patch: { tabSwitcher: false } });
        return close();
      }
      if (ui.linkMenu) {
        dispatch({ type: 'SET_UI', patch: { linkMenu: null } });
        return close();
      }
      if (ui.compact) {
        dispatch({ type: 'SET_UI', patch: { compact: false } });
        return close();
      }
      if (ui.screen !== 'browser') {
        dispatch({ type: 'SET_SCREEN', screen: 'browser' });
        return close();
      }
      if (cur.canGoBack && cur.tabId) {
        getWebView(cur.tabId)?.goBack();
        return close();
      }
      return false;
    });
    return () => sub.remove();
  }, [dispatch]);

  // ---------- aksi ----------
  const openOmniboxNew = (incognito = false) =>
    dispatch({ type: 'SET_OMNIBOX', patch: { open: true, mode: 'new', initial: '', incognito } });
  const [forceBlank, setForceBlank] = useState(false);
  const openFreshTab = (incognito = false) => {
    setForceBlank(true);
    openNewTab(NEW_TAB_URL, { incognito });
    if (incognito) {
      ToastAndroid.show('Mode privat — riwayat tidak disimpan', ToastAndroid.SHORT);
    }
  };
  const freshOpen = fullState.tabs.find(
    (t) => t.id === freshTabId() && t.profileId === state.activeProfileId && isNewTabUrl(t.url),
  );
  const freshOpenId = freshOpen ? freshOpen.id : null;
  const onNewTabPage =
    forceBlank || blankTabHeld() || freshOpenId != null || !activeTab || isNewTabUrl(activeTab?.url);
  useEffect(() => {
    if (forceBlank && !blankTabHeld() && freshOpenId == null) {
      setForceBlank(false);
    }
  }, [forceBlank, state.activeTabId, freshOpenId]);
  backRef.current.canGoBack = !!activeTab?.canGoBack && !onNewTabPage;
  const openOmniboxEdit = () =>
    dispatch({
      type: 'SET_OMNIBOX',
      patch: {
        open: true,
        mode: 'edit',
        initial: onNewTabPage || !activeTab || isNewTabUrl(activeTab.url) ? '' : activeTab.url,
        incognito: !!activeTab?.incognito,
      },
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

  const toggleBookmark = () => {
    if (!activeTab?.url || isNewTabUrl(activeTab.url)) {
      return;
    }
    if (bookmark) {
      dispatch({ type: 'DEL_BOOKMARK', id: bookmark.id });
      return;
    }
    dispatch({
      type: 'ADD_BOOKMARK',
      bookmark: {
        id: `bm-${Date.now().toString(36)}`,
        url: activeTab.url,
        title: activeTab.title || hostOfUrl(activeTab.url),
      },
    });
  };

  const findInPage = (q: string) => {
    const wv = activeTab && getWebView(activeTab.id);
    if (!wv) {
      ToastAndroid.show('Buka halaman dulu', ToastAndroid.SHORT);
      return;
    }
    const js =
      `(function(){var q=${JSON.stringify(q)};try{if(window.find&&window.find(q,false,false,true))return true;}catch(e){}` +
      `var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);var n,l=q.toLowerCase();` +
      `while((n=w.nextNode())){var i=(n.nodeValue||'').toLowerCase().indexOf(l);if(i>=0){var r=document.createRange();` +
      `r.setStart(n,i);r.setEnd(n,Math.min(n.nodeValue.length,i+q.length));var s=window.getSelection();` +
      `s.removeAllRanges();s.addRange(r);if(n.parentElement)n.parentElement.scrollIntoView({block:'center'});return true;}}return true;})();true;`;
    wv.injectJavaScript(js);
  };

  const linkActions: SheetAction[] = useMemo(() => {
    const lm = state.ui.linkMenu;
    if (!lm) {
      return [];
    }
    return [
      { label: 'Buka di tab baru', icon: 'plus', onPress: () => openNewTab(lm.url, { incognito: !!activeTab?.incognito }) },
      { label: 'Buka di tab privat', icon: 'eyeOff', onPress: () => openNewTab(lm.url, { incognito: true }) },
      { label: 'Pratinjau cepat (Glance)', icon: 'eye', onPress: () => dispatch({ type: 'SET_UI', patch: { glanceUrl: lm.url } }) },
      { label: 'Bagikan tautan', icon: 'share', onPress: () => Share.share({ message: lm.url }).catch(() => {}) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ui.linkMenu?.url]);

  const renderTab = (tab: Tab, forceActive = false) => {
    const shown = forceActive || tab.id === state.activeTabId || (onNewTabPage && freshOpenId === tab.id);
    if (isNewTabUrl(tab.url)) {
      return (
        <View key={tab.id} style={{ flex: 1, display: shown ? 'flex' : 'none', zIndex: shown ? 2 : 0 }}>
          <NewTabPage theme={theme} tab={tab} />
        </View>
      );
    }
    return <TabView key={tab.id} tab={tab} active={shown} theme={theme} />;
  };

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
            onPress={() => {
              releaseBlankTab();
              dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: ws.id });
            }}
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

  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];
  const addressRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: 2 }}>
      <Pressable
        onPress={() => setProfilesOpen(true)}
        hitSlop={6}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          marginRight: 6,
          backgroundColor: activeProfile?.color ?? theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
          {(activeProfile?.name || 'U').slice(0, 1).toUpperCase()}
        </Text>
      </Pressable>
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
          borderColor: activeTab?.incognito || isDesktopMode ? theme.accent : theme.border,
        })}>
        {activeTab?.incognito ? (
          <Icon name="eyeOff" size={14} color={theme.accent} />
        ) : !onNewTabPage && activeTab?.url.startsWith('https://') ? (
          <Icon name="lock" size={13} color={theme.ok} />
        ) : (
          <Icon name="search" size={14} color={theme.subtext} />
        )}
        {activeTab?.incognito ? (
          <View
            style={{
              backgroundColor: theme.accentSoft,
              borderRadius: 5,
              paddingHorizontal: 5,
              paddingVertical: 1,
              marginLeft: 5,
            }}>
            <Text style={{ color: theme.accent, fontSize: 9, fontWeight: '800' }}>PRIVAT</Text>
          </View>
        ) : null}
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
          {onNewTabPage ? 'Cari atau ketik alamat' : host || activeTab?.url}
        </Text>
        {activeTab?.loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      </Pressable>

      {/* BOOKMARK */}
      <Pressable
        onPress={toggleBookmark}
        disabled={!activeTab || onNewTabPage}
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
      {/* Refresh / Stop — satu ketukan, tidak mengulang sendiri */}
      <IconButton
        name={activeTab?.loading ? 'close' : 'refresh'}
        theme={theme}
        disabled={!activeTab || onNewTabPage}
        onPress={() => {
          if (!activeTab || onNewTabPage) {
            return;
          }
          const wv = getWebView(activeTab.id);
          if (!wv) {
            return;
          }
          if (activeTab.loading) {
            wv.stopLoading();
            dispatch({ type: 'UPDATE_TAB', id: activeTab.id, patch: { loading: false } });
            return;
          }
          const now = Date.now();
          if (now - lastReloadAt.current < 1200) {
            return;
          }
          lastReloadAt.current = now;
          wv.reload();
        }}
      />
      <Pressable
        onPress={() => openFreshTab(!!activeTab?.incognito)}
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
    <View style={{ backgroundColor: activeTab?.incognito ? theme.accentSoft : theme.bar, zIndex: 20 }}>
      {activeTab?.incognito ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: 4 }}>
          <Icon name="eyeOff" size={13} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 11.5, fontWeight: '800', marginLeft: 6 }}>MODE PRIVAT</Text>
          <Text style={{ color: theme.subtext, fontSize: 11.5, marginLeft: 8, flex: 1 }} numberOfLines={1}>
            Tidak masuk riwayat
          </Text>
        </View>
      ) : null}
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
  const mountTabs = useMemo(() => {
    const pid = state.activeProfileId;
    const mine = fullState.tabs.filter((t) => t.profileId === pid);
    // Tab baru tidak boleh menampilkan WebView tab atau profil lain.
    // Satu WebView saja: tab lain tidak boleh menempel atau menyalin URL-nya.
    if (onNewTabPage) {
      return [];
    }
    return mine.filter((t) => t.id === state.activeTabId && !isNewTabUrl(t.url));
  }, [fullState.tabs, state.activeProfileId, state.activeWorkspaceId, state.activeTabId, onNewTabPage, freshOpenId]);

  // ---------- panel SHIELD GUARD (Brave + log koneksi) ----------
  const shieldsSheet = (
    <Sheet visible={shieldsOpen} onClose={() => setShieldsOpen(false)} title={`Shield Guard — ${host || 'tak ada situs'}`} theme={theme}>
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

      {/* ---------- LOG KONEKSI (hostname) ---------- */}
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Icon name="zap" size={14} color={theme.subtext} />
          <Text
            style={{
              color: theme.subtext,
              fontSize: 12,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginLeft: 6,
              flex: 1,
            }}>
            Connection log — {connLog.length ? `${connLog.length} terakhir` : 'menunggu permintaan'}
          </Text>
          {connLog.length > 0 ? (
            <Pressable
              onPress={async () => {
                await adblockClearConnectionLog();
                setConnLog([]);
              }}
              hitSlop={8}
              style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: theme.surface2 }}>
              <Text style={{ color: theme.subtext, fontSize: 11.5, fontWeight: '700' }}>Bersihkan</Text>
            </Pressable>
          ) : null}
        </View>
        {connLog.length === 0 ? (
          <Text style={{ color: theme.subtext, fontSize: 12.5, paddingBottom: 6 }}>
            Buka halaman apa pun — hostname setiap permintaan muncul di sini lengkap dengan statusnya.
          </Text>
        ) : (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: radius.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
              paddingVertical: 4,
              marginBottom: 4,
            }}>
            {connLog.slice(0, 12).map((e, i) => (
              <View
                key={`${e.at}-${e.host}-${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    marginRight: 8,
                    backgroundColor: e.blocked ? theme.danger : e.main ? theme.accent : theme.ok,
                  }}
                />
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12.5, fontWeight: '600', flex: 1 }}>
                  {e.host}
                </Text>
                <Text style={{ color: theme.subtext, fontSize: 11, marginLeft: 8 }}>
                  {e.main ? 'halaman' : e.blocked ? '⛔ diblokir' : 'lolos'}
                </Text>
              </View>
            ))}
            {connLog.length > 12 ? (
              <Text style={{ color: theme.subtext, fontSize: 11, textAlign: 'center', paddingVertical: 4 }}>
                +{connLog.length - 12} lainnya
              </Text>
            ) : null}
          </View>
        )}
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
        icon="globe"
        title="Jaringan & DNS Aman"
        subtitle="Kelompok server utama/cadangan + uji resolusi"
        onPress={() => {
          setShieldsOpen(false);
          dispatch({ type: 'SET_SCREEN', screen: 'settings' });
        }}
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
      <View
        key={onNewTabPage ? `${state.activeProfileId}:blank` : state.activeProfileId}
        style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.bg }}
      >
        {onNewTabPage ? null : mountTabs
          .filter((t) => !(splitActive && splitIds.includes(t.id)))
          .map((t) => renderTab(t))}
        {onNewTabPage ? (
          <View
            collapsable={false}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 30, elevation: 24 }]}
          >
            <NewTabPage
              theme={theme}
              tab={freshOpen ?? (activeTab && isNewTabUrl(activeTab.url) ? activeTab : null)}
            />
          </View>
        ) : null}
        {onNewTabPage ? null : empty ? (
          <View style={StyleSheet.absoluteFill}>
            <NewTabPage theme={theme} />
          </View>
        ) : wsEmptyButTabsExist && !splitActive ? (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: theme.bg }]}>
            <Icon name="folder" size={40} color={theme.subtext} />
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>
              Tidak ada tab di workspace ini
            </Text>
            <Text style={{ color: theme.subtext, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
              Tab di workspace lain tetap terbuka di memori. Pindah workspace untuk kembali tanpa memuat ulang.
            </Text>
          </View>
        ) : null}
        {splitActive && !onNewTabPage ? (
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

        {/* banner unduhan — bawah, bisa ditutup, tidak menempel saat gagal */}
        {download && (download.status === 'downloading' || download.status === 'connecting') ? (
          <View
            style={{
              position: 'absolute',
              bottom: 8,
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
            <Pressable
              onPress={() => dispatch({ type: 'SET_SCREEN', screen: 'downloads' })}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="download" size={18} color={theme.accent} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                  {download.filename || 'Mengunduh…'}
                </Text>
                <View style={{ height: 4, backgroundColor: theme.surface2, borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: 4,
                      width:
                        download.total > 0
                          ? `${Math.min(100, Math.round((download.done / download.total) * 100))}%`
                          : '8%',
                      backgroundColor: theme.accent,
                      borderRadius: 2,
                    }}
                  />
                </View>
                <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
                  {download.done === 0
                    ? 'Menunggu data'
                    : download.total > 0
                      ? `${(download.done / 1048576).toFixed(1)} / ${(download.total / 1048576).toFixed(1)} MB`
                      : `${(download.done / 1048576).toFixed(1)} MB`}
                  {download.speed > 0 ? ` • ${(download.speed / 1048576).toFixed(1)} MB/s` : ''}
                </Text>
              </View>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                dismissedBanner.current = download.id;
                setDownload(null);
              }}
              style={{ padding: 6 }}>
              <Icon name="close" size={16} color={theme.subtext} />
            </Pressable>
          </View>
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
      <FirefoxMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        theme={theme}
        canBack={!!activeTab?.canGoBack}
        canForward={!!activeTab?.canGoForward}
        canPage={!!activeTab && !isNewTabUrl(activeTab.url)}
        bookmarked={!!bookmark && !onNewTabPage}
        desktop={isDesktopMode}
        compact={compact}
        splitActive={splitActive}
        extensions={state.extensions}
        onBack={() => activeTab && getWebView(activeTab.id)?.goBack()}
        onForward={() => activeTab && getWebView(activeTab.id)?.goForward()}
        onShare={() => activeTab?.url && !isNewTabUrl(activeTab.url) && Share.share({ message: activeTab.url }).catch(() => {})}
        onReload={() => {
          if (!activeTab || onNewTabPage) {
            return;
          }
          const now = Date.now();
          if (now - lastReloadAt.current < 1200) {
            return;
          }
          lastReloadAt.current = now;
          getWebView(activeTab.id)?.reload();
        }}
        onBookmark={toggleBookmark}
        onToggleDesktop={toggleDesktopMode}
        onFind={findInPage}
        onToggleExtension={(id, enabled) => dispatch({ type: 'UPDATE_EXTENSION', id, patch: { enabled } })}
        onManageExtensions={() => dispatch({ type: 'SET_SCREEN', screen: 'extensions' })}
        onHistory={() => dispatch({ type: 'SET_SCREEN', screen: 'history' })}
        onBookmarks={() => dispatch({ type: 'SET_SCREEN', screen: 'bookmarks' })}
        onDownloads={() => dispatch({ type: 'SET_SCREEN', screen: 'downloads' })}
        onPasswords={() => dispatch({ type: 'SET_SCREEN', screen: 'passwords' })}
        onAccount={() => dispatch({ type: 'SET_SCREEN', screen: 'account' })}
        onSettings={() => dispatch({ type: 'SET_SCREEN', screen: 'settings' })}
        onNewTab={() => openFreshTab(false)}
        onPrivateTab={() => openFreshTab(true)}
        onSplit={() => (splitActive ? dispatch({ type: 'SET_SPLIT', ids: [] }) : doSplit())}
        onCompact={() => dispatch({ type: 'SET_UI', patch: { compact: !compact } })}
        onScripts={() => dispatch({ type: 'SET_SCREEN', screen: 'scripts' })}
        onSiteSettings={() => dispatch({ type: 'SET_SCREEN', screen: 'siteSettings' })}
      />
      <ActionSheet
        visible={!!state.ui.linkMenu}
        onClose={() => dispatch({ type: 'SET_UI', patch: { linkMenu: null } })}
        title={state.ui.linkMenu ? hostOfUrl(state.ui.linkMenu.url) : undefined}
        actions={linkActions}
        theme={theme}
      />
      <Sheet visible={profilesOpen} onClose={() => setProfilesOpen(false)} title="Profil" theme={theme}>
        <View style={{ padding: spacing.lg, gap: 8 }}>
          <Text style={{ color: theme.subtext, fontSize: 13, lineHeight: 19, marginBottom: 4 }}>
            Pindah profil tidak menutup tab. Setiap profil menyimpan sesinya sendiri.
          </Text>
          {state.profiles.map((p) => {
            const n = fullState.tabs.filter((t) => t.profileId === p.id).length;
            const on = p.id === state.activeProfileId;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  setProfilesOpen(false);
                  if (!on) {
                    switchProfile(p.id);
                    ToastAndroid.show(`${p.name} — tab lain tetap tersimpan`, ToastAndroid.SHORT);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: on ? theme.accentSoft : theme.surface2,
                }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: p.color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{p.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{p.name}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>{n} tab tersimpan</Text>
                </View>
                {on ? <Text style={{ color: p.color, fontWeight: '800', fontSize: 12 }}>AKTIF</Text> : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              setProfilesOpen(false);
              dispatch({ type: 'SET_SCREEN', screen: 'account' });
            }}
            style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: theme.accent, fontWeight: '700' }}>Kelola profil</Text>
          </Pressable>
        </View>
      </Sheet>
      {state.ui.omnibox.open ? <Omnibox theme={theme} /> : null}
    </View>
  );
}

