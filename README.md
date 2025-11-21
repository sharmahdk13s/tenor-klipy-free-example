# TenorGIF – GIF / Sticker / Clip Picker

React Native 0.82 demo app that implements a chat-style GIF picker using a bottom sheet.

The picker supports:

- **Tenor** and **Klipy** as providers
- **GIFs, Stickers, Clips** content types
- **Search + trending** endpoints
- **Masonry two‑column grid** with lazy loading & pagination
- **Klipy ad tiles** injected into the grid
- **Keyboard‑aware bottom sheet** with sticky tabs & search bar

The main logic lives in `App.tsx` inside the `AppContent` component.

---

## 1. Project Structure (high level)

- **`App.tsx`** – UI and logic for:
  - Provider switcher (Tenor / Klipy)
  - Picker type tabs (GIFs / Stickers / Clips)
  - Search bar and query handling
  - Bottom sheet configuration (`@gorhom/bottom-sheet` v5)
  - Masonry grid layout using `BottomSheetScrollView`
  - Tenor & Klipy API calls and pagination
  - Klipy ad placeholder tiles inside the grid
- **`.env`** – API keys and configuration (loaded via `@env`).
- **`babel.config.js`** – configures `react-native-dotenv` and `react-native-reanimated`.
- **`patches/@gorhom+bottom-sheet+5.2.6.patch`** (expected) – guards a Fabric‑only crash in `useBoundingClientRect`.

---

## 2. Environment Variables

This project uses [`react-native-dotenv`](https://github.com/goatandsheep/react-native-dotenv) and imports values from `@env` inside `App.tsx`.

Create a `.env` file in the project root:

```dotenv
TENOR_API_KEY=YOUR_TENOR_API_KEY
TENOR_CLIENT_KEY=My First Project
TENOR_COUNTRY=US
TENOR_LOCALE=en_US
TENOR_LIMIT=20

KLIPY_BASE_URL=https://api.klipy.co/api/v1
KLIPY_API_KEY=YOUR_KLIPY_API_KEY
```

Type declarations are in `env.d.ts` so TypeScript understands:

```ts
import {
  TENOR_API_KEY,
  TENOR_CLIENT_KEY,
  TENOR_COUNTRY,
  TENOR_LOCALE,
  TENOR_LIMIT,
  KLIPY_BASE_URL,
  KLIPY_API_KEY,
} from '@env';
```

> **Note**: Do not commit real API keys to a public repository.

---

## 3. Setup & Running

Make sure your React Native environment is set up for 0.82: Xcode, Cocoapods, Android SDK, Node 20.

Install JS dependencies:

```bash
yarn install
```

Install iOS pods (first time, or after native dep updates):

```bash
cd ios
pod install
cd ..
```

Start Metro with a clean cache:

```bash
yarn start --reset-cache
```

In another terminal, run iOS:

```bash
yarn ios
```

Android is similar:

```bash
yarn android
```

---

## 4. Bottom Sheet GIF Picker

### 4.1 Provider & tabs

- Provider switcher above the bottom bar: **Tenor** or **Klipy**.
- Inside the sheet:
  - Tabs: **GIFs**, **Stickers**, **Clips**.
  - The tabs and search bar are **sticky** at the top of the sheet.

### 4.2 Opening / closing the sheet

- Bottom "GIFs" button toggles the sheet:
  - Opens to a snap point when closed.
  - Closes the sheet and **dismisses the keyboard** if open.
- Tapping the backdrop or swiping down also closes the sheet and dismisses the keyboard.

### 4.3 Keyboard behaviour

- `keyboardBehavior="interactive"` and `keyboardBlurBehavior="restore"` are used.
- When the search `TextInput` gains focus, the sheet snaps to the highest snap point so the grid stays above the keyboard.
- Closing the sheet (button, backdrop, or pan‑down) calls `Keyboard.dismiss()`.

---

## 5. Masonry Grid, Pagination & Ads

### 5.1 Masonry layout

- Uses `BottomSheetScrollView` instead of `FlatList` for better control.
- Items are mapped to a shared `GridItem` type: `id`, `url`, `width`, `height`.
- A `useMemo` splits `displayItems` into **left** and **right** arrays by accumulating approximate column heights based on aspect ratios.
- Each column is rendered as a vertical stack of tiles; spacing is controlled via `gridItem`, `masonryRow`, and `masonryColumn` styles.

### 5.2 Pagination

- The scroll view’s `onScroll` handler computes distance from bottom and calls `loadMore()` when near the end.
- **Tenor** uses the `next` cursor from API responses.
- **Klipy** uses `page` and `per_page` query parameters (`per_page = 50` in this app).

### 5.3 Klipy ad tiles

- `GridItem` has an optional `isAd` flag.
- For Klipy only, `displayItems` is derived from `items`:
  - After every `KLIPY_AD_FREQUENCY` (default `8`) items, an ad placeholder item is injected.
- `renderGridItem` checks `item.isAd` and renders a simple **Ad** tile (grey box with label) instead of an image.
- You can replace that placeholder with a real ad view (e.g. Klipy ads) or your own component.

To adjust frequency, update the constant in `App.tsx`:

```ts
const KLIPY_AD_FREQUENCY = 8;
```

---

## 6. Patch for `@gorhom/bottom-sheet` on RN 0.82 (Fabric)

On React Native 0.82 (Fabric), the bottom sheet’s `useBoundingClientRect` hook may try to call `ref.current.unstable_getBoundingClientRect()` when it is undefined, causing:

> `ref.current.unstable_getBoundingClientRect is not a function`

This project uses **patch-package** to guard those calls.

### 6.1 How it works

- `package.json` has:

  ```json
  "scripts": {
    "postinstall": "patch-package",
    ...
  }
  ```

- A patch file in `patches/@gorhom+bottom-sheet+5.2.6.patch` modifies `useBoundingClientRect` so it only calls:

  - `unstable_getBoundingClientRect` if it is a **function**.
  - `getBoundingClientRect` if it is a **function**.

- Every time you run `yarn install`, `patch-package` re‑applies this fix.

If you ever update `@gorhom/bottom-sheet`, re‑check that the patch still applies cleanly or regenerate it with:

```bash
npx patch-package @gorhom/bottom-sheet
```

---

## 7. Customization Tips

- **Change snap points**: edit `snapPoints = ['25%', '55%', '90%']` in `AppContent`.
- **Tweak masonry spacing**: adjust `masonryRow`, `masonryColumn`, and `gridItem` styles.
- **Different default provider or tab**: update `useState<Provider>('tenor')` and `useState<PickerType>('gif')`.
- **Search UX**: modify debounce behavior, query trimming, or `TENOR_LIMIT` / `per_page` values.

---

## 8. Troubleshooting

- **`Unable to resolve module @env`**

  - Ensure `.env` exists and `react-native-dotenv` is installed.
  - Confirm `babel.config.js` includes the `module:react-native-dotenv` plugin.
  - Restart Metro with `yarn start --reset-cache` and rebuild (`yarn ios`).

- **BottomSheet crash about `unstable_getBoundingClientRect`**
  - Make sure `patch-package` ran after `yarn install`.
  - Check that the patch file for `@gorhom/bottom-sheet` is present and not conflicting with a newer version.

---

## 9. License

This project is for demonstration and integration reference purposes. Adapt it as needed within your own application and licensing requirements.
