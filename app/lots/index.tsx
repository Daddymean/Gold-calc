import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/AppState';
import { calculateSettlement, realisedFromLots } from '@/lib/refining';
import { money, shortDate, signedPercent } from '@/lib/format';
import { Badge, Button, Card, EmptyState, SectionLabel } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import type { LotStatus, MeltLot } from '@/types';

const STATUS_TONE: Record<LotStatus, 'info' | 'warn' | 'up'> = {
  open: 'info',
  sent: 'warn',
  settled: 'up',
};

const STATUS_LABEL: Record<LotStatus, string> = {
  open: 'BUILDING',
  sent: 'AT REFINER',
  settled: 'SETTLED',
};

/**
 * Refining lots.
 *
 * Everything before this screen is an estimate. This is where a dealer finds
 * out what the metal actually assayed and whether the buying was any good.
 */
export default function LotsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lots, settings } = useApp();

  const realised = realisedFromLots(lots);
  const outstanding = lots.filter((lot) => lot.status !== 'settled');

  return (
    <View style={styles.screen}>
      <FlatList
        data={lots}
        keyExtractor={(lot) => lot.id}
        contentContainerStyle={
          lots.length
            ? { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 96 }
            : { flexGrow: 1, justifyContent: 'center' }
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          lots.length ? (
            <View style={{ paddingBottom: spacing.md }}>
              <SectionLabel>Refining</SectionLabel>
              <Card>
                <View style={styles.summaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Settled profit</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: realised >= 0 ? colors.up : colors.down },
                      ]}
                    >
                      {money(realised, settings.currency)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryLabel}>Awaiting settlement</Text>
                    <Text style={styles.summaryValue}>{outstanding.length}</Text>
                  </View>
                </View>
                <Text style={styles.summaryNote}>
                  Open and sent lots contribute nothing until the refiner reports — guessing would
                  only flatter the book.
                </Text>
              </Card>
            </View>
          ) : null
        }
        renderItem={({ item: lot }) => (
          <LotRow lot={lot} onPress={() => router.push(`/lots/${lot.id}`)} />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No refining lots yet"
            body="Group the scrap you're sending out, record what the refiner reports back, and see what the buying actually earned."
            action={<Button label="Build a lot" onPress={() => router.push('/lots/new')} />}
          />
        }
      />

      {lots.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Build a lot"
          onPress={() => router.push('/lots/new')}
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + spacing.lg },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.fabPlus}>＋</Text>
        </Pressable>
      )}
    </View>
  );
}

function LotRow({ lot, onPress }: { lot: MeltLot; onPress: () => void }) {
  const settled = lot.status === 'settled';
  const result = settled ? calculateSettlement(lot) : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={styles.reference}>{lot.reference}</Text>
          <Badge label={STATUS_LABEL[lot.status]} tone={STATUS_TONE[lot.status]} />
        </View>
        <Text style={styles.refiner} numberOfLines={1}>
          {lot.refinerName || 'No refiner named'}
        </Text>
        <Text style={styles.meta}>
          {lot.itemIds.length} item{lot.itemIds.length === 1 ? '' : 's'} · cost{' '}
          {money(lot.costBasis, lot.currency, 0)} ·{' '}
          {shortDate(lot.settledAt ?? lot.sentAt ?? lot.createdAt)}
        </Text>
      </View>

      <View style={styles.cardRight}>
        {result ? (
          <>
            <Text
              style={[styles.profit, { color: result.profit >= 0 ? colors.up : colors.down }]}
            >
              {money(result.profit, lot.currency, 0)}
            </Text>
            <Text style={styles.profitLabel}>{signedPercent(result.profitPercent, 0)}</Text>
          </>
        ) : (
          <Text style={styles.pending}>pending</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  summaryRow: { flexDirection: 'row', gap: spacing.lg },
  summaryLabel: { ...type.caption, color: colors.textMuted },
  summaryValue: { ...type.mono, fontSize: 20, color: colors.text, marginTop: 2 },
  summaryNote: { ...type.caption, color: colors.textFaint, lineHeight: 16, marginTop: spacing.md },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reference: { ...type.caption, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  refiner: { ...type.heading, fontSize: 15, color: colors.text, marginTop: 1 },
  meta: { ...type.caption, color: colors.textMuted },

  cardRight: { alignItems: 'flex-end' },
  profit: { ...type.mono, fontSize: 16 },
  profitLabel: { ...type.caption, fontSize: 10, color: colors.textFaint },
  pending: { ...type.caption, color: colors.textFaint },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabPlus: { fontSize: 30, color: colors.onGold, marginTop: -2 },
});
