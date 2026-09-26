/**
 * Omnibox Zen — bilah URL mengambang gaya Zen Browser.
 * Menekan tombol "+" membuka omnibox di atas tab saat ini (tanpa halaman
 * tab baru khusus), persis filosofi URL bar Zen.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useStore } from '../state/store';
import type { Theme } from '../theme';
import { radius, spacing } from '../theme';
import { fetchSuggestions, fuzzyScore } from '../core/suggest';
import { getWebView } from './refs';
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

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const close = () =>
    dispatch({ type: 'SET_OMNIBOX', patch: { open: false, initial: '', incognito: false } });

  const go = async (raw: string) => {
    const q = raw.trim();
    if (!q) {
      close();
      return;
    }
    const { url } = await resolveInput(q);
    if (!url) {
      close();
      return;
    }
    if (omnibox.mode === 'new' || !activeTab) {
      openNewTab(url, { incognito: omnibox.incognito });
    } else {
      const wv = getWebView(activeTab.id);
      if (wv) {
        if (url !== activeTab.url) {
          wv.injectJavaScript(`location.href=${JSON.stringify(url)};true;`);
        }
      } else {
        openNewTab(url);
      }
    }
    close();
  };

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      const q = text.trim();
      if (!q) {
        setRows([]);
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
          title: `Cari “${q}”`,
          subtitle: `${activeEngine.name}${omnibox.incognito ? ' • tab privat' : ''}`,
          onPress: () => go(q),
        });
      } else {
        out.push({
          key: 'url',
          icon: 'globe',
          title: url,
          subtitle: 'Buka situs web',
          onPress: () => go(q),
        });
      }
      if (state.settings.searchSuggestions && isSearch && activeEngine.suggestUrl) {
        const suggestions = await fetchSuggestions(activeEngine, q);
        if (!alive) {
          return;
        }
        for (const s of suggestions.slice(0, 6)) {
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
          onPress: () => go(h.h.url),
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
          onPress: () => go(b.b.url),
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
          subtitle: 'Tab terbuka',
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
    }, 170);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, activeEngine.id, state.settings.searchSuggestions, state.history, state.bookmarks, state.tabs, activeTab?.id, omnibox.incognito]);

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.overlay,
        zIndex: 60,
      }}>
      <Pressable style={{ flex: 1 }} onPress={close} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          backgroundColor: theme.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          maxHeight: '82%',
          paddingBottom: 16,
        }}>
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.surface2,
              borderRadius: radius.pill,
              paddingHorizontal: 14,
            }}>
            <Icon name={omnibox.incognito ? 'eyeOff' : 'search'} size={19} color={theme.subtext} />
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={omnibox.incognito ? 'Cari di tab privat…' : 'Cari atau ketik URL'}
              placeholderTextColor={theme.subtext}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={() => go(text)}
              selectTextOnFocus
              style={{
                flex: 1,
                color: theme.text,
                fontSize: 16,
                paddingVertical: 12,
                paddingHorizontal: 10,
              }}
            />
            {text.length > 0 ? (
              <Pressable hitSlop={8} onPress={() => setText('')}>
                <Icon name="close" size={17} color={theme.subtext} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {state.settings.engines.map((engine) => {
              const active = engine.id === activeEngine.id;
              return (
                <Pressable
                  key={engine.id}
                  onPress={() => dispatch({ type: 'SET_SETTINGS', patch: { defaultEngineId: engine.id } })}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    marginRight: 8,
                    backgroundColor: active ? theme.accent : theme.surface2,
                  }}>
                  <Text style={{ color: active ? '#fff' : theme.subtext, fontSize: 13, fontWeight: '600' }}>
                    {engine.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={{ color: theme.subtext, fontSize: 12 }}>
            {omnibox.mode === 'new' || !activeTab
              ? `Akan dibuka di tab baru${omnibox.incognito ? ' (privat)' : ''}`
              : 'Navigasi di tab saat ini'}
          </Text>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 400 }}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              android_ripple={{ color: theme.surface2 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: spacing.lg,
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
            </Pressable>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
