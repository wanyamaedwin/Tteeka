# Preview mode

The app defaults to `NEXT_PUBLIC_TTEEKA_APP_MODE=mock` when no mode is configured. Mock mode is intentionally design-only: it restores a sample session, uses the existing local preview data, and does not call the NestJS API.

Set `NEXT_PUBLIC_TTEEKA_APP_MODE=live` and provide `NEXT_PUBLIC_TTEEKA_API_BASE_URL` only when integrating with the real backend. Live mode keeps the F1 cookie-based session flow and credentials-included requests.

The preview account is a sample owner identity for design review. It is not a production user, merchant, permission source, or authorization boundary. Mock sign-out only clears in-memory React state and does not persist a fake session or call the backend. Workspace switching, personas, suspended states, disabled memberships, and permission gates are also local design-preview behavior. Authentication and permissions must be verified by the backend when live mode is enabled.

Product, Variant, Pricing, and Inventory (F4.1-F4.3) fixtures and session states are managed in `lib/mock-catalogue.ts`, `lib/mock-variants.ts`, `lib/mock-pricing.ts`, and `lib/mock-inventory.ts`.

*   `mock-variants.ts`: Contains `MOCK_MERCHANT_VARIANTS_FIXTURE` mapping Merchant ID to their initial `ProductVariantPreview` array.
*   `mock-pricing.ts`: Contains `MOCK_MERCHANT_PRICING_FIXTURE` and `MOCK_MERCHANT_PRICE_HISTORY_FIXTURE` separated from variants.
*   `mock-inventory.ts`: Contains `MOCK_MERCHANT_INVENTORY_FIXTURE` providing `InventoryBalancePreview` balances keyed by Variant ID.
