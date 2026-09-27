/**
 * Omnibox Zen — bilah URL mengambang gaya Zen Browser.
 *
 * Prinsip Zen: TIDAK ada halaman "tab baru" — tombol apa pun membuka
 * URL bar mengambang tepat DI ATAS tab saat ini. Panel ditempatkan di
 * bagian atas layar sehingga keyboard TIDAK PERNAH menutupinya
 * (perbaikan bug v0.1.x di mana keyboard menutupi input).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../state/store';
import type { Theme } from '../theme';
import { radius, spacing } from '../theme';
import { fetchSuggestions, fuzzyScore } from '../core/suggest';
import { getWebView } from './refs';
import { isNewTabUrl } from './newtab';
import { Icon, type IconName } from '../ui/Icon';

interface SuggestionRow {
  key: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
}

export function Omnibox({ theme }: { theme: Theme }) {
  const { state, dispatch, activeTab, activeEngine, resolveInput, openNewTab } = useStore();
  const omnibox = state.ui.omnibox;
  const [text, setText] = useState(omnibox.initial);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const inputRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // autoFocus menangani mayoritas kasus; retry cadangan untuk perangkat lambat.
    const t1 = setTimeout(() => inputRef.current?.focus(), 120);
    const t2 = setTimeout(() => inputRef.current?.focus(), 450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const close = () => {
    Keyboard.dismiss();
    dispatch({ type: 'SET_OMNIBOX', patch: { open: false, initial: '', incognito: false } });
  };

  const go = async (raw: string, remember = true) => {
    const q = raw.trim();
    if (!q) {
      close();
      return;
    }
    const { url, isSearch } = await resolveInput(q);
    if (remember && isSearch) {
      dispatch({ type: 'ADD_RECENT_SEARCH', query: q });
    }
    if (!url) {
      close();
      return;
    }
    if (activeTab && isNewTabUrl(activeTab.url) && omnibox.mode !== 'new') {
      dispatch({
        type: 'UPDATE_TAB',
        id: activeTab.id,
        patch: { url, title: '', loading: true, progress: 0.08 },
      });
    } else if (omnibox.mode === 'new' || !activeTab) {
      openNewTab(url, { incognito: omnibox.incognito });
    } else {
      const wv = getWebView(activeTab.id);
      if (wv && url !== activeTab.url) {
        wv.injectJavaScript(`location.href=${JSON.stringify(url)};true;`);
      } else if (!wv) {
        dispatch({
          type: 'UPDATE_TAB',
          id: activeTab.id,
          patch: { url, title: '', loading: true, progress: 0.08 },
        });
      }
    }
    close();
  };

  // ---- hitung baris saran (debounce 160ms) ----
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const q = text.trim();
      try {
        if (!q) {
          // kosong → tampilkan pencarian terakhir
          const recents: SuggestionRow[] = state.settings.recentSearches.slice(0, 8).map((rs) => ({
            key: 'r:' + rs,
            icon: 'clock',
            title: rs,
            subtitle: 'Pencarian terakhir',
            onPress: () => go(rs, false),
          }));
          if (alive) {
            setRows(recents);
          }
          return;
        }
        const { url, isSearch } = await resolveInput(q);
        if (!alive) {
          return;
        }
        const out: SuggestionRow[] = [];
        if (isSearch) {
          out.push({
            key: 'search',
            icon: 'search',
            title: q,
            subtitle: `Cari dengan ${activeEngine.name}${omnibox.incognito ? ' • privat' : ''}`,
            onPress: () => go(q),
          });
        } else {
          out.push({
            key: 'url',
            icon: 'globe',
            title: url,
            subtitle: 'Buka situs web',
            onPress: () => go(q, false),
          });
        }
        if (state.settings.searchSuggestions && isSearch && activeEngine.suggestUrl) {
          const suggestions = await fetchSuggestions(activeEngine, q);
          if (!alive) {
            return;
          }
          for (const s of suggestions.slice(0, 6)) {
            if (s.toLowerCase() === q.toLowerCase()) {
              continue;
            }
            out.push({
              key: 's:' + s,
              icon: 'search',
              title: s,
              subtitle: `Saran ${activeEngine.name}`,
              onPress: () => go(s),
            });
          }
        }
        for (const h of state.history
          .map((h) => ({ h, s: fuzzyScore(`${h.url} ${h.title}`, q) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 5)) {
          out.push({
            key: 'h:' + h.h.url + h.h.at,
            icon: 'clock',
            title: h.h.title || h.h.url,
            subtitle: h.h.url,
            onPress: () => go(h.h.url, false),
          });
        }
        for (const b of state.bookmarks
          .map((b) => ({ b, s: fuzzyScore(`${b.url} ${b.title}`, q) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)) {
          out.push({
            key: 'b:' + b.b.id,
            icon: 'bookmark',
            title: b.b.title || b.b.url,
            subtitle: 'Bookmark',
            onPress: () => go(b.b.url, false),
          });
        }
        for (const t of state.tabs
          .filter((t) => t.id !== activeTab?.id)
          .map((t) => ({ t, s: fuzzyScore(`${t.url} ${t.title}`, q) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)) {
          out.push({
            key: 't:' + t.t.id,
            icon: 'tabs',
            title: t.t.title || t.t.url,
            subtitle: 'Tab terbuka — ketuk untuk pindah',
            onPress: () => {
              dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: t.t.workspaceId });
              dispatch({ type: 'SET_ACTIVE_TAB', id: t.t.id });
              close();
            },
          });
        }
        if (alive) {
          setRows(out.slice(0, 14));
        }
      } catch {
        if (alive) {
          setRows([]);
        }
      }
    }, 160);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, activeEngine.id, state.settings.searchSuggestions, state.settings.recentSearches, state.history, state.bookmarks, state.tabs, activeTab?.id, omnibox.incognito]);

  const screenH = Dimensions.get('window').height;

  return (
    /* Modal native = selalu tampil di atas bar/WebView (perbaikan v0.3.2:
       overlay absolute biasa kalah dari view ber-elevation di Android). */
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: theme.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={close} />

        {/* Panel mengambang DI ATAS — keyboard di bawah tidak pernah menutup */}
      <View
        style={{
          position: 'absolute',
          top: Math.max(insets.top, 10) + 2,
          left: 10,
          right: 10,
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: theme.border,
          paddingTop: 10,
          paddingBottom: 6,
          maxHeight: screenH * 0.62,
          elevation: 18,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}>
        {/* baris input */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.surface2,
            borderRadius: radius.md,
            marginHorizontal: 10,
            paddingHorizontal: 12,
          }}>
          <Icon
            name={omnibox.incognito ? 'eyeOff' : 'search'}
            size={19}
            color={omnibox.incognito ? theme.accent : theme.subtext}
          />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder={omnibox.incognito ? 'Cari di tab privat…' : 'Cari atau ketik URL'}
            placeholderTextColor={theme.subtext}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => go(text)}
            selectTextOnFocus
            blurOnSubmit={false}
            style={{
              flex: 1,
              color: theme.text,
              fontSize: 16.5,
              paddingVertical: 12,
              paddingHorizontal: 10,
              fontWeight: '500',
            }}
          />
          {text.length > 0 ? (
            <Pressable hitSlop={10} onPress={() => setText('')} style={{ padding: 4 }}>
              <Icon name="close" size={17} color={theme.subtext} />
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={8}
            onPress={() => go(text)}
            style={{
              marginLeft: 6,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: theme.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="forward" size={16} color="#fff" />
          </Pressable>
        </View>

        {/* chip mesin pencari */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 8 }}
          contentContainerStyle={{ paddingHorizontal: 10 }}>
          {state.settings.engines.map((engine) => {
            const active = engine.id === activeEngine.id;
            return (
              <Pressable
                key={engine.id}
                onPress={() =>
                  dispatch({ type: 'SET_SETTINGS', patch: { defaultEngineId: engine.id } })
                }
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  marginRight: 8,
                  backgroundColor: active ? theme.accent : theme.surface2,
                  borderWidth: 1,
                  borderColor: active ? theme.accent : theme.border,
                }}>
                <Text
                  style={{
                    color: active ? '#fff' : theme.subtext,
                    fontSize: 13,
                    fontWeight: '700',
                  }}>
                  {engine.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text
          style={{
            color: theme.subtext,
            fontSize: 11.5,
            marginTop: 8,
            marginBottom: 2,
            marginHorizontal: 14,
          }}>
          {omnibox.mode === 'new' || !activeTab
            ? `Enter → buka di tab baru${omnibox.incognito ? ' (privat)' : ''}`
            : `Enter → navigasi di tab ini${activeTab.title ? '' : ''}`}
        </Text>

        {/* daftar saran */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={{ maxHeight: screenH * 0.38 }}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              android_ripple={{ color: theme.surface2 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 11,
              }}>
              <View style={{ marginRight: 12 }}>
                <Icon name={row.icon} size={18} color={theme.subtext} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15 }}>
                  {row.title}
                </Text>
                {row.subtitle ? (
                  <Text numberOfLines={1} style={{ color: theme.subtext, fontSize: 12 }}>
                    {row.subtitle}
                  </Text>
                ) : null}
              </View>
                <Icon name="chevronRight" size={15} color={theme.border} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
}
