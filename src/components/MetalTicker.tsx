import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { METALS, type MetalSymbol } from '@/lib/metals';
import { signedPercent, spotMoney, type CurrencyCode } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';
import { Sparkline } from './PriceChart';
import type { PricePoint, SpotQuote } from '@/types';

/**
 * One metal, one row: symbol chip, name, spot, and the day's move. The chip
 * carries the colour so the metal is identified by symbol first and hue second.
 */
export function MetalRow({
  metal,
  quote,
  currency,
  spark,
  onPress,
}: {
  metal: MetalSymbol;
  quote?: SpotQuote;
  currency: CurrencyCode;
  spark?: PricePoint[];
  onPress?: () => void;
}) {
  const meta = METALS[metal];
  const up = (quote?.changePercent ?? 0) >= 0;
  const moveColor = quote ? (up ? colors.up : colors.down) : colors.textFaint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meta.name} spot price`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.symbol, { borderColor: meta.color, backgroundColor: `${meta.color}22` }]}>
        <Text style={[styles.symbolText, { color: meta.color }]}>{meta.short}</Text>
      </View>

      <View style={styles.nameCol}>
        <Text style={styles.name}>{meta.name}</Text>
        <Text style={styles.unit}>per troy oz</Text>
      </View>

      {!!spark?.length && (
        <View style={styles.spark}>
          <Sparkline points={spark} color={meta.color} />
        </View>
      )}

      <View style={styles.priceCol}>
        <Text style={styles.price}>{quote ? spotMoney(quote.price, currency) : '—'}</Text>
        <Text style={[styles.change, { color: moveColor }]}>
          {quote ? `${up ? '▲' : '▼'} ${signedPercent(quote.changePercent)}` : 'no data'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  symbol: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: { ...type.label, fontSize: 14 },
  nameCol: { flex: 1 },
  name: { ...type.heading, color: colors.text },
  unit: { ...type.caption, color: colors.textFaint },
  spark: { opacity: 0.9 },
  priceCol: { alignItems: 'flex-end', minWidth: 96 },
  price: { ...type.mono, fontSize: 17, color: colors.text },
  change: { ...type.caption, fontVariant: ['tabular-nums'] },
});
