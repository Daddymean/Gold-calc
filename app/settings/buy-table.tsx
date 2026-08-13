import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { confirm } from '@/lib/confirm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/AppState';
import { METALS, METAL_ORDER, findPurity, puritiesFor, type MetalSymbol } from '@/lib/metals';
import {
  findOverlaps,
  ruleMode,
  rulesForMetal,
  starterRules,
  type BuyRule,
  type RateMode,
} from '@/lib/buyTable';
import { money, parseNumber, percent } from '@/lib/format';
import { uid } from '@/lib/storage';
import { Badge, Button, Card, Divider, Input, SectionLabel, Segmented } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

/**
 * The buy table editor.
 *
 * Shops price scrap off a matrix, not a single percentage. This is that matrix:
 * per metal, optionally per karat, stepped by how much the customer brought.
 */
export default function BuyTableScreen() {
  const insets = useSafeAreaInsets();
  const { buyRules, saveBuyRules, settings, updateSettings } = useApp();

  const [metal, setMetal] = useState<MetalSymbol>(settings.defaultMetal);
  const [editing, setEditing] = useState<BuyRule | null>(null);

  const rules = useMemo(() => rulesForMetal(buyRules, metal), [buyRules, metal]);
  const overlaps = useMemo(() => findOverlaps(buyRules), [buyRules]);
  const overlapIds = useMemo(
    () => new Set(overlaps.flatMap(([a, b]) => [a.id, b.id])),
    [overlaps],
  );

  const upsert = async (incoming: BuyRule) => {
    // A posted per-gram price is meaningless without the currency it was
    // entered in, and the display currency can change later.
    const rule: BuyRule =
      ruleMode(incoming) === 'perGram'
        ? { ...incoming, currency: settings.currency }
        : { ...incoming, currency: undefined };
    const exists = buyRules.some((r) => r.id === rule.id);
    await saveBuyRules(
      exists ? buyRules.map((r) => (r.id === rule.id ? rule : r)) : [...buyRules, rule],
    );
    setEditing(null);
  };

  const remove = async (rule: BuyRule) => {
    const ok = await confirm({
      title: 'Remove this rate?',
      message: 'Pieces matching it fall back to a wider rule or your default.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) await saveBuyRules(buyRules.filter((r) => r.id !== rule.id));
  };

  const loadStarter = async () => {
    const ok = await confirm({
      title: 'Load a starter table?',
      message:
        'Adds a typical set of rates for all four metals. Your existing rules are kept — remove any you do not want.',
      confirmLabel: 'Add them',
    });
    if (ok) await saveBuyRules([...buyRules, ...starterRules(uid)]);
  };

  if (editing) {
    return <RuleEditor rule={editing} onCancel={() => setEditing(null)} onSave={upsert} />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <View style={styles.section}>
        <Card>
          <Text style={styles.intro}>
            Rates are matched most-specific first: a rule naming a karat beats one covering the
            whole metal, and a narrower weight band beats a wider one. Anything unmatched falls back
            to your default of {percent(settings.defaultPayoutRate, 0)}.
          </Text>
          {!settings.useBuyTable && (
            <View style={styles.disabledRow}>
              <Badge label="TABLE OFF" tone="warn" />
              <Text style={styles.disabledText}>
                The calculator is using your flat default rate.
              </Text>
              <Button
                label="Turn on"
                variant="secondary"
                onPress={() => updateSettings({ useBuyTable: true })}
              />
            </View>
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <Segmented
          value={metal}
          onChange={setMetal}
          accent={METALS[metal].color}
          options={METAL_ORDER.map((m) => ({ value: m, label: METALS[m].short }))}
        />
      </View>

      <View style={styles.section}>
        <SectionLabel>{METALS[metal].name} rates</SectionLabel>

        {rules.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>
              No {METALS[metal].name.toLowerCase()} rules yet. Every piece uses your default rate.
            </Text>
          </Card>
        ) : (
          <Card padded={false}>
            {rules.map((rule, i) => (
              <View key={rule.id}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEditing(rule)}
                  onLongPress={() => remove(rule)}
                  style={({ pressed }) => [styles.ruleRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleTitle}>
                      {rule.purityId ? (findPurity(rule.purityId)?.label ?? '—') : 'All purities'}
                    </Text>
                    <Text style={styles.ruleBand}>
                      {rule.maxGrams == null
                        ? `${rule.minGrams} g and up`
                        : `${rule.minGrams}–${rule.maxGrams} g`}
                    </Text>
                    {overlapIds.has(rule.id) && (
                      <View style={{ marginTop: spacing.xs }}>
                        <Badge label="OVERLAPS ANOTHER BAND" tone="warn" />
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.ruleRate}>
                      {ruleMode(rule) === 'perGram'
                        ? `${money(rule.perGram ?? 0, settings.currency)}/g`
                        : percent(rule.rate, 0)}
                    </Text>
                    <Text style={styles.ruleMode}>
                      {ruleMode(rule) === 'perGram' ? 'posted' : 'of melt'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        <Text style={styles.hint}>Tap a rate to edit it, hold to remove.</Text>
      </View>

      <View style={styles.section}>
        <Button
          label={`Add a ${METALS[metal].name.toLowerCase()} rate`}
          onPress={() =>
            setEditing({
              id: uid(),
              metal,
              purityId: null,
              minGrams: 0,
              maxGrams: null,
              mode: 'percent',
              rate: settings.defaultPayoutRate,
              perGram: 0,
            })
          }
        />
        {buyRules.length === 0 && (
          <>
            <View style={{ height: spacing.sm }} />
            <Button label="Load a starter table" variant="secondary" onPress={loadStarter} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ editor */

function RuleEditor({
  rule,
  onCancel,
  onSave,
}: {
  rule: BuyRule;
  onCancel: () => void;
  onSave: (rule: BuyRule) => void;
}) {
  const insets = useSafeAreaInsets();

  const [purityId, setPurityId] = useState<string>(rule.purityId ?? 'any');
  const [minText, setMinText] = useState(String(rule.minGrams));
  const [maxText, setMaxText] = useState(rule.maxGrams == null ? '' : String(rule.maxGrams));
  const [mode, setMode] = useState<RateMode>(ruleMode(rule));
  const [rateText, setRateText] = useState(String(Math.round(rule.rate * 100)));
  const [perGramText, setPerGramText] = useState(rule.perGram ? String(rule.perGram) : '');

  const minGrams = Math.max(0, parseNumber(minText));
  const maxGrams = maxText.trim() ? Math.max(0, parseNumber(maxText)) : null;
  const rate = parseNumber(rateText) / 100;
  const perGram = parseNumber(perGramText);

  const problem =
    maxGrams !== null && maxGrams <= minGrams
      ? 'The upper bound has to be above the lower one.'
      : mode === 'percent' && (rate <= 0 || rate > 1)
        ? 'A payout rate has to be between 1 and 100 percent.'
        : mode === 'perGram' && perGram <= 0
          ? 'Enter the posted price per gram.'
          : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <SectionLabel>Applies to</SectionLabel>
          <Segmented
            scroll
            accent={METALS[rule.metal].color}
            value={purityId}
            onChange={setPurityId}
            options={[
              { value: 'any', label: 'All' },
              ...puritiesFor(rule.metal).map((p) => ({
                value: p.id,
                label: p.label,
                sublabel: p.hint,
              })),
            ]}
          />
          <Text style={styles.hint}>
            {purityId === 'any'
              ? `Every ${METALS[rule.metal].name.toLowerCase()} piece in this weight band.`
              : 'Only this purity. Overrides an "All" rule covering the same weight.'}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>Weight band</SectionLabel>
          <View style={styles.row}>
            <Input
              containerStyle={{ flex: 1 }}
              label="From"
              value={minText}
              onChangeText={setMinText}
              keyboardType="decimal-pad"
              suffix="g"
            />
            <Input
              containerStyle={{ flex: 1 }}
              label="Up to"
              value={maxText}
              onChangeText={setMaxText}
              keyboardType="decimal-pad"
              suffix="g"
              placeholder="no limit"
            />
          </View>
          <Text style={styles.hint}>
            Measured on gross weight, and quantity counts — twelve 5 g rings is a 60 g lot. Leave
            "up to" empty for the top band.
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>Payout</SectionLabel>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'percent', label: 'Percent of melt' },
              { value: 'perGram', label: 'Posted per gram' },
            ]}
          />
          <Text style={styles.hint}>
            {mode === 'percent'
              ? 'Floats with spot on its own — the offer moves as the market does.'
              : 'A fixed board price per gram of the item as presented, not per gram of pure metal. Simpler to read out, but it goes stale as spot moves, so the calculator shows what percentage of melt it currently works out to.'}
          </Text>

          <View style={{ height: spacing.md }} />
          {mode === 'percent' ? (
            <Input
              label="Percent of melt"
              value={rateText}
              onChangeText={setRateText}
              keyboardType="number-pad"
              suffix="%"
            />
          ) : (
            <Input
              label="Price per gram"
              value={perGramText}
              onChangeText={setPerGramText}
              keyboardType="decimal-pad"
              prefix="$"
              placeholder="42.00"
            />
          )}
          {!!problem && <Text style={styles.problem}>{problem}</Text>}

          <Divider />
          <Text style={styles.preview}>
            {METALS[rule.metal].name} ·{' '}
            {purityId === 'any' ? 'all purities' : (findPurity(purityId)?.label ?? '')} ·{' '}
            {maxGrams == null ? `${minGrams} g and up` : `${minGrams}–${maxGrams} g`} →{' '}
            <Text style={styles.previewRate}>
              {mode === 'perGram' ? `${money(perGram)}/g` : `${percent(rate, 0)} of melt`}
            </Text>
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label="Save rate"
          disabled={!!problem}
          onPress={() =>
            onSave({
              ...rule,
              purityId: purityId === 'any' ? null : purityId,
              minGrams,
              maxGrams,
              mode,
              rate,
              perGram,
            })
          }
          style={{ flex: 2 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },

  intro: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  disabledRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  disabledText: { ...type.caption, color: colors.textMuted, flex: 1 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  ruleTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  ruleBand: { ...type.caption, color: colors.textFaint },
  ruleRate: { ...type.mono, fontSize: 18, color: colors.gold },
  ruleMode: { ...type.caption, fontSize: 10, color: colors.textFaint },

  emptyText: { ...type.body, color: colors.textMuted, lineHeight: 21 },
  hint: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 16 },
  problem: { ...type.caption, color: colors.down, marginTop: spacing.sm },

  preview: { ...type.body, color: colors.textMuted, lineHeight: 21 },
  previewRate: { color: colors.gold, fontWeight: '700' },

  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
