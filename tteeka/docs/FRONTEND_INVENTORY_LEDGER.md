# F5.3 — Inventory Ledger UX

This document details the architecture and rules for the Tteeka frontend Inventory Ledger workspace (`/app/inventory/[variantId]/ledger`), fulfilling the F5.3 requirement specification.

## Core Domain Principles

1.  **Append-Only Immutable Architecture:** Ledger entries are historical facts. They cannot be edited, deleted, reordered, reversed, or backdated. All stock corrections must occur through new F5.2 Adjustment movements.
2.  **Ledger vs. Balance Separation:** `InventoryLedgerEntryPublicPreview` provides the historical source of movements. `InventoryBalancePreview` remains the current transactional projection. The Ledger is NEVER used as an entry point for setting quantity directly.
3.  **Variant-Specific Scope:** The ledger is inherently scoped to a single Variant (`/app/inventory/[variantId]/ledger`). There is no global ledger dashboard or recent movements feed.
4.  **AVAILABLE-Only State:** The ledger strictly models movements into and out of the `AVAILABLE` state. Future states (e.g. `HELD`, `DAMAGED`) are not part of F5.3.

## Movement Types & Semantics

The exact supported movement types are displayed with human-friendly labels first, and technical types secondarily for operational clarity:

| Technical Type | Friendly Label | Direction | State Transition | Note Requirement |
| :--- | :--- | :--- | :--- | :--- |
| `RECEIPT` | Stock received | + | `—` to `AVAILABLE` | Optional |
| `ADJUSTMENT_IN` | Stock added | + | `—` to `AVAILABLE` | Required |
| `ADJUSTMENT_OUT`| Stock removed | - | `AVAILABLE` to `—` | Required |

*   **Quantity String Contract:** All quantities, including `balanceBefore` and `balanceAfter`, remain decimal strings. Formatting uses `Intl.NumberFormat` but mathematical coercion through JavaScript `Number` for storage or backend transmission is prohibited.

## Permissions & Isolation

*   **`INVENTORY_READ` Required:** The ledger is only visible if the user holds `inventory.read`.
*   **Manage Does Not Imply Read:** A user with `inventory.manage` but NOT `inventory.read` cannot see the ledger, movement notes, or quantities.
*   **Catalogue Independence:** `catalogue.manage` and `catalogue.price.manage` do not grant access to the ledger.
*   **Merchant Isolation:** The ledger strictly verifies that the Variant belongs to the currently active Merchant. Foreign Variant URLs or workspace switches gracefully reject the view to prevent cross-tenant data leakage.

## Data Projection & Privacy

*   **Public/Redacted Model:** The UI consumes `InventoryLedgerEntryPublicPreview`, which actively redacts the `idempotencyKey` and `requestHash` fields.
*   **No Actor or Document Metadata:** The current endpoint contract does not include "performed by" (actor), Supplier, Invoice, or Purchase Order fields. The frontend does not invent these.

## Coherent Mock Architecture

*   **Seed Fixtures:** Any Variant in `MOCK_MERCHANT_INVENTORY_FIXTURE` with a non-zero balance has coherent seed history populated in `MOCK_MERCHANT_LEDGER_FIXTURE` (usually a "Stock received" entry for the exact amount).
*   **Zero Balance Variants:** A variant with "0" balance may legitimately have NO history (empty state: "No inventory movements yet"). It may also legitimately have history (e.g., Receipt +5, Adjustment Out -5).
*   **Immediate F5.2 Integration:** The `merchant-workspace-provider` immediately merges newly performed session movements (`ledgerOverrides`) with the static seed fixtures. Ledger updates appear instantly without a reload.

## UX & Layout

*   **Newest-First Ordering:** Entries are displayed with the most recent movement at the top (sorted by `createdAt` DESC, then `id` DESC).
*   **Responsive List:** The ledger uses an accessible timeline list, optimized for both desktop and mobile to avoid horizontal scrolling.
*   **Read-Only Detail:** Clicking an entry opens a read-only drawer containing exact string snapshots of the `balanceBefore` and `balanceAfter` transition.
*   **No Filters/Analytics:** The ledger displays the timeline purely. It does not introduce filtering, pagination logic, stock valuation, or aggregate analytics dashboards.
