import * as FileSystem from 'expo-file-system';

/**
 * Photo files on disk.
 *
 * Picker results live in a cache directory the OS is free to purge, which would
 * silently empty an inventory record months later. Every image is copied into
 * the app's document directory first, and the stored URI points at that copy.
 *
 * Item photos are pictures of jewellery and stay as ordinary files: they are
 * read constantly while scrolling a list, and the app sandbox is the control
 * that matters for them. The sensitive material — names, licence numbers, dates
 * of birth — is in the encrypted store, and ID photos get a retention sweep
 * (see `purgeExpiredIdPhotos`) so they are not kept longer than needed.
 */
export const PHOTO_DIR = `${FileSystem.documentDirectory}item-photos/`;

export async function persistPhoto(uri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
  const extension = uri.split('.').pop()?.split('?')[0] || 'jpg';
  const target = `${PHOTO_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export async function deletePhoto(uri: string): Promise<void> {
  // Only ever delete files this app wrote — never a URI handed to us by the
  // picker that still points into the user's own photo library.
  if (!uri.startsWith(PHOTO_DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/**
 * Removes every image this app has written.
 *
 * "Erase everything" clears the records and destroys the key, which leaves the
 * encrypted book unreadable — but photographs are ordinary files, and deleting
 * a key does nothing to them. Without this, a wipe would leave pictures of
 * jewellery and of customers' identification sitting in the sandbox after the
 * operator was told the device had been cleared.
 */
export async function deleteAllPhotos(): Promise<void> {
  await FileSystem.deleteAsync(PHOTO_DIR, { idempotent: true }).catch(() => {});
}

// The retention *policy* lives in `retention.ts`, which imports nothing native
// so it can be unit tested; this module only does the deleting.
