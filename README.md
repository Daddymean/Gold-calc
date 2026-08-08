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
npm test        # the money math — 17 tests, no native deps needed
npm run typecheck
```

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
src/
  lib/metals.ts          purity tables, unit conversion, the melt engine
  lib/spot/              price providers behind one interface
  lib/portfolio.ts       book valuation and P&L
  lib/export.ts          CSV
  lib/storage.ts         AsyncStorage persistence
  state/AppState.tsx     one provider: inventory, customers, settings, prices
  components/            UI kit, chart, photo picker
tests/                   the money math
```

**The engine is pure and dependency-free.** `src/lib/metals.ts` imports nothing,
so the same code backs the calculator, the intake form's live melt panel and the
portfolio valuation — those three can't drift apart — and it's testable in plain
node.

**Everything is on-device.** Inventory, customers, ID details and photos live in
AsyncStorage and the app's document directory. Nothing is uploaded. That's
deliberate: a customer's driver's licence number isn't data to ship to a server
by default, and the app has to work in a basement shop with no signal. The
trade-off is real — a lost phone is a lost book, so the app pushes you to export.

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
