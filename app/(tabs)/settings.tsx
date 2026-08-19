import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { confirm, notify } from '@/lib/confirm';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useSpot } from '@/state/AppState';
import { isSecureStorageAvailable } from '@/lib/crypto';
import { IS_DEMO } from '@/lib/demoMode';
import { PROVIDERS, type ProviderId } from '@/lib/spot';
import { CURRENCIES, parseNumber } from '@/lib/format';
import { METALS, METAL_ORDER, WEIGHT_UNITS, WEIGHT_UNIT_ORDER } from '@/lib/metals';
import { customersCsv, inventoryCsv } from '@/lib/csv';
import { shareCsv } from '@/lib/export';
import { Button, Card, Divider, Input, SectionLabel, Segmented } from '@/components/ui';
import { colors, spacing, type } from '@/theme';

const PROVIDER_DOCS: Record<ProviderId, string> = {
  demo: '',
  'metals.dev': 'https://metals.dev',
  goldapi: 'https://www.goldapi.io',
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, updateSettings, items, customers, buyRules, resetAll, refreshQuotes, refreshing } =
    useApp();
  const spot = useSpot();

  const [keyDraft, setKeyDraft] = useState(settings.spotApiKey);
  const [businessDraft, setBusinessDraft] = useState(settings.businessName);
  const [payoutDraft, setPayoutDraft] = useState(String(Math.round(settings.defaultPayoutRate * 100)));
  const [holdDraft, setHoldDraft] = useState(String(settings.holdPeriodDays));
  const [retentionDraft, setRetentionDraft] = useState(String(settings.idPhotoRetentionDays));
  const [exporting, setExporting] = useState(false);

  const provider = PROVIDERS[settings.spotProvider as ProviderId];
  const encrypted = isSecureStorageAvailable();

  const doExport = async (which: 'inventory' | 'customers') => {
    if (which === 'inventory' && !items.length) {
      notify('Nothing to export', 'Your inventory is empty.');
      return;
    }
    if (which === 'customers' && !customers.length) {
      notify('Nothing to export', 'You have no customer records.');
      return;
    }

    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (which === 'inventory') {
        await shareCsv(`inventory-${stamp}.csv`, inventoryCsv(items, spot, settings.currency));
      } else {
        await shareCsv(`customers-${stamp}.csv`, customersCsv(customers, items, settings.currency));
      }
    } catch (err: any) {
      notify('Export failed', err?.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  const confirmReset = async () => {
    const ok = await confirm({
      title: 'Erase everything?',
      message: `This deletes ${items.length} item${items.length === 1 ? '' : 's'} and ${customers.length} customer record${customers.length === 1 ? '' : 's'} from this device, and destroys the encryption key so no backup copy can be opened either. Export first if you want a copy — this cannot be undone.`,
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (ok) await resetAll();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      {/* ------------------------------------------------------ price feed */}
      <View style={styles.section}>
        <SectionLabel>Price feed</SectionLabel>
        <Segmented
          scroll
          value={settings.spotProvider}
          onChange={(id) => updateSettings({ spotProvider: id as ProviderId })}
          options={Object.values(PROVIDERS).map((p) => ({ value: p.id, label: p.label }))}
        />

        <Card style={{ marginTop: spacing.md }}>
          {settings.spotProvider === 'demo' ? (
            <Text style={styles.note}>
              Demo prices are generated on this device so the app works with no key and no signal.
              They are realistic but <Text style={styles.strong}>not market data</Text> — switch to a
              real feed before paying anyone against them.
            </Text>
          ) : (
            <>
              <Input
                label={`${provider.label} API key`}
                value={keyDraft}
                onChangeText={setKeyDraft}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="Paste your key"
              />
              <View style={styles.keyActions}>
                <Button
                  label="Save key"
                  variant="secondary"
                  onPress={() => {
                    updateSettings({ spotApiKey: keyDraft.trim() });
                    refreshQuotes(true);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Get a key"
                  variant="ghost"
                  onPress={() => Linking.openURL(PROVIDER_DOCS[settings.spotProvider as ProviderId])}
                  style={{ flex: 1 }}
                />
              </View>
              {!provider.supportsHistory && (
                <Text style={styles.note}>
                  {provider.label} doesn't serve history on the free tier, so trend charts fall back
                  to demo data. Prices stay live.
                </Text>
              )}
            </>
          )}

          <Divider />
          <Input
            label="Refresh every"
            value={String(settings.refreshMinutes)}
            onChangeText={(t) =>
              updateSettings({ refreshMinutes: Math.max(1, Math.round(parseNumber(t))) || 15 })
            }
            keyboardType="number-pad"
            suffix="min"
            hint="Lower means fresher prices and more API calls."
          />
          <Button
            label="Refresh now"
            variant="secondary"
            loading={refreshing}
            onPress={() => refreshQuotes(true)}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      </View>

      {/* -------------------------------------------------------- defaults */}
      <View style={styles.section}>
        <SectionLabel>Counter defaults</SectionLabel>
        <Card>
          <Text style={styles.label}>Currency</Text>
          <Segmented
            scroll
            value={settings.currency}
            onChange={(code) => updateSettings({ currency: code })}
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
          />

          <View style={{ height: spacing.lg }} />
          <Text style={styles.label}>Default metal</Text>
          <Segmented
            value={settings.defaultMetal}
            onChange={(m) => updateSettings({ defaultMetal: m })}
            options={METAL_ORDER.map((m) => ({ value: m, label: METALS[m].name }))}
          />

          <View style={{ height: spacing.lg }} />
          <Text style={styles.label}>Default weight unit</Text>
          <Segmented
            scroll
            value={settings.defaultUnit}
            onChange={(u) => updateSettings({ defaultUnit: u })}
            options={WEIGHT_UNIT_ORDER.map((u) => ({ value: u, label: WEIGHT_UNITS[u].label }))}
          />

          <Divider />
          <Input
            label="Default payout rate"
            value={payoutDraft}
            onChangeText={setPayoutDraft}
            onBlur={() => {
              const pct = Math.min(100, Math.max(0, parseNumber(payoutDraft)));
              setPayoutDraft(String(Math.round(pct)));
              updateSettings({ defaultPayoutRate: pct / 100 });
            }}
            keyboardType="number-pad"
            suffix="%"
            hint="The fallback when no buy-table rule matches."
          />
        </Card>
      </View>

      {/* -------------------------------------------------------- buy table */}
      <View style={styles.section}>
        <SectionLabel>Buy table</SectionLabel>
        <Card>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Price from the buy table</Text>
              <Text style={styles.switchHint}>
                Rates by karat and weight band, instead of one flat percentage.
              </Text>
            </View>
            <Switch
              value={settings.useBuyTable}
              onValueChange={(v) => updateSettings({ useBuyTable: v })}
              trackColor={{ true: colors.goldDim, false: colors.border }}
              thumbColor={settings.useBuyTable ? colors.gold : colors.textFaint}
            />
          </View>

          <View style={{ height: spacing.md }} />
          <Button
            label={buyRules.length ? `Edit rates (${buyRules.length})` : 'Set up your rates'}
            variant="secondary"
            onPress={() => router.push('/settings/buy-table')}
          />
          <Text style={styles.note}>
            A bigger lot usually earns a better rate. The calculator picks the matching rate as you
            weigh, and you can always type over it.
          </Text>
        </Card>
      </View>

      {/* ------------------------------------------------------ compliance */}
      <View style={styles.section}>
        <SectionLabel>Records &amp; compliance</SectionLabel>
        <Card>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Require seller ID on purchases</Text>
              <Text style={styles.switchHint}>
                Blocks saving a purchase without a name and ID number.
              </Text>
            </View>
            <Switch
              value={settings.requireCustomerId}
              onValueChange={(v) => updateSettings({ requireCustomerId: v })}
              trackColor={{ true: colors.goldDim, false: colors.border }}
              thumbColor={settings.requireCustomerId ? colors.gold : colors.textFaint}
            />
          </View>

          <Divider />

          <Input
            label="Hold period before melting"
            value={holdDraft}
            onChangeText={setHoldDraft}
            onBlur={() => {
              const days = Math.max(0, Math.round(parseNumber(holdDraft)));
              setHoldDraft(String(days));
              updateSettings({ holdPeriodDays: days });
            }}
            keyboardType="number-pad"
            suffix="days"
            hint="Many jurisdictions require holding bought goods before resale or melting. 0 turns the reminder off."
          />

          <View style={{ height: spacing.md }} />
          <Input
            label="Business name"
            value={businessDraft}
            onChangeText={setBusinessDraft}
            onBlur={() => updateSettings({ businessName: businessDraft.trim() })}
            placeholder="Appears on exports"
          />

          <Text style={styles.note}>
            These settings are reminders, not legal advice. Secondhand-dealer and precious-metal
            rules vary by state, province and city — confirm what applies to you.
          </Text>
        </Card>
      </View>

      {/* -------------------------------------------------------- security */}
      <View style={styles.section}>
        <SectionLabel>Security</SectionLabel>
        <Card>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: encrypted ? colors.up : colors.warn }]} />
            <Text style={styles.statusText}>
              {encrypted
                ? 'Your book is encrypted with a key held in this device’s secure hardware.'
                : 'This preview has no secure keystore, so data is stored unencrypted. The iOS and Android apps always encrypt.'}
            </Text>
          </View>

          <Divider />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Require unlock to open</Text>
              <Text style={styles.switchHint}>
                Face ID, fingerprint or device passcode, and again after the app is backgrounded.
              </Text>
            </View>
            <Switch
              value={settings.appLockEnabled}
              onValueChange={(v) => updateSettings({ appLockEnabled: v })}
              trackColor={{ true: colors.goldDim, false: colors.border }}
              thumbColor={settings.appLockEnabled ? colors.gold : colors.textFaint}
            />
          </View>

          <Divider />

          <Input
            label="Delete ID photos after"
            value={retentionDraft}
            onChangeText={setRetentionDraft}
            onBlur={() => {
              const days = Math.max(0, Math.round(parseNumber(retentionDraft)));
              setRetentionDraft(String(days));
              updateSettings({ idPhotoRetentionDays: days });
            }}
            keyboardType="number-pad"
            suffix="days"
            hint="Runs on launch. 0 keeps them indefinitely. Holding a customer's ID image longer than your rules require is a liability, not an asset."
          />

          <Text style={styles.note}>
            Item photos stay as ordinary files inside the app sandbox so lists scroll smoothly. The
            sensitive material — names, ID numbers, dates of birth — is in the encrypted store.
          </Text>
        </Card>
      </View>

      {/* ---------------------------------------------------------- export */}
      <View style={styles.section}>
        <SectionLabel>Your data</SectionLabel>
        <Card>
          <Text style={styles.note}>
            Everything lives on this device — inventory, customers, photos and ID details. Nothing is
            uploaded. That also means a lost phone is a lost book, so export regularly. Exported CSV
            is plain text, so treat the file as carefully as the records themselves.
          </Text>
          <View style={{ height: spacing.md }} />
          <Button
            label={`Export inventory (${items.length})`}
            variant="secondary"
            loading={exporting}
            onPress={() => doExport('inventory')}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label={`Export customers (${customers.length})`}
            variant="secondary"
            loading={exporting}
            onPress={() => doExport('customers')}
          />
          <View style={{ height: spacing.lg }} />
          <Button
            label={IS_DEMO ? 'Reset the demo' : 'Erase all data'}
            variant="danger"
            onPress={confirmReset}
          />
          {IS_DEMO && (
            <Text style={styles.note}>
              Clears everything you changed and reloads the sample book on the next visit.
            </Text>
          )}
        </Card>
      </View>

      <Text style={styles.version}>BullionBook · prices are indicative, not an offer to trade.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.lg },

  label: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.md },
  strong: { color: colors.warn, fontWeight: '700' },

  keyActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },

  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  statusText: { ...type.caption, color: colors.textMuted, lineHeight: 17, flex: 1 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchLabel: { ...type.body, color: colors.text, fontWeight: '600' },
  switchHint: { ...type.caption, color: colors.textFaint, marginTop: 1 },

  version: { ...type.caption, color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },
});
