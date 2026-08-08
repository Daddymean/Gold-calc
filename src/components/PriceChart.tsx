import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Line as SvgLine } from 'react-native-svg';
import { colors, radius, spacing, type } from '@/theme';
import { spotMoney, type CurrencyCode } from '@/lib/format';
import type { PricePoint } from '@/types';

/**
 * Single-series price history.
 *
 * One metal at a time, so there is no legend — the header above the chart names
 * what is plotted and the only direct label is the endpoint. Scrubbing is the
 * mobile form of a crosshair tooltip: drag anywhere on the plot and the header
 * value swaps to the touched day, which is how anyone actually reads a price
 * chart on a phone.
 */

interface Props {
  points: PricePoint[];
  color: string;
  currency: CurrencyCode;
  height?: number;
  /** Called as the user scrubs; null when they lift off. */
  onScrub?: (point: PricePoint | null) => void;
}

const PAD_TOP = 14;
const PAD_BOTTOM = 22;
const PAD_RIGHT = 58;
const PAD_LEFT = 8;

/** Round a span to friendly axis numbers so ticks read 2,400 not 2,387.42. */
function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function PriceChart({ points, color, currency, height = 210, onScrub }: Props) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const plotW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotH = Math.max(0, height - PAD_TOP - PAD_BOTTOM);

  const geometry = useMemo(() => {
    if (points.length < 2 || plotW <= 0) {
      return { linePath: '', areaPath: '', xs: [] as number[], ys: [] as number[], min: 0, max: 0 };
    }
    const prices = points.map((p) => p.price);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    // A flat series would divide by zero; give it a nominal band instead.
    const pad = (rawMax - rawMin) * 0.12 || Math.max(rawMax * 0.02, 0.01);
    const min = rawMin - pad;
    const max = rawMax + pad;

    const xs = points.map((_, i) => PAD_LEFT + (i / (points.length - 1)) * plotW);
    const ys = points.map((p) => PAD_TOP + (1 - (p.price - min) / (max - min)) * plotH);

    let linePath = `M ${xs[0]} ${ys[0]}`;
    for (let i = 1; i < xs.length; i++) linePath += ` L ${xs[i]} ${ys[i]}`;
    const areaPath = `${linePath} L ${xs[xs.length - 1]} ${PAD_TOP + plotH} L ${xs[0]} ${PAD_TOP + plotH} Z`;

    return { linePath, areaPath, xs, ys, min, max };
  }, [points, plotW, plotH]);

  const ticks = useMemo(
    () => (geometry.max > geometry.min ? niceTicks(geometry.min, geometry.max) : []),
    [geometry.min, geometry.max],
  );

  const indexAtX = (x: number) => {
    if (points.length < 2 || plotW <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (x - PAD_LEFT) / plotW));
    return Math.round(ratio * (points.length - 1));
  };

  // Built once — PanResponder captures its callbacks on creation, so the
  // handlers read through refs rather than closing over stale state.
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const scrubRef = useRef({ indexAtX, onScrub });
  scrubRef.current = { indexAtX, onScrub };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Claim the gesture so the enclosing ScrollView does not steal the drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const i = scrubRef.current.indexAtX(e.nativeEvent.locationX);
        setActiveIndex(i);
        scrubRef.current.onScrub?.(pointsRef.current[i] ?? null);
      },
      onPanResponderMove: (e) => {
        const i = scrubRef.current.indexAtX(e.nativeEvent.locationX);
        setActiveIndex(i);
        scrubRef.current.onScrub?.(pointsRef.current[i] ?? null);
      },
      onPanResponderRelease: () => {
        setActiveIndex(null);
        scrubRef.current.onScrub?.(null);
      },
      onPanResponderTerminate: () => {
        setActiveIndex(null);
        scrubRef.current.onScrub?.(null);
      },
    }),
  ).current;

  const ready = points.length >= 2 && width > 0;
  const lastX = ready ? geometry.xs[geometry.xs.length - 1] : 0;
  const lastY = ready ? geometry.ys[geometry.ys.length - 1] : 0;
  const lastPrice = points.length ? points[points.length - 1].price : 0;
  const active = ready && activeIndex !== null ? points[activeIndex] : null;

  // The measured container is rendered unconditionally, empty state included.
  // Swapping it for a different element while waiting for data would leave the
  // reused DOM node unobserved on web, so the chart would never learn its width.
  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      {!ready && (
        <View style={[styles.placeholder, { height }]}>
          <Text style={styles.placeholderText}>
            {points.length < 2 ? 'Not enough price history to chart yet.' : ' '}
          </Text>
        </View>
      )}

      {ready && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              {/* A wash, never a saturated block — the line carries the data. */}
              <Stop offset="0" stopColor={color} stopOpacity={0.18} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {/* Recessive gridlines: hairline, one step off the surface, solid. */}
          {ticks.map((t) => {
            const y = PAD_TOP + (1 - (t - geometry.min) / (geometry.max - geometry.min)) * plotH;
            return (
              <React.Fragment key={t}>
                <SvgLine
                  x1={PAD_LEFT}
                  y1={y}
                  x2={PAD_LEFT + plotW}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              </React.Fragment>
            );
          })}

          <Path d={geometry.areaPath} fill="url(#areaFill)" />
          <Path
            d={geometry.linePath}
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />

          {/* Crosshair while scrubbing. */}
          {active && activeIndex !== null && (
            <>
              <SvgLine
                x1={geometry.xs[activeIndex]}
                y1={PAD_TOP}
                x2={geometry.xs[activeIndex]}
                y2={PAD_TOP + plotH}
                stroke={colors.borderStrong}
                strokeWidth={1}
              />
              <Circle
                cx={geometry.xs[activeIndex]}
                cy={geometry.ys[activeIndex]}
                r={5}
                fill={color}
                stroke={colors.surface}
                strokeWidth={2}
              />
            </>
          )}

          {/* Endpoint marker: >=8px with a 2px surface ring so it clears the line. */}
          {!active && (
            <Circle cx={lastX} cy={lastY} r={4.5} fill={color} stroke={colors.surface} strokeWidth={2} />
          )}
        </Svg>
      )}

      {/* Axis ticks and the one direct label, in text tokens — never the series hue. */}
      {ready && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {ticks.map((t) => {
            const y = PAD_TOP + (1 - (t - geometry.min) / (geometry.max - geometry.min)) * plotH;
            return (
              <Text key={t} style={[styles.tick, { top: y - 8, right: spacing.xs }]}>
                {t.toLocaleString(undefined, { maximumFractionDigits: t < 100 ? 2 : 0 })}
              </Text>
            );
          })}
          <Text style={[styles.endLabel, { top: lastY - 10, right: spacing.xs }]}>
            {spotMoney(lastPrice, currency)}
          </Text>
          <Text style={[styles.axisDate, { left: PAD_LEFT }]}>{points[0].date}</Text>
          <Text style={[styles.axisDate, { right: PAD_RIGHT }]}>
            {points[points.length - 1].date}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Twelve-point sparkline for stat tiles and list rows. No axes, no labels — it
 * is a shape, and the number beside it carries the value.
 */
export function Sparkline({
  points,
  color,
  width = 72,
  height = 26,
}: {
  points: PricePoint[];
  color: string;
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return '';
    const slice = points.slice(-24);
    const prices = slice.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;
    return slice
      .map((p, i) => {
        const x = (i / (slice.length - 1)) * width;
        const y = height - 2 - ((p.price - min) / span) * (height - 4);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points, width, height]);

  if (!path) return <View style={{ width, height }} />;

  return (
    <Svg width={width} height={height}>
      <Path d={path} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/**
 * Horizontal composition bar — how a portfolio splits across metals. Segments
 * are separated by a 2px surface gap rather than a stroke, so no non-data ink
 * is added.
 */
export function CompositionBar({
  segments,
  height = 10,
}: {
  segments: { value: number; color: string; key: string }[];
  height?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <View style={[styles.compositionEmpty, { height }]} />;
  }
  return (
    <View style={[styles.compositionRow, { height }]}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <View
            key={s.key}
            style={{ flex: s.value / total, backgroundColor: s.color, borderRadius: 2 }}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  placeholderText: { ...type.caption, color: colors.textFaint },

  tick: {
    position: 'absolute',
    ...type.caption,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  endLabel: {
    position: 'absolute',
    ...type.caption,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
    paddingHorizontal: 3,
    borderRadius: 3,
    fontVariant: ['tabular-nums'],
  },
  axisDate: { position: 'absolute', bottom: 0, ...type.caption, fontSize: 10, color: colors.textFaint },

  compositionRow: { flexDirection: 'row', gap: 2, width: '100%' },
  compositionEmpty: { backgroundColor: colors.surfaceAlt, borderRadius: 2, width: '100%' },
});
