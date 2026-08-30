import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COINS,
  JUNK_GROUPS,
  entryByCount,
  entryByFace,
  searchCoins,
  type Coin,
  type CoinEntry,
} from '@/lib/coins';
import { METALS, METAL_ORDER, calculateMelt, findPurity, type MetalSymbol } from '@/lib/metals';
import { money, parseNumber } from '@/lib/format';
import { Button, Input, Segmented } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import type { CurrencyCode } from '@/lib/format';

export interface CoinPick {
  coin: Coin;
  entry: CoinEntry;
}

type CountMode = 'count' | 'face';

/**
 * Pick a coin instead of recalling its weight.
 *
 * Two steps on purpose. The list answers "which coin", which is a recognition
 * task and wants everything visible at once; the detail answers "how many",
 * which needs a keyboard and a running total. Trying to do both in one row
 * makes a list nobody can scan.
 *
 * The melt preview is the point of the second step: an operator quoting across
 * the counter gets the number before committing to anything, and a wrong pick
 * is obvious because the total is an order of magnitude off.
 */
export function CoinPicker({
  visible,
  onClose,
  onPick,
  spot,
  currency,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (pick: CoinPick) => void;
  spot: Partial<Record<MetalSymbol, number>>;
  currency: CurrencyCode;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [metalFilter, setMetalFilter] = useState<MetalSymbol | 'all'>('all');
  const [selected, setSelected] = useState<Coin | null>(null);
  const [mode, setMode] = useState<CountMode>('count');
  const [amountText, setAmountText] = useState('1');

  const results = useMemo(() => {
    const pool = metalFilter === 'all' ? COINS : COINS.filter((c) => c.metal === metalFilter);
    return searchCoins(query, pool);
  }, [query, metalFilter]);

  const reset = () => {
    setSelected(null);
    setQuery('');
    setMetalFilter('all');
    setAmountText('1');
    setMode('count');
  };

  const close = () => {
    reset();
    onClose();
  };

  const open = (coin: Coin) => {
    setSelected(coin);
    // Circulated coin is bought by face value, so that is what its form opens
    // on. Anything else is counted.
    const byFace = !!coin.junkGroup;
    setMode(byFace ? 'face' : 'count');
    setAmountText(byFace ? '' : '1');
  };

  const amount = parseNumber(amountText);
  const entry = useMemo<CoinEntry | null>(() => {
    if (!selected) return null;
    return mode === 'face' ? entryByFace(selected, amount) : entryByCount(selected, amount);
  }, [selected, mode, amount]);

  const preview = useMemo(() => {
    if (!selected || !entry) return null;
    return calculateMelt({
      spotPerTroyOz: spot[selected.metal] ?? 0,
      weight: entry.grams,
      unit: 'g',
      fineness: findPurity(selected.purityId)?.fineness ?? 0,
      payoutRate: 1,
      quantity: entry.quantity,
    });
  }, [selected, entry, spot]);

  const group = selected?.junkGroup ? JUNK_GROUPS[selected.junkGroup] : undefined;
  const usable = !!entry && entry.grams > 0 && entry.quantity > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{selected ? selected.name : 'Coin catalog'}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={selected ? 'Back to the coin list' : 'Close the coin catalog'}
              onPress={() => (selected ? setSelected(null) : close())}
              style={styles.headerAction}
            >
              <Text style={styles.headerActionText}>{selected ? 'Back' : 'Close'}</Text>
            </Pressable>
          </View>

          {!selected ? (
            <>
              <Input
                accessibilityLabel="Search the coin catalog"
                value={query}
                onChangeText={setQuery}
                placeholder="Eagle, krug, junk, 1965…"
                autoCorrect={false}
                containerStyle={{ marginBottom: spacing.md }}
              />
              <Segmented
                scroll
                value={metalFilter}
                onChange={setMetalFilter}
                options={[
                  { value: 'all' as const, label: 'All' },
                  ...METAL_ORDER.filter((m) => COINS.some((c) => c.metal === m)).map((m) => ({
                    value: m,
                    label: METALS[m].name,
                  })),
                ]}
              />

              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {results.map((coin) => (
                  <CoinRow key={coin.id} coin={coin} onPress={() => open(coin)} />
                ))}
                {results.length === 0 && (
                  <Text style={styles.empty}>
                    No coin matches “{query}”. Anything not listed can still be entered by weight
                    and purity.
                  </Text>
                )}
              </ScrollView>
            </>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.spec}>{specLine(selected)}</Text>
              {!!selected.years && <Text style={styles.years}>Struck {selected.years}</Text>}

              {!!group && (
                <>
                  <View style={{ height: spacing.md }} />
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'face' as const, label: 'By face value' },
                      { value: 'count' as const, label: 'By the coin' },
                    ]}
                  />
                  <Text style={styles.groupNote}>{group.note}</Text>
                </>
              )}

              <View style={{ height: spacing.lg }} />
              {mode === 'face' && group ? (
                <Input
                  label="Face value"
                  accessibilityLabel="Face value"
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  prefix={group.faceCurrency}
                  hint="What the coins add up to at face — not what they are worth."
                />
              ) : (
                <Input
                  label="How many"
                  accessibilityLabel="How many coins"
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="number-pad"
                  placeholder="1"
                  suffix="coins"
                  hint={`${selected.grams} g each`}
                />
              )}

              {!!preview && usable && (
                <View style={styles.preview}>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Pure {METALS[selected.metal].name.toLowerCase()}</Text>
                    <Text style={styles.previewValue}>
                      {preview.pureTroyOz.toFixed(3)} ozt
                      <Text style={styles.previewSub}>{`  ·  ${preview.pureGrams.toFixed(1)} g`}</Text>
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Melt value at spot</Text>
                    <Text style={[styles.previewValue, styles.previewGold]}>
                      {money(preview.meltValue, currency)}
                    </Text>
                  </View>
                  <Text style={styles.previewFoot}>
                    {`Records as ${entry!.grams.toFixed(2)} g${entry!.quantity > 1 ? ` × ${entry!.quantity}` : ''} at ${findPurity(selected.purityId)?.label}`}
                  </Text>
                </View>
              )}

              <View style={{ height: spacing.lg }} />
              <Button
                label="Use this"
                disabled={!usable}
                onPress={() => {
                  if (!entry) return;
                  onPick({ coin: selected, entry });
                  reset();
                }}
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function CoinRow({ coin, onPress }: { coin: Coin; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={[styles.rowDot, { backgroundColor: METALS[coin.metal].color }]}>
        <Text style={styles.rowDotText}>{METALS[coin.metal].short}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{coin.name}</Text>
        <Text style={styles.rowSpec}>{specLine(coin)}</Text>
      </View>
      {!!coin.junkGroup && <Text style={styles.rowTag}>by face</Text>}
    </Pressable>
  );
}

/** One line a dealer can check the catalog against: weight, fineness, content. */
function specLine(coin: Coin): string {
  const purity = findPurity(coin.purityId);
  return `${coin.grams} g · ${purity?.label ?? '—'} · ${coin.aswOzt} ozt ${METALS[coin.metal].name.toLowerCase()}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000B0', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  title: { ...type.heading, color: colors.text, flex: 1 },
  headerAction: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  headerActionText: { ...type.body, color: colors.gold },

  list: { marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowDotText: { ...type.caption, fontWeight: '700', color: colors.onGold },
  rowBody: { flex: 1, gap: 2 },
  rowName: { ...type.body, color: colors.text },
  rowSpec: { ...type.caption, color: colors.textMuted },
  rowTag: { ...type.caption, color: colors.textFaint },
  empty: { ...type.body, color: colors.textMuted, paddingVertical: spacing.xl },

  spec: { ...type.body, color: colors.textMuted },
  years: { ...type.caption, color: colors.textFaint, marginTop: 2 },
  groupNote: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 17 },

  preview: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.sm,
  },
  previewRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  previewLabel: { ...type.body, color: colors.textMuted },
  previewValue: { ...type.body, color: colors.text, fontWeight: '600' },
  previewGold: { ...type.heading, color: colors.gold },
  previewSub: { ...type.caption, color: colors.textFaint, fontWeight: '400' },
  previewFoot: { ...type.caption, color: colors.textFaint },
});
