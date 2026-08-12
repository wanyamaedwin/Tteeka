# Customers and Delivery Locations

## B5 scope

B5 introduces Merchant-owned customer identities and reusable Uganda-first delivery locations. A `Customer` is an operational commerce identity, not an authentication `User`, staff account, Membership, Role, Order, or WhatsApp conversation. The same person may therefore have independent Customer records under different Merchants, and creating a Customer never creates authentication or access-management records.

Customer phones accept `0712345678`, `712345678`, `256712345678`, and `+256712345678` and are persisted and returned as canonical `+256712345678`. A canonical phone is unique within one Merchant across both `ACTIVE` and `ARCHIVED` Customers; another Merchant may use the same phone. Customer names are optional, trimmed, nullable, nonblank when present, and limited to 160 characters.

Customers use exactly `ACTIVE` and `ARCHIVED`. PATCH can archive, restore, change the phone, change the name, or clear the name. There is no hard delete, and archiving never releases the phone identity.

## Delivery locations

A `DeliveryLocation` belongs directly to a Merchant and, through a tenant-safe composite foreign key, to a Customer under that same Merchant. It stores:

- required trimmed `area` (120 characters maximum)
- required trimmed `landmark` (240 characters maximum)
- required canonical Uganda contact `phone`, which may differ from the Customer phone
- nullable trimmed `instructions` (500 characters maximum; blank becomes null)
- nullable absolute HTTP(S) `mapPinUrl` (2,048 characters maximum; blank becomes null)
- exactly `ACTIVE` or `ARCHIVED` status

Locations have no semantic uniqueness rule and can be archived or restored by PATCH. Customer and location lifecycles are independent: changing either status never changes the other. B5 adds no default location, Western postal-address abstraction, geocoding, coordinates, delivery zone, fee, rider, or external map call.

## API and permissions

Every route uses `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard` and returns no-store responses. GET routes require exact `customers.read`; POST and PATCH routes require exact `customers.manage`. Neither Permission implies the other.

Customer routes:

- `GET /api/v1/merchants/:merchantId/customers`
- `POST /api/v1/merchants/:merchantId/customers`
- `GET /api/v1/merchants/:merchantId/customers/:customerId`
- `PATCH /api/v1/merchants/:merchantId/customers/:customerId`

The list supports `q`, normalized exact `phone`, exact `status`, `page` (default 1), and `pageSize` (default 20, maximum 100), ordered by name ascending with nulls last, then phone and ID ascending.

Delivery-location routes:

- `GET /api/v1/merchants/:merchantId/customers/:customerId/delivery-locations`
- `POST /api/v1/merchants/:merchantId/customers/:customerId/delivery-locations`
- `GET /api/v1/merchants/:merchantId/customers/:customerId/delivery-locations/:locationId`
- `PATCH /api/v1/merchants/:merchantId/customers/:customerId/delivery-locations/:locationId`

The location list supports exact `status`, `page`, and `pageSize` with the same bounds, ordered by creation time and ID descending. Nested reads and writes resolve the complete Merchant, Customer, and location scope; foreign or mismatched targets produce the same safe not-found behavior.

## Deferred integration

B5 stores reusable current data only. A future reviewed Order domain can select a Customer and DeliveryLocation and own immutable recipient/location snapshots. B5 does not add Order, Reservation, StockHold linkage, order history, financial aggregates, customer analytics, WhatsApp API records, Redis caching, or automatic Permission grants. `permissions:sync` remains an explicit, idempotent operational command.
