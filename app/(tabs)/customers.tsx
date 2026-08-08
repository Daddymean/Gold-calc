import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/AppState';
import { money, shortDate } from '@/lib/format';
import { Badge, Button, EmptyState, Input } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

export default function CustomersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { customers, items, settings } = useApp();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers
      .map((customer) => {
        const theirs = items.filter((i) => i.customerId === customer.id);
        return {
          customer,
          count: theirs.length,
          total: theirs.reduce((sum, i) => sum + i.purchasePrice, 0),
          last: theirs[0]?.purchasedAt,
        };
      })
      .filter(({ customer }) => {
        if (!needle) return true;
        return [customer.name, customer.phone, customer.email, customer.idNumber]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
      });
  }, [customers, items, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, phone, ID"
          autoCapitalize="none"
          accessibilityLabel="Search customers"
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={({ customer }) => customer.id}
        contentContainerStyle={
          rows.length
            ? { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 96 }
            : { flexGrow: 1, justifyContent: 'center' }
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item: row }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/customer/${row.customer.id}`)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {row.customer.name.slice(0, 1).toUpperCase() || '?'}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{row.customer.name}</Text>
              <Text style={styles.meta}>
                {row.count} transaction{row.count === 1 ? '' : 's'}
                {row.last ? ` · last ${shortDate(row.last)}` : ''}
              </Text>
              {!row.customer.idNumber && (
                <View style={{ marginTop: spacing.xs }}>
                  <Badge label="NO ID ON FILE" tone="warn" />
                </View>
              )}
            </View>

            <Text style={styles.total}>{money(row.total, settings.currency, 0)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            title={customers.length ? 'Nothing matches' : 'No customers yet'}
            body={
              customers.length
                ? 'Try a different search.'
                : 'Customers are created automatically when you log a purchase, or you can add one ahead of time.'
            }
            action={<Button label="Add customer" onPress={() => router.push('/customer/new')} />}
          />
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add customer"
        onPress={() => router.push('/customer/new')}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },

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
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.heading, color: colors.gold },
  name: { ...type.heading, fontSize: 15, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  total: { ...type.mono, color: colors.text },

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
