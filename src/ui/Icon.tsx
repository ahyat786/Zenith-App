import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

export type IconName =
  | 'back' | 'forward' | 'home' | 'tabs' | 'shield' | 'shieldOff' | 'lock'
  | 'plus' | 'close' | 'split' | 'eye' | 'eyeOff' | 'gear' | 'code'
  | 'puzzle' | 'search' | 'star' | 'starFilled' | 'more' | 'chevronRight'
  | 'chevronDown' | 'trash' | 'pencil' | 'refresh' | 'globe' | 'zap'
  | 'share' | 'check' | 'expand' | 'clock' | 'info' | 'download' | 'folder'
  | 'bookmark' | 'arrowUp' | 'arrowDown' | 'warning' | 'monitor' | 'phone';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const P = (d: string, key?: string) => <Path key={key} d={d} />;

export function Icon({ name, size = 22, color = '#fff', strokeWidth = 2 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const body: React.ReactNode = (() => {
    switch (name) {
      case 'back': return P('M15 18l-6-6 6-6');
      case 'forward': return P('M9 6l6 6-6 6');
      case 'home': return <G>{P('M3 10.5 12 3l9 7.5')}{P('M5.5 9.5V21h13V9.5')}</G>;
      case 'tabs': return <G>{P('M12 3l9 5-9 5-9-5 9-5z')}{P('M3 13.5l9 5 9-5')}</G>;
      case 'shield': return P('M12 3l7 3v5.5c0 4.4-2.9 8.2-7 9.5-4.1-1.3-7-5.1-7-9.5V6l7-3z');
      case 'shieldOff': return <G>{P('M12 3l7 3v5.5c0 4.4-2.9 8.2-7 9.5-4.1-1.3-7-5.1-7-9.5V6l7-3z')}{P('M4 4l16 16', 'x')}</G>;
      case 'lock': return <G>{P('M7.5 11V8a4.5 4.5 0 019 0v3')}{P('M5.5 11h13v9.5h-13z')}</G>;
      case 'plus': return P('M12 5v14M5 12h14');
      case 'close': return P('M6 6l12 12M18 6L6 18');
      case 'split': return <G>{P('M3.5 5h6.5v14H3.5z')}{P('M14 5h6.5v14H14z')}</G>;
      case 'eye': return <G>{P('M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z')}<Circle cx={12} cy={12} r={3} /></G>;
      case 'eyeOff': return <G>{P('M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z')}{P('M4 4l16 16', 'x')}</G>;
      case 'gear': return <G><Circle cx={12} cy={12} r={3.2} />{P('M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2')}</G>;
      case 'code': return P('M8.5 6L3 12l5.5 6M15.5 6L21 12l-5.5 6');
      case 'puzzle': return P('M9 4a2 2 0 114 0v1h4.5a.5.5 0 01.5.5V10h1a2 2 0 110 4h-1v4.5a.5.5 0 01-.5.5H13v-1a2 2 0 10-4 0v1H4.5a.5.5 0 01-.5-.5V14h1a2 2 0 100-4h-.5V4.5A.5.5 0 014.5 4H9V4z');
      case 'search': return <G><Circle cx={11} cy={11} r={7} />{P('M16.5 16.5L21 21')}</G>;
      case 'star': return P('M12 3.2l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.6l6-.9L12 3.2z');
      case 'starFilled': return <Path d="M12 3.2l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.6l6-.9L12 3.2z" fill={color} stroke={color} />;
      case 'more': return <G fill={color} stroke="none"><Circle cx={12} cy={5} r={1.7} /><Circle cx={12} cy={12} r={1.7} /><Circle cx={12} cy={19} r={1.7} /></G>;
      case 'chevronRight': return P('M9 6l6 6-6 6');
      case 'chevronDown': return P('M6 9l6 6 6-6');
      case 'trash': return <G>{P('M4 7h16M9.5 7V4.5h5V7M6 7l1 13.5h10L18 7')}</G>;
      case 'pencil': return <G>{P('M4 20l1.2-4.5L16.5 4.2a2 2 0 012.8 2.8L8 18.3 4 20z')}</G>;
      case 'refresh': return <G>{P('M20 12a8 8 0 11-2.5-5.8L20 8.5')}{P('M20 3.5v5h-5')}</G>;
      case 'globe': return <G><Circle cx={12} cy={12} r={9} />{P('M3 12h18M12 3a14 14 0 010 18a14 14 0 010-18z')}</G>;
      case 'zap': return P('M13 2L4.5 13.5H11L9.5 22 18.5 10.5H12L13 2z');
      case 'share': return <G>{P('M12 3v12M7.5 7.5L12 3l4.5 4.5')}{P('M4.5 14v6h15v-6')}</G>;
      case 'check': return P('M4.5 12.5l5 5L19.5 7');
      case 'expand': return <G>{P('M4 14v6h6M20 10V4h-6')}{P('M4 20l6-6M20 4l-6 6')}</G>;
      case 'clock': return <G><Circle cx={12} cy={12} r={9} />{P('M12 7v5l3.2 2')}</G>;
      case 'info': return <G><Circle cx={12} cy={12} r={9} />{P('M12 8h.01M12 11.5V16.5')}</G>;
      case 'download': return <G>{P('M12 3v12M7 10.5l5 5 5-5')}{P('M4 20h16')}</G>;
      case 'folder': return P('M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7z');
      case 'bookmark': return P('M6.5 3.5h11V21L12 16.5 6.5 21V3.5z');
      case 'arrowUp': return P('M12 19V5M6 11l6-6 6 6');
      case 'arrowDown': return P('M12 5v14M6 13l6 6 6-6');
      case 'warning': return <G>{P('M12 3.5L22 20H2L12 3.5z')}{P('M12 9.5v4.5M12 17.2h.01')}</G>;
      case 'monitor': return <G>{P('M3 5h18v11H3z')}{P('M9 20h6M12 16v4')}</G>;
      case 'phone': return <G>{P('M7.5 3.5h9v17h-9z')}{P('M10.5 18.5h3')}</G>;
      default: return null;
    }
  })();

  return <Svg {...common}>{body}</Svg>;
}
