# F5.2 — Inventory Movements UX

This document details the architecture and rules for the Tteeka frontend Inventory Movements workspace (`/app/inventory` actions), fulfilling the F5.2 requirement specification.

## Core Domain Principles

1.  **AVAILABLE-Only Scope:** F5.2 only implements movements that affect the `AVAILABLE` inventory state. No other states (e.g., HELD, RESERVED, PACKED, IN_TRANSIT) are modeled.
2.  **Supported Movement Types:** The exact supported movement types are:
    *   `RECEIPT` (from `null` to `AVAILABLE`)
    *   `ADJUSTMENT_IN` (from `null` to `AVAILABLE`)
    *   `ADJUSTMENT_OUT` (from `AVAILABLE` to `null`)
3.  **Balance vs. Ledger Separation:** `InventoryBalancePreview` remains the current projected state. `InventoryLedgerEntryPreview` represents an append-only historical movement record.
4.  **Quantity String Contract:** Quantity is always handled and stored as a positive integer decimal string (e.g., `"1", "5", "100"`). It is never coerced to a JavaScript `Number`.
5.  **BIGINT-Safe Arithmetic:** Addition and subtraction are performed safely via `BigInt` (e.g., `BigInt(before) + BigInt(qty)`).
6.  **No Direct Balance Set:** Users cannot directly type "Set stock to 50". All corrections go through `RECEIPT`, `ADJUSTMENT_IN`, or `ADJUSTMENT_OUT`.

## Movement Rules

### RECEIPT
*   **Purpose:** Record physical stock entering the business.
*   **Semantics:** Increases `AVAILABLE`.
*   **Note:** Optional. Blank strings are normalized to `null`.
*   **Validation:** Rejects zero or negative quantities.

### ADJUSTMENT_IN
*   **Purpose:** Add stock to correct a discrepancy.
*   **Semantics:** Increases `AVAILABLE`.
*   **Note:** REQUIRED.
*   **Validation:** Rejects zero or negative quantities.

### ADJUSTMENT_OUT
*   **Purpose:** Remove stock to correct a discrepancy.
*   **Semantics:** Decreases `AVAILABLE`.
*   **Note:** REQUIRED.
*   **Validation:** Rejects zero or negative quantities. Prevents negative stock (i.e., you cannot remove more than is available). Exact zero-balance removal is allowed.

## Atomic & Append-Only State

*   **Mock Atomicity:** The mock command helper (`applyMockInventoryMovement`) handles calculation, idempotent conflict checks, ledger append, and balance projection inside a single logical request.
*   **Append-Only:** Movements cannot be edited or deleted once created. Corrections require a subsequent adjustment.
*   **Ledger (F5.3):** The frontend generates the append-only `InventoryLedgerEntryPreview` records which are instantly consumed and rendered by the F5.3 Inventory Ledger.

## Idempotency Architecture

Every movement request enforces an `Idempotency-Key`.
*   **Generation:** The UI generates one key (e.g., UUID) per logical submit attempt upon form mount.
*   **Replay:** If a request with the exact same key and same payload is submitted again, it returns an exact replay success without double-mutating stock.
*   **Conflict:** If a request with the same key but a *different* payload is submitted, it simulates a 409 Conflict.
*   **Scoping:** Keys are unique per `merchantId`.
*   **Privacy:** Keys are not exposed to users in the UI.

## Permissions & Isolation

*   **`INVENTORY_MANAGE`:** Required to see the "Receive stock" and "Adjust stock" actions.
*   **Read vs Manage:** `INVENTORY_MANAGE` does not imply `INVENTORY_READ`. Users with only manage permissions still see the restricted state ("You can manage but not view") and do not see the general inventory directory or movement buttons on the directory.
*   **Catalogue Independence:** `CATALOGUE_MANAGE` does not grant inventory access.
*   **Lifecycle Independence:** Movements can be performed on variants regardless of their pricing status, active status, or archive status.
*   **Merchant Isolation:** Movements are strictly validated and scoped to the active `merchantId`. A dirty form during a workspace switch uses standard discard protections to prevent cross-merchant contamination.

## No Analytics or Valuation
F5.2 does not multiply inventory quantities by prices. There is no stock valuation UI, low stock logic, reorder rules, warehouse concepts, or sales movement integration.
