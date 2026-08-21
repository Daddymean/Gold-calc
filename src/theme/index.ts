import type { TextStyle } from 'react-native';

/**
 * Dark-first palette. Buyers work under bright counter lights and outdoors at
 * shows; a dark surface with one warm accent keeps the numbers the loudest
 * thing on screen.
 */
export const colors = {
  bg: '#0B0D12',
  surface: '#141821',
  surfaceAlt: '#1B2029',
  border: '#252B38',
  borderStrong: '#333B4C',

  text: '#F2F4F8',
  textMuted: '#98A2B3',
  textFaint: '#68707F',

  gold: '#E5B567',
  goldDim: '#8A6E3C',

  up: '#4ADE80',
  down: '#F87171',
  warn: '#FBBF24',
  info: '#7DD3FC',

  onGold: '#1A1206',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/**
 * Text styles are typed as TextStyle rather than `as const`: a const assertion
 * would make `fontVariant` a readonly tuple, which React Native's style types
 * reject, and that failure silently widens every StyleSheet that spreads one.
 */
export const type: Record<
  'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono',
  TextStyle
> = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '500' },
  /** Tabular figures — for columns of numbers that must align vertically. */
  mono: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
};
