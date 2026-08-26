import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm, notify } from '@/lib/confirm';
import { buildReceiptHtml } from '@/lib/receipt';
import { printHtml, shareHtmlAsPdf } from '@/lib/print';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useSpot } from '@/state/AppState';
import { METALS, findPurity, ratePerWeight, toGrams } from '@/lib/metals';
import { money, parseNumber, percent, shortDate, signedPercent, weight as fmtWeight } from '@/lib/format';
import { valueItem } from '@/lib/portfolio';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Badge, Button, Card, Divider, Input, SectionLabel, Segmented, StatRow } from '@/components/ui';
import { colors, radius, spacing, type } from '@/theme';
import type { ItemStatus } from '@/types';

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'sold', label: 'Sold' },
  { value: 'melted', label: 'Melted' },
];

export default function ItemDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getItem, updateItem, deleteItem, settings, getCustomer } = useApp();
  const spot = useSpot();

  const item = getItem(String(id));
  const [saleText, setSaleText] = useState('');
  const [receiptBusy, setReceiptBusy] = useState(false);

  if (!item) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This item is no longer in your book.</Text>
        <Button label="Back to inventory" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const meta = METALS[item.metal];
  const purity = findPurity(item.purityId);
  const valuation = valueItem(item, spot, settings.currency);
  const customer = item.customerId ? getCustomer(item.customerId) : undefined;

  // Margin is measured against what the piece is worth now, or against the
  // actual sale price once it has left the shop.
  const exitValue = item.status === 'sold' && item.salePrice != null ? item.salePrice : valuation.meltNow;
  const gainTone = valuation.gain >= 0 ? 'up' : 'down';

  // Dealers quote each other in per-gram and per-ounce terms, so every money
  // figure on the record carries its rate. Gross weight, because that is the
  // weight the trade quotes on.
  const grossGrams = toGrams(item.weight, item.unit) * (item.quantity || 1);
  const rateLine = (amount: number, currency: typeof item.currency) => {
    const rates = ratePerWeight(amount, grossGrams);
    if (!rates.perGram) return undefined;
    return `${money(rates.perGram, currency)}/g · ${money(rates.perTroyOz, currency, 0)}/ozt`;
  };

  const heldDays = Math.floor((Date.now() - new Date(item.purchasedAt).getTime()) / 86_400_000);
  const holdRemaining = settings.holdPeriodDays - heldDays;
  const underHold = settings.holdPeriodDays > 0 && holdRemaining > 0 && item.status !== 'sold';

  const setStatus = (status: ItemStatus) => {
    if (status === 'sold') {
      Alert.prompt?.(
        'Sale price',
        'What did it sell for?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark sold',
            onPress: (value) =>
              updateItem(item.id, {
                status: 'sold',
                salePrice: parseNumber(value ?? ''),
                soldAt: new Date().toISOString(),
              }),
          },
        ],
        'plain-text',
        exitValue > 0 ? exitValue.toFixed(2) : '',
        'decimal-pad',
      );
      // Android has no Alert.prompt; fall back to the inline field below.
      if (!Alert.prompt) {
        notify('Enter the sale price', 'Use the sale price field further down, then tap Sold again.');
      }
      return;
    }

    if (status === 'melted' && underHold) {
      confirm({
        title: 'Still inside the hold period',
        message: `Your settings require holding items ${settings.holdPeriodDays} days. This one has ${holdRemaining} day${holdRemaining === 1 ? '' : 's'} to go.`,
        confirmLabel: 'Mark melted anyway',
        cancelLabel: 'Keep holding',
        destructive: true,
      }).then((ok) => {
        if (ok) updateItem(item.id, { status });
      });
      return;
    }

    updateItem(item.id, { status, salePrice: undefined, soldAt: undefined });
  };

  // Item details are read live, so correcting a mistyped weight fixes the
  // reprint. Seller details are NOT: they are the audit fact of who was checked
  // that day, and a renewed licence or a new address must not rewrite history.
  // Records written before snapshots existed fall back to the live customer,
  // and the receipt says which of the two it is printing.
  const sellerAtSale = item.sellerAtSale;
  const seller = sellerAtSale ?? {
    name: customer?.name ?? item.customerName,
    phone: customer?.phone,
    address: customer?.address,
    idType: customer?.idType,
    idNumber: customer?.idNumber,
  };

  const receiptHtml = () =>
    buildReceiptHtml(
      {
        ticket: item.ticket,
        description: item.description,
        metal: item.metal,
        purityId: item.purityId,
        weight: item.weight,
        unit: item.unit,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice,
        currency: item.currency,
        spotAtPurchase: item.spotAtPurchase,
        meltAtPurchase: item.meltAtPurchase,
        purchasedAt: item.purchasedAt,
        transactionType: item.transactionType,
      },
      seller,
      { businessName: settings.businessName, sellerAsRecorded: !!sellerAtSale },
    );

  const withReceipt = async (action: (html: string) => Promise<void>) => {
    setReceiptBusy(true);
    try {
      await action(receiptHtml());
    } catch (err: any) {
      notify('Could not produce the receipt', err?.message ?? 'Unknown error');
    } finally {
      setReceiptBusy(false);
    }
  };

  const confirmDelete = async () => {
    const ok = await confirm({
      title: 'Delete this record?',
      message: `${item.ticket} — ${item.description}. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    // deleteItem removes the photo files too — see AppState.
    await deleteItem(item.id);
    router.back();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <Stack.Screen options={{ title: item.ticket }} />

      {item.photoUris.length > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
          {item.photoUris.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.hero} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{item.description}</Text>
          <Badge
            label={STATUS_OPTIONS.find((s) => s.value === item.status)?.label.toUpperCase() ?? ''}
            tone={item.status === 'sold' ? 'up' : item.status === 'on_hold' ? 'warn' : 'info'}
          />
        </View>
        <Text style={styles.subtitle}>
          {purity?.label} {meta.name} · {fmtWeight(item.weight)} {item.unit}
          {item.quantity > 1 ? ` ×${item.quantity}` : ''} · bought {shortDate(item.purchasedAt)}
        </Text>

        {underHold && (
          <View style={styles.holdBar}>
            <Badge label="HOLD" tone="warn" />
            <Text style={styles.holdText}>
              {holdRemaining} day{holdRemaining === 1 ? '' : 's'} before this can be melted.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Card>
          <StatRow
            label="You paid"
            value={money(item.purchasePrice, item.currency)}
            detail={rateLine(item.purchasePrice, item.currency)}
          />
          {/* The price of the metal on the day, sitting next to what was paid
              rather than buried below the weights — it is the number that
              explains the price, and a demo user looked straight past it
              where it used to be. */}
          {item.spotAtPurchase > 0 && (
            <StatRow
              label={`${meta.name} price that day`}
              value={`${money(item.spotAtPurchase, item.currency)}/ozt`}
              detail={shortDate(item.purchasedAt)}
            />
          )}
          <StatRow
            label={item.status === 'sold' ? 'Sold for' : 'Worth now'}
            // A sale price is money that was recorded, in the item's currency;
            // "worth now" comes from today's feed, in the display currency.
            value={
              item.status === 'sold' && item.salePrice != null
                ? money(item.salePrice, item.currency)
                : money(valuation.meltNow, settings.currency)
            }
            detail={
              item.status === 'sold' && item.salePrice != null
                ? rateLine(item.salePrice, item.currency)
                : rateLine(valuation.meltNow, settings.currency)
            }
            tone="gold"
          />
          {valuation.comparable ? (
            <StatRow
              label={item.status === 'sold' ? 'Realised P&L' : 'Unrealised P&L'}
              value={`${money(valuation.gain, settings.currency)} (${signedPercent(valuation.gainPercent, 1)})`}
              emphasis
              tone={gainTone}
            />
          ) : (
            <StatRow
              label="P&L"
              value={`not shown — bought in ${item.currency}`}
              tone="muted"
            />
          )}

          <Divider />

          <StatRow label="Pure content" value={`${valuation.pureGrams.toFixed(3)} g`} />
          <StatRow label="Gross weight" value={`${toGrams(item.weight, item.unit).toFixed(2)} g`} />
          <StatRow
            label="Paid vs melt then"
            value={
              item.meltAtPurchase > 0 ? percent(item.purchasePrice / item.meltAtPurchase) : '—'
            }
          />
          {!valuation.priced && (
            <Text style={styles.warn}>
              No live {meta.name} price right now, so "worth now" is stale.
            </Text>
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Status</SectionLabel>
        <Segmented scroll value={item.status} onChange={setStatus} options={STATUS_OPTIONS} />

        {item.status !== 'sold' && (
          <View style={styles.saleRow}>
            <Input
              containerStyle={{ flex: 1 }}
              value={saleText}
              onChangeText={setSaleText}
              keyboardType="decimal-pad"
              prefix="$"
              placeholder={exitValue > 0 ? exitValue.toFixed(2) : 'Sale price'}
              accessibilityLabel="Sale price"
              // Shows the rate as it is typed, so the operator can sanity-check
              // against what they quote per gram before committing the sale.
              hint={rateLine(parseNumber(saleText), item.currency)}
            />
            <Button
              label="Mark sold"
              variant="secondary"
              disabled={parseNumber(saleText) <= 0}
              onPress={() => {
                updateItem(item.id, {
                  status: 'sold',
                  salePrice: parseNumber(saleText),
                  soldAt: new Date().toISOString(),
                });
                setSaleText('');
              }}
            />
          </View>
        )}
      </View>

      {(customer || item.customerName) && (
        <View style={styles.section}>
          <SectionLabel>Bought from</SectionLabel>
          <Card>
            <Text style={styles.customerName}>{customer?.name ?? item.customerName}</Text>
            {!!customer?.phone && <Text style={styles.customerLine}>{customer.phone}</Text>}
            {!!customer?.idNumber && (
              <Text style={styles.customerLine}>
                ID {customer.idType ? `(${customer.idType.replace(/_/g, ' ')}) ` : ''}
                {customer.idNumber}
              </Text>
            )}
            {!!customer && (
              <Button
                label="View customer"
                variant="ghost"
                onPress={() => router.push(`/customer/${customer.id}`)}
                style={{ marginTop: spacing.md }}
              />
            )}
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <SectionLabel>Photos</SectionLabel>
        <PhotoPicker
          photos={item.photoUris}
          label=""
          onChange={(photos) => updateItem(item.id, { photoUris: photos })}
        />
      </View>

      {(!!item.notes || !!item.location || item.tags.length > 0) && (
        <View style={styles.section}>
          <SectionLabel>Details</SectionLabel>
          <Card>
            {!!item.location && <StatRow label="Location" value={item.location} />}
            {item.tags.length > 0 && <StatRow label="Tags" value={item.tags.join(', ')} />}
            {item.isNumismatic && (
              <StatRow
                label="Collector value"
                value={item.numismaticValue ? money(item.numismaticValue, item.currency) : 'set'}
              />
            )}
            {!!item.notes && (
              <>
                <Divider />
                <Text style={styles.notes}>{item.notes}</Text>
              </>
            )}
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <SectionLabel>Customer copy</SectionLabel>
        <View style={styles.receiptRow}>
          <Button
            label="Print"
            variant="secondary"
            loading={receiptBusy}
            onPress={() => withReceipt(printHtml)}
            style={{ flex: 1 }}
          />
          <Button
            label="Share PDF"
            loading={receiptBusy}
            onPress={() => withReceipt((html) => shareHtmlAsPdf(html, `${item.ticket}.pdf`))}
            style={{ flex: 1 }}
          />
        </View>
        <Text style={styles.receiptNote}>
          Shows what you paid and how it was worked out, with only the last digits of the seller's
          ID. Check the declaration wording against your local rules.
        </Text>
      </View>

      <View style={styles.section}>
        <Button label="Delete record" variant="danger" onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  missingText: { ...type.body, color: colors.textMuted, textAlign: 'center' },

  gallery: { maxHeight: 240 },
  hero: { width: 320, height: 240, borderRadius: radius.lg, marginLeft: spacing.lg },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...type.title, color: colors.text, flex: 1 },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },

  holdBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  holdText: { ...type.caption, color: colors.warn },

  warn: { ...type.caption, color: colors.warn, marginTop: spacing.sm },

  saleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.md },

  customerName: { ...type.heading, color: colors.text },
  customerLine: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  notes: { ...type.body, color: colors.textMuted, lineHeight: 21 },

  receiptRow: { flexDirection: 'row', gap: spacing.md },
  receiptNote: { ...type.caption, color: colors.textFaint, lineHeight: 16, marginTop: spacing.sm },
});
