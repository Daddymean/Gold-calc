import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useApp } from '@/state/AppState';
import { Button, Card } from '@/components/ui';
import { colors, spacing, type } from '@/theme';

/**
 * Stands between the app and the book.
 *
 * Two things can keep the operator out. The book may be unreadable — encrypted
 * with a key this device no longer has — in which case showing the app would
 * mean showing an empty inventory over records that still exist. Or the
 * operator has turned on the app lock, in which case device authentication is
 * required before anything is displayed.
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const { ready, vaultError, settings, resetAll } = useApp();

  const [unlocked, setUnlocked] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const lockRequired = settings.appLockEnabled && !vaultError;

  const authenticate = useCallback(async () => {
    setPrompting(true);
    setLockError(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        // The device lost its biometrics or passcode after the setting was
        // turned on. Refusing entry forever would strand the operator's own
        // data, so let them in and say why the lock could not run.
        setUnlocked(true);
        setLockError('No device lock is set up, so the app lock could not run.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock your book',
        cancelLabel: 'Cancel',
      });
      if (result.success) {
        setUnlocked(true);
      } else {
        setLockError(result.error === 'user_cancel' ? null : 'Authentication failed.');
      }
    } catch (err: any) {
      setLockError(err?.message ?? 'Could not run device authentication.');
    } finally {
      setPrompting(false);
    }
  }, []);

  // Prompt as soon as the app is ready and the lock is on.
  useEffect(() => {
    if (ready && lockRequired && !unlocked && !prompting) authenticate();
    // `prompting` is deliberately excluded: including it would re-fire the
    // prompt the instant one finishes and trap the user in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lockRequired, unlocked, authenticate]);

  // Re-lock when the app goes to the background, so a phone left on a counter
  // does not hand the book to whoever picks it up next.
  const appState = useRef(RNAppState.currentState);
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (next) => {
      if (appState.current === 'active' && next.match(/inactive|background/)) {
        if (settings.appLockEnabled) setUnlocked(false);
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [settings.appLockEnabled]);

  if (!ready) return <View style={styles.blank} />;

  if (vaultError) return <VaultErrorScreen message={vaultError} onErase={resetAll} />;

  if (lockRequired && !unlocked) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockGlyph}>🔒</Text>
        <Text style={styles.lockTitle}>BullionBook is locked</Text>
        <Text style={styles.lockBody}>
          Your inventory and customer records are encrypted on this device.
        </Text>
        {!!lockError && <Text style={styles.lockError}>{lockError}</Text>}
        <Button
          label={prompting ? 'Waiting…' : 'Unlock'}
          onPress={authenticate}
          loading={prompting}
          style={styles.lockButton}
        />
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * The book exists but will not open. This screen never offers a way "past" the
 * problem into an empty app — the only paths are to fix the key situation or to
 * knowingly destroy the data.
 */
function VaultErrorScreen({ message, onErase }: { message: string; onErase: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <ScrollView contentContainerStyle={styles.errorScroll}>
      <Card>
        <Text style={styles.errorTitle}>Your book could not be opened</Text>
        <Text style={styles.errorBody}>{message}</Text>

        <Text style={styles.errorHeading}>What you can do</Text>
        <Text style={styles.errorBody}>
          If this phone was restored from a backup, restoring the keychain from the same backup
          brings the key with it and the book opens again. If you moved to a new device without a
          keychain transfer, the records here cannot be recovered — but a CSV you exported earlier
          still can be.
        </Text>

        <Text style={styles.errorNote}>
          Nothing has been changed or deleted. Saving is disabled so nothing overwrites the records
          that are still on this device.
        </Text>

        {confirming ? (
          <>
            <Text style={styles.errorDanger}>
              Erasing removes every item, customer and photo on this device, and destroys the key.
              This cannot be undone.
            </Text>
            <View style={styles.errorActions}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setConfirming(false)}
                style={{ flex: 1 }}
              />
              <Button label="Erase everything" variant="danger" onPress={onErase} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <Button
            label="Start over with an empty book"
            variant="danger"
            onPress={() => setConfirming(true)}
            style={{ marginTop: spacing.lg }}
          />
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  lockGlyph: { fontSize: 40, marginBottom: spacing.sm },
  lockTitle: { ...type.title, color: colors.text },
  lockBody: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  lockError: { ...type.caption, color: colors.warn, textAlign: 'center', marginTop: spacing.sm },
  lockButton: { alignSelf: 'stretch', marginTop: spacing.xl },

  errorScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  errorTitle: { ...type.title, color: colors.text },
  errorHeading: { ...type.heading, color: colors.text, marginTop: spacing.lg },
  errorBody: { ...type.body, color: colors.textMuted, lineHeight: 21, marginTop: spacing.sm },
  errorNote: { ...type.caption, color: colors.info, lineHeight: 17, marginTop: spacing.lg },
  errorDanger: { ...type.caption, color: colors.down, lineHeight: 17, marginTop: spacing.lg },
  errorActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
