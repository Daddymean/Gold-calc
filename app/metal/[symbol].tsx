import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/AppState';
import { METALS, TROY_OUNCE_IN_GRAMS, WEIGHT_UNITS, puritiesFor, type MetalSymbol } from '@/lib/metals';
import { money, relativeTime, signedPercent, spotMoney } from '@/lib/format';
import { seriesChange } from '@/lib/spot';
import { PriceChart } from '@/components/PriceChart';
import { Badge, Card, SectionLabel, Segmented, StatRow } from '@/components/ui';
import { colors, spacing, type } from '@/theme';
import type { HistoryRange, PricePoint } from '@/types';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '1M' },
  { value: '90d', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
];

export default function MetalDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ symbol: string }>();
  const metal = (params.symbol as MetalSymbol) in METALS ? (params.symbol as MetalSymbol) : 'XAU';

  const { settings, quotes, history, loadHistory, historyLoading } = useApp();
  const [range, setRange] = useState<HistoryRange>('90d');
  const [scrubbed, setScrubbed] = useState<PricePoint | null>(null);

  const meta = METALS[metal];
  const quote = quotes[metal];
  const key = `${metal}:${range}:${settings.currency}`;
  const series = history[key];

  useEffect(() => {
    if (!history[key]) loadHistory(metal, range);
    // Refetching on every history object change would loop; the key is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const points = series?.points ?? [];
  const change = seriesChange(points);

  // While scrubbing, the header shows the touched day instead of the latest —
  // the chart itself is the control, so the number has to follow the finger.
  const headlinePrice = scrubbed?.price ?? quote?.price ?? points[points.length - 1]?.price ?? 0;
  const headlineLabel = scrubbed ? scrubbed.date : 'Spot, per troy ounce';

  const perGram = headlinePrice / TROY_OUNCE_IN_GRAMS;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <Stack.Screen options={{ title: meta.name }} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={[styles.symbol, { borderColor: meta.color, backgroundColor: `${meta.color}22` }]}>
            <Text style={[styles.symbolText, { color: meta.color }]}>{meta.short}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headlineLabel}>{headlineLabel}</Text>
            <Text style={styles.headline}>{spotMoney(headlinePrice, settings.currency)}</Text>
          </View>
          {settings.spotProvider === 'demo' && <Badge label="DEMO" tone="warn" />}
        </View>

        {!scrubbed && !!quote && (
          <Text style={[styles.dayChange, { color: quote.changePercent >= 0 ? colors.up : colors.down }]}>
            {quote.changePercent >= 0 ? '▲' : '▼'} {money(Math.abs(quote.change), settings.currency)}{' '}
            ({signedPercent(quote.changePercent)}) today
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Card>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>
              {meta.name} · {RANGES.find((r) => r.value === range)?.label}
            </Text>
            <Text
              style={[styles.chartChange, { color: change.percent >= 0 ? colors.up : colors.down }]}
            >
              {signedPercent(change.percent)}
            </Text>
          </View>

          {historyLoading && !points.length ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : (
            <PriceChart
              points={points}
              color={meta.color}
              currency={settings.currency}
              onScrub={setScrubbed}
            />
          )}

          <View style={{ height: spacing.md }} />
          <Segmented value={range} onChange={setRange} options={RANGES} />
          <Text style={styles.chartHint}>Touch and drag the chart to read any day.</Text>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Rates right now</SectionLabel>
        <Card>
          <StatRow label="Per troy ounce" value={spotMoney(headlinePrice, settings.currency)} />
          <StatRow label="Per gram" value={money(perGram, settings.currency, 3)} />
          <StatRow
            label="Per pennyweight"
            value={money(perGram * WEIGHT_UNITS.dwt.grams, settings.currency, 3)}
          />
          <StatRow label="Per kilo" value={money(perGram * 1000, settings.currency, 0)} />
          {!!quote?.high24h && (
            <StatRow
              label="24h range"
              value={`${spotMoney(quote.low24h ?? 0, settings.currency)} – ${spotMoney(quote.high24h, settings.currency)}`}
            />
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Melt value per gram by purity</SectionLabel>
        <Card padded={false}>
          {puritiesFor(metal).map((p, i) => (
            <View key={p.id}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.purityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.purityLabel}>{p.label}</Text>
                  {!!p.hint && <Text style={styles.purityHint}>{p.hint}</Text>}
                </View>
                <Text style={styles.purityValue}>
                  {money(perGram * p.fineness, settings.currency, 2)}/g
                </Text>
                <Text style={styles.purityValueAlt}>
                  {money(perGram * p.fineness * WEIGHT_UNITS.dwt.grams, settings.currency, 2)}/dwt
                </Text>
              </View>
            </View>
          ))}
        </Card>
        <Text style={styles.footnote}>
          Full melt at spot — before your payout percentage, refining loss or fees.
        </Text>
      </View>

      <Text style={styles.source}>
        Source: {settings.spotProvider === 'demo' ? 'demo generator (not market data)' : settings.spotProvider}
        {series ? ` · history ${relativeTime(series.fetchedAt)}` : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  symbol: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: { ...type.label, fontSize: 16 },
  headlineLabel: { ...type.caption, color: colors.textMuted },
  headline: { ...type.display, color: colors.text },
  dayChange: { ...type.label, marginTop: spacing.sm },

  section: { paddingHorizontal: spacing.lg },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  chartTitle: { ...type.label, color: colors.textMuted },
  chartChange: { ...type.label, fontVariant: ['tabular-nums'] },
  chartHint: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm, textAlign: 'center' },
  loading: { height: 210, alignItems: 'center', justifyContent: 'center' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  purityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  purityLabel: { ...type.body, color: colors.text, fontWeight: '600' },
  purityHint: { ...type.caption, fontSize: 10, color: colors.textFaint },
  purityValue: { ...type.mono, fontSize: 14, color: colors.text, minWidth: 88, textAlign: 'right' },
  purityValueAlt: { ...type.mono, fontSize: 13, color: colors.textMuted, minWidth: 88, textAlign: 'right' },

  footnote: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm },
  source: { ...type.caption, color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },
});
