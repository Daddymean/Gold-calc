import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation.
 *
 * `Alert.alert` renders nothing actionable on react-native-web: the buttons are
 * dropped and the `onPress` handlers never fire, so every destructive action
 * silently does nothing in a browser. Anything the hosted demo needs to
 * demonstrate has to go through here instead.
 *
 * Returns true when the user confirms.
 */
export function confirm(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive } = options;

  if (Platform.OS === 'web') {
    // The browser dialog is plain, but it is real: it blocks, it has two
    // buttons, and it returns an answer.
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(
      typeof globalThis.confirm === 'function' ? globalThis.confirm(text) : false,
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Single-button acknowledgement, for telling rather than asking. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof globalThis.alert === 'function') globalThis.alert(text);
    return;
  }
  Alert.alert(title, message);
}
