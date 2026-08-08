/**
 * Whether this build is the public demo.
 *
 * Set at build time by the deploy workflow (`EXPO_PUBLIC_DEMO=1`). Expo inlines
 * EXPO_PUBLIC_* variables into the bundle, so this is a constant after build
 * rather than something a visitor can flip — the shipped app can never seed
 * sample records over a real book.
 */
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO === '1';
