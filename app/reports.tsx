import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/AppState';
import { availableYears, realisedEvents, summariseYear } from '@/lib/taxYear';
import { taxYearCsv } from '@/lib/csv';
import { shareCsv } from '@/lib/export';
import { money, shortDate } from '@/lib/format';
import { notify } from '@/lib/confirm';
import { Badge, Button, Card, Divider, EmptyState, SectionLabel, Segmented, StatRow } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Profit and loss for a year.
 *
 * Two streams realise at different moments — a sale on the day it sells, a lot
 * weeks later when the refiner reports — and both belong in the same total. The
 * losing ones are shown on their own as well as in the sum, because a year that
 * nets to the same figure through one ruinous lot is a different business from
 * one that got there steadily.
 */
export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { items, lots, settings } = useApp();
  const [exporting, setExporting] = useState(false);

  const events = useMemo(() => realisedEvents(items, lots), [items, lots]);
  const years = useMemo(() => availableYears(events), [events]);
  const [year, setYear] = useState<number | null>(null);
  // Local, matching yearOf — the year on screen must be the dealer's year.
  const active = year ?? years[0] ?? new Date().getFullYear();

  const summary = useMemo(
    () => summariseYear(events, active, settings.currency),
    [events, active, settings.currency],
  );

  const doExport = async () => {
    setExporting(true);
    try {
      await shareCsv(`profit-and-loss-${active}.csv`, taxYearCsv(summary));
    } catch (err: any) {
      notify('Export failed', err?.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  if (!years.length) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Profit & loss' }} />
        <EmptyState
          title="Nothing has realised yet"
          body="Profit shows up here when a piece sells or a melt lot settles. Stock on the shelf is not income, however much it has gone up."
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <Stack.Screen options={{ title: 'Profit & loss' }} />

      {years.length > 1 && (
        <View style={styles.section}>
          <Segmented
            scroll
            value={String(active)}
            onChange={(v) => setYear(Number(v))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </View>
      )}

      <View style={styles.section}>
        <Card>
          <Text style={styles.heroLabel}>Net profit · {active}</Text>
          <Text style={[styles.hero, { color: summary.profit >= 0 ? colors.up : colors.down }]}>
            {money(summary.profit, settings.currency)}
          </Text>

          <Divider />

          <StatRow label="Proceeds" value={money(summary.proceeds, settings.currency)} />
          <StatRow label="Cost of what was sold" value={`− ${money(summary.cost, settings.currency)}`} />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Where it came from</SectionLabel>
        <Card>
          <StatRow
            label="Counter sales"
            value={money(summary.salesProfit, settings.currency)}
            tone={summary.salesProfit >= 0 ? 'up' : 'down'}
          />
          <Text style={styles.subNote}>
            {money(summary.salesProceeds, settings.currency)} in,{' '}
            {money(summary.salesCost, settings.currency)} cost
          </Text>
          <Divider />
          <StatRow
            label="Refining"
            value={money(summary.refiningProfit, settings.currency)}
            tone={summary.refiningProfit >= 0 ? 'up' : 'down'}
          />
          <Text style={styles.subNote}>
            {money(summary.refiningProceeds, settings.currency)} in,{' '}
            {money(summary.refiningCost, settings.currency)} cost
          </Text>
        </Card>
      </View>

      {summary.losingCount > 0 && (
        <View style={styles.section}>
          <Card>
            <Text style={styles.lossTitle}>
              {summary.losingCount} {summary.losingCount === 1 ? 'entry' : 'entries'} lost money —{' '}
              {money(summary.losses, settings.currency)}
            </Text>
            <Text style={styles.subNote}>
              Already included in the net above. Shown separately because a bad batch is worth
              looking at on its own, not just absorbed into a good year.
            </Text>
          </Card>
        </View>
      )}

      {summary.excluded.length > 0 && (
        <View style={styles.section}>
          <Card>
            <Text style={styles.warnNote}>
              {summary.excluded.length}{' '}
              {summary.excluded.length === 1 ? 'entry is' : 'entries are'} recorded in another
              currency and {summary.excluded.length === 1 ? 'is' : 'are'} not in these totals. There
              is no exchange rate on file for the day each one realised, so adding them would give
              you a number you could not stand behind. They are listed at the end of the export.
            </Text>
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <SectionLabel>
          {summary.events.length} {summary.events.length === 1 ? 'entry' : 'entries'}
        </SectionLabel>
        <Card padded={false}>
          {summary.events.map((event, i) => (
            <View key={event.id}>
              {i > 0 && <View style={styles.rowDivider} />}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowRef}>{event.reference}</Text>
                    <Badge
                      label={event.kind === 'sale' ? 'SALE' : 'REFINING'}
                      tone={event.kind === 'sale' ? 'info' : 'neutral'}
                    />
                  </View>
                  <Text style={styles.rowDesc} numberOfLines={1}>
                    {event.description}
                  </Text>
                  <Text style={styles.rowDate}>{shortDate(event.date)}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text
                    style={[
                      styles.rowProfit,
                      { color: event.profit >= 0 ? colors.up : colors.down },
                    ]}
                  >
                    {money(event.profit, event.currency)}
                  </Text>
                  <Text style={styles.rowSub}>
                    {money(event.proceeds, event.currency)} − {money(event.cost, event.currency)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <Button
          label={`Export ${active} as CSV`}
          onPress={doExport}
          loading={exporting}
          // Enabled when there is anything to write, included or not. A year
          // holding only foreign-currency entries still has a file worth
          // having — the screen has just promised they are listed in it.
          disabled={!summary.events.length && !summary.excluded.length}
        />
        <Text style={styles.disclaimer}>
          This is what your book says, arranged so an accountant can read it. It is not tax advice,
          and it does not know your jurisdiction's rules on inventory, depreciation or how a
          secondhand dealer must recognise cost. Take it to whoever does your return.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },

  heroLabel: { ...type.caption, color: colors.textMuted },
  hero: { ...type.mono, fontSize: 32, marginTop: spacing.xs },

  subNote: { ...type.caption, color: colors.textFaint, lineHeight: 16, marginTop: spacing.xs },
  warnNote: { ...type.caption, color: colors.warn, lineHeight: 16 },
  lossTitle: { ...type.heading, fontSize: 14, color: colors.down },

  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowRef: { ...type.caption, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  rowDesc: { ...type.heading, fontSize: 14, color: colors.text, marginTop: 1 },
  rowDate: { ...type.caption, fontSize: 11, color: colors.textFaint, marginTop: 1 },
  rowRight: { alignItems: 'flex-end' },
  rowProfit: { ...type.mono, fontSize: 15 },
  rowSub: { ...type.caption, fontSize: 10, color: colors.textFaint, marginTop: 2 },

  disclaimer: {
    ...type.caption,
    color: colors.textFaint,
    lineHeight: 16,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
});
