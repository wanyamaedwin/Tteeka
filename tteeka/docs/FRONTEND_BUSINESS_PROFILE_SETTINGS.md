# F3.1 — Frontend Business Profile & Settings

**Stage:** F3.1
**Routes:** `/app/business/profile` · `/app/business/settings`
**Status:** Complete
**Next stage:** F3.2 — Staff Management

---

## 1. Purpose

F3.1 turns the placeholder Business Profile and Settings screens into polished, production-quality business-management UX. Both pages implement full permission-aware read/edit flows, dirty-state handling, mock-mode saves, and workspace-switch protection.

---

## 2. Mock-mode design

All F3.1 interactions run in **MOCK MODE**. No API calls are made.

- Mock business data lives on each `MerchantWorkspace` object in `lib/workspaces.ts`.
- `MerchantWorkspaceProvider` maintains per-workspace session overrides in React state (`profileOverrides`, `settingsOverrides`).
- When the user saves in mock mode, `updateMockProfile` or `updateMockSettings` is called. The overlay is merged with the static mock data.
- Switching away and back during the same session preserves saved values.
- No `localStorage` is used. No backend request is made.

---

## 3. Business Profile fields

| Field | Backend contract | Frontend |
|---|---|---|
| `displayName` | `string` (required) | Required, trim whitespace, preserve casing |
| `legalName` | `string \| null` | Optional — blank clears to null |
| `phone` | `string \| null` | Optional — light UX validation only |
| `email` | `string \| null` | Optional — basic email format check when non-empty |

---

## 4. Business Settings fields

| Field | Backend contract | Frontend |
|---|---|---|
| `currency` | `string` (ISO 4217) | Select from curated list; store canonical code e.g. `UGX` |
| `timezone` | `string` (IANA) | Select from curated list; store identifier e.g. `Africa/Kampala` |

No other settings fields are implemented. Future settings domains (delivery, payments, stock, receipts, notifications) are not started.

---

## 5. Read/manage permission separation

F3.1 implements **exact** permission checks. Manage does **not** imply read. Read does **not** imply manage.

| Permission | What it grants |
|---|---|
| `MERCHANT_PROFILE_READ` | View saved profile values |
| `MERCHANT_PROFILE_MANAGE` | Edit and save profile values |
| `MERCHANT_SETTINGS_READ` | View saved settings values |
| `MERCHANT_SETTINGS_MANAGE` | Edit and save settings values |

These are checked via `hasPermission()` from `useMerchantWorkspace()`. They are UX-only frontend checks. The backend remains authoritative during live integration.

---

## 6. Read-only UX

When the user has `MERCHANT_PROFILE_READ` but **not** `MERCHANT_PROFILE_MANAGE`:

- Profile values are displayed in `BusinessProfileView` read-only mode.
- A subtle "View only" label is shown.
- No Edit button, Save button, or editable inputs are rendered.

Equivalent behaviour applies to `MERCHANT_SETTINGS_READ` without `MERCHANT_SETTINGS_MANAGE`.

---

## 7. Manage-only PATCH-style UX

When the user has `MERCHANT_PROFILE_MANAGE` but **not** `MERCHANT_PROFILE_READ`:

- Existing profile values are **never shown** (manage does not imply read).
- A card is displayed: *"Business profile management — You can update business information, but your current workspace permissions do not allow you to view the saved profile."*
- An "Update profile" button opens a **blank form** (prefilled=false).
- All fields are optional individually.
- At least one non-empty field is required before Save enables.
- Only entered fields are included in the patch.

Equivalent behaviour applies to manage-without-read on settings.

---

## 8. Dirty state

Dirty state is computed by comparing current form values against the **saved snapshot** (`profile` or `settings` from the workspace provider).

- In **full mode** (prefilled=true): dirty if any value differs from saved.
- In **patch mode** (prefilled=false): dirty if any field is non-empty.

The `onDirtyChange` prop propagates dirty state to the page, which registers a `switchGuardFn` with the workspace provider.

---

## 9. Cancel behaviour

If the user clicks **Cancel** with no changes: editing mode exits immediately.

If the user clicks **Cancel** with unsaved changes: `UnsavedChangesDialog` opens.

- **Keep editing** → dialog closes, form remains.
- **Discard changes** → form resets to saved values, editing mode exits.

---

## 10. Mock save behaviour

1. `handleSave(patch)` is called from the form's `onSave` prop.
2. In mock mode: a 400 ms artificial delay simulates a network round trip.
3. `updateMockProfile(patch)` or `updateMockSettings(patch)` is called on the provider.
4. The provider merges the patch into the session overlay for the active workspace.
5. The page exits edit mode.
6. A toast notification fires: *"Business profile updated."* or *"Business settings updated."*
7. In live mode: `handleSave` is a no-op pending API integration.

---

## 11. Unsaved-change protection

`UnsavedChangesDialog` (`components/business/unsaved-changes-dialog.tsx`) is a modal with:

- Title: "Discard unsaved changes?"
- Body: context-specific description
- **Keep editing** (default focus) — closes dialog
- **Discard changes** — confirms navigation/switch

It is reused in two situations:

1. **Cancel while dirty** — triggered by the Cancel button.
2. **Workspace switch while dirty** — triggered by the sidebar workspace switcher.

It is keyboard-accessible: focus-trapped, Escape = Keep editing.

---

## 12. Merchant switching while dirty

The `MerchantWorkspaceProvider` exposes `registerSwitchGuard(fn)`.

When a profile or settings page enters edit mode, it registers a guard. When the workspace switcher calls `requestWorkspaceSwitch(id)`, the guard fires and returns `false` (blocking the switch). The page then shows `UnsavedChangesDialog`.

If the user discards changes: the guard is removed, the switch proceeds via the direct `switchWorkspace(id)` call.

If the user keeps editing: the switch is cancelled.

---

## 13. Currency snapshot explanation

Changing the business `currency` field applies **to new price updates only**. It is a metadata field on the merchant, not a trigger for rewriting existing price records.

All existing price records keep the currency code they were recorded with. This is explained inline in both `BusinessSettingsView` (read mode) and `BusinessSettingsForm` (edit mode), and via the `SettingsInfoCallout` which appears when the selected currency differs from the saved value.

---

## 14. No FX conversion

No exchange rate logic is implemented. No currency arithmetic is performed. The frontend stores and displays IANA currency codes. The backend is authoritative for any price-related business logic.

---

## 15. Timezone semantics

The timezone field stores **IANA timezone identifiers** (e.g. `Africa/Kampala`), not UTC offset strings (e.g. `UTC+3`). The `TIMEZONE_OPTIONS` list in `lib/workspaces.ts` contains valid IANA IDs with human-readable labels. The backend stores and uses the identifier; the frontend simply selects and displays it.

---

## 16. Frontend validation is UX only

Frontend validation is light by design:

- Display name: required, non-blank.
- Email: basic `@` / `.` format check when non-empty.
- Phone: no normalization — accepted as entered.

The NestJS/Zod backend remains authoritative during live integration. Frontend validation errors use plain English messages, not technical schema names.

---

## 17. Backend remains future authority

All save operations in mock mode simulate the outcome of:

```
PATCH /merchants/:merchantId/profile
PATCH /merchants/:merchantId/settings
```

The actual HTTP calls are deferred. The endpoint shape is already defined in `lib/api/endpoints.ts`:

```ts
merchant.profile(merchantId) // → /merchants/:id/profile
merchant.settings(merchantId) // → /merchants/:id/settings
```

---

## 18. No unsupported settings

The following are explicitly **not implemented** in F3.1:

- Address
- Logo upload
- Business category
- TIN / registration number
- Website / WhatsApp
- Delivery fee / COD
- Return policy
- Stock hold duration
- Receipt / payment settings
- Notifications
- Mobile Money settings

---

## 19. Live integration deferred

In live mode (`NEXT_PUBLIC_TTEEKA_APP_MODE=live`):

- `isMockMode()` returns `false`.
- `updateMockProfile` and `updateMockSettings` are no-ops.
- The save handlers currently do nothing in live mode (no API call).
- Live mode does **not** silently fall back to mock profile or settings data.

API integration will be wired in a future stage once the backend is accessible from the frontend deployment.

---

## 20. F3.2 — Staff Management next

F3.1 is complete. F3.2 (Staff Management) has **not** been started.

---

## Component reference

| Component | File | Purpose |
|---|---|---|
| `BusinessProfileView` | `components/business/business-profile-view.tsx` | Read-only profile display |
| `BusinessProfileForm` | `components/business/business-profile-form.tsx` | Editable profile form with dirty state |
| `BusinessSettingsView` | `components/business/business-settings-view.tsx` | Read-only settings display |
| `BusinessSettingsForm` | `components/business/business-settings-form.tsx` | Editable settings form with dirty state |
| `UnsavedChangesDialog` | `components/business/unsaved-changes-dialog.tsx` | Discard-changes confirmation modal |
| `SettingsInfoCallout` | `components/business/settings-info-callout.tsx` | Currency-change warning callout |
| `ToastProvider` / `useToast` | `components/ui/toast.tsx` | Success/error notification system |

---

## Mock workspace permission matrix

| Workspace | Profile Read | Profile Manage | Settings Read | Settings Manage |
|---|---|---|---|---|
| Dstyle Hub (OWNER) | ✅ | ✅ | ✅ | ✅ |
| Urban Steps (MANAGER) | ✅ | ❌ | ✅ | ❌ |
| Classic Wear (SUSPENDED) | ✅ | ❌ | ❌ | ❌ |
| Dstyle Hub — Disabled | ❌ | ❌ | ❌ | ❌ |
| Dstyle Hub — Manage only | ❌ | ✅ | ❌ | ✅ |
