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
import { IS_DEMO } from '@/lib/demoMode';
import { colors, radius, spacing, type } from '@/theme';

export default function PricesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, quotes, quotesUpdatedAt, refreshing, spotError, refreshQuotes, items, lots, history, loadHistory } =
    useApp();
  const spot = useSpot();

  const summary = useMemo(
    () => summarisePortfolio(items, spot, settings.currency, lots),
    [items, spot, settings.currency, lots],
  );
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
      {IS_DEMO && (
        <View style={styles.demoBar}>
          <Text style={styles.demoTitle}>This is a demo</Text>
          <Text style={styles.demoBody}>
            The inventory, customers and prices below are all made up, so you can try the app
            without setting anything up. Everything you change stays in this browser. Reset it any
            time from Settings.
          </Text>
        </View>
      )}

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

              {/* A zero gain because nothing can be compared is not a flat
                  book, and must not be drawn as one. */}
              {summary.gainUnavailable ? (
                <View style={styles.heroDelta}>
                  <Text style={[styles.heroDeltaText, { color: colors.textMuted }]}>—</Text>
                  <Text style={styles.heroDeltaLabel}>
                    no cost recorded in {settings.currency}
                  </Text>
                </View>
              ) : (
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
              )}

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

              {/* Same rule as the hero: a total of zero because everything was
                  excluded is not zero, and reads as a result if printed. */}
              <View style={styles.miniGrid}>
                <Mini
                  label="Cost basis"
                  value={
                    summary.gainUnavailable ? '—' : money(summary.costBasis, settings.currency, 0)
                  }
                />
                <Mini
                  label="Realised P&L"
                  value={
                    summary.realisedGain === 0 &&
                    (summary.offCurrencySold > 0 || summary.offCurrencyLots > 0)
                      ? '—'
                      : money(summary.realisedGain, settings.currency, 0)
                  }
                  tone={summary.realisedGain >= 0 ? 'up' : 'down'}
                />
              </View>

              {summary.unpricedCount > 0 && (
                <Text style={styles.warnNote}>
                  {summary.unpricedCount} item{summary.unpricedCount === 1 ? '' : 's'} could not be
                  valued — no live price for that metal.
                </Text>
              )}

              {/* The dashboard shows the running total; the year is where it
                  gets read for tax. Reachable from the figure it belongs to. */}
              {summary.realisedGain !== 0 && (
                <Button
                  label="Profit &amp; loss by year"
                  variant="ghost"
                  onPress={() => router.push('/reports')}
                />
              )}

              {summary.realisedFromRefining !== 0 && summary.realisedFromSales !== 0 && (
                <Text style={styles.note}>
                  Realised P&L is {money(summary.realisedFromSales, settings.currency, 0)} from
                  sales and {money(summary.realisedFromRefining, settings.currency, 0)} from settled
                  melt lots.
                </Text>
              )}

              {summary.offCurrencyLots > 0 && (
                <Text style={styles.warnNote}>
                  {summary.offCurrencyLots} settled lot
                  {summary.offCurrencyLots === 1 ? ' was' : 's were'} priced in another currency and
                  {summary.offCurrencyLots === 1 ? ' is' : ' are'} not in the realised total.
                </Text>
              )}

              {summary.offCurrencyHeld > 0 && (
                <Text style={styles.warnNote}>
                  {summary.offCurrencyHeld} held item
                  {summary.offCurrencyHeld === 1 ? ' was' : 's were'} bought in another currency.
                  Their metal is counted in the market value above; what you paid is not, so cost
                  basis and unrealised gain leave {summary.offCurrencyHeld === 1 ? 'it' : 'them'}{' '}
                  out.
                </Text>
              )}

              {summary.offCurrencySold > 0 && (
                <Text style={styles.warnNote}>
                  Realised P&L excludes {summary.offCurrencySold} sold item
                  {summary.offCurrencySold === 1 ? '' : 's'} bought in another currency.
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
  demoBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: `${colors.info}14`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.info}44`,
  },
  demoTitle: { ...type.label, color: colors.info },
  demoBody: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: 2 },

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
  note: { ...type.caption, color: colors.textMuted, marginTop: spacing.md },

  emptyBook: { gap: spacing.lg },
  emptyBookText: { ...type.body, color: colors.textMuted, lineHeight: 21 },

  quickRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
