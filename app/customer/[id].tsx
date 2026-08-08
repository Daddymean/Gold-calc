import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/lib/confirm';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/AppState';
import { METALS, findPurity } from '@/lib/metals';
import { money, shortDate, weight as fmtWeight } from '@/lib/format';
import { CustomerForm } from '@/components/CustomerForm';
import { Badge, Button, Card, SectionLabel, StatRow } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';

export default function CustomerDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getCustomer, updateCustomer, deleteCustomer, items, settings } = useApp();

  const [editing, setEditing] = useState(false);
  const customer = getCustomer(String(id));

  if (!customer) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This customer record no longer exists.</Text>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const theirs = items.filter((i) => i.customerId === customer.id);
  const total = theirs.reduce((sum, i) => sum + i.purchasePrice, 0);

  if (editing) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit customer' }} />
        <CustomerForm
          initial={customer}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            await updateCustomer(customer.id, draft);
            setEditing(false);
          }}
        />
      </>
    );
  }

  const confirmDelete = async () => {
    const ok = await confirm({
      title: 'Delete customer?',
      message: theirs.length
        ? `${customer.name} is linked to ${theirs.length} item${theirs.length === 1 ? '' : 's'}. Those records keep the name but lose the ID details.`
        : `Delete ${customer.name}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteCustomer(customer.id);
    router.back();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <Stack.Screen options={{ title: customer.name }} />

      <View style={styles.section}>
        <Text style={styles.name}>{customer.name}</Text>
        <Text style={styles.since}>Customer since {shortDate(customer.createdAt)}</Text>
        {!customer.idNumber && (
          <View style={{ marginTop: spacing.sm }}>
            <Badge label="NO ID ON FILE" tone="warn" />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Card>
          <StatRow label="Transactions" value={String(theirs.length)} />
          <StatRow label="Total paid out" value={money(total, settings.currency)} emphasis tone="gold" />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Contact</SectionLabel>
        <Card>
          <StatRow label="Phone" value={customer.phone || '—'} />
          <StatRow label="Email" value={customer.email || '—'} />
          <StatRow label="Address" value={customer.address || '—'} />
          <StatRow label="Date of birth" value={customer.dateOfBirth || '—'} />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Identification</SectionLabel>
        <Card>
          <StatRow label="Type" value={customer.idType?.replace(/_/g, ' ') || '—'} />
          <StatRow label="Number" value={customer.idNumber || '—'} />
          <StatRow label="Expires" value={customer.idExpiry || '—'} />
          <StatRow label="Photo on file" value={customer.idPhotoUri ? 'Yes' : 'No'} />
        </Card>
      </View>

      {theirs.length > 0 && (
        <View style={styles.section}>
          <SectionLabel>What they've sold you</SectionLabel>
          <Card padded={false}>
            {theirs.map((item, i) => {
              const purity = findPurity(item.purityId);
              return (
                <View key={item.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/item/${item.id}`)}
                    style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[styles.dot, { backgroundColor: METALS[item.metal].color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text style={styles.itemSub}>
                        {item.ticket} · {purity?.label} · {fmtWeight(item.weight)} {item.unit} ·{' '}
                        {shortDate(item.purchasedAt)}
                      </Text>
                    </View>
                    <Text style={styles.itemPrice}>{money(item.purchasePrice, item.currency, 0)}</Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </View>
      )}

      {!!customer.notes && (
        <View style={styles.section}>
          <SectionLabel>Notes</SectionLabel>
          <Card>
            <Text style={styles.notes}>{customer.notes}</Text>
          </Card>
        </View>
      )}

      <View style={[styles.section, styles.actions]}>
        <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} style={{ flex: 1 }} />
        <Button label="Delete" variant="danger" onPress={confirmDelete} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  missingText: { ...type.body, color: colors.textMuted, textAlign: 'center' },

  name: { ...type.title, color: colors.text },
  since: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  itemTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  itemSub: { ...type.caption, color: colors.textFaint },
  itemPrice: { ...type.mono, fontSize: 14, color: colors.text },

  notes: { ...type.body, color: colors.textMuted, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
