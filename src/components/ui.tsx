import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, type } from '@/theme';

/* ------------------------------------------------------------------- Card */

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  return <View style={[s.card, padded && s.cardPadded, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  // Uppercasing via style rather than String(children): interpolated children
  // arrive as an array, and stringifying one inserts stray commas.
  return <Text style={s.sectionLabel}>{children}</Text>;
}

/* ----------------------------------------------------------------- Button */

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        variant === 'primary' && s.buttonPrimary,
        variant === 'secondary' && s.buttonSecondary,
        variant === 'ghost' && s.buttonGhost,
        variant === 'danger' && s.buttonDanger,
        (disabled || loading) && s.buttonDisabled,
        pressed && s.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onGold : colors.text} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[
              s.buttonLabel,
              isPrimary && s.buttonLabelPrimary,
              variant === 'danger' && s.buttonLabelDanger,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Input */

export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.field, style]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
      {!!hint && <Text style={s.fieldHint}>{hint}</Text>}
    </View>
  );
}

export function Input({
  label,
  hint,
  prefix,
  suffix,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  containerStyle?: ViewStyle;
}) {
  const input = (
    <View style={s.inputWrap}>
      {!!prefix && <Text style={s.affix}>{prefix}</Text>}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        style={[s.input, props.multiline && s.inputMultiline, props.style]}
      />
      {!!suffix && <Text style={s.affix}>{suffix}</Text>}
    </View>
  );

  if (!label) return <View style={containerStyle}>{input}</View>;
  return (
    <Field label={label} hint={hint} style={containerStyle}>
      {input}
    </Field>
  );
}

/* ------------------------------------------------------- Segmented / chips */

export interface Option<T extends string> {
  value: T;
  label: string;
  sublabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  scroll = false,
  accent = colors.gold,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Horizontal scroll for long option sets like the karat table. */
  scroll?: boolean;
  accent?: string;
}) {
  const chips = options.map((opt) => {
    const selected = opt.value === value;
    return (
      <Pressable
        key={opt.value}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(opt.value)}
        style={[
          s.chip,
          scroll && s.chipScroll,
          selected && { backgroundColor: accent, borderColor: accent },
        ]}
      >
        <Text style={[s.chipLabel, selected && s.chipLabelSelected]}>{opt.label}</Text>
        {!!opt.sublabel && (
          <Text style={[s.chipSub, selected && s.chipSubSelected]}>{opt.sublabel}</Text>
        )}
      </Pressable>
    );
  });

  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRowScroll}
      >
        {chips}
      </ScrollView>
    );
  }
  return <View style={s.chipRow}>{chips}</View>;
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'up' | 'down' | 'warn' | 'gold' | 'info';
}) {
  const toneColor =
    tone === 'up'
      ? colors.up
      : tone === 'down'
        ? colors.down
        : tone === 'warn'
          ? colors.warn
          : tone === 'gold'
            ? colors.gold
            : tone === 'info'
              ? colors.info
              : colors.textMuted;

  return (
    <View style={[s.badge, { borderColor: `${toneColor}55`, backgroundColor: `${toneColor}1A` }]}>
      <Text style={[s.badgeLabel, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

/* -------------------------------------------------------------- Stat rows */

export function StatRow({
  label,
  value,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'up' | 'down' | 'gold';
}) {
  const valueColor =
    tone === 'up' ? colors.up : tone === 'down' ? colors.down : tone === 'gold' ? colors.gold : colors.text;
  return (
    <View style={[s.statRow, emphasis && s.statRowEmphasis]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, emphasis && s.statValueEmphasis, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
      {!!action && <View style={s.emptyAction}>{action}</View>}
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardPadded: { padding: spacing.lg },

  sectionLabel: {
    ...type.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  buttonPrimary: { backgroundColor: colors.gold },
  buttonSecondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  buttonGhost: { backgroundColor: 'transparent', borderColor: colors.border },
  buttonDanger: { backgroundColor: 'transparent', borderColor: `${colors.down}66` },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.75 },
  buttonLabel: { ...type.heading, color: colors.text },
  buttonLabelPrimary: { color: colors.onGold },
  buttonLabelDanger: { color: colors.down },

  field: { gap: spacing.sm },
  fieldLabel: { ...type.label, color: colors.textMuted },
  fieldHint: { ...type.caption, color: colors.textFaint },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 14,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  affix: { ...type.body, color: colors.textMuted, paddingHorizontal: spacing.xs },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipRowScroll: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    minWidth: 56,
  },
  chipScroll: { minWidth: 62 },
  chipLabel: { ...type.label, color: colors.text },
  chipLabelSelected: { color: colors.onGold },
  chipSub: { ...type.caption, color: colors.textFaint, fontSize: 10, marginTop: 1 },
  chipSubSelected: { color: `${colors.onGold}CC` },

  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  badgeLabel: { ...type.caption, fontSize: 11 },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  statRowEmphasis: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  statLabel: { ...type.body, color: colors.textMuted },
  statValue: { ...type.mono, color: colors.text },
  statValueEmphasis: { fontSize: 22, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...type.heading, color: colors.text },
  emptyBody: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyAction: { marginTop: spacing.md, alignSelf: 'stretch' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.md },
});
