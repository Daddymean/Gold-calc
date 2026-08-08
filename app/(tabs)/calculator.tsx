import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useSpot } from '@/state/AppState';
import {
  DEFAULT_PURITY,
  METALS,
  METAL_ORDER,
  WEIGHT_UNITS,
  WEIGHT_UNIT_ORDER,
  calculateLot,
  calculateMelt,
  findPurity,
  puritiesFor,
  type LotLine,
  type MetalSymbol,
  type WeightUnit,
} from '@/lib/metals';
import { money, parseNumber, percent, spotMoney, weight as fmtWeight } from '@/lib/format';
import { Badge, Button, Card, Divider, Input, SectionLabel, Segmented, StatRow } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import { uid } from '@/lib/storage';

/**
 * The calculator is the screen a buyer keeps open all day, so it optimises for
 * the counter conversation: weigh, pick karat, read the offer aloud. Everything
 * else — the lot builder, the offer override — is one tap away but never in the
 * path of the common case.
 */
export default function CalculatorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, quotes } = useApp();
  const spot = useSpot();

  const [metal, setMetal] = useState<MetalSymbol>(settings.defaultMetal);
  const [purityId, setPurityId] = useState<string>(DEFAULT_PURITY[settings.defaultMetal]);
  const [unit, setUnit] = useState<WeightUnit>(settings.defaultUnit);
  const [weightText, setWeightText] = useState('');
  const [payoutText, setPayoutText] = useState(String(Math.round(settings.defaultPayoutRate * 100)));
  const [offerText, setOfferText] = useState('');
  const [offerLocked, setOfferLocked] = useState(false);
  const [lot, setLot] = useState<LotLine[]>([]);

  const purity = findPurity(purityId);
  const spotPrice = spot[metal] ?? 0;
  const payoutRate = parseNumber(payoutText) / 100;

  const result = useMemo(
    () =>
      calculateMelt({
        spotPerTroyOz: spotPrice,
        weight: parseNumber(weightText),
        unit,
        fineness: purity?.fineness ?? 0,
        payoutRate,
      }),
    [spotPrice, weightText, unit, purity?.fineness, payoutRate],
  );

  // Typing an offer flips the relationship: the percentage becomes the derived
  // value so a buyer can quote a round number and see what it costs them.
  const offer = parseNumber(offerText);
  const effectiveOffer = offerLocked && offer > 0 ? offer : result.payout;
  const effectiveRate = result.meltValue > 0 ? effectiveOffer / result.meltValue : 0;
  const margin = result.meltValue - effectiveOffer;

  const lotTotals = useMemo(() => calculateLot(lot, spot, payoutRate), [lot, spot, payoutRate]);

  const switchMetal = (next: MetalSymbol) => {
    setMetal(next);
    setPurityId(DEFAULT_PURITY[next]);
  };

  const addCurrentToLot = () => {
    const w = parseNumber(weightText);
    if (w <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLot((prev) => [...prev, { id: uid(), metal, purityId, weight: w, unit }]);
    setWeightText('');
  };

  const hasWeight = parseNumber(weightText) > 0;
  const noPrice = !spot[metal];

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
        {/* ---------------------------------------------------------- metal */}
        <View style={styles.section}>
          <SectionLabel>Metal</SectionLabel>
          <View style={styles.metalRow}>
            {METAL_ORDER.map((m) => {
              const selected = m === metal;
              const meta = METALS[m];
              return (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => switchMetal(m)}
                  style={[
                    styles.metalTile,
                    selected && { borderColor: meta.color, backgroundColor: `${meta.color}1F` },
                  ]}
                >
                  <Text style={[styles.metalShort, { color: meta.color }]}>{meta.short}</Text>
                  <Text style={[styles.metalName, selected && { color: colors.text }]}>
                    {meta.name}
                  </Text>
                  <Text style={styles.metalSpot}>
                    {spot[m] ? spotMoney(spot[m]!, settings.currency) : '—'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* --------------------------------------------------------- purity */}
        <View style={styles.section}>
          <SectionLabel>Purity</SectionLabel>
          <Segmented
            scroll
            accent={METALS[metal].color}
            value={purityId}
            onChange={setPurityId}
            options={puritiesFor(metal).map((p) => ({
              value: p.id,
              label: p.label,
              sublabel: p.hint,
            }))}
          />
          <Text style={styles.purityNote}>
            {purity ? `${percent(purity.fineness, 2)} fine` : 'Select a purity'} ·{' '}
            {money(result.perGram, settings.currency)}/g · {money(result.perDwt, settings.currency)}/dwt
          </Text>
        </View>

        {/* --------------------------------------------------------- weight */}
        <View style={styles.section}>
          <SectionLabel>Weight</SectionLabel>
          <Input
            value={weightText}
            onChangeText={setWeightText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            suffix={unit}
            style={styles.weightInput}
            accessibilityLabel="Item weight"
          />
          <View style={{ height: spacing.sm }} />
          <Segmented
            scroll
            value={unit}
            onChange={setUnit}
            options={WEIGHT_UNIT_ORDER.map((u) => ({ value: u, label: WEIGHT_UNITS[u].label }))}
          />
        </View>

        {/* ---------------------------------------------------------- offer */}
        <View style={styles.section}>
          <SectionLabel>Your offer</SectionLabel>
          <View style={styles.offerRow}>
            <Input
              containerStyle={{ flex: 1 }}
              label="Payout rate"
              value={payoutText}
              onChangeText={(t) => {
                setPayoutText(t);
                setOfferLocked(false);
              }}
              keyboardType="number-pad"
              suffix="%"
              accessibilityLabel="Percentage of melt paid out"
            />
            <Input
              containerStyle={{ flex: 1 }}
              label="Or pay exactly"
              value={offerLocked ? offerText : ''}
              onChangeText={(t) => {
                setOfferText(t);
                setOfferLocked(t.length > 0);
              }}
              keyboardType="decimal-pad"
              placeholder={result.payout > 0 ? result.payout.toFixed(2) : '0.00'}
              prefix="$"
              accessibilityLabel="Fixed offer amount"
            />
          </View>
          {offerLocked && (
            <Text style={styles.offerNote}>
              That offer is {percent(effectiveRate)} of melt.{' '}
              <Text
                style={styles.link}
                onPress={() => {
                  setOfferLocked(false);
                  setOfferText('');
                }}
              >
                Back to percentage
              </Text>
            </Text>
          )}
        </View>

        {/* --------------------------------------------------------- result */}
        <View style={styles.section}>
          <Card style={styles.resultCard}>
            {noPrice && (
              <View style={styles.noPrice}>
                <Badge label="NO LIVE PRICE" tone="warn" />
                <Text style={styles.noPriceText}>
                  No spot price for {METALS[metal].name}. Pull to refresh on the Prices tab.
                </Text>
              </View>
            )}

            <Text style={styles.payoutLabel}>Pay the customer</Text>
            <Text style={styles.payout}>{money(effectiveOffer, settings.currency)}</Text>

            <Divider />

            <StatRow
              label="Melt value at spot"
              value={money(result.meltValue, settings.currency)}
              tone="gold"
            />
            <StatRow label="Your margin" value={money(margin, settings.currency)} />
            <StatRow
              label="Pure content"
              value={`${fmtWeight(result.pureGrams, 3)} g · ${fmtWeight(result.pureTroyOz, 4)} ozt`}
            />
            <StatRow
              label={`Spot (${METALS[metal].short})`}
              value={`${spotPrice ? spotMoney(spotPrice, settings.currency) : '—'}/ozt`}
            />

            <View style={styles.actions}>
              <Button
                label="Add to lot"
                variant="secondary"
                disabled={!hasWeight}
                onPress={addCurrentToLot}
                style={{ flex: 1 }}
              />
              <Button
                label="Log purchase"
                disabled={!hasWeight}
                onPress={() =>
                  router.push({
                    pathname: '/item/new',
                    params: {
                      metal,
                      purityId,
                      weight: weightText,
                      unit,
                      price: effectiveOffer.toFixed(2),
                    },
                  })
                }
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>

        {/* ------------------------------------------------------------ lot */}
        {lot.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>Lot · {lot.length} lines</SectionLabel>
            <Card padded={false}>
              {lot.map((line, i) => {
                const linePurity = findPurity(line.purityId);
                const lineResult = calculateMelt({
                  spotPerTroyOz: spot[line.metal] ?? 0,
                  weight: line.weight,
                  unit: line.unit,
                  fineness: linePurity?.fineness ?? 0,
                  payoutRate,
                });
                return (
                  <View key={line.id}>
                    {i > 0 && <View style={styles.lotDivider} />}
                    <View style={styles.lotLine}>
                      <View
                        style={[styles.lotDot, { backgroundColor: METALS[line.metal].color }]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lotTitle}>
                          {linePurity?.label} {METALS[line.metal].name}
                        </Text>
                        <Text style={styles.lotSub}>
                          {fmtWeight(line.weight)} {line.unit}
                        </Text>
                      </View>
                      <Text style={styles.lotValue}>
                        {money(lineResult.payout, settings.currency)}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove line"
                        hitSlop={10}
                        onPress={() => setLot((prev) => prev.filter((l) => l.id !== line.id))}
                      >
                        <Text style={styles.lotRemove}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              <View style={styles.lotTotals}>
                <StatRow label="Lot melt" value={money(lotTotals.meltValue, settings.currency)} />
                <StatRow
                  label="Lot payout"
                  value={money(lotTotals.payout, settings.currency)}
                  emphasis
                  tone="gold"
                />
              </View>
            </Card>
            <Button
              label="Clear lot"
              variant="ghost"
              onPress={() => setLot([])}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg },

  metalRow: { flexDirection: 'row', gap: spacing.sm },
  metalTile: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 1,
  },
  metalShort: { ...type.label, fontSize: 15 },
  metalName: { ...type.caption, color: colors.textMuted },
  metalSpot: { ...type.caption, fontSize: 10, color: colors.textFaint, fontVariant: ['tabular-nums'] },

  purityNote: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },

  weightInput: { fontSize: 28, fontWeight: '700', paddingVertical: 10 },

  offerRow: { flexDirection: 'row', gap: spacing.md },
  offerNote: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  link: { color: colors.gold, fontWeight: '700' },

  resultCard: { marginTop: spacing.lg },
  noPrice: { gap: spacing.xs, marginBottom: spacing.md },
  noPriceText: { ...type.caption, color: colors.textMuted },

  payoutLabel: { ...type.caption, color: colors.textMuted },
  payout: { ...type.display, fontSize: 40, color: colors.gold, marginTop: 2 },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },

  lotDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 40 },
  lotLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  lotDot: { width: 8, height: 8, borderRadius: 4 },
  lotTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  lotSub: { ...type.caption, color: colors.textFaint },
  lotValue: { ...type.mono, color: colors.text },
  lotRemove: { ...type.body, color: colors.textFaint, paddingLeft: spacing.xs },
  lotTotals: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
