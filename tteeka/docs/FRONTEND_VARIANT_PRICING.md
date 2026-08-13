# F4.3 — Variant Pricing & Price History UX

This document outlines the architecture and UI/UX rules for Variant Pricing in the Tteeka frontend. It fulfills the F4.3 requirement specification.

## Core Domain Principles

1.  **Variant-Specific Pricing:** Pricing is strictly a property of a `ProductVariant`. Products do *not* have prices. A Product is merely a grouping of variants.
2.  **Appended, Never Mutated:** The history of a variant's price is append-only. A "Change Price" action creates a *new* current price snapshot and appends it to the history. Existing history records are immutable.
3.  **BigInt-Safe Decimal Strings:** Money values (`sellingPrice`, `costPrice`) are *always* stored and passed as string representations of integers (e.g., `"85000"`). They are never coerced to a JavaScript `Number` for calculation, as JavaScript numbers lose precision beyond $2^{53}-1$.
4.  **No In-Browser Math:** The frontend does not calculate margins, profits, or taxes. It strictly captures raw integer strings.
5.  **Currency Snapshotting:** Currency is snapshotted from the Merchant's current business settings at the time of saving. If the merchant changes their currency in the future, old history entries retain their original currency snapshot (no FX conversion is performed).

## Permissions & Visibility

Pricing introduces a granular permission model separating *lifecycle management* from *commercial management*.

*   **`CATALOGUE_READ`:** Can see the `sellingPrice` (or "Not priced yet") in the variant list, product lookup, and variant detail panel. Cannot see `costPrice` or history.
*   **`PRICING_MANAGE` (`catalogue.price.manage`):** Required to see the `costPrice`, view the price history, and open the Set/Change Price forms. This permission does *not* grant the ability to activate/archive variants.
*   **`CATALOGUE_MANAGE`:** Required to change the variant's status (Activate, Mark inactive, Archive).
*   **Activation Gate:** A variant can only be activated (transition from `INACTIVE` to `ACTIVE`) if it has a current price. The UI enforces this by disabling the "Activate" button and showing a warning until a price is set.

## Mock Data Architecture (`lib/mock-pricing.ts`)

Pricing state is deliberately separated from the `ProductVariantPreview` object in the mock state to mirror the backend separation of concerns.

*   `VariantCurrentPricePreview`: Represents the active price. Contains `sellingPrice`, `costPrice`, `currency`, and `updatedAt`.
*   `VariantPriceHistoryPreview`: Represents a historical snapshot.
*   `MOCK_MERCHANT_PRICING_FIXTURE`: A map of `workspaceId` → `variantId` → `VariantCurrentPricePreview`.
*   `MOCK_MERCHANT_PRICE_HISTORY_FIXTURE`: A map of `workspaceId` → `variantId` → `VariantPriceHistoryPreview[]`.

## Component Architecture

1.  **`MoneyInput`:** A controlled `input type="text" inputMode="numeric"` component. It strictly filters out non-digit characters on change. It explicitly avoids `type="number"` to prevent scientific notation (e.g., `1e4`) and float inputs.
2.  **`MoneyDisplay`:** A robust display component that parses the string amount using `BigInt` for validation, and uses `Intl.NumberFormat` strictly for adding grouping separators (e.g., `"UGX 85,000"`).
3.  **`VariantPriceForm`:** The dialog (desktop) / sheet (mobile) for setting and changing prices. Features:
    *   **Identical Update Block:** If the user submits the exact same selling price, cost price, and currency, the form closes without firing a save event (preventing redundant history entries).
    *   **Currency Change Warning:** If the variant's existing currency differs from the merchant's current settings, a prominent warning is shown.
4.  **`VariantPriceHistoryPanel`:** A side panel displaying the append-only history, ordered newest first. Distinguishes visually between a `costPrice` of `null` ("Cost not recorded") and `"0"` ("UGX 0").

## Future Considerations (Post-Mock Phase)

When transitioning to a real NestJS API:
*   The `setMockVariantPrice` function will be replaced by a `POST /variants/:id/price` endpoint.
*   The backend will enforce the identical-update block and append the history record transactionally.
*   The BigInt-safe string handling implemented in the UI will seamlessly map to PostgreSQL's `BIGINT` or `DECIMAL` types.
