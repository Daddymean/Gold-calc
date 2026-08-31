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
import { CoinPicker, type CoinPick } from '@/components/CoinPicker';

/**
 * The calculator is the screen a buyer keeps open all day, so it optimises for
 * the counter conversation: weigh, pick karat, read the offer aloud. Everything
 * else — the lot builder, the offer override — is one tap away but never in the
 * path of the common case.
 */
export default function CalculatorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, offerFor, items } = useApp();
  const spot = useSpot();

  const [metal, setMetal] = useState<MetalSymbol>(settings.defaultMetal);
  const [purityId, setPurityId] = useState<string>(DEFAULT_PURITY[settings.defaultMetal]);
  const [unit, setUnit] = useState<WeightUnit>(settings.defaultUnit);
  const [weightText, setWeightText] = useState('');
  const [payoutOverride, setPayoutOverride] = useState<string | null>(null);
  const [offerText, setOfferText] = useState('');
  const [offerLocked, setOfferLocked] = useState(false);
  const [lot, setLot] = useState<LotLine[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const purity = findPurity(purityId);
  const spotPrice = spot[metal] ?? 0;

  // The catalog fills the same three fields the operator would have typed, in
  // grams because that is what every coin is specified in. Nothing downstream
  // needs to know a coin was involved.
  const applyCoin = ({ coin, entry }: CoinPick) => {
    setMetal(coin.metal);
    setPurityId(coin.purityId);
    setUnit('g');
    setWeightText((entry.grams * entry.quantity).toFixed(2));
    setCatalogOpen(false);
  };

  // Melt first, because a per-gram rule needs the gross weight and a percentage
  // rule needs the melt value; the table then decides which basis applies.
  const meltOnly = useMemo(
    () =>
      calculateMelt({
        spotPerTroyOz: spotPrice,
        weight: parseNumber(weightText),
        unit,
        fineness: purity?.fineness ?? 0,
        payoutRate: 1,
      }),
    [spotPrice, weightText, unit, purity?.fineness],
  );

  const tableOffer = useMemo(
    () =>
      offerFor(
        { metal, purityId, weight: parseNumber(weightText), unit },
        meltOnly.meltValue,
        meltOnly.grams,
      ),
    [offerFor, metal, purityId, weightText, unit, meltOnly.meltValue, meltOnly.grams],
  );

  // Typing in the percentage field pins the rate until the operator clears it.
  const payoutText = payoutOverride ?? String(Math.round(tableOffer.impliedRate * 100));
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
  const effectiveOffer = offerLocked && offer > 0
    ? offer
    : payoutOverride !== null
      ? result.payout
      : tableOffer.payout;
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
        {/* Shown only while the book is empty, which is as good a definition of
            a first-time user as the app has. It disappears the moment they log
            anything, so it never becomes furniture. */}
        {items.length === 0 && (
          <View style={styles.section}>
            <Card>
              <Text style={styles.primerTitle}>New to buying scrap?</Text>
              <Text style={styles.primerBody}>
                <Text style={styles.primerStep}>1.</Text> Pick the metal and its purity — the karat
                stamp on the piece.{'\n'}
                <Text style={styles.primerStep}>2.</Text> Weigh it and enter the weight.{'\n'}
                <Text style={styles.primerStep}>3.</Text> The app works out what the metal inside is
                worth at today's price. You pay a percentage of that; the rest is your margin.
              </Text>
            </Card>
          </View>
        )}

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
          {/* "58.33% fine" is what the trade says; "pure gold by weight" is
              what it means. Both, so the term is learned rather than decoded. */}
          <Text style={styles.purityNote}>
            {purity
              ? `${percent(purity.fineness, 2)} fine — that much pure ${METALS[metal].name.toLowerCase()} by weight`
              : 'Select a purity'}
          </Text>
          {!!purity && (
            <Text style={styles.purityNote}>
              Worth {money(result.perGram, settings.currency)} per gram ·{' '}
              {money(result.perDwt, settings.currency)} per dwt (pennyweight)
            </Text>
          )}
          {/* A nominal fineness is a working average, not a measurement of the
              piece on the scale. Quoting from it without saying so invites the
              operator to treat a convention as an assay. */}
          {purity?.nominal && !!purity.note && (
            <Text style={styles.nominalNote}>{purity.note}</Text>
          )}
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
          {/* Coins are the one case where the weight is already known and
              typing it is just recall from memory. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Look up a coin"
            onPress={() => setCatalogOpen(true)}
            style={styles.catalogLink}
          >
            <Text style={styles.catalogLinkText}>Coins and junk silver — look it up</Text>
          </Pressable>
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
                setPayoutOverride(t);
                setOfferLocked(false);
              }}
              keyboardType="number-pad"
              suffix="%"
              hint="of melt value"
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
              hint="sets the rate for you"
              accessibilityLabel="Fixed offer amount"
            />
          </View>
          {offerLocked ? (
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
          ) : payoutOverride !== null ? (
            <Text style={styles.offerNote}>
              Manual rate.{' '}
              <Text style={styles.link} onPress={() => setPayoutOverride(null)}>
                Use the buy table
              </Text>
            </Text>
          ) : (
            settings.useBuyTable && (
              <View>
                <Text style={styles.offerNote}>
                  {/* "Buy table · All · 0–31.1 g" told a newcomer nothing.
                      Say which rule fired and that it came from their own
                      posted rates. */}
                  {tableOffer.rule
                    ? `From your buy table — the ${tableOffer.reason} rule${
                        tableOffer.mode === 'perGram'
                          ? `, posted at ${money(tableOffer.perGram, settings.currency)} per gram`
                          : ''
                      }`
                    : tableOffer.reason}
                </Text>
                {tableOffer.stale && (
                  <View style={styles.staleRow}>
                    <Badge label="POSTED PRICE HAS DRIFTED" tone="warn" />
                    <Text style={styles.staleText}>
                      That works out to {percent(tableOffer.impliedRate)} of melt at today's spot.
                    </Text>
                  </View>
                )}
              </View>
            )
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

            {/* The trade's words, each with the plain one underneath. Somebody
                buying their first lot should not have to know what "melt" or
                "spot" means before the screen makes sense. */}
            <StatRow
              label="Melt value at spot"
              value={money(result.meltValue, settings.currency)}
              detail="what the metal is worth"
              tone="gold"
            />
            <StatRow
              label="Your margin"
              value={money(margin, settings.currency)}
              detail="melt value less what you pay"
            />
            <StatRow
              label="Pure content"
              value={`${fmtWeight(result.pureGrams, 3)} g · ${fmtWeight(result.pureTroyOz, 4)} ozt`}
              detail="actual metal, once purity is taken off"
            />
            <StatRow
              label={`Spot (${METALS[metal].short})`}
              value={`${spotPrice ? spotMoney(spotPrice, settings.currency) : '—'}/ozt`}
              detail="today's market price per troy ounce"
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

      <CoinPicker
        visible={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onPick={applyCoin}
        spot={spot}
        currency={settings.currency}
      />
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

  nominalNote: { ...type.caption, color: colors.warn, lineHeight: 16, marginTop: spacing.sm },
  purityNote: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  primerTitle: { ...type.heading, fontSize: 15, color: colors.text, marginBottom: spacing.sm },
  primerBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  primerStep: { color: colors.gold },

  weightInput: { fontSize: 28, fontWeight: '700', paddingVertical: 10 },

  offerRow: { flexDirection: 'row', gap: spacing.md },
  offerNote: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  staleRow: { gap: spacing.xs, marginTop: spacing.sm },
  staleText: { ...type.caption, color: colors.warn, lineHeight: 16 },
  link: { color: colors.gold, fontWeight: '700' },
  catalogLink: { marginTop: spacing.md, alignSelf: 'flex-start' },
  catalogLinkText: { ...type.body, color: colors.gold, fontWeight: '600' },

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
