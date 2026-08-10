# Product Variants and Pricing

B3.2 extends the Merchant catalogue from descriptive Products to exact future sellable identities. A `Product` describes an item family; a `ProductVariant` identifies the concrete SKU that later inventory, orders, reservations, payments, and returns will reference. Inventory itself begins in B4.1 and is not part of this checkpoint.

## Ownership and identity

Every Variant has a database-generated UUIDv7 ID and carries `merchantId` plus `productId`. PostgreSQL enforces `(merchant_id, product_id) -> Product(merchant_id, id)`, so a row cannot combine one Merchant with another Merchant's Product. Product and ProductVariant both expose composite tenant keys, and `(merchant_id, variant_id) -> ProductVariant(merchant_id, id)` similarly protects price history. All foreign keys use restrictive deletion; there is no Product or Variant hard-delete API.

SKU is required, trimmed, uppercased, 1–64 characters, begins with an ASCII letter or digit, and otherwise permits only `A-Z`, `0-9`, `.`, `_`, and `-`. It is unique per Merchant, not globally. SKU correction is allowed before order/inventory history exists. Barcode is optional/null, case-preserving, trimmed, at most 64 characters, permits ASCII letters, digits, `.`, `_`, and `-`, and is unique per Merchant when present. Multiple null barcodes are valid.

Size and colour are independent optional/null, trimmed, case-preserving strings up to 80 characters. Neither is required, their combination is not unique, and no Size, Colour, or generic JSON attributes/options model exists.

## Lifecycle

Variants use `INACTIVE`, `ACTIVE`, and `ARCHIVED` and default to `INACTIVE` with no price or history. `ACTIVE` requires an established current selling price and currency; an unpriced activation receives HTTP 422. A priced Variant may move among all three states, including restoration from ARCHIVED, without losing current price or history.

Product lifecycle changes never rewrite child Variant lifecycle. Administrative Variant APIs remain available for retained Products. Future order eligibility must deliberately consider both Product and Variant state.

## Current price and history

`ProductVariant` stores current `sellingPrice BIGINT`, nullable `costPrice BIGINT`, nullable `priceCurrency CHAR(3)`, and nullable `priceUpdatedAt TIMESTAMPTZ(3)`. Money is integer-only and JSON always represents it as canonical base-10 strings, preserving values above JavaScript's safe-integer range. Selling price must be positive. Cost may be null, zero, positive, or greater than selling price. Inputs above signed PostgreSQL BIGINT (`9223372036854775807`) are rejected before persistence.

Clients cannot submit currency. Each price PUT reads the Merchant's current three-letter currency and snapshots it into both current Variant state and an immutable `VariantPriceHistory` row. Changing Merchant currency does not reinterpret or rewrite existing prices and performs no FX conversion. A later explicit PUT snapshots the then-current currency.

Price PUT is a complete desired-state operation: omitted or null cost means no cost. PostgreSQL row locking serializes writes to a Variant. A changed selling price, cost, or effective currency updates current state and appends exactly one history snapshot in the same transaction. Failure rolls both back. An identical PUT changes neither `priceUpdatedAt` nor history. History is ordered by creation time descending then UUID descending and is append-only; it is domain price history, not a general AuditLog or outbox.

## API and permissions

```text
GET   /api/v1/merchants/:merchantId/products/:productId/variants
POST  /api/v1/merchants/:merchantId/products/:productId/variants
GET   /api/v1/merchants/:merchantId/products/:productId/variants/:variantId
PATCH /api/v1/merchants/:merchantId/products/:productId/variants/:variantId
PUT   /api/v1/merchants/:merchantId/products/:productId/variants/:variantId/price
GET   /api/v1/merchants/:merchantId/products/:productId/variants/:variantId/price-history
GET   /api/v1/merchants/:merchantId/variants/lookup
```

Every route runs `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard`, uses resolved Merchant context as tenant authority, and emits no-store/no-cache headers. Malformed UUIDv7 IDs receive 400. Unknown and foreign nested targets share generic 404 behavior.

- `catalogue.read` permits Variant list, detail, and exact SKU/barcode lookup. It exposes current selling price, currency, and update time, never cost.
- `catalogue.manage` permits Variant creation and SKU/barcode/metadata/lifecycle updates. Create always starts unpriced and INACTIVE; PATCH cannot change Product or price.
- `catalogue.price.manage` permits current-price PUT and price-history reads, including cost.

No catalogue Permission implies another. Manage-only callers cannot read or set price; price-manage-only callers cannot read ordinary detail or patch metadata.

Variant list accepts only `q`, `status`, `page`, and `pageSize`, defaults to page 1/size 50, caps size at 100, searches SKU/barcode/size/colour case-insensitively, and orders SKU then UUID ascending. Product detail remains bounded and never embeds an unbounded Variant collection.

Merchant-wide lookup accepts exactly one of canonicalized `sku` or case-sensitive exact `barcode`, returns any lifecycle state and its `productId`, and never exposes cost. Price history uses page/pageSize with the same 50 default and 100 maximum.

## Deferred boundary

B3.2 contains no inventory quantity, on-hand/available/held/reserved state, stock ledger, reservation, warehouse/bin, order/cart/payment, discounts/promotions/schedules, tax/VAT/FX, Product or Variant images, supplier/purchasing, Category/Brand table, Redis catalogue cache, audit/outbox, or frontend. PostgreSQL remains catalogue and price authority. B4.1 owns inventory.
