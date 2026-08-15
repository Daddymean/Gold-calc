import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Turning a receipt into something the customer can hold.
 *
 * Two routes, because counters differ: send it straight to a printer if there
 * is one on the network, or produce a PDF and hand it to the share sheet for
 * email, AirDrop or a messaging app.
 */

/** Opens the OS print dialog. */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

/**
 * Renders to a PDF and offers it to the share sheet.
 *
 * On web there is no share sheet and no file system to speak of, so the print
 * dialog is the only sensible destination — the browser's own "save as PDF"
 * covers the rest.
 */
export async function shareHtmlAsPdf(html: string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: filename,
    UTI: 'com.adobe.pdf',
  });
}
