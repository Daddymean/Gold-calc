import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { deletePhoto, persistPhoto } from '@/lib/photos';
import { colors, radius, spacing, type } from '@/theme';

export function PhotoPicker({
  photos,
  onChange,
  max = 6,
  label = 'Photos',
  hint = 'Shoot the piece, the hallmark, and anything that explains the price.',
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);

  const add = async (source: 'camera' | 'library') => {
    if (photos.length >= max) {
      Alert.alert('Photo limit', `Up to ${max} photos per record.`);
      return;
    }
    setBusy(true);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          source === 'camera'
            ? 'Allow camera access to photograph items at the counter.'
            : 'Allow photo access to attach an existing picture.',
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
        // Multi-select only applies to the library; the camera returns one shot.
        allowsMultipleSelection: source === 'library',
        selectionLimit: max - photos.length,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled) return;

      const saved = await Promise.all(result.assets.map((asset) => persistPhoto(asset.uri)));
      onChange([...photos, ...saved].slice(0, max));
    } catch (err: any) {
      Alert.alert('Could not add photo', err?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const remove = (uri: string) => {
    Alert.alert('Remove photo?', 'This deletes the image from the record.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          onChange(photos.filter((p) => p !== uri));
          await deletePhoto(uri);
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {photos.map((uri) => (
          <Pressable
            key={uri}
            onLongPress={() => remove(uri)}
            accessibilityRole="imagebutton"
            accessibilityLabel="Item photo. Long press to remove."
            style={styles.thumbWrap}
          >
            <Image source={{ uri }} style={styles.thumb} />
            <View style={styles.removeHint}>
              <Text style={styles.removeHintText}>hold to remove</Text>
            </View>
          </Pressable>
        ))}

        {photos.length < max && (
          <>
            <Pressable
              onPress={() => add('camera')}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              style={[styles.addTile, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.addGlyph}>📷</Text>
              <Text style={styles.addLabel}>Camera</Text>
            </Pressable>
            <Pressable
              onPress={() => add('library')}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
              style={[styles.addTile, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.addGlyph}>🖼️</Text>
              <Text style={styles.addLabel}>Library</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const TILE = 88;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...type.label, color: colors.textMuted },
  strip: { gap: spacing.sm, paddingRight: spacing.lg },
  thumbWrap: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  thumb: { width: '100%', height: '100%' },
  removeHint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000AA',
    paddingVertical: 2,
    alignItems: 'center',
  },
  removeHintText: { ...type.caption, fontSize: 9, color: colors.textMuted },
  addTile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addGlyph: { fontSize: 22 },
  addLabel: { ...type.caption, color: colors.textMuted },
  hint: { ...type.caption, color: colors.textFaint },
});
