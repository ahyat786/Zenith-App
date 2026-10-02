/**
 * Snackbar Material 3 — umpan balik singkat dengan aksi (biasanya "Urungkan").
 *
 * Rujukan resmi:
 *  · developer.android.com/design/ui/mobile/guides/components/snackbar — bentuk
 *    4dp, permukaan `inverseSurface`, teks `inverseOnSurface`, aksi teks
 *    `inversePrimary`, muncul dari bawah, hilang otomatis 4–10 detik.
 *  · developer.android.com/develop/ui — aksi "Undo" harus selalu memberi jalan
 *    pulang bagi tindakan yang mengubah keadaan.
 *
 * Pemakaian lokal (di dalam komponen/Modal):
 *   const snack = useSnackbar(theme);
 *   ...
 *   snack.show({ message: 'Warna dinamis dimatikan', actionLabel: 'Urungkan',
 *                onAction: () => dispatch(...) });
 *   ...
 *   return <View>{...}{snack.host}</View>;
 *
 * `host` sengaja dikembalikan (bukan dipasang global) supaya Snackbar yang
 * dipicu dari dalam Modal (menu, sheet) tetap tampil DI ATAS modal tersebut —
 * di Android, modal RenderNative punya jendela sendiri.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { elevation, motion, radius, spacing, type as typeScale, withAlpha, type Theme } from '../theme';

/**
 * Kanal global: dipakai layar yang tidak ingin menaruh `host` sendiri
 * (mis. SettingsScreen). Host global dipasang sekali di AppShell
 * lewat <SnackbarHost />. Bila tidak ada host (layar belum siap),
 * panggilan diabaikan tanpa error.
 */
let globalHandler: ((opts: SnackbarOptions) => void) | null = null;

export function showSnackbar(opts: SnackbarOptions) {
  globalHandler?.(opts);
}

/** Host global Snackbar — pasang sekali di akar aplikasi. */
export function SnackbarHost({ theme }: { theme: Theme }) {
  const snack = useSnackbar(theme);
  const show = snack.show;
  useEffect(() => {
    globalHandler = show;
    return () => {
      if (globalHandler === show) {
        globalHandler = null;
      }
    };
  }, [show]);
  return snack.host;
}

export interface SnackbarOptions {
  message: string;
  /** Label aksi, mis. "Urungkan". Bila kosong, Snackbar hanya informatif. */
  actionLabel?: string;
  onAction?: () => void;
  /** Durasi tampil. Aksi membuat Snackbar bertahan lebih lama (a11y). */
  durationMs?: number;
}

interface Item extends SnackbarOptions {
  id: number;
}

/** Snackbar informatif: 4 s (Material 3). Dengan aksi: 7 s agar sempat dibaca. */
const DURATION_INFO = 4000;
const DURATION_ACTION = 7000;

export function useSnackbar(theme: Theme) {
  const [item, setItem] = useState<Item | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const anim = useRef(new Animated.Value(0)).current;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    Animated.timing(anim, {
      toValue: 0,
      duration: motion.duration.short4,
      easing: Easing.bezier(...motion.easing.accelerate),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setItem(null);
      }
    });
  }, [anim, clearTimer]);

  const show = useCallback(
    (opts: SnackbarOptions) => {
      if (!opts?.message) {
        return;
      }
      counter.current += 1;
      clearTimer();
      setItem({ ...opts, id: counter.current });
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: motion.duration.medium2,
        easing: Easing.bezier(...motion.easing.emphasized),
        useNativeDriver: true,
      }).start();
      const ms = opts.durationMs ?? (opts.actionLabel ? DURATION_ACTION : DURATION_INFO);
      timer.current = setTimeout(dismiss, ms);
    },
    [anim, clearTimer, dismiss],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const host = item ? (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.md,
        zIndex: 200,
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
          },
        ],
      }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 48,
          paddingLeft: spacing.md,
          paddingRight: spacing.sm,
          paddingVertical: 10,
          borderRadius: radius.xs,
          backgroundColor: theme.inverseSurface,
          elevation: elevation.level3,
        }}>
        <Text
          style={{
            flex: 1,
            color: theme.inverseOnSurface,
            ...typeScale.bodyMedium,
          }}>
          {item.message}
        </Text>
        {item.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.actionLabel}
            android_ripple={{
              color: withAlpha(theme.inverseOnSurface, 0.16),
              borderless: false,
              radius: radius.sm,
            }}
            onPress={() => {
              const run = item.onAction;
              dismiss();
              run?.();
            }}
            style={{
              minHeight: 40,
              justifyContent: 'center',
              paddingHorizontal: spacing.md,
              marginLeft: spacing.sm,
            }}>
            <Text style={{ color: theme.inversePrimary, ...typeScale.labelLarge }}>{item.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  ) : null;

  return { show, dismiss, host };
}
