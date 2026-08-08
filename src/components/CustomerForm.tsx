import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Button, Input, SectionLabel, Segmented } from '@/components/ui';
import { colors, spacing } from '@/theme';
import type { Customer, IdType } from '@/types';

const ID_TYPES: { value: IdType; label: string }[] = [
  { value: 'drivers_license', label: "Driver's licence" },
  { value: 'state_id', label: 'State ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'military_id', label: 'Military ID' },
  { value: 'other', label: 'Other' },
];

export type CustomerDraft = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;

/** Shared by the create and edit screens so the two can never drift apart. */
export function CustomerForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Customer>;
  submitLabel: string;
  onSubmit: (draft: CustomerDraft) => Promise<void> | void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [idType, setIdType] = useState<IdType>(initial?.idType ?? 'drivers_license');
  const [idNumber, setIdNumber] = useState(initial?.idNumber ?? '');
  const [idExpiry, setIdExpiry] = useState(initial?.idExpiry ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [idPhotos, setIdPhotos] = useState<string[]>(initial?.idPhotoUri ? [initial.idPhotoUri] : []);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        idType,
        idNumber: idNumber.trim() || undefined,
        idExpiry: idExpiry.trim() || undefined,
        dateOfBirth: dateOfBirth.trim() || undefined,
        notes: notes.trim() || undefined,
        idPhotoUri: idPhotos[0],
      });
    } finally {
      setSaving(false);
    }
  };

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
          <SectionLabel>Contact</SectionLabel>
          <Input label="Full name" value={name} onChangeText={setName} placeholder="Jordan Ellis" />
          <View style={{ height: spacing.md }} />
          <View style={styles.row}>
            <Input
              containerStyle={{ flex: 1 }}
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Input
              containerStyle={{ flex: 1 }}
              label="Date of birth"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={{ height: spacing.md }} />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={{ height: spacing.md }} />
          <Input label="Address" value={address} onChangeText={setAddress} multiline />
        </View>

        <View style={styles.section}>
          <SectionLabel>Identification</SectionLabel>
          <Segmented scroll value={idType} onChange={setIdType} options={ID_TYPES} />
          <View style={{ height: spacing.md }} />
          <View style={styles.row}>
            <Input
              containerStyle={{ flex: 2 }}
              label="ID number"
              value={idNumber}
              onChangeText={setIdNumber}
              autoCapitalize="characters"
            />
            <Input
              containerStyle={{ flex: 1 }}
              label="Expires"
              value={idExpiry}
              onChangeText={setIdExpiry}
              placeholder="YYYY-MM"
            />
          </View>
          <View style={{ height: spacing.lg }} />
          <PhotoPicker
            photos={idPhotos}
            onChange={setIdPhotos}
            max={1}
            label="ID photo"
            hint="Optional. Stored only on this device — check what your local rules allow you to keep."
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>Notes</SectionLabel>
          <Input
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Regular seller. Estate clearance, expects to be back next month."
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label={submitLabel}
          onPress={submit}
          loading={saving}
          disabled={!name.trim()}
          style={{ flex: 2 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
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
