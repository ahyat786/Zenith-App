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
import { noteBackHandled } from '../browser/backStack';
import { Icon, type IconName } from './Icon';
import { radius, spacing, type Theme } from '../theme';

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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm }}>
          <Text
            style={{
              flex: 1,
              color: theme.subtext,
              fontSize: 12.5,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.7,
            }}>
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      <View
        style={{
          backgroundColor: theme.surface,
          borderRadius: radius.md,
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
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      android_ripple={{ color: theme.surface2 }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: 13,
        backgroundColor: pressed ? theme.surface2 : 'transparent',
      })}>
      {icon ? (
        <View style={{ marginRight: spacing.md }}>
          <Icon name={icon} size={21} color={danger ? theme.danger : theme.subtext} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: danger ? theme.danger : theme.text, fontSize: 15.5, fontWeight: '500' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={{ color: theme.subtext, fontSize: 12.5, marginTop: 2 }}>
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
            height: 0.6,
            backgroundColor: theme.border,
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
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ true: theme.accent, false: theme.surface2 }}
          thumbColor="#fff"
        />
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
    kind === 'primary' ? theme.accent : kind === 'danger' ? theme.danger : theme.surface2;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: pressed ? bg + 'cc' : bg,
        borderRadius: radius.md,
        paddingHorizontal: small ? 14 : 20,
        paddingVertical: small ? 8 : 12,
        opacity: disabled ? 0.45 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}>
      <Text
        style={{
          color: kind === 'secondary' ? theme.text : '#fff',
          fontWeight: '700',
          fontSize: small ? 13 : 15,
        }}>
        {label}
      </Text>
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
}: {
  name: IconName;
  onPress?: () => void;
  onLongPress?: () => void;
  theme: Theme;
  size?: number;
  disabled?: boolean;
  badge?: number | string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 23,
        backgroundColor: pressed ? theme.surface2 : 'transparent',
        opacity: disabled ? 0.35 : 1,
      })}>
      <Icon name={name} size={size} color={theme.text} />
      {badge !== undefined && badge !== 0 && badge !== '' ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 15,
            height: 15,
            borderRadius: 8,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          }}>
          <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>
            {typeof badge === 'number' && badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
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
        <Text style={{ color: theme.subtext, fontSize: 12.5, fontWeight: '600', marginBottom: 6 }}>
          {label}
        </Text>
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
        style={{
          backgroundColor: theme.surface2,
          color: theme.text,
          borderRadius: radius.sm,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 8,
          fontSize: 15,
          fontFamily: mono ? 'monospace' : undefined,
          minHeight: multiline ? 120 : 42,
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
        backgroundColor: theme.surface2,
        borderRadius: radius.sm,
        padding: 3,
      }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onValueChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: radius.sm - 2,
              backgroundColor: active ? theme.accent : 'transparent',
              alignItems: 'center',
            }}>
            <Text
              style={{
                color: active ? '#fff' : theme.subtext,
                fontWeight: '700',
                fontSize: 13,
              }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {
      noteBackHandled();
      onClose();
    }}>
      <Pressable
        style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}
        onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            maxHeight,
            paddingBottom: 24,
          }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.sm,
            }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>
            <IconButton name="close" onPress={onClose} theme={theme} size={19} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
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
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.surface2,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        }}>
        <Icon name={icon} size={30} color={theme.subtext} />
      </View>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      {subtitle ? (
        <Text
          numberOfLines={3}
          style={{ color: theme.subtext, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Loading({ theme }: { theme: Theme }) {
  return <ActivityIndicator color={theme.accent} />;
}
