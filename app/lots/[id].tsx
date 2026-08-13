import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useSpot } from '@/state/AppState';
import { METALS, findPurity } from '@/lib/metals';
import {
  calculateExpectedContent,
  calculateSettlement,
  calculateVariance,
  suggestAssayLines,
  type AssayLine,
} from '@/lib/refining';
import { money, parseNumber, percent, shortDate, signedPercent } from '@/lib/format';
import { confirm } from '@/lib/confirm';
import { uid } from '@/lib/storage';
import { Badge, Button, Card, Divider, Input, SectionLabel, StatRow } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

export default function LotDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getLot, getItem, sendLot, settleLot, deleteLot, settings } = useApp();
  const spot = useSpot();

  const lot = getLot(String(id));

  const lotItems = useMemo(
    () => (lot ? lot.itemIds.map(getItem).filter((i): i is NonNullable<typeof i> => !!i) : []),
    [lot, getItem],
  );
  const expected = useMemo(() => calculateExpectedContent(lotItems), [lotItems]);

  const [lines, setLines] = useState<AssayLine[] | null>(null);
  const [fees, setFees] = useState({ refining: '', assay: '', shipping: '', other: '' });
  const [saving, setSaving] = useState(false);

  if (!lot) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This lot no longer exists.</Text>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const editableLines = lines ?? lot.assayLines;
  const feeValues = {
    refining: parseNumber(fees.refining),
    assay: parseNumber(fees.assay),
    shipping: parseNumber(fees.shipping),
    other: parseNumber(fees.other),
  };

  const settled = lot.status === 'settled';
  const result = calculateSettlement(
    settled ? lot.assayLines : editableLines,
    settled ? lot.fees : feeValues,
    lot.costBasis,
  );
  const variance = calculateVariance(expected, result);

  const startSettlement = () =>
    setLines(suggestAssayLines(expected, spot, uid));

  const patchLine = (lineId: string, patch: Partial<AssayLine>) =>
    setLines((prev) =>
      (prev ?? []).map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );

  const doSend = async () => {
    const ok = await confirm({
      title: `Send ${lot.reference} to the refiner?`,
      message: `${lotItems.length} item${lotItems.length === 1 ? '' : 's'} will be marked melted and leave your stock. The lot's cost basis is locked at this point.`,
      confirmLabel: 'Mark sent',
    });
    if (ok) await sendLot(lot.id);
  };

  const doSettle = async () => {
    setSaving(true);
    try {
      await settleLot(lot.id, editableLines, feeValues);
      setLines(null);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    const ok = await confirm({
      title: `Delete ${lot.reference}?`,
      message:
        lot.status === 'open'
          ? 'The items stay in your inventory.'
          : 'The items in this lot go back to in-stock, since nothing will account for them otherwise.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteLot(lot.id);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ title: lot.reference }} />

        <View style={styles.section}>
          <Text style={styles.title}>{lot.refinerName || 'No refiner named'}</Text>
          <Text style={styles.subtitle}>
            {lotItems.length} item{lotItems.length === 1 ? '' : 's'} · created{' '}
            {shortDate(lot.createdAt)}
            {lot.sentAt ? ` · sent ${shortDate(lot.sentAt)}` : ''}
            {lot.settledAt ? ` · settled ${shortDate(lot.settledAt)}` : ''}
          </Text>
        </View>

        {/* ------------------------------------------------------- the money */}
        <View style={styles.section}>
          <Card>
            <StatRow label="Cost basis" value={money(lot.costBasis, lot.currency)} />
            {settled || editableLines.length > 0 ? (
              <>
                <StatRow label="Payable value" value={money(result.grossValue, lot.currency)} tone="gold" />
                <StatRow label="Fees" value={`− ${money(result.feesTotal, lot.currency)}`} />
                <StatRow label="Refiner pays" value={money(result.netSettlement, lot.currency)} />
                <StatRow
                  label="Profit on the lot"
                  value={`${money(result.profit, lot.currency)} (${signedPercent(result.profitPercent, 1)})`}
                  emphasis
                  tone={result.profit >= 0 ? 'up' : 'down'}
                />
              </>
            ) : (
              <Text style={styles.note}>
                Nothing is known about this lot's value until the refiner reports. Expected pure
                content from your own weights is {expected.totalPureGrams.toFixed(2)} g.
              </Text>
            )}
          </Card>
        </View>

        {/* -------------------------------------------------------- variance */}
        {(settled || editableLines.length > 0) && variance.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>Book versus assay</SectionLabel>
            <Card padded={false}>
              {variance.map((row, i) => (
                <View key={row.metal}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.varianceRow}>
                    <View style={[styles.dot, { backgroundColor: METALS[row.metal].color }]} />
                    <Text style={styles.varianceMetal}>{METALS[row.metal].name}</Text>
                    <Text style={styles.varianceNums}>
                      {row.expectedPureGrams.toFixed(2)} → {row.assayedPureGrams.toFixed(2)} g
                    </Text>
                    <Text
                      style={[
                        styles.varianceDelta,
                        { color: row.differenceGrams >= 0 ? colors.up : colors.down },
                      ]}
                    >
                      {signedPercent(row.differencePercent, 1)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
            <Text style={styles.note}>
              A consistent shortfall with one refiner is worth a conversation. A shortfall on one
              buyer's intake is a training problem.
            </Text>
          </View>
        )}

        {/* ------------------------------------------------------ settlement */}
        {lot.status === 'sent' && (
          <View style={styles.section}>
            <SectionLabel>Settlement</SectionLabel>
            {!lines ? (
              <Card>
                <Text style={styles.note}>
                  When the refiner's statement arrives, enter what they actually weighed, assayed
                  and paid for.
                </Text>
                <Button
                  label="Enter settlement"
                  onPress={startSettlement}
                  style={{ marginTop: spacing.md }}
                />
              </Card>
            ) : (
              <>
                {lines.map((line) => (
                  <Card key={line.id} style={{ marginBottom: spacing.md }}>
                    <View style={styles.lineHeader}>
                      <View style={[styles.dot, { backgroundColor: METALS[line.metal].color }]} />
                      <Text style={styles.lineTitle}>{METALS[line.metal].name}</Text>
                    </View>

                    <View style={styles.row}>
                      <Input
                        containerStyle={{ flex: 1 }}
                        label="Gross received"
                        value={String(line.grossGrams)}
                        onChangeText={(t) => patchLine(line.id, { grossGrams: parseNumber(t) })}
                        keyboardType="decimal-pad"
                        suffix="g"
                      />
                      <Input
                        containerStyle={{ flex: 1 }}
                        label="Assay"
                        value={String(line.assayFineness)}
                        onChangeText={(t) => patchLine(line.id, { assayFineness: parseNumber(t) })}
                        keyboardType="decimal-pad"
                        hint="0–1, e.g. 0.585"
                      />
                    </View>

                    <View style={{ height: spacing.md }} />
                    <View style={styles.row}>
                      <Input
                        containerStyle={{ flex: 1 }}
                        label="Payable"
                        value={String(line.payableRate)}
                        onChangeText={(t) => patchLine(line.id, { payableRate: parseNumber(t) })}
                        keyboardType="decimal-pad"
                        hint="0–1, e.g. 0.97"
                      />
                      <Input
                        containerStyle={{ flex: 1 }}
                        label="Settlement price"
                        value={String(line.pricePerTroyOz)}
                        onChangeText={(t) => patchLine(line.id, { pricePerTroyOz: parseNumber(t) })}
                        keyboardType="decimal-pad"
                        prefix="$"
                        hint="per troy oz"
                      />
                    </View>
                  </Card>
                ))}

                <Card>
                  <Text style={styles.lineTitle}>Fees</Text>
                  <View style={{ height: spacing.md }} />
                  <View style={styles.row}>
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Refining"
                      value={fees.refining}
                      onChangeText={(t) => setFees((f) => ({ ...f, refining: t }))}
                      keyboardType="decimal-pad"
                      prefix="$"
                    />
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Assay"
                      value={fees.assay}
                      onChangeText={(t) => setFees((f) => ({ ...f, assay: t }))}
                      keyboardType="decimal-pad"
                      prefix="$"
                    />
                  </View>
                  <View style={{ height: spacing.md }} />
                  <View style={styles.row}>
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Shipping"
                      value={fees.shipping}
                      onChangeText={(t) => setFees((f) => ({ ...f, shipping: t }))}
                      keyboardType="decimal-pad"
                      prefix="$"
                    />
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Other"
                      value={fees.other}
                      onChangeText={(t) => setFees((f) => ({ ...f, other: t }))}
                      keyboardType="decimal-pad"
                      prefix="$"
                    />
                  </View>

                  <Divider />
                  <Button label="Record settlement" onPress={doSettle} loading={saving} />
                </Card>
              </>
            )}
          </View>
        )}

        {/* ----------------------------------------------------------- items */}
        <View style={styles.section}>
          <SectionLabel>What went in</SectionLabel>
          <Card padded={false}>
            {lotItems.map((item, i) => {
              const purity = findPurity(item.purityId);
              return (
                <View key={item.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.itemRow}>
                    <View style={[styles.dot, { backgroundColor: METALS[item.metal].color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text style={styles.itemSub}>
                        {item.ticket} · {purity?.label} · {item.weight} {item.unit}
                      </Text>
                    </View>
                    <Text style={styles.itemPrice}>
                      {money(item.purchasePrice, item.currency, 0)}
                    </Text>
                  </View>
                </View>
              );
            })}
            {lotItems.length < lot.itemIds.length && (
              <Text style={styles.warn}>
                {lot.itemIds.length - lotItems.length} item
                {lot.itemIds.length - lotItems.length === 1 ? ' has' : 's have'} been deleted since
                this lot was built. The cost basis above still includes them.
              </Text>
            )}
          </Card>
        </View>

        {/* --------------------------------------------------------- actions */}
        <View style={styles.section}>
          {lot.status === 'open' && (
            <>
              <Badge label="NOT SENT YET" tone="info" />
              <View style={{ height: spacing.md }} />
              <Button label="Mark sent to refiner" onPress={doSend} />
              <View style={{ height: spacing.sm }} />
            </>
          )}
          <Button label="Delete lot" variant="danger" onPress={doDelete} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },

  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  missingText: { ...type.body, color: colors.textMuted, textAlign: 'center' },

  title: { ...type.title, color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },

  varianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  varianceMetal: { ...type.body, color: colors.text, flex: 1 },
  varianceNums: { ...type.mono, fontSize: 13, color: colors.textMuted },
  varianceDelta: { ...type.caption, minWidth: 56, textAlign: 'right', fontVariant: ['tabular-nums'] },

  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  lineTitle: { ...type.heading, fontSize: 15, color: colors.text },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  itemTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  itemSub: { ...type.caption, color: colors.textFaint },
  itemPrice: { ...type.mono, fontSize: 14, color: colors.text },

  note: { ...type.caption, color: colors.textFaint, lineHeight: 16, marginTop: spacing.sm },
  warn: { ...type.caption, color: colors.warn, lineHeight: 16, padding: spacing.lg },
});
