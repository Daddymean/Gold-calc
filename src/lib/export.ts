import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * The device half of exporting. The documents themselves are built in
 * `csv.ts`, which imports nothing native so it can be tested — the same split
 * as `receipt.ts` and `print.ts`.
 */

/**
 * Writes the CSV to a temp file and hands it to the OS share sheet.
 *
 * On web there is no share sheet, so the browser's own download takes over —
 * the same shape of fallback `shareHtmlAsPdf` uses for printing. Without it the
 * web build has an export button that only ever reports that it cannot export,
 * which is how the demo looked to anyone who tried to take a report away.
 */
export async function shareCsv(filename: string, contents: string): Promise<void> {
  if (Platform.OS === 'web') {
    downloadInBrowser(filename, contents);
    return;
  }

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

function downloadInBrowser(filename: string, contents: string): void {
  // A BOM so a spreadsheet opening this in a non-UTF-8 default locale does not
  // mangle a customer's name or a £ sign.
  const blob = new Blob([`﻿${contents}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
