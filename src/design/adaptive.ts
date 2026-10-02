/**
 * Kelas ukuran jendela Material 3 (adaptive layout).
 *
 * Rujukan resmi (Android Design → Layout & konten):
 *  https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics
 *
 *  compact   : < 600dp  (ponsel potret)      → 1 panel, 4 kolom pintasan
 *  medium    : 600–839dp (tablet kecil/fold) → 2 panel, 6 kolom
 *  expanded  : ≥ 840dp  (tablet besar/desktop) → 2 panel + margin lebar, 8 kolom
 */

import { useWindowDimensions } from 'react-native';

export type WindowSizeClass = 'compact' | 'medium' | 'expanded';

export interface AdaptiveLayout {
  width: number;
  height: number;
  sizeClass: WindowSizeClass;
  /** true bila lebar ≥ 600dp (tablet/foldable terbuka) */
  wide: boolean;
  /** jumlah kolom nyaman untuk kisi pintasan / kartu tab */
  shortcutColumns: number;
  tabColumns: number;
  /** lebar maksimum konten agar baris tetap nyaman dibaca (M3: 720–840dp) */
  contentMaxWidth: number;
  /** margin horizontal layar sesuai kelas ukuran */
  screenMargin: number;
  fontScale: number;
}

export function windowSizeClassFor(width: number): WindowSizeClass {
  if (width >= 840) {
    return 'expanded';
  }
  if (width >= 600) {
    return 'medium';
  }
  return 'compact';
}

export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height, fontScale } = useWindowDimensions();
  const sizeClass = windowSizeClassFor(width);
  return {
    width,
    height,
    sizeClass,
    wide: sizeClass !== 'compact',
    shortcutColumns: sizeClass === 'expanded' ? 8 : sizeClass === 'medium' ? 6 : 4,
    tabColumns: sizeClass === 'expanded' ? 4 : sizeClass === 'medium' ? 3 : 2,
    contentMaxWidth: sizeClass === 'compact' ? width : sizeClass === 'medium' ? 720 : 840,
    screenMargin: sizeClass === 'compact' ? 16 : 24,
    fontScale,
  };
}
