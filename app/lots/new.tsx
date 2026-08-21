import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/AppState';
import { METALS, findPurity } from '@/lib/metals';
import { activeLotItemIds, calculateExpectedContent } from '@/lib/refining';
import { itemsUnderHold } from '@/lib/retention';
import { money, shortDate, weight as fmtWeight } from '@/lib/format';
import { notify } from '@/lib/confirm';
import { Badge, Button, Card, EmptyState, Input, SectionLabel, StatRow } from '@/components/ui';
import { colors, spacing, type } from '@/theme';

/**
 * Build a refining lot.
 *
 * Only in-stock and on-hold items can go: anything already sold or melted has
 * left the shelf, and putting it in a lot would double-count the metal.
 * Numismatic pieces are shown but flagged, because melting a graded coin
 * destroys most of what it is worth.
 */
export default function NewLotScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, lots, settings, createLot } = useApp();

  const [refiner, setRefiner] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Items already committed to an unsettled lot are not offered again, or the
  // same metal and the same cost would end up in two refining results.
  const reserved = useMemo(() => activeLotItemIds(lots), [lots]);
  const eligible = useMemo(
    () =>
      items.filter(
        (item) =>
          (item.status === 'in_stock' || item.status === 'on_hold') && !reserved.has(item.id),
      ),
    [items, reserved],
  );

  // Flagged rather than hidden: a hold is the operator's rule to override
  // knowingly, and the send step asks again before anything is melted.
  const heldIds = useMemo(
    () => new Set(itemsUnderHold(eligible, settings.holdPeriodDays)),
    [eligible, settings.holdPeriodDays],
  );

  const chosen = useMemo(
    () => eligible.filter((item) => selected.includes(item.id)),
    [eligible, selected],
  );
  const expected = useMemo(() => calculateExpectedContent(chosen), [chosen]);
  const numismaticCount = chosen.filter((item) => item.isNumismatic).length;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!selected.length) {
      notify('Nothing selected', 'Choose the items going into this lot.');
      return;
    }
    setSaving(true);
    try {
      const lot = await createLot(selected, refiner);
      router.replace(`/lots/${lot.id}`);
    } catch (err: any) {
      notify('Could not create the lot', err?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (!eligible.length) {
    return (
      <EmptyState
        title="Nothing available"
        body={
          reserved.size
            ? 'Everything in stock is already committed to an open lot. Settle or delete that lot to free the items up.'
            : 'Only items that are in stock or on hold can go into a refining lot.'
        }
        action={<Button label="Back" variant="secondary" onPress={() => router.back()} />}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}>
        <View style={styles.section}>
          <SectionLabel>Refiner</SectionLabel>
          <Input
            label="Who is it going to"
            value={refiner}
            onChangeText={setRefiner}
            placeholder="e.g. Midwest Refining"
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>
            Items · {selected.length} of {eligible.length}
          </SectionLabel>

          <Card padded={false}>
            {eligible.map((item, i) => {
              const picked = selected.includes(item.id);
              const purity = findPurity(item.purityId);
              return (
                <View key={item.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: picked }}
                    onPress={() => toggle(item.id)}
                    style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        picked && { backgroundColor: colors.gold, borderColor: colors.gold },
                      ]}
                    >
                      {picked && <Text style={styles.checkmark}>✓</Text>}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text style={styles.itemSub}>
                        {item.ticket} · {purity?.label} {METALS[item.metal].name} ·{' '}
                        {fmtWeight(item.weight)} {item.unit} · {shortDate(item.purchasedAt)}
                      </Text>
                      {item.isNumismatic && (
                        <View style={{ marginTop: spacing.xs }}>
                          <Badge label="COLLECTIBLE — WORTH MORE INTACT" tone="warn" />
                        </View>
                      )}
                      {heldIds.has(item.id) && (
                        <View style={{ marginTop: spacing.xs }}>
                          <Badge label="STILL INSIDE THE HOLD PERIOD" tone="warn" />
                        </View>
                      )}
                    </View>

                    <Text style={styles.itemPrice}>
                      {money(item.purchasePrice, item.currency, 0)}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </View>

        {selected.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>What the book expects</SectionLabel>
            <Card>
              <StatRow label="Cost basis" value={money(expected.costBasis, settings.currency)} />
              <StatRow
                label="Expected pure content"
                value={`${expected.totalPureGrams.toFixed(2)} g`}
              />
              <Text style={styles.note}>
                From your own weights and stamped purities. The refiner's assay is what actually
                gets paid — the difference between the two is the number worth watching.
              </Text>
              {numismaticCount > 0 && (
                <Text style={styles.warn}>
                  {numismaticCount} collectible piece{numismaticCount === 1 ? '' : 's'} selected.
                  Melting destroys the premium that makes them worth more than their metal.
                </Text>
              )}
            </Card>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button
          label={`Create lot (${selected.length})`}
          onPress={save}
          loading={saving}
          disabled={!selected.length}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 52 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: colors.onGold, fontSize: 14, fontWeight: '700' },
  itemTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  itemSub: { ...type.caption, color: colors.textFaint },
  itemPrice: { ...type.mono, fontSize: 14, color: colors.text },

  note: { ...type.caption, color: colors.textFaint, lineHeight: 16, marginTop: spacing.md },
  warn: { ...type.caption, color: colors.warn, lineHeight: 16, marginTop: spacing.md },

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
