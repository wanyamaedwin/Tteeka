# F5.1 — Inventory Availability UX

This document outlines the architecture, rules, and mock state for the Tteeka frontend Inventory Availability workspace (`/app/inventory`). It fulfills the F5.1 requirement specification.

## Core Domain Principles

1.  **Inventory is Separate from Product:** Inventory is *not* a property of a Product. It is not embedded in the `ProductPreview` object.
2.  **Inventory is Keyed by Variant:** Inventory is tracked per `ProductVariant`. However, it is not embedded in the `ProductVariantPreview` object. It exists in its own separate `InventoryBalancePreview` collection, joined at render time.
3.  **AVAILABLE-Only Scope:** F5.1 only implements the `AVAILABLE` inventory state. Concepts like HELD, RESERVED, PACKED, or DAMAGED are deferred to future stages (F5.2+).
4.  **Balance vs. Ledger Separation:** `InventoryBalancePreview` represents the current transactional state. F5.1 does *not* include an inventory ledger (movement history). The ledger will be a separate entity introduced in F5.3.
5.  **Quantity String Contract:** Quantity is *always* handled, stored, and passed as a non-negative decimal string (e.g., `"0"`, `"24"`, `"1000000"`). It is never coerced to a JavaScript `Number` for calculation, preventing precision loss. BigInt is used solely for display formatting.

## Zero-Balance Semantics & Empty States

*   **Derived Zero:** If a variant has no corresponding `InventoryBalancePreview` record in the fixture, it is inherently considered to have `"0"` available stock.
*   **All Variants Displayed:** The inventory list displays *all* valid variants for the merchant, including those with zero stock (derived or explicit).
*   **Empty Directory:** The inventory directory is only considered "empty" if the merchant has *zero* variants in total.
*   **"0 available" over "Out of stock":** F5.1 provides quantity visibility only. It does not derive business lifecycle statuses like "Out of stock". A zero balance simply displays as `"0 available"`.

## Lifecycle Independence

Inventory quantities are resilient to product and variant lifecycle changes.

*   **Archived/Inactive Variants:** Variants that are `INACTIVE` or `ARCHIVED` remain visible in the inventory list if they exist in the variant directory. Their quantities are not automatically zeroed out.
*   **Unpriced Variants:** Pricing and inventory are independent. An unpriced variant will still appear in the inventory list.
*   **Variant Changes:** Changing a variant's SKU, size, or colour immediately reflects in the inventory list since the data is joined by reference.

## Search, Filtering, and Pagination

The inventory list provides server-style data controls:

*   **Search:** Substring matching across Product Name, SKU, Barcode, Size, and Colour.
*   **Product Filter:** Filters variants by a specific `productId` or all products for the current merchant.
*   **Variant Status Filter:** Filters by variant lifecycle status (`ACTIVE`, `INACTIVE`, `ARCHIVED`). Note that this does *not* filter by inventory state (which is always `AVAILABLE`).
*   **AND Semantics:** Filters are combined using logical AND.
*   **Pagination:** Server-style pagination (page, pageSize, totalPages) with stable clamping.
*   **Deterministic Ordering:** Results are strictly ordered by: Product Name ASC → SKU ASC → Variant ID ASC.

## Permissions & Visibility

*   **`INVENTORY_READ`:** Grants access to the inventory list, quantities, search, filters, and detail panel.
*   **`INVENTORY_MANAGE`:** Required to modify inventory (actions deferred to F5.2).
*   **Exact Independence:** Having `INVENTORY_MANAGE` does *not* imply `INVENTORY_READ`. If a user has manage-only access, they see a restricted state explaining they can make changes (via future workflows) but cannot view current balances.
*   **Catalogue Isolation:** `CATALOGUE_READ` or `CATALOGUE_MANAGE` do *not* grant access to inventory data.

## Mock State Architecture (`lib/mock-inventory.ts`)

*   **`InventoryBalancePreview`:** Represents a balance snapshot `{ merchantId, variantId, state: 'AVAILABLE', quantity: string }`.
*   **Merchant Isolation:** The list safely enforces isolation by matching against the merchant's current `productList`.
*   **F5.2 Movements Integration:** `inventoryOverrides` captures session-based mutations (RECEIPT, ADJUSTMENT_IN, ADJUSTMENT_OUT) through an atomic helper that updates the projected Balance while appending to an immutable mock ledger.
*   **F5.3 Ledger Integration:** The immutable movement history is securely projected into the dedicated `/app/inventory/[variantId]/ledger` workspace. There are no direct balance-set endpoints, warehouse concepts, valuation logic, or low-stock alerts.
