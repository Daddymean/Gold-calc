import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { notify } from '@/lib/confirm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useSpot } from '@/state/AppState';
import {
  DEFAULT_PURITY,
  METALS,
  METAL_ORDER,
  WEIGHT_UNITS,
  WEIGHT_UNIT_ORDER,
  calculateMelt,
  findPurity,
  puritiesFor,
  type MetalSymbol,
  type WeightUnit,
} from '@/lib/metals';
import { money, parseNumber, percent } from '@/lib/format';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Badge, Button, Card, Divider, Input, SectionLabel, Segmented, StatRow } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import type { Customer, TransactionType } from '@/types';

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'consignment', label: 'Consignment' },
  { value: 'trade', label: 'Trade-in' },
  { value: 'sale', label: 'Sale' },
];

/**
 * Add to inventory.
 *
 * Ordered the way an intake actually happens: what is it, what does it weigh,
 * what did you pay, who sold it to you, photograph it. The live melt panel sits
 * between price and customer so the operator sees whether the number they just
 * typed is sane before they commit the record.
 */
export default function NewItemScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    metal?: string;
    purityId?: string;
    weight?: string;
    unit?: string;
    price?: string;
  }>();

  const { settings, addItem, customers, addCustomer, quotes } = useApp();
  const spot = useSpot();

  // Prefilled when the operator arrives from the calculator, so the number they
  // quoted at the counter is the number that lands in the book.
  const initialMetal = (params.metal as MetalSymbol) || settings.defaultMetal;

  const [metal, setMetal] = useState<MetalSymbol>(initialMetal);
  const [purityId, setPurityId] = useState(params.purityId || DEFAULT_PURITY[initialMetal]);
  const [unit, setUnit] = useState<WeightUnit>((params.unit as WeightUnit) || settings.defaultUnit);
  const [weightText, setWeightText] = useState(params.weight || '');
  const [quantityText, setQuantityText] = useState('1');
  const [description, setDescription] = useState('');
  const [priceText, setPriceText] = useState(params.price || '');
  const [transactionType, setTransactionType] = useState<TransactionType>('purchase');

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');

  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [isNumismatic, setIsNumismatic] = useState(false);
  const [numismaticText, setNumismaticText] = useState('');
  const [saving, setSaving] = useState(false);

  const purity = findPurity(purityId);
  const spotPrice = spot[metal] ?? 0;
  const quantity = Math.max(1, Math.round(parseNumber(quantityText) || 1));

  const melt = useMemo(
    () =>
      calculateMelt({
        spotPerTroyOz: spotPrice,
        weight: parseNumber(weightText),
        unit,
        fineness: purity?.fineness ?? 0,
        payoutRate: 1,
        quantity,
      }),
    [spotPrice, weightText, unit, purity?.fineness, quantity],
  );

  const price = parseNumber(priceText);
  const payoutRate = melt.meltValue > 0 ? price / melt.meltValue : 0;
  // Paying over melt is legitimate for collectible pieces but is a mistake on
  // scrap, so it earns a visible warning rather than a silent save.
  const overMelt = melt.meltValue > 0 && price > melt.meltValue && !isNumismatic;

  const switchMetal = (next: MetalSymbol) => {
    setMetal(next);
    setPurityId(DEFAULT_PURITY[next]);
  };

  const pickCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? '');
    setCustomerIdNumber(customer.idNumber ?? '');
  };

  const clearCustomer = () => {
    setCustomerId(undefined);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerIdNumber('');
  };

  const validate = (): string | null => {
    if (!description.trim()) return 'Give the item a description so it can be found later.';
    if (parseNumber(weightText) <= 0) return 'Enter the item weight.';
    if (price <= 0) return 'Enter what you paid for it.';
    if (transactionType === 'purchase' && settings.requireCustomerId) {
      if (!customerName.trim()) return 'Record who you bought this from.';
      if (!customerIdNumber.trim() && !customerId) {
        return 'Record the seller ID, or turn off the ID requirement in Settings.';
      }
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      notify('Check the record', problem);
      return;
    }

    setSaving(true);
    try {
      // A name typed inline becomes a real customer record, so the next time
      // this person walks in their history is already there.
      let linkedId = customerId;
      let linkedCustomer = customers.find((c) => c.id === customerId);
      if (!linkedId && customerName.trim()) {
        const created = await addCustomer({
          name: customerName.trim(),
          phone: customerPhone.trim() || undefined,
          idNumber: customerIdNumber.trim() || undefined,
        });
        linkedId = created.id;
        linkedCustomer = created;
      }

      const now = new Date().toISOString();
      const item = await addItem({
        description: description.trim(),
        metal,
        purityId,
        weight: parseNumber(weightText),
        unit,
        quantity,
        purchasePrice: price,
        currency: settings.currency,
        spotAtPurchase: spotPrice,
        meltAtPurchase: melt.meltValue,
        transactionType,
        status: 'in_stock',
        customerId: linkedId,
        customerName: customerName.trim() || undefined,
        // Frozen now, for the same reason a lot freezes its cost basis: the
        // receipt has to say who was checked on the day, not who they are now.
        sellerAtSale: {
          name: customerName.trim() || undefined,
          phone: customerPhone.trim() || undefined,
          address: linkedCustomer?.address,
          idType: linkedCustomer?.idType,
          idNumber: customerIdNumber.trim() || linkedCustomer?.idNumber,
        },
        photoUris,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        isNumismatic,
        numismaticValue: isNumismatic ? parseNumber(numismaticText) : undefined,
        purchasedAt: now,
      });

      router.replace(`/item/${item.id}`);
    } catch (err: any) {
      notify('Could not save', err?.message ?? 'Unknown error');
      setSaving(false);
    }
  };

  const recentCustomers = customers.slice(0, 6);

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
        {/* ------------------------------------------------------ the item */}
        <View style={styles.section}>
          <SectionLabel>The item</SectionLabel>
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Ladies' rope chain, broken clasp"
            hint="What you'd say to identify it across the counter."
          />

          <View style={{ height: spacing.lg }} />
          <Text style={styles.fieldLabel}>Metal</Text>
          <View style={styles.metalRow}>
            {METAL_ORDER.map((m) => {
              const selected = m === metal;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => switchMetal(m)}
                  style={[
                    styles.metalTile,
                    selected && {
                      borderColor: METALS[m].color,
                      backgroundColor: `${METALS[m].color}1F`,
                    },
                  ]}
                >
                  <Text style={[styles.metalShort, { color: METALS[m].color }]}>
                    {METALS[m].short}
                  </Text>
                  <Text style={styles.metalName}>{METALS[m].name}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ height: spacing.lg }} />
          <Text style={styles.fieldLabel}>Purity</Text>
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
        </View>

        {/* --------------------------------------------------- weight/count */}
        <View style={styles.section}>
          <SectionLabel>Weight</SectionLabel>
          <View style={styles.row}>
            <Input
              containerStyle={{ flex: 2 }}
              label="Weight"
              value={weightText}
              onChangeText={setWeightText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              suffix={unit}
            />
            <Input
              containerStyle={{ flex: 1 }}
              label="Qty"
              value={quantityText}
              onChangeText={setQuantityText}
              keyboardType="number-pad"
              hint="identical pieces"
            />
          </View>
          <View style={{ height: spacing.md }} />
          <Segmented
            scroll
            value={unit}
            onChange={setUnit}
            options={WEIGHT_UNIT_ORDER.map((u) => ({ value: u, label: WEIGHT_UNITS[u].label }))}
          />
        </View>

        {/* ------------------------------------------------------ the money */}
        <View style={styles.section}>
          <SectionLabel>The money</SectionLabel>
          <Input
            label="Purchase price"
            value={priceText}
            onChangeText={setPriceText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            prefix="$"
            hint="What you actually handed over."
          />

          <Card style={{ marginTop: spacing.md }}>
            <StatRow label="Melt value now" value={money(melt.meltValue, settings.currency)} tone="gold" />
            <StatRow label="Pure content" value={`${melt.pureGrams.toFixed(3)} g`} />
            <StatRow
              label="You're paying"
              value={melt.meltValue > 0 ? `${percent(payoutRate)} of melt` : '—'}
              emphasis
            />
            {overMelt && (
              <View style={styles.warnBox}>
                <Badge label="OVER MELT" tone="warn" />
                <Text style={styles.warnText}>
                  This price is above the metal's melt value. Fine if the piece carries collector
                  value — flip the numismatic switch below to record that.
                </Text>
              </View>
            )}
            {!spotPrice && (
              <Text style={styles.warnText}>
                No live {METALS[metal].name} price, so melt can't be checked right now. The record
                will still save.
              </Text>
            )}
          </Card>

          <View style={{ height: spacing.lg }} />
          <Text style={styles.fieldLabel}>Transaction</Text>
          <Segmented
            scroll
            value={transactionType}
            onChange={setTransactionType}
            options={TRANSACTION_TYPES}
          />
        </View>

        {/* -------------------------------------------------- the customer */}
        <View style={styles.section}>
          <SectionLabel>
            Customer {settings.requireCustomerId && transactionType === 'purchase' ? '(required)' : ''}
          </SectionLabel>

          {recentCustomers.length > 0 && !customerId && (
            <>
              <Text style={styles.hint}>Recent</Text>
              <Segmented
                scroll
                value={''}
                onChange={(id) => {
                  const found = customers.find((c) => c.id === id);
                  if (found) pickCustomer(found);
                }}
                options={recentCustomers.map((c) => ({ value: c.id, label: c.name }))}
              />
              <View style={{ height: spacing.md }} />
            </>
          )}

          {customerId && (
            <View style={styles.linkedCustomer}>
              <Text style={styles.linkedText}>Linked to {customerName}</Text>
              <Pressable onPress={clearCustomer} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>
          )}

          <Input label="Name" value={customerName} onChangeText={setCustomerName} placeholder="Full name" />
          <View style={{ height: spacing.md }} />
          <View style={styles.row}>
            <Input
              containerStyle={{ flex: 1 }}
              label="Phone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
              placeholder="555 010 0000"
            />
            <Input
              containerStyle={{ flex: 1 }}
              label="ID number"
              value={customerIdNumber}
              onChangeText={setCustomerIdNumber}
              autoCapitalize="characters"
              placeholder="DL / passport"
            />
          </View>
          <Text style={styles.privacyNote}>
            Seller details stay on this device. Most secondhand-dealer rules require you to keep
            them — check what your jurisdiction asks for.
          </Text>
        </View>

        {/* ---------------------------------------------------------- photo */}
        <View style={styles.section}>
          <SectionLabel>Photos</SectionLabel>
          <PhotoPicker photos={photoUris} onChange={setPhotoUris} label="" />
        </View>

        {/* ---------------------------------------------------------- extra */}
        <View style={styles.section}>
          <SectionLabel>Details</SectionLabel>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Numismatic / collectible</Text>
              <Text style={styles.switchHint}>Value it above melt, and never send it to refining.</Text>
            </View>
            <Switch
              value={isNumismatic}
              onValueChange={setIsNumismatic}
              trackColor={{ true: colors.goldDim, false: colors.border }}
              thumbColor={isNumismatic ? colors.gold : colors.textFaint}
            />
          </View>

          {isNumismatic && (
            <>
              <View style={{ height: spacing.md }} />
              <Input
                label="Collector value"
                value={numismaticText}
                onChangeText={setNumismaticText}
                keyboardType="decimal-pad"
                prefix="$"
                hint="Used instead of melt when valuing your book."
              />
            </>
          )}

          <Divider />

          <Input
            label="Storage location"
            value={location}
            onChangeText={setLocation}
            placeholder="Safe 2, tray B"
          />
          <View style={{ height: spacing.md }} />
          <Input
            label="Tags"
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="scrap, chain, estate"
            hint="Comma separated."
          />
          <View style={{ height: spacing.md }} />
          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Tested 14K with acid. Clasp missing. Seller inherited from mother."
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button label="Save item" onPress={save} loading={saving} style={{ flex: 2 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },

  fieldLabel: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  hint: { ...type.caption, color: colors.textFaint, marginBottom: spacing.xs },

  metalRow: { flexDirection: 'row', gap: spacing.sm },
  metalTile: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  metalShort: { ...type.label, fontSize: 15 },
  metalName: { ...type.caption, color: colors.textMuted },

  warnBox: { marginTop: spacing.md, gap: spacing.xs },
  warnText: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },

  linkedCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: `${colors.gold}14`,
    marginBottom: spacing.md,
  },
  linkedText: { ...type.caption, color: colors.gold },
  link: { ...type.caption, color: colors.gold, fontWeight: '700' },

  privacyNote: { ...type.caption, color: colors.textFaint, marginTop: spacing.md, lineHeight: 16 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchLabel: { ...type.body, color: colors.text, fontWeight: '600' },
  switchHint: { ...type.caption, color: colors.textFaint, marginTop: 1 },

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
