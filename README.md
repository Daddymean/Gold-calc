# BullionBook

A mobile app for people who buy and sell precious metals across a counter: a
melt calculator, live spot prices with historic trends, and an inventory book
that records what you bought, what you paid, who you bought it from, and what it
looked like.

Built with Expo (React Native) and TypeScript. Runs on iOS and Android from one
codebase, plus a web build for a desk browser.

---

## Running it

```bash
npm install
npx expo install --fix     # aligns native package versions with the SDK
npm start
```

Scan the QR code with **Expo Go** on your phone, or press `i` / `a` for a
simulator. `npm run web` opens it in a browser (camera capture is limited there).

```bash
npm test        # money math, buy table, crypto, retention — 54 tests, no native deps
npm run typecheck
```

## Branches

Work happens on a feature branch; **`main` is the publish branch**. Pushing to
`main` is what updates the public demo, so merging is a deliberate release step
rather than something every commit triggers. The deploy can also be run by hand
from the Actions tab without a merge.

## The hosted demo

Pushing to `main` builds the web app and publishes it to GitHub Pages via
`.github/workflows/deploy-demo.yml`. That build sets two variables:

- `EXPO_PUBLIC_DEMO=1` seeds a sample book — four customers, ten items across
  all four metals, a populated buy table — so a visitor sees a working counter
  instead of an empty app, and shows a banner saying the data is invented. Every
  seeded figure is derived through the real melt engine from a stated spot price
  on the purchase date, so the margins and portfolio totals are consistent.
- `EXPO_PUBLIC_BASE_URL=/<repo>` prefixes assets and routes, because a project
  site is served from a subpath rather than the domain root.

To reproduce it locally:

```bash
EXPO_PUBLIC_BASE_URL=/Gold-calc EXPO_PUBLIC_DEMO=1 npx expo export -p web --output-dir dist
```

**What the web demo can't show.** There's no keystore in a browser, so the demo
stores data unencrypted and says so on the Settings screen. Desktop browsers
have no camera capture (a mobile browser will offer one through the file
picker), and the OS share sheet used by CSV export doesn't exist.

## Demos on a real device

`eas.json` defines two internal-distribution profiles: **demo** (seeded sample
book, for someone who has never seen the app) and **preview** (empty book, for
someone trying it against their own stock). Build them from the Actions tab via
the *Build app* workflow, which is manual-only — the free Expo plan includes 15
Android and 15 iOS builds a month, and building on every push would spend that
without anyone asking.

One-time setup:

1. Create a free account at expo.dev.
2. `npx eas-cli login && npx eas-cli init` — writes `owner` and
   `extra.eas.projectId` into the app config and links the repo to the project.
3. Create an access token (expo.dev → account settings → access tokens) and add
   it to this repo as the `EXPO_TOKEN` secret.

**Android is the cheap path.** The demo profile builds an APK; EAS returns a
shareable install link, testers accept the "unknown apps" warning, and no Google
Play account is involved.

**iOS needs the Apple Developer Program ($99/yr), with no way around it.**
TestFlight is the better route for people you don't know; ad-hoc internal
distribution works too but needs each device's UDID registered in advance and
caps at 100 devices a year.

**Expo Go is not a distribution channel.** Since 12 May 2026 it only loads EAS
Update projects owned by you or by an organisation you belong to, so a prospect
cannot open your link. It is still useful for a demo you drive yourself
(`npx expo start --tunnel`) or for teammates added to your Expo org.

---

## What's in it

### Calculator
The screen you keep open all day. Pick a metal, tap a karat or fineness, type
the weight, read the payout. Everything else is one tap away and never in the
path of that sequence.

- Four metals: gold, silver, platinum, palladium
- 26 purities — the full karat table (6K–24K), sterling/coin/Britannia silver,
  platinum and palladium finenesses, each with the hallmark stamp you'd actually
  see on the piece
- Six weight units, including **pennyweight**, which most jewellery scrap is
  still bought in
- **Buy table** — rates by karat and weight band, because nobody runs one flat
  percentage. Matched most-specific-first, so "all gold: 75%" and "22K over
  50 g: 92%" coexist and the carve-out wins. The rate follows the scale as you
  weigh, and you can always type over it
- Payout percentage *or* a fixed offer — type a round number and the app tells
  you what percentage of melt you just offered
- **Lot builder** for the realistic case: a bag of mixed karats, totalled
- One tap from a quote to a logged purchase, carrying the numbers over

### Live pricing and trends
- Spot per troy ounce, with the day's move
- Interactive history — 7D / 1M / 3M / 1Y / 5Y, drag across the chart to read
  any day
- Per-purity melt tables: what a gram of 14K is worth right now, and per dwt
- Pluggable providers. **metals.dev** and **GoldAPI.io** are wired up; adding
  another means implementing one interface in `src/lib/spot/`
- Prices are cached, so a dead signal shows the last good numbers clearly marked
  stale rather than an empty screen

### Inventory
- Add an item with description, metal, purity, weight, quantity, purchase price,
  and **photos from the camera or library**
- Customer capture inline — name, phone, ID number — which becomes a real
  customer record so their history is there next time
- Every record freezes the **spot price and melt value at the moment of
  purchase**, so margin stays honest months later
- Live P&L per item and across the book, valued against current spot
- Search by ticket, description, customer, tag or note; filter by status
- Status lifecycle: in stock → on hold → sold / melted, with realised P&L

### Customers
- Full contact and ID details (type, number, expiry, DOB, optional ID photo)
- Every transaction that customer has brought you, with the total paid out
- Flags records with no ID on file

### The things a dealer actually needs
- **Hold-period tracking** — set the days your jurisdiction requires before
  resale or melting; the app warns before you mark something melted early
- **Required-ID enforcement** — a purchase won't save without seller details
  unless you turn it off deliberately
- **App lock** — optional Face ID / fingerprint / passcode on open, and again
  after the app is backgrounded, so a phone left on the counter stays shut
- **ID photo retention** — set a window and the app forgets them for you
- **Over-melt warning** — paying more than the metal is worth is fine for a
  collectible and a mistake on scrap, so it's flagged either way
- **Numismatic mode** — a graded coin is valued at its collector price, not melt
- **CSV export** of inventory and customers, through the OS share sheet

---

## How it's built

```
app/                     screens (expo-router, file-based)
  (tabs)/                prices · calculator · inventory · customers · settings
  item/new, item/[id]    intake form and item record
  customer/…             customer records
  metal/[symbol]         price history and melt tables
  settings/buy-table     the karat x weight-band rate editor
src/
  lib/metals.ts          purity tables, unit conversion, the melt engine
  lib/buyTable.ts        rate rules and most-specific-first resolution
  lib/spot/              price providers behind one interface
  lib/portfolio.ts       book valuation and P&L
  lib/crypto/            envelope.ts is pure; index.ts holds the keychain
  lib/retention.ts       which ID photos have aged out (pure)
  lib/export.ts          CSV
  lib/storage.ts         encrypted persistence
  state/AppState.tsx     one provider: inventory, customers, settings, prices
  components/            UI kit, chart, photo picker, lock/vault gate
tests/                   money math, buy table, crypto, retention
```

**The engine is pure and dependency-free.** `src/lib/metals.ts` imports nothing,
so the same code backs the calculator, the intake form's live melt panel and the
portfolio valuation — those three can't drift apart — and it's testable in plain
node. The same split is applied wherever a policy is worth testing on its own:
`buyTable.ts`, `retention.ts` and `crypto/envelope.ts` are all free of native
imports, with the keychain and filesystem kept in thin wrappers beside them.

**Everything is on-device, and encrypted.** Inventory, customers and ID details
are sealed with XChaCha20-Poly1305 under a 32-byte key held in the iOS Keychain
/ Android Keystore. Nothing is uploaded. That's deliberate: a customer's
driver's licence number isn't data to ship to a server by default, and the app
has to work in a basement shop with no signal. The trade-off is real — a lost
phone is a lost book, so the app pushes you to export.

Three decisions inside that are worth not undoing:

- **The key is not bound to biometrics.** Android invalidates Keystore entries
  requiring authentication whenever a new fingerprint or face is enrolled, which
  would permanently destroy the book. The optional app lock is a separate gate;
  losing it never costs data.
- **A failed decrypt is never treated as an empty book.** Showing "no items"
  over records that are still there invites the operator to save on top of them.
  Storage latches writes off, and the app shows what happened and offers only
  two honest paths: recover the key, or knowingly erase.
- **Item photos stay as plain files.** They're pictures of jewellery, read
  constantly while scrolling, and the app sandbox is the control that matters.
  ID photos get a configurable retention sweep instead, because holding a
  customer's ID image longer than local rules require is a liability.

**Photos are copied, not referenced.** The image picker hands back a URI in a
cache directory the OS may purge; every photo is copied into the app's document
directory first so an inventory record doesn't quietly lose its picture months
later.

**Money math is defensive.** Weights floor at zero, purity and payout clamp to
0–1, and non-finite input yields zeros rather than `NaN` propagating into a
number someone reads aloud to a customer. Troy constants are exact.

**The metal colours are a validated palette, not the literal metals.** Gold,
silver, platinum and palladium as they actually look are one yellow and three
greys — indistinguishable to a colourblind reader and nearly so to everyone
else. The four series colours are checked for perceptual separation under
deuteranopia and protanopia and for contrast against the dark surface, and every
place a colour appears it's paired with the Au/Ag/Pt/Pd symbol, so identity never
rests on hue alone.

---

## Price feeds

Ships with a **demo generator** so it runs with no API key and no connection.
It's a seeded random walk anchored to realistic levels — deterministic, so the
charts look like markets rather than static. It is clearly labelled
`NOT MARKET DATA` on every screen that shows it.

For real prices, add a key in Settings:

| Provider | Live | History | Notes |
|---|---|---|---|
| metals.dev | ✅ | ✅ | free tier covers both |
| GoldAPI.io | ✅ | — | history is a paid add-on; charts fall back to demo |

---

## Scope

This is a complete, running app, not a mockup — but a few things a shop would
want before it replaces a paper book:

- **No cloud sync or multi-device.** One phone, one book, by design. Multi-till
  shops need a backend.
- **No receipt printing.** CSV export covers the accountant; a thermal-printer
  receipt for the customer is the obvious next piece.
- **No hallmark OCR or scale integration.** Bluetooth scales and photographing a
  stamp to auto-fill karat are both plausible and both out of scope here.
- **Compliance features are reminders, not legal advice.** Secondhand-dealer and
  precious-metal rules vary by state, province and city. The hold period and ID
  requirements are configurable because the correct values are local — confirm
  what applies to you.

Prices shown are indicative and not an offer to trade.
