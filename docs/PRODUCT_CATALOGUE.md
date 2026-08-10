# Product Catalogue

B3.1 introduces Product as Tteeka's first core commerce aggregate. A Product belongs directly to one Merchant, uses the repository's database-generated UUIDv7 convention, and contains only bounded catalogue metadata: `name`, nullable `description`, nullable `category`, nullable `brand`, lifecycle `status`, and timestamps. Responses omit `merchantId` because route context identifies the tenant. B3.2 adds dedicated ProductVariant endpoints while keeping Product detail bounded rather than embedding an unbounded child collection.

## Lifecycle and retention

`ACTIVE` means operational catalogue metadata, `INACTIVE` means temporarily inactive but retained, and `ARCHIVED` means retired but retained. All B3.1 transitions are reversible, including restoration from ARCHIVED, because no immutable order or inventory history exists yet. There is no Product DELETE route or production hard-delete operation.

Category and brand are case-preserving nullable strings bounded to 120 characters. Category and Brand tables, taxonomies, and administration are deferred until real requirements justify separate aggregates. Generic JSON metadata/attributes/options remain rejected; B3.2 models only explicit nullable size and colour on sellable ProductVariants.

## Merchant administration API

```text
GET   /api/v1/merchants/:merchantId/products
POST  /api/v1/merchants/:merchantId/products
GET   /api/v1/merchants/:merchantId/products/:productId
PATCH /api/v1/merchants/:merchantId/products/:productId
```

All routes execute `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard`, use no-store/no-cache headers, and treat `merchantContext.merchant.id` as persistence authority. Detail/update scope Merchant and Product IDs together. A missing or foreign Product produces the same generic 404; malformed Product UUIDv7 input produces 400 before store access.

`catalogue.read` permits list/detail. `catalogue.manage` permits create/update/status changes. Exact grant semantics mean manage does not imply read.

Create requires a trimmed nonblank name up to 160 characters. Description is optional/null or trimmed nonblank text up to 2000 characters. Category and brand are optional/null or trimmed nonblank text up to 120 characters. New Products default ACTIVE. PATCH is a strict, nonempty partial of those fields plus `ACTIVE`, `INACTIVE`, or `ARCHIVED`; nullable metadata may be cleared with `null`.

## Search, filters, and pagination

List accepts only `q`, `status`, `category`, `brand`, `page`, and `pageSize`. Search is trimmed nonblank text up to 100 characters and uses PostgreSQL/Prisma case-insensitive containment across name, description, category, and brand. Status is exact. Category and brand use case-insensitive equality without altering stored case. Supplied filters combine with AND while searchable fields combine with OR.

Offset pagination defaults to page 1 and page size 20; page is an integer at least 1 and page size is 1–100. Results order by name ascending then UUID ascending. Count and rows use one Prisma transaction and the same filters. A valid out-of-range page returns 200 with an empty list and accurate totals.

## Authority and deferred scope

PostgreSQL is Product and authorization authority on every request. Product data is not cached in Redis, and operations do not rotate, renew, revoke, or otherwise mutate the global Session. The code-owned Permission catalog expands to eleven keys through B3.2; explicit `npm run permissions:sync` remains idempotent, preserves DEPRECATED and unknown records, and creates no Roles or grants.

B3.2 now gives each Product dedicated Merchant-scoped ProductVariants with SKU/barcode identity, lifecycle, current BIGINT price, currency snapshots, and append-only price history. Product status does not cascade into Variant status. Inventory, stock/holds/warehouses, discounts/promotions, images/media, Category/Brand tables, public storefront, audit/outbox, and Redis catalogue caching remain absent. See [PRODUCT_VARIANTS_PRICING.md](PRODUCT_VARIANTS_PRICING.md).
