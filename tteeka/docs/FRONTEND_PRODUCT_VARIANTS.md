# F4.2 — Frontend Product Variants, SKU & Barcode UX

**Stage:** F4.2
**Route:** `/app/catalogue/products/[productId]/variants`
**Status:** Complete (F4.2 + F4.3 Pricing Integrated)
**Next stage:** F5 — Inventory Availability (TBD)

---

## 1. Purpose

F4.2 implements a production-quality Product Variant management workspace on `/app/catalogue/products/[productId]/variants` and an exact merchant-scoped SKU/barcode lookup modal on `/app/catalogue/products`. It enables merchants to manage sellable product identities (SKU, barcode, size, colour) with strict merchant-wide SKU and barcode uniqueness, uppercase SKU canonicalization, leading-zero barcode preservation, and independent Product/Variant status lifecycles — all in MOCK MODE without making backend API calls.

---

## 2. Product vs ProductVariant Relationship

```
Merchant
   ↓
Product (F4.1) — High-level descriptive catalogue metadata
   ↓
ProductVariant (F4.2) — The exact sellable identity (SKU, barcode, size, colour)
```

Product describes the catalogue item. ProductVariant represents the exact SKU-identified physical/sellable version.

---

## 3. Variant Fields

- `id`: System-generated string (`var-...`)
- `merchantId`: Owning merchant identifier
- `productId`: Parent product identifier (`product.id`)
- `sku`: Required, uppercase canonicalized, merchant-unique across all products and statuses
- `barcode`: Optional string, leading zeros preserved, merchant-unique across all products and statuses if non-null
- `size`: Optional free-form text (e.g. `"M"`, `"42"`), blank maps to `null`
- `colour`: Optional free-form text (e.g. `"White"`, `"Navy"`), blank maps to `null`
- `status`: Lifecycle state (`ACTIVE` | `INACTIVE` | `ARCHIVED`)
- `createdAt` / `updatedAt`: ISO timestamps

---

## 4. Merchant Ownership

Variants belong to a Merchant via `merchantId`. SKU and barcode uniqueness rules are strictly enforced **PER MERCHANT** across all products within the business workspace.

---

## 5. `productId` Foreign Key Relationship

`ProductVariantPreview` records reference `productId` as a foreign key. Variant arrays are **NOT** embedded directly inside `ProductPreview` objects:

```ts
type ProductVariantPreview = {
  id: string
  merchantId: string
  productId: string
  sku: string
  barcode: string | null
  size: string | null
  colour: string | null
  status: VariantStatus
  createdAt: string
  updatedAt: string
}
```

---

## 6. Separate Variant Collection

Variants are stored in a standalone `variantList` state array per workspace in `MerchantWorkspaceProvider`. `getVariantsForProduct(variantList, productId)` filters variants dynamically by `productId`.

---

## 7. SKU Requirement

SKU is **REQUIRED** for every variant. Labels and help text clearly instruct the user. Auto-generation is prohibited; merchants explicitly supply SKU values.

---

## 8. SKU Uppercase Canonicalization

SKUs are automatically trimmed of outer whitespace and converted to UPPERCASE on save (e.g. `ds-oxf-wht-m` $\rightarrow$ `DS-OXF-WHT-M`).

---

## 9. Merchant-Wide SKU Uniqueness

SKU uniqueness is enforced across the **entire Merchant workspace** (including ACTIVE, INACTIVE, and ARCHIVED variants across all products). Two different products under the same merchant cannot share a SKU. Different merchants may reuse SKUs without conflict.

---

## 10. Barcode Optional

Barcode is optional. Blank inputs map to `null`.

---

## 11. Barcode Preserved as String

Barcodes are handled strictly as **STRINGS**. Leading zeros are preserved (e.g. `001234567890` remains `"001234567890"`). Barcodes are **never** converted to JavaScript Numbers.

---

## 12. Leading Zeros Preserved

Because barcodes are strings, leading zeros are fully retained in display, storage, and validation.

---

## 13. Merchant-Wide Barcode Uniqueness

If a barcode is non-null, it must be unique across all variants in the Merchant workspace (across all products and statuses). Duplicate barcodes within the same merchant trigger a validation error:
> This barcode is already used by another variant.

---

## 14. Optional Size Field

Free-form text string (max 60 chars). No rigid size taxonomy or size table exists. Blank maps to `null`.

---

## 15. Optional Colour Field

Free-form text string (max 60 chars). No rigid colour taxonomy exists. Blank maps to `null`.

---

## 16. No Size / Colour Taxonomy

Size and Colour are optional metadata fields. A variant may have size only, colour only, both, or neither (rendering presentational label `"Standard variant"`).

---

## 17. New Variant Status Starts INACTIVE

Newly created variants automatically start with `status: 'INACTIVE'`. No status dropdown is presented during variant creation.

---

## 18. Activation Requires Current Price

Per NestJS backend rules, a variant cannot become `ACTIVE` until it has a current price. This is now fully implemented (via F4.3 integration) — the "Activate variant" button is disabled with a "Set a price before activating" warning if the variant is unpriced.

---

## 19. New Variants Require Pricing to Activate

New variants remain `INACTIVE` until a user with `catalogue.price.manage` sets a price (F4.3 functionality), after which a user with `catalogue.manage` can activate them.

---

## 20. Variant Status Lifecycle

Valid statuses: `ACTIVE`, `INACTIVE`, `ARCHIVED`.

---

## 21. Product / Variant Lifecycle Independence

Product status and Variant status are completely independent:
- Archiving a Product does **NOT** archive its Variants.
- Reactivating a Product does **NOT** alter Variant statuses.
- Archiving a Variant does **NOT** archive the parent Product.

---

## 22. No Hard Delete

There is **NO** `Delete variant` or permanent removal action. Variants are preserved in database history.

---

## 23. Restore-as-INACTIVE Preview Behavior

Restoring an `ARCHIVED` variant sets its status to `INACTIVE` (not `ACTIVE`), avoiding an activation bypass before pricing is set.

---

## 24. Product-Specific Variant Workspace

Located at `/app/catalogue/products/[productId]/variants`. Renders breadcrumb, product header with product status badge, independence disclaimer, and variant list.

---

## 25. Variant Detail

Slide-in sheet displaying Product Name, Variant label, SKU (monospace), Barcode (monospace), Size, Colour, Status badge, Created date, and Updated date. Excludes pricing, cost, currency, and stock sections.

---

## 26. Exact SKU / Barcode Lookup

Triggered by *"Find variant"* button on `/app/catalogue/products`. Opens `VariantLookupDialog`. Performs exact merchant-scoped lookup by SKU (uppercase canonicalized) or Barcode (exact string matching).

---

## 27. Lookup Merchant Isolation

Lookup queries strictly target `workspace.id`. Identical SKUs or barcodes in other merchants are never returned.

---

## 28. Archived Lookup

Exact lookup finds `ARCHIVED` variants as well as `ACTIVE` and `INACTIVE` variants, displaying their archived status badge clearly.

---

## 29. `catalogue.read` Permission

Grants access to view variant lists, variant details, and perform exact SKU/barcode lookups.

---

## 30. `catalogue.manage` Permission

Grants access to add variants, edit variant identity (SKU, barcode, size, colour), mark active variants inactive, archive variants, and restore archived variants as inactive.

---

## 31. No Manage-Implies-Read

`catalogue.manage` does **not** automatically grant `catalogue.read`.

---

## 32. `catalogue.price.manage` Does Not Grant Variant Read

`catalogue.price.manage` alone does **not** grant access to view variant lists, details, or lookup dialogs.

---

## 33. Read-Only UX

Users with `catalogue.read` but not `catalogue.manage` can view variants and use exact lookup. Add, Edit, and lifecycle action buttons are hidden with a *"View only"* notice.

---

## 34. Manage-Only UX

Direct access to variant list routes without `catalogue.read` renders `AccessDenied` to prevent unauthorized data discovery.

---

## 35. Mock State Persistence

Variant additions, updates, and status transitions persist in React session state per workspace in `MerchantWorkspaceProvider`.

---

## 36. Merchant Isolation

Switching merchants resets active variant detail panels, closes lookup modals, and loads only the destination merchant's variants.

---

## 37. Unsaved-Change Handling

Variant Add/Edit forms track dirty state. Unsaved changes prompt confirmation on modal close or workspace switch.

---

## 38. Pricing Integrated (F4.3)

Selling price, cost price, currency, and price history are managed separately in `mock-pricing.ts` (see `FRONTEND_VARIANT_PRICING.md`). Prices are mapped to variants dynamically and never stored within the `ProductVariantPreview` object.

---

## 39. No Inventory in F4.2 / F4.3

No stock quantities, stock holds, or inventory ledger entries exist in F4.2.

---

## 40. No API Calls in Mock Mode

All interactions run via synchronous session state mutators in `MerchantWorkspaceProvider` (`addMockVariant`, `updateMockVariant`, `updateMockVariantStatus`).

---

## 41. Future Live Variant Routes

When live backend integration is enabled:

```
GET   /merchants/:merchantId/products/:productId/variants
POST  /merchants/:merchantId/products/:productId/variants
GET   /merchants/:merchantId/products/:productId/variants/:variantId
PATCH /merchants/:merchantId/products/:productId/variants/:variantId
GET   /merchants/:merchantId/variants/lookup
```

---

## 42. F4.3 Pricing Completed

Stage F4.3 has introduced price assignment and price history, enabling variant activation. See `FRONTEND_VARIANT_PRICING.md` for full pricing documentation.

---

## Component Reference

| Component | File | Purpose |
|---|---|---|
| `VariantList` | `components/catalogue/variant-list.tsx` | Desktop table & mobile cards for product variants |
| `VariantDetailPanel` | `components/catalogue/variant-detail-panel.tsx` | Slide-in detail sheet for variant metadata & actions |
| `VariantFormDialog` | `components/catalogue/variant-form-dialog.tsx` | Add & Edit variant form modal with SKU/barcode uniqueness checks |
| `VariantStatusConfirmDialog` | `components/catalogue/variant-status-confirm-dialog.tsx` | Status transition confirmation dialogs |
| `VariantLookupDialog` | `components/catalogue/variant-lookup-dialog.tsx` | Exact SKU / barcode search modal for catalogue users |
