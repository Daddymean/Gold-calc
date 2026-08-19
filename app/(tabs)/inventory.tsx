import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useSpot } from '@/state/AppState';
import { METALS, findPurity } from '@/lib/metals';
import { money, shortDate, signedPercent, weight as fmtWeight } from '@/lib/format';
import { valueItem } from '@/lib/portfolio';
import { Badge, Button, EmptyState, Input, Segmented } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import type { InventoryItem, ItemStatus } from '@/types';

type Filter = 'all' | ItemStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'sold', label: 'Sold' },
  { value: 'melted', label: 'Melted' },
];

const STATUS_TONE: Record<ItemStatus, 'neutral' | 'up' | 'warn' | 'info'> = {
  in_stock: 'info',
  on_hold: 'warn',
  sold: 'up',
  melted: 'neutral',
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  in_stock: 'IN STOCK',
  on_hold: 'ON HOLD',
  sold: 'SOLD',
  melted: 'MELTED',
};

export default function InventoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, settings } = useApp();
  const spot = useSpot();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!needle) return true;
      // Search everything a buyer would remember an item by, including the
      // ticket they wrote on the envelope.
      return [item.ticket, item.description, item.customerName, item.location, item.notes, ...item.tags]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [items, query, filter]);

  const totals = useMemo(() => {
    let cost = 0;
    let value = 0;
    let offCurrency = 0;
    for (const item of visible) {
      // Market value is spot-derived and always in the display currency; what
      // was paid is in the item's own. Only the matching ones can be totalled.
      value += valueItem(item, spot, settings.currency).meltNow;
      if (item.currency === settings.currency) cost += item.purchasePrice;
      else offCurrency += 1;
    }
    return { cost, value, offCurrency };
  }, [visible, spot, settings.currency]);

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search ticket, item, customer, tag"
          autoCapitalize="none"
          accessibilityLabel="Search inventory"
        />
        <Segmented scroll value={filter} onChange={setFilter} options={FILTERS} />
      </View>

      {visible.length > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            {visible.length} item{visible.length === 1 ? '' : 's'} · cost{' '}
            {money(totals.cost, settings.currency, 0)}
            {totals.offCurrency > 0 ? ` (excl. ${totals.offCurrency} in other currencies)` : ''}
          </Text>
          <Text style={styles.summaryValue}>{money(totals.value, settings.currency, 0)}</Text>
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          visible.length
            ? { paddingBottom: insets.bottom + 96, paddingHorizontal: spacing.lg }
            : { flexGrow: 1, justifyContent: 'center' }
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <ItemRow item={item} onPress={() => router.push(`/item/${item.id}`)} />
        )}
        ListEmptyComponent={
          <EmptyState
            title={items.length ? 'Nothing matches' : 'Your book is empty'}
            body={
              items.length
                ? 'Try a different search or filter.'
                : 'Log the first piece you take in. Every record keeps the spot price and melt value from the moment you bought it.'
            }
            action={
              items.length ? undefined : (
                <Button label="Add an item" onPress={() => router.push('/item/new')} />
              )
            }
          />
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add item to inventory"
        onPress={() => router.push('/item/new')}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + spacing.lg },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={styles.fabPlus}>＋</Text>
      </Pressable>
    </View>
  );
}

function ItemRow({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const { settings } = useApp();
  const spot = useSpot();
  const valuation = valueItem(item, spot, settings.currency);
  const meta = METALS[item.metal];
  const purity = findPurity(item.purityId);
  const up = valuation.gain >= 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
    >
      {item.photoUris[0] ? (
        <Image source={{ uri: item.photoUris[0] }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoEmpty, { borderColor: `${meta.color}55` }]}>
          <Text style={[styles.photoGlyph, { color: meta.color }]}>{meta.short}</Text>
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.ticket}>{item.ticket}</Text>
          <Badge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
        </View>

        <Text style={styles.description} numberOfLines={1}>
          {item.description || 'Untitled item'}
        </Text>

        <Text style={styles.spec} numberOfLines={1}>
          {purity?.label} {meta.name} · {fmtWeight(item.weight)} {item.unit}
          {item.quantity > 1 ? ` ×${item.quantity}` : ''} · {shortDate(item.purchasedAt)}
        </Text>

        {!!item.customerName && (
          <Text style={styles.customer} numberOfLines={1}>
            from {item.customerName}
          </Text>
        )}
      </View>

      <View style={styles.cardRight}>
        {/* The item's own currency, not the shop's: a €500 piece must never
            read as $500 because the display currency changed since. */}
        <Text style={styles.paid}>{money(item.purchasePrice, item.currency, 0)}</Text>
        <Text style={styles.paidLabel}>
          paid{item.currency === settings.currency ? '' : ` ${item.currency}`}
        </Text>
        {valuation.comparable ? (
          <Text style={[styles.gain, { color: up ? colors.up : colors.down }]}>
            {signedPercent(valuation.gainPercent, 0)}
          </Text>
        ) : (
          <Text style={[styles.gain, { color: colors.textFaint }]}>—</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },

  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryText: { ...type.caption, color: colors.textMuted },
  summaryValue: { ...type.mono, fontSize: 15, color: colors.text },

  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  photo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  photoGlyph: { ...type.label, fontSize: 16 },

  cardBody: { flex: 1, gap: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ticket: { ...type.caption, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  description: { ...type.heading, fontSize: 15, color: colors.text },
  spec: { ...type.caption, color: colors.textMuted },
  customer: { ...type.caption, fontSize: 11, color: colors.textFaint },

  cardRight: { alignItems: 'flex-end' },
  paid: { ...type.mono, color: colors.text },
  paidLabel: { ...type.caption, fontSize: 10, color: colors.textFaint },
  gain: { ...type.caption, marginTop: 2, fontVariant: ['tabular-nums'] },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPlus: { fontSize: 30, color: colors.onGold, marginTop: -2 },
});
