import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * The device half of exporting. The documents themselves are built in
 * `csv.ts`, which imports nothing native so it can be tested — the same split
 * as `receipt.ts` and `print.ts`.
 */

/** Writes the CSV to a temp file and hands it to the OS share sheet. */
export async function shareCsv(filename: string, contents: string): Promise<void> {
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: filename,
    UTI: 'public.comma-separated-values-text',
  });
}
