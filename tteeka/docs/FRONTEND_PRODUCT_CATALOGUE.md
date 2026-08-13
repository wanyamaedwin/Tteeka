# F4.1 — Frontend Product Catalogue Management

**Stage:** F4.1 & F4.2
**Route:** `/app/catalogue/products`
**Status:** Complete
**Next stage:** F5 — Inventory Availability (TBD)

---

## 1. Purpose

F4.1 implements a production-quality Product Catalogue Management UX on `/app/catalogue/products`. It enables merchants to view products, search across name/description/category/brand, filter by status, category, and brand, paginate deterministically ordered results, inspect product details, create new products, edit existing product metadata, and manage product status lifecycles (`ACTIVE` / `INACTIVE` / `ARCHIVED`) — all in MOCK MODE without making backend API calls.

---

## 2. Core Domain Distinction: Product Aggregate

This stage manages **PRODUCTS ONLY**.

A Product represents high-level descriptive catalogue metadata (Name, Description, Category, Brand, Status).

```
Product (F4.1)
   ↓
ProductVariant (F4.2)
   ↓
SKU / Barcode / Price / Stock (F4.2 / F4.3 / F5)
```

Product is **NOT** the sellable stock identity. Product pages in F4.1 strictly exclude SKU, barcode, size, colour, selling price, cost price, currency, price history, stock quantity, available quantity, or warehouse balances.

---

## 3. Product vs ProductVariant Separation

F4.1 defines `ProductPreview` without embedded variant arrays. Future stage F4.2 will attach `ProductVariantPreview` records using `productId` as a foreign key:

```ts
ProductPreview {
  id: string
  merchantId: string
  name: string
  description?: string | null
  category?: string | null
  brand?: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}
```

---

## 4. Merchant Ownership

Products belong to exactly one Merchant (`merchantId`). Products are strictly isolated in mock session state — switching merchants resets active view selection, closes form sheets, and loads the target merchant's product catalogue without cross-tenant data leakage.

---

## 5. Product Fields

- `id`: System-generated string (`prod-...`)
- `merchantId`: Owning merchant identifier
- `name`: Required, max 160 characters, outer whitespace trimmed, case preserved
- `description`: Optional, max 2000 characters, outer whitespace trimmed, blank maps to `null`
- `category`: Optional free-form text, max 120 characters, blank maps to `null`
- `brand`: Optional free-form text, max 120 characters, blank maps to `null`
- `status`: Lifecycle state (`ACTIVE` | `INACTIVE` | `ARCHIVED`)
- `createdAt` / `updatedAt`: ISO timestamps

---

## 6. Product Status Lifecycle

Valid statuses are `ACTIVE`, `INACTIVE`, and `ARCHIVED`.

```
          ┌──────────────┐
          │    ACTIVE    │
          └──────┬───────┘
            ▲    │
 mark-active│    │mark-inactive
            │    ▼
          ┌──────────────┐
          │   INACTIVE   │
          └──────┬───────┘
            ▲    │
            │    │archive
            │    ▼
          ┌──────────────┐
          │   ARCHIVED   │
          └──────────────┘
```

---

## 7. ACTIVE Status

Default status for newly created products. Active products appear normally in catalogue lists.

---

## 8. INACTIVE Status

Temporarily de-activates a product while keeping it in the catalogue. Transition from `ACTIVE` to `INACTIVE` uses a lightweight confirmation dialog explaining:
> This keeps the product in your catalogue but marks it as inactive.

---

## 9. ARCHIVED Status

Archives a product. Confirmation copy clarifies:
> The product will remain in Tteeka and can be restored at any time.

---

## 10. Reversible Status Transitions

All status changes are reversible:
- `INACTIVE` $\rightarrow$ `ACTIVE` via *Reactivate product*
- `ARCHIVED` $\rightarrow$ `ACTIVE` via *Restore product*

---

## 11. No Hard Delete

There is **NO** `Delete product` or permanent removal action. Products are preserved in database history.

---

## 12. Non-Unique Product Names

The backend deliberately allows duplicate Product names. Multiple products with the same name (e.g. "Classic Oxford Shirt") can exist under the same merchant. Identity is governed strictly by `product.id`.

---

## 13. Nullable Description UX

If `description` is `null` or blank, the detail view displays `"No description"` in italic secondary text rather than `null`, `undefined`, or `-`.

---

## 14. Category as Free-Form Metadata

Category is free-form text (`"Men's Shirts"`, `"Trousers"`, `"Footwear"`). It is not linked to a rigid category tree. Blank values map to `null` and render as `"Not specified"`.

---

## 15. Brand as Free-Form Metadata

Brand is free-form text (`"Dstyle"`, `"Urban Form"`, `"Northline"`). Blank values map to `null` and render as `"Not specified"`.

---

## 16. No Category CRUD

There are no UI components to create, rename, or delete category entities.

---

## 17. No Brand CRUD

There are no UI components to manage brand entities.

---

## 18. Product List

- **Desktop:** Operational table displaying *Product* (Name + 1-line description preview), *Category*, *Brand*, *Status*, *Updated*, and *Actions*.
- **Mobile:** Structured cards showing product name, status badge, category, brand, and action menu without horizontal table overflow.

---

## 19. Search Semantics

Search performs case-insensitive substring matching across `name`, `description`, `category`, and `brand`. Blank or whitespace search acts as no filter.

---

## 20. Filters

Toolbar dropdowns allow filtering by:
- **Status:** `All statuses`, `ACTIVE`, `INACTIVE`, `ARCHIVED`
- **Category:** `All categories` + dynamically derived categories from current merchant products
- **Brand:** `All brands` + dynamically derived brands from current merchant products

---

## 21. Combined-Filter Semantics

Filters combine using strict **AND** logic (Search AND Status AND Category AND Brand). A *"Clear filters"* button appears whenever any search term or dropdown filter is active.

---

## 22. Pagination

Pagination uses server-pagination shape:

```ts
{
  page: number,
  pageSize: number,
  total: number,
  totalPages: number
}
```

Page size options: 10, 20, 50 (max 100). Filtering automatically resets the view to Page 1. Clamps out-of-range pages safely.

---

## 23. Deterministic Ordering

Matches backend ordering: `name ASC`, then `id ASC`.

---

## 24. Product Detail

Side-panel / Sheet showing Name, Description, Category, Brand, Status badge, Created date, and Updated date. Excludes pricing, SKU, and stock sections.

---

## 25. Create Product

Opened via *Add product* button (`catalogue.manage` required). Fields: Name (required), Description (optional), Category (optional), Brand (optional).

---

## 26. ACTIVE Default on Create

New products automatically start with `status: 'ACTIVE'`. The create form does not expose a status selector (matching backend POST contract).

---

## 27. Edit Product

Allows updating Name, Description, Category, and Brand. Pre-fills existing values.

---

## 28. `catalogue.read` Permission

Grants access to view the product list, search, filter, paginate, and open product detail panels.

---

## 29. `catalogue.manage` Permission

Grants access to add products, edit products, and execute lifecycle actions (*Mark inactive*, *Reactivate*, *Archive*, *Restore*).

---

## 30. No Manage-Implies-Read

`catalogue.manage` does **not** automatically grant `catalogue.read`. Permissions are evaluated independently.

---

## 31. `catalogue.price.manage` Does Not Grant Product Read

Holding pricing permission alone does **not** grant access to discover or view product catalogue lists in F4.1.

---

## 32. Read-Only UX

Users with `catalogue.read` but not `catalogue.manage` see the full catalogue list and details with a subtle *"View only"* notice. *Add product*, *Edit product*, and status transition buttons are hidden.

---

## 33. Manage-Only UX

Users with `catalogue.manage` but not `catalogue.read` see a dedicated *"Product management"* card with an *Add product* button. The existing product list is hidden to prevent unauthorized data discovery. Created products trigger a toast (*"Product added."*) without leaking catalogue records.

---

## 34. Mock Product State

State is maintained per-merchant in `productOverrides` within `MerchantWorkspaceProvider`. Session edits persist when switching between app routes.

---

## 35. Merchant Isolation

Product queries and mutations strictly target `workspace.id`. Switching active merchants clears selection state and loads only the destination merchant's products.

---

## 36. Unsaved-Change Handling

Create/Edit forms track dirty state. Unsaved changes prompt confirmation on modal close or workspace switch.

---

## 37. No Variant/SKU/Barcode in F4.1

No SKU, barcode, size, or colour attributes are rendered or stored.

---

## 38. Pricing Handled in Variants (F4.3)

Selling prices, cost prices, and price history exist strictly at the Variant level (F4.3), not the Product level. F4.1 UI excludes all price fields intentionally.

---

## 39. No Inventory in F4.1

No stock quantities, stock holds, or warehouse locations are referenced.

---

## 40. No API Calls in Mock Mode

All interactions run via synchronous session state mutators in `MerchantWorkspaceProvider` (`addMockProduct`, `updateMockProduct`, `updateMockProductStatus`).

---

## 41. Future Live Product Routes

When live backend integration is enabled:

```
GET   /merchants/:merchantId/products
POST  /merchants/:merchantId/products
GET   /merchants/:merchantId/products/:productId
PATCH /merchants/:merchantId/products/:productId
```

---

## 42. F4.2 & F4.3 Complete

Stage F4.2 introduces `ProductVariant` models (SKU, barcode, size, colour) and Stage F4.3 introduces `Pricing`. Both are now integrated.

---

## Component Reference

| Component | File | Purpose |
|---|---|---|
| `ProductToolbar` | `components/catalogue/product-toolbar.tsx` | Search bar + Status, Category, Brand filter dropdowns |
| `ProductList` | `components/catalogue/product-list.tsx` | Desktop operational table & mobile card view |
| `PaginationControls` | `components/catalogue/pagination-controls.tsx` | Server-pagination control (page, pageSize, total, totalPages) |
| `ProductDetailPanel` | `components/catalogue/product-detail-panel.tsx` | Slide-in detail sheet for product metadata & actions |
| `ProductFormDialog` | `components/catalogue/product-form-dialog.tsx` | Create & Edit product form modal with dirty-state guard |
| `ProductStatusConfirmDialog` | `components/catalogue/product-status-confirm-dialog.tsx` | Status transition confirmation dialogs |
