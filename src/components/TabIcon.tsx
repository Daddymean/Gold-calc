import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The five tab glyphs, drawn inline.
 *
 * `@expo/vector-icons` was 527 KB of the bundle — 12.7%, the largest single
 * non-framework entry — to supply five icons in the tab bar. It ships every
 * icon set and every glyph map because the name is resolved at runtime, so
 * nothing can tree-shake it. These are the five, as paths, over the SVG
 * renderer the price chart already pulls in.
 *
 * Stroke-based at a 24-unit grid, scaled by `size`, so they stay crisp at any
 * tab-bar height and inherit the active/inactive colour like the originals.
 */

export type TabIconName = 'prices' | 'calculator' | 'inventory' | 'customers' | 'settings';

export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabIconName;
  color: string;
  size?: number;
}) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'prices' && (
        <>
          {/* A rising line with its arrowhead — the price trend. */}
          <Path d="M3 16.5 L9 10.5 L13 14.5 L21 6.5" {...stroke} />
          <Path d="M15.5 6.5 H21 V12" {...stroke} />
        </>
      )}

      {name === 'calculator' && (
        <>
          <Rect x="4.5" y="2.75" width="15" height="18.5" rx="2.5" {...stroke} />
          <Path d="M8 7 H16" {...stroke} />
          <Circle cx="8.5" cy="12" r="1.05" fill={color} />
          <Circle cx="12" cy="12" r="1.05" fill={color} />
          <Circle cx="15.5" cy="12" r="1.05" fill={color} />
          <Circle cx="8.5" cy="16.5" r="1.05" fill={color} />
          <Circle cx="12" cy="16.5" r="1.05" fill={color} />
          <Circle cx="15.5" cy="16.5" r="1.05" fill={color} />
        </>
      )}

      {name === 'inventory' && (
        <>
          {/* A box seen straight on, with its lid seam — stock on a shelf. */}
          <Path d="M3.25 7.5 L12 3 L20.75 7.5 V16.5 L12 21 L3.25 16.5 Z" {...stroke} />
          <Path d="M3.25 7.5 L12 12 L20.75 7.5" {...stroke} />
          <Path d="M12 12 V21" {...stroke} />
        </>
      )}

      {name === 'customers' && (
        <>
          <Circle cx="9" cy="8" r="3.25" {...stroke} />
          <Path d="M3 19.5 C3 15.9 5.7 14 9 14 C12.3 14 15 15.9 15 19.5" {...stroke} />
          <Path d="M16.5 5.2 A3.25 3.25 0 0 1 16.5 10.8" {...stroke} />
          <Path d="M17.5 14.3 C19.9 14.9 21 16.6 21 19.5" {...stroke} />
        </>
      )}

      {name === 'settings' && (
        <>
          {/* Sliders rather than a gear: three strokes read cleanly at 24px,
              where a gear's teeth turn to mush. */}
          <Path d="M4 7 H20" {...stroke} />
          <Path d="M4 12 H20" {...stroke} />
          <Path d="M4 17 H20" {...stroke} />
          <Circle cx="9" cy="7" r="2.15" {...stroke} fill={color} />
          <Circle cx="15" cy="12" r="2.15" {...stroke} fill={color} />
          <Circle cx="8" cy="17" r="2.15" {...stroke} fill={color} />
        </>
      )}
    </Svg>
  );
}
