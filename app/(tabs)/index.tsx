import React, { useEffect, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useSpot } from '@/state/AppState';
import { METALS, METAL_ORDER } from '@/lib/metals';
import { money, relativeTime, signedPercent } from '@/lib/format';
import { metalsPresent, summarisePortfolio } from '@/lib/portfolio';
import { MetalRow } from '@/components/MetalTicker';
import { CompositionBar } from '@/components/PriceChart';
import { Badge, Button, Card, Divider, SectionLabel } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

export default function PricesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, quotes, quotesUpdatedAt, refreshing, spotError, refreshQuotes, items, history, loadHistory } =
    useApp();
  const spot = useSpot();

  const summary = useMemo(() => summarisePortfolio(items, spot), [items, spot]);
  const present = metalsPresent(summary);

  // Pull a short series per metal purely to draw the row sparklines.
  useEffect(() => {
    METAL_ORDER.forEach((metal) => {
      if (!history[`${metal}:30d:${settings.currency}`]) loadHistory(metal, '30d');
    });
    // Deliberately keyed on currency only: re-running per history change would
    // loop, and a currency switch is the one thing that invalidates the series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.currency]);

  const stale = quotesUpdatedAt
    ? Date.now() - new Date(quotesUpdatedAt).getTime() > settings.refreshMinutes * 60_000 * 2
    : true;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => refreshQuotes(true)}
          tintColor={colors.gold}
        />
      }
    >
      {/* Provenance sits above everything: nobody should pay out against a
          number without knowing where it came from and how old it is. */}
      <View style={styles.feedBar}>
        <View style={[styles.feedDot, { backgroundColor: stale ? colors.warn : colors.up }]} />
        <Text style={styles.feedText}>
          {settings.spotProvider === 'demo' ? 'Demo prices' : settings.spotProvider} ·{' '}
          {relativeTime(quotesUpdatedAt)}
        </Text>
        {settings.spotProvider === 'demo' && <Badge label="NOT MARKET DATA" tone="warn" />}
      </View>

      {!!spotError && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{spotError}</Text>
          <Text style={styles.errorSub}>Showing the last prices this device saw.</Text>
        </View>
      )}

      <View style={styles.section}>
        <SectionLabel>Spot prices</SectionLabel>
        <Card padded={false}>
          {METAL_ORDER.map((metal, i) => (
            <View key={metal}>
              {i > 0 && <View style={styles.rowDivider} />}
              <MetalRow
                metal={metal}
                quote={quotes[metal]}
                currency={settings.currency}
                spark={history[`${metal}:30d:${settings.currency}`]?.points}
                onPress={() => router.push(`/metal/${metal}`)}
              />
            </View>
          ))}
        </Card>
        <Text style={styles.footnote}>Tap a metal for trends and a melt breakdown.</Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Your book</SectionLabel>
        <Card>
          {summary.heldCount === 0 ? (
            <View style={styles.emptyBook}>
              <Text style={styles.emptyBookText}>
                Nothing in inventory yet. Items you log show their live value here.
              </Text>
              <Button label="Add first item" onPress={() => router.push('/item/new')} />
            </View>
          ) : (
            <>
              <Text style={styles.heroLabel}>Market value · {summary.heldCount} items held</Text>
              <Text style={styles.hero}>{money(summary.marketValue, settings.currency)}</Text>

              <View style={styles.heroDelta}>
                <Text
                  style={[
                    styles.heroDeltaText,
                    { color: summary.unrealisedGain >= 0 ? colors.up : colors.down },
                  ]}
                >
                  {summary.unrealisedGain >= 0 ? '▲' : '▼'}{' '}
                  {money(Math.abs(summary.unrealisedGain), settings.currency)} (
                  {signedPercent(summary.unrealisedPercent)})
                </Text>
                <Text style={styles.heroDeltaLabel}>unrealised vs cost</Text>
              </View>

              {present.length > 0 && (
                <View style={styles.composition}>
                  <CompositionBar
                    segments={present.map((m) => ({
                      key: m,
                      value: summary.valueByMetal[m],
                      color: METALS[m].color,
                    }))}
                  />
                  <View style={styles.legend}>
                    {present.map((m) => (
                      <View key={m} style={styles.legendItem}>
                        <View style={[styles.legendSwatch, { backgroundColor: METALS[m].color }]} />
                        <Text style={styles.legendLabel}>
                          {METALS[m].name} {money(summary.valueByMetal[m], settings.currency, 0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Divider />

              <View style={styles.miniGrid}>
                <Mini label="Cost basis" value={money(summary.costBasis, settings.currency, 0)} />
                <Mini
                  label="Realised P&L"
                  value={money(summary.realisedGain, settings.currency, 0)}
                  tone={summary.realisedGain >= 0 ? 'up' : 'down'}
                />
              </View>

              {summary.unpricedCount > 0 && (
                <Text style={styles.warnNote}>
                  {summary.unpricedCount} item{summary.unpricedCount === 1 ? '' : 's'} could not be
                  valued — no live price for that metal.
                </Text>
              )}
            </>
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <View style={styles.quickRow}>
          <Button
            label="New item"
            onPress={() => router.push('/item/new')}
            style={{ flex: 1 }}
          />
          <Button
            label="Calculator"
            variant="secondary"
            onPress={() => router.push('/calculator')}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text
        style={[
          styles.miniValue,
          tone === 'up' && { color: colors.up },
          tone === 'down' && { color: colors.down },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg },

  feedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  feedDot: { width: 7, height: 7, borderRadius: 4 },
  feedText: { ...type.caption, color: colors.textMuted, flex: 1 },

  errorBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: `${colors.warn}14`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.warn}44`,
  },
  errorText: { ...type.label, color: colors.warn },
  errorSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 68 },
  footnote: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm },

  heroLabel: { ...type.caption, color: colors.textMuted },
  hero: { ...type.display, color: colors.text, marginTop: 2 },
  heroDelta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xs },
  heroDeltaText: { ...type.label, fontSize: 14 },
  heroDeltaLabel: { ...type.caption, color: colors.textFaint },

  composition: { marginTop: spacing.lg, gap: spacing.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 9, height: 9, borderRadius: 2 },
  legendLabel: { ...type.caption, color: colors.textMuted },

  miniGrid: { flexDirection: 'row', gap: spacing.lg },
  mini: { flex: 1 },
  miniLabel: { ...type.caption, color: colors.textMuted },
  miniValue: { ...type.mono, fontSize: 18, color: colors.text, marginTop: 2 },

  warnNote: { ...type.caption, color: colors.warn, marginTop: spacing.md },

  emptyBook: { gap: spacing.lg },
  emptyBookText: { ...type.body, color: colors.textMuted, lineHeight: 21 },

  quickRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
