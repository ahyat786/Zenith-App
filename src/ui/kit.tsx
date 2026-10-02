/**
 * Kit UI Zenith — komponen Material 3.
 *
 * Rujukan resmi (Android Design → Components / Material 3):
 *  https://developer.android.com/design/ui/mobile/guides/components/material-overview
 *
 * Prinsip yang diterapkan:
 *  · Target sentuh minimum 48dp untuk semua elemen interaktif.
 *  · Efek sentuh memakai ripple Android (state layer M3), bukan sekadar ganti warna.
 *  · Permukaan memakai peran warna M3 (surface container bertingkat).
 *  · Bentuk: 8 · 12 · 16 · 28 (bottom sheet & dialog 28dp).
 *  · Label aksesibilitas untuk semua tombol ikon (TalkBack).
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { noteBackHandled } from '../browser/backStack';
import { useImeInset } from '../core/systemUi';
import { Icon, type IconName } from './Icon';
import { elevation, radius, sizes, spacing, type, type Theme } from '../theme';

/** Warna ripple M3 = warna konten dengan opasitas state layer. */
function rippleColor(theme: Theme, strong = false): string {
  return strong ? theme.primary + '29' : theme.onSurface + '1f';
}

// ---------------------------------------------------------------- bagian

export function ListSection({
  title,
  children,
  theme,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  theme: Theme;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      {title ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: spacing.md,
            marginBottom: spacing.sm,
          }}>
          <Text
            style={{
              flex: 1,
              color: theme.primary,
              ...type.labelLarge,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}>
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      <View
        style={{
          backgroundColor: theme.surfaceContainer,
          borderRadius: radius.lg,
          marginHorizontal: spacing.md,
          overflow: 'hidden',
        }}>
        {children}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- baris

export function Row({
  icon,
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  danger,
  theme,
  last,
  accessibilityLabel,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  danger?: boolean;
  theme: Theme;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const interactive = !!onPress || !!onLongPress;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !interactive }}
      android_ripple={{ color: rippleColor(theme), foreground: true }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        minHeight: sizes.listItem,
        paddingVertical: 10,
        backgroundColor: 'transparent',
      }}>
      {icon ? (
        <View style={{ marginRight: spacing.md, width: 24, alignItems: 'center' }}>
          <Icon name={icon} size={22} color={danger ? theme.danger : theme.onSurfaceVariant} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: danger ? theme.danger : theme.text, ...type.bodyLarge }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={{ color: theme.subtext, ...type.bodyMedium, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevronRight" size={18} color={theme.subtext} /> : null)}
      {!last ? (
        <View
          style={{
            position: 'absolute',
            left: icon ? 52 : spacing.md,
            right: 0,
            bottom: 0,
            height: 1,
            backgroundColor: theme.outlineVariant,
          }}
        />
      ) : null}
    </Pressable>
  );
}

export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  theme,
  last,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  theme: Theme;
  last?: boolean;
}) {
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={subtitle}
      theme={theme}
      last={last}
      accessibilityLabel={`${title}. ${value ? 'Aktif' : 'Nonaktif'}`}
      right={
        <View style={{ width: 48, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: theme.surfaceVariant, true: theme.primary }}
            thumbColor={value ? theme.onPrimary : theme.outline}
            ios_backgroundColor={theme.surfaceVariant}
          />
        </View>
      }
    />
  );
}

// ---------------------------------------------------------------- tombol

export function Button({
  label,
  onPress,
  theme,
  kind = 'primary',
  disabled,
  small,
}: {
  label: string;
  onPress?: () => void;
  theme: Theme;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  small?: boolean;
}) {
  const bg =
    kind === 'primary'
      ? theme.accent
      : kind === 'danger'
        ? theme.errorContainer
        : theme.secondaryContainer;
  const fg =
    kind === 'primary'
      ? theme.onAccent
      : kind === 'danger'
        ? theme.onErrorContainer
        : theme.onSecondaryContainer;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: fg + '26' }}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: small ? 16 : 24,
        minHeight: small ? 36 : 40,
        opacity: disabled ? 0.38 : pressed ? 0.92 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Text style={{ color: fg, ...(small ? type.labelMedium : type.labelLarge) }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  onLongPress,
  theme,
  size = 22,
  disabled,
  badge,
  label,
  selected,
}: {
  name: IconName;
  onPress?: () => void;
  onLongPress?: () => void;
  theme: Theme;
  size?: number;
  disabled?: boolean;
  badge?: number | string;
  /** Label TalkBack — sangat dianjurkan untuk tombol tanpa teks. */
  label?: string;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label ?? name}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      android_ripple={{ color: rippleColor(theme), borderless: true, radius: sizes.touchTarget / 2 }}
      style={({ pressed }) => ({
        width: sizes.touchTarget,
        height: sizes.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: sizes.touchTarget / 2,
        backgroundColor: selected ? theme.accentSoft : pressed ? theme.surfaceContainerHigh : 'transparent',
        opacity: disabled ? 0.38 : 1,
      })}>
      <Icon name={name} size={size} color={disabled ? theme.outline : selected ? theme.accent : theme.text} />
      {badge !== undefined && badge !== 0 && badge !== '' ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          }}>
          <Text style={{ color: theme.onAccent, fontSize: 10, fontWeight: '700' }}>
            {typeof badge === 'number' && badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Tombol aksi M3 berbentuk teks (dipakai di dialog & baris aksi). */
export function TextButton({
  label,
  onPress,
  theme,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  theme: Theme;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: theme.primary + '1f', borderless: false }}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        opacity: disabled ? 0.38 : pressed ? 0.9 : 1,
      })}>
      <Text style={{ color: theme.primary, ...type.labelLarge }}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- input

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  theme,
  multiline,
  mono,
  autoCapitalize = 'none',
  autoCorrect = false,
  keyboardType = 'default',
  secure,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  theme: Theme;
  multiline?: boolean;
  mono?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'url' | 'email-address';
  secure?: boolean;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <Text style={{ color: theme.subtext, ...type.labelLarge, marginBottom: 6 }}>{label}</Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.subtext}
        multiline={multiline}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        accessibilityLabel={label ?? placeholder}
        style={{
          backgroundColor: theme.surfaceContainerLow,
          color: theme.text,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: theme.outline,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 12 : 8,
          ...type.bodyLarge,
          fontFamily: mono ? 'monospace' : undefined,
          minHeight: multiline ? 120 : sizes.textField,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  theme,
}: {
  options: { value: T; label: string }[];
  value: T;
  onValueChange: (v: T) => void;
  theme: Theme;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.surfaceContainerHighest,
        borderRadius: radius.pill,
        padding: 4,
        gap: 4,
      }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onValueChange(opt.value)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: active }}
            android_ripple={{ color: theme.primary + '1f', borderless: false }}
            style={{
              flex: 1,
              minHeight: 40,
              paddingVertical: 9,
              borderRadius: radius.pill,
              backgroundColor: active ? theme.primaryContainer : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text
              style={{
                color: active ? theme.onPrimaryContainer : theme.subtext,
                ...type.labelLarge,
              }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chip filter Material 3 (workspace, mesin pencari, tag). */
export function Chip({
  label,
  leading,
  selected,
  onPress,
  theme,
  accessibilityLabel,
}: {
  label: string;
  leading?: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  theme: Theme;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      android_ripple={{ color: rippleColor(theme), borderless: false }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        // minHeight (bukan height) + padding vertikal: label tetap utuh saat
        // pengguna memakai skala huruf besar (aksesibilitas 1,3–2,0).
        minHeight: sizes.chip,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: selected ? 'transparent' : theme.outlineVariant,
        backgroundColor: selected ? theme.secondaryContainer : 'transparent',
        overflow: 'hidden',
      }}>
      {leading}
      <Text
        style={{
          color: selected ? theme.onSecondaryContainer : theme.subtext,
          ...type.labelLarge,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- lembar

export function Sheet({
  visible,
  onClose,
  title,
  theme,
  children,
  maxHeight = '85%',
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  theme: Theme;
  children: React.ReactNode;
  maxHeight?: number | string;
}) {
  const insets = useSafeAreaInsets();
  const ime = useImeInset();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        noteBackHandled();
        onClose();
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tutup panel"
        style={{ flex: 1, backgroundColor: theme.scrim, justifyContent: 'flex-end' }}
        onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.surfaceContainerLow,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            maxHeight,
            paddingBottom: Math.max(insets.bottom, 16) + ime,
            elevation: elevation.sheet,
          }}>
          {/* gagang tarik khas bottom sheet Material 3 */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View
              style={{
                width: 32,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.outlineVariant,
              }}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: spacing.sm,
            }}>
            <Text style={{ color: theme.text, ...type.titleLarge, flex: 1 }} numberOfLines={1}>
              {title}
            </Text>
            <IconButton name="close" onPress={onClose} theme={theme} size={20} label="Tutup" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Dialog Material 3 (sudut 28dp, aksi teks di kanan). */
export function Dialog({
  visible,
  title,
  children,
  actions,
  onClose,
  theme,
}: {
  visible: boolean;
  title: string;
  children?: React.ReactNode;
  actions?: { label: string; onPress: () => void; emphasis?: boolean }[];
  onClose: () => void;
  theme: Theme;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        noteBackHandled();
        onClose();
      }}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.scrim,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}>
        <View
          style={{
            width: '100%',
            maxWidth: 560,
            backgroundColor: theme.surfaceContainerHigh,
            borderRadius: radius.xl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.md,
            elevation: elevation.dialog,
          }}>
          <Text style={{ color: theme.text, ...type.headlineSmall }}>{title}</Text>
          {children ? <View style={{ marginTop: spacing.md }}>{children}</View> : null}
          {actions?.length ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: spacing.lg,
              }}>
              {actions.map((a) => (
                <TextButton
                  key={a.label}
                  label={a.label}
                  onPress={a.onPress}
                  theme={theme}
                  disabled={false}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export interface SheetAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  danger?: boolean;
}

export function ActionSheet({
  visible,
  onClose,
  actions,
  title,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  actions: SheetAction[];
  title?: string;
  theme: Theme;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} theme={theme}>
      {actions.map((a, i) => (
        <Row
          key={a.label + i}
          icon={a.icon}
          title={a.label}
          theme={theme}
          danger={a.danger}
          last={i === actions.length - 1}
          onPress={() => {
            onClose();
            setTimeout(a.onPress, 60);
          }}
        />
      ))}
    </Sheet>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  theme,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  theme: Theme;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: theme.surfaceContainerHighest,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        }}>
        <Icon name={icon} size={32} color={theme.onSurfaceVariant} />
      </View>
      <Text style={{ color: theme.text, ...type.titleMedium }}>{title}</Text>
      {subtitle ? (
        <Text
          numberOfLines={3}
          style={{ color: theme.subtext, ...type.bodyMedium, textAlign: 'center', marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Loading({ theme }: { theme: Theme }) {
  return <ActivityIndicator color={theme.accent} />;
}
