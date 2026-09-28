/**
 * Menu halaman — susunan Firefox Android:
 * kembali/maju/bagikan/segarkan, markah, cari di laman, situs desktop,
 * ekstensi (bisa dibuka), lebih banyak, kisi riwayat/markah/unduhan/sandi,
 * lalu pengaturan.
 */

import React, { useState } from 'react';
import { useHardwareBack } from './backStack';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Theme } from '../theme';
import type { Extension } from '../types';
import { Icon, type IconName } from '../ui/Icon';
import { useStore } from '../state/store';

interface Props {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
  canBack: boolean;
  canForward: boolean;
  canPage: boolean;
  bookmarked: boolean;
  desktop: boolean;
  compact: boolean;
  splitActive: boolean;
  extensions: Extension[];
  onBack: () => void;
  onForward: () => void;
  onShare: () => void;
  onReload: () => void;
  onBookmark: () => void;
  onToggleDesktop: () => void;
  onFind: (query: string) => void;
  onToggleExtension: (id: string, enabled: boolean) => void;
  onManageExtensions: () => void;
  onHistory: () => void;
  onBookmarks: () => void;
  onDownloads: () => void;
  onPasswords: () => void;
  onAccount: () => void;
  onSettings: () => void;
  onNewTab: () => void;
  onPrivateTab: () => void;
  onSplit: () => void;
  onCompact: () => void;
  onScripts: () => void;
  onSiteSettings: () => void;
}

export function FirefoxMenu(props: Props) {
  const { theme, visible, onClose } = props;
  const { state, switchProfile } = useStore();
  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];
  const insets = useSafeAreaInsets();
  const [extOpen, setExtOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const card = theme.dark ? '#2b2a33' : theme.surface;
  const sheet = theme.dark ? '#1c1b22' : theme.bg;
  const ink = theme.text;

  const go = (fn: () => void) => {
    onClose();
    setTimeout(fn, 40);
  };

  const closeNested = () => {
    if (findOpen) {
      setFindOpen(false);
      return true;
    }
    if (extOpen) {
      setExtOpen(false);
      return true;
    }
    if (moreOpen) {
      setMoreOpen(false);
      return true;
    }
    return false;
  };

  useHardwareBack(visible, () => closeNested());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {
      if (!closeNested()) {
        onClose();
      }
    }}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]} onPress={onClose} />
        <View
          style={{
            maxHeight: '92%',
            backgroundColor: sheet,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            paddingBottom: Math.max(insets.bottom, 10),
          }}>
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 6 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.dark ? '#5b5b66' : theme.border }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, marginBottom: 8 }}>
              <NavBtn icon="back" label="Kembali" disabled={!props.canBack} theme={theme} onPress={props.onBack} />
              <NavBtn icon="forward" label="Maju" disabled={!props.canForward} theme={theme} onPress={props.onForward} />
              <NavBtn icon="share" label="Bagikan" disabled={!props.canPage} theme={theme} onPress={() => go(props.onShare)} />
              <NavBtn icon="refresh" label="Segarkan" disabled={!props.canPage} theme={theme} onPress={props.onReload} />
            </View>

            <View style={{ backgroundColor: card, borderRadius: 14, overflow: 'hidden' }}>
              <MenuRow
                theme={theme}
                icon={props.bookmarked ? 'starFilled' : 'star'}
                title={props.bookmarked ? 'Hapus markah' : 'Markahi laman'}
                disabled={!props.canPage}
                onPress={props.onBookmark}
              />
              <Hairline theme={theme} />
              <MenuRow
                theme={theme}
                icon="search"
                title="Temukan di laman"
                disabled={!props.canPage}
                onPress={() => setFindOpen((v) => !v)}
              />
              {findOpen ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Kata di halaman ini"
                    placeholderTextColor={theme.subtext}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => query.trim() && props.onFind(query.trim())}
                    style={{
                      flex: 1,
                      color: ink,
                      backgroundColor: theme.dark ? '#1c1b22' : theme.surface2,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      height: 40,
                      fontSize: 15,
                    }}
                  />
                  <Pressable
                    onPress={() => query.trim() && props.onFind(query.trim())}
                    style={{ backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 12, height: 40, justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Cari</Text>
                  </Pressable>
                </View>
              ) : null}
              <Hairline theme={theme} />
              <Pressable
                onPress={props.onToggleDesktop}
                disabled={!props.canPage}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, opacity: props.canPage ? 1 : 0.4 }}>
                <Icon name="monitor" size={22} color={ink} />
                <Text style={{ flex: 1, marginLeft: 14, color: ink, fontSize: 16 }}>Situs desktop</Text>
                <View
                  style={{
                    backgroundColor: props.desktop ? theme.accent : theme.dark ? '#3a3944' : theme.surface2,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                  }}>
                  <Text style={{ color: props.desktop ? '#fff' : ink, fontWeight: '700', fontSize: 13 }}>
                    {props.desktop ? 'Hidup' : 'Mati'}
                  </Text>
                </View>
              </Pressable>
              <Hairline theme={theme} />
              <Pressable onPress={() => setExtOpen((v) => !v)} style={rowStyle}>
                <Icon name="puzzle" size={22} color={ink} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: ink, fontSize: 16 }}>Ekstensi</Text>
                  <Text style={{ color: theme.subtext, fontSize: 12.5, marginTop: 1 }}>
                    {props.extensions.length > 0
                      ? `${props.extensions.length} terpasang`
                      : 'Coba ekstensi yang disarankan'}
                  </Text>
                </View>
                <View style={{ transform: [{ rotate: extOpen ? '180deg' : '0deg' }] }}>
                  <Icon name="chevronDown" size={18} color={theme.subtext} />
                </View>
              </Pressable>
              {extOpen ? (
                <View style={{ paddingBottom: 8 }}>
                  {props.extensions.length === 0 ? (
                    <Pressable onPress={() => go(props.onManageExtensions)} style={{ paddingHorizontal: 52, paddingVertical: 10 }}>
                      <Text style={{ color: theme.accent, fontWeight: '700' }}>Tambah ekstensi</Text>
                    </Pressable>
                  ) : (
                    props.extensions.map((ext) => (
                      <View key={ext.id} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 52, paddingRight: 12, paddingVertical: 6 }}>
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            backgroundColor: theme.accentSoft,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}>
                          <Text style={{ color: theme.accent, fontWeight: '800' }}>{ext.iconLetter || ext.name.slice(0, 1)}</Text>
                        </View>
                        <Text numberOfLines={1} style={{ flex: 1, color: ink, fontSize: 15 }}>
                          {ext.name}
                        </Text>
                        <Switch
                          value={ext.enabled}
                          onValueChange={(v) => props.onToggleExtension(ext.id, v)}
                          trackColor={{ true: theme.accent, false: theme.border }}
                        />
                      </View>
                    ))
                  )}
                  {props.extensions.length > 0 ? (
                    <Pressable onPress={() => go(props.onManageExtensions)} style={{ paddingHorizontal: 52, paddingVertical: 8 }}>
                      <Text style={{ color: theme.accent, fontWeight: '700' }}>Kelola ekstensi</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              <Hairline theme={theme} />
              <Pressable onPress={() => setMoreOpen((v) => !v)} style={rowStyle}>
                <Icon name="more" size={22} color={ink} />
                <Text style={{ flex: 1, marginLeft: 14, color: ink, fontSize: 16 }}>Lebih banyak</Text>
                <View style={{ transform: [{ rotate: moreOpen ? '180deg' : '0deg' }] }}>
                  <Icon name="chevronDown" size={18} color={theme.subtext} />
                </View>
              </Pressable>
              {moreOpen ? (
                <View style={{ paddingBottom: 6 }}>
                  <MoreItem theme={theme} label="Tab baru" onPress={() => go(props.onNewTab)} />
                  <MoreItem theme={theme} label="Tab privat" onPress={() => go(props.onPrivateTab)} />
                  <MoreItem theme={theme} label={props.splitActive ? 'Keluar dari split' : 'Split layar'} onPress={() => go(props.onSplit)} />
                  <MoreItem theme={theme} label={props.compact ? 'Keluar mode kompak' : 'Mode kompak'} onPress={() => go(props.onCompact)} />
                  <MoreItem theme={theme} label="Skrip" onPress={() => go(props.onScripts)} />
                  <MoreItem theme={theme} label="Pengaturan situs" onPress={() => go(props.onSiteSettings)} />
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <GridBtn theme={theme} card={card} icon="clock" label="Riwayat" onPress={() => go(props.onHistory)} />
              <GridBtn theme={theme} card={card} icon="star" label="Markah" onPress={() => go(props.onBookmarks)} />
              <GridBtn theme={theme} card={card} icon="download" label="Unduhan" onPress={() => go(props.onDownloads)} />
              <GridBtn theme={theme} card={card} icon="key" label="Kata sandi" onPress={() => go(props.onPasswords)} />
            </View>

            <View style={{ backgroundColor: card, borderRadius: 14, marginTop: 10, padding: 14 }}>
              <Pressable onPress={() => go(props.onAccount)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: activeProfile?.color ?? theme.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>
                    {(activeProfile?.name || 'U').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: ink, fontSize: 16, fontWeight: '700' }}>{activeProfile?.name ?? 'Profil'}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 12.5, marginTop: 2 }}>
                    Profil terpisah · tab tetap tersimpan
                  </Text>
                </View>
                <Icon name="chevronRight" size={18} color={theme.subtext} />
              </Pressable>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {state.profiles.map((p) => {
                  const on = p.id === state.activeProfileId;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        if (!on) {
                        switchProfile(p.id);
                        ToastAndroid.show(`${p.name} — tab lain tetap tersimpan`, ToastAndroid.SHORT);
                      }
                      onClose();
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginRight: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: on ? p.color : theme.surface2,
                      }}>
                      <Text style={{ color: on ? '#fff' : ink, fontWeight: '700', fontSize: 12.5 }}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              onPress={() => go(props.onSettings)}
              style={{ backgroundColor: card, borderRadius: 14, marginTop: 8, flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <Icon name="gear" size={22} color={ink} />
              <Text style={{ marginLeft: 14, color: ink, fontSize: 16 }}>Pengaturan</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 14, paddingVertical: 13 };

function Hairline({ theme }: { theme: Theme }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.dark ? '#3f3e48' : theme.border, marginLeft: 50 }} />;
}

function NavBtn({
  icon,
  label,
  disabled,
  onPress,
  theme,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ alignItems: 'center', minWidth: 68, opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={24} color={theme.text} />
      <Text style={{ color: theme.text, fontSize: 12, marginTop: 6 }}>{label}</Text>
    </Pressable>
  );
}

function MenuRow({
  theme,
  icon,
  title,
  onPress,
  disabled,
}: {
  theme: Theme;
  icon: IconName;
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[rowStyle, { opacity: disabled ? 0.4 : 1 }]}>
      <Icon name={icon} size={22} color={theme.text} />
      <Text style={{ flex: 1, marginLeft: 14, color: theme.text, fontSize: 16 }}>{title}</Text>
    </Pressable>
  );
}

function MoreItem({ theme, label, onPress }: { theme: Theme; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingLeft: 52, paddingRight: 14, paddingVertical: 11 }}>
      <Text style={{ color: theme.text, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

function GridBtn({
  theme,
  card,
  icon,
  label,
  onPress,
}: {
  theme: Theme;
  card: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: pressed ? theme.surface2 : card,
        borderRadius: 12,
        alignItems: 'center',
        paddingVertical: 14,
      })}>
      <Icon name={icon} size={22} color={theme.text} />
      <Text style={{ color: theme.text, fontSize: 11.5, marginTop: 6 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
