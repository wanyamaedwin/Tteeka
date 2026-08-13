# F3.3 — Frontend Roles & Permissions Management

**Stage:** F3.3
**Route:** `/app/team/roles`
**Status:** Complete
**Next stage:** F4.1 — Product Catalogue Workflows

---

## 1. Purpose

F3.3 implements a production-quality Roles & Permissions Management UX on `/app/team/roles`. It enables merchants to view roles, create new roles, edit role metadata, manage role status (`ACTIVE` / `DISABLED`), perform exact desired-state permission assignment from a canonical 13-key permission catalog, and inspect assigned staff counts — all in MOCK MODE without making backend API calls.

---

## 2. Role / Permission architecture

The domain model is:

```
Merchant
  ↓
Role (RolePreview)
  ↓
RolePermission
  ↓
Permission (13 canonical keys)
```

Role names provide **zero authority**. Authority is granted strictly by the exact permission keys attached to a Role. The code never evaluates `if (role.name === 'Administrator')`.

---

## 3. Role names are not authorization

Role names are user-facing presentation labels only. They are not used as permission keys, auth tokens, or conditional guards anywhere in the frontend.

---

## 4. Exact Permission keys

Authority comes exclusively from exact permission key strings (e.g. `merchant.profile.manage`, `catalogue.price.manage`). Friendly labels and descriptions are for human display only.

---

## 5. Canonical 13-key Permission catalog

The catalog in `lib/permissions.ts` contains exactly the 13 production permission keys defined in F2:

```
BUSINESS:
  merchant.profile.read
  merchant.profile.manage
  merchant.settings.read
  merchant.settings.manage

TEAM:
  merchant.staff.read
  merchant.staff.manage
  merchant.roles.read
  merchant.roles.manage

CATALOGUE:
  catalogue.read
  catalogue.manage
  catalogue.price.manage

INVENTORY:
  inventory.read
  inventory.manage
```

No future or placeholder permission keys (e.g. `orders.*`, `inventory.hold`) are present.

---

## 6. Permission grouping

For visual clarity, permissions are displayed in 4 human-readable groups:
- **Business** (`merchant.profile.*`, `merchant.settings.*`)
- **Team** (`merchant.staff.*`, `merchant.roles.*`)
- **Catalogue** (`catalogue.*`, `catalogue.price.manage`)
- **Inventory** (`inventory.*`)

---

## 7. Role list / detail

- **Desktop:** Polished table showing Role name & description, Status badge, Permission count, Assigned staff count, and Actions menu.
- **Mobile:** Responsive cards with badges and accessible menu.
- **Detail Panel:** Slide-in sheet showing role metadata, staff count, and permission grants grouped by category with monospace permission keys.

---

## 8. Role creation

Created via `RoleFormDialog` (modal on desktop, bottom sheet on mobile):
- Fields: Name (required, max 80 chars, case preserved) and Description (optional, max 320 chars).
- Initial creation request does **not** include permission selection.

---

## 9. ACTIVE default

Newly created roles automatically start with `status: 'ACTIVE'`.

---

## 10. Zero grants at creation

Newly created roles start with `permissionKeys: []`. The UI displays a notification banner offering a *"Manage permissions"* shortcut.

---

## 11. Duplicate Role-name conflict

If the user attempts to create or rename a role using an exact duplicate name already present in the current merchant's role list, the UI simulates a `409 Conflict` error:

> A role with this name already exists.

Role names are not automatically appended with `(2)` or lowercased.

---

## 12. Role edit

Editing allows updating Name and Description via `RoleFormDialog`. Dirty-state detection ensures the Save button is disabled when no changes have been made.

---

## 13. ACTIVE / DISABLED lifecycle

Roles have two valid status states: `ACTIVE` and `DISABLED`. There are no `DELETED`, `ARCHIVED`, `DRAFT`, or `SYSTEM` statuses.

---

## 14. No hard delete

Hard deletion is strictly prohibited. Role lifecycle is managed exclusively through `ACTIVE` and `DISABLED` states.

---

## 15. Disabled Role retains staff links

Disabling a role (`updateMockRoleStatus(roleId, 'DISABLED')`) retains all existing `MembershipRole` links in staff memberships. Assigned staff members continue to show the role on their profiles in a disabled state (with strikethrough styling).

---

## 16. Disabled Role retains Permission links

Disabling a role retains its `permissionKeys` array unchanged.

---

## 17. Reactivation behavior

Reactivating a disabled role restores its status to `ACTIVE`. All existing staff assignments and permission grants immediately regain active status without requiring re-assignment.

---

## 18. Exact desired-state Permission replacement

Saving permissions in `PermissionPickerDialog` replaces the entire `permissionKeys` array with the exact set of selected checkboxes. Unchecked permissions are removed (mirrors `PUT /roles/:roleId/permissions`).

---

## 19. Empty Permission set

A role may have zero permissions assigned (`permissionKeys: []`). This is a valid state and displays as *"No permissions assigned"*.

---

## 20. No Permission implication

Permissions are strictly independent:
- `merchant.profile.manage` does **not** auto-select `merchant.profile.read`.
- `inventory.manage` does **not** auto-select `inventory.read`.
- `catalogue.manage` does **not** auto-select `catalogue.read`.
- `catalogue.price.manage` does **not** auto-select anything else.

Help text in the permission picker explicitly clarifies this independence.

---

## 21. Historical / deprecated Permission UX

If a role record contains a permission key not in the canonical 13-key catalog (e.g. historical data), it is displayed in the Role detail and Permission picker under a *"Historical assignments (deprecated)"* section with strikethrough formatting and an explanation that saving will remove it. It cannot be newly assigned to other roles.

---

## 22. Permission catalogue is read-only

The *"Permission catalogue"* tab on `/app/team/roles` provides a searchable view of all 13 active permissions with their friendly labels, descriptions, groups, and exact keys.

---

## 23. No Permission CRUD

Permissions are code-owned by the backend. There are no UI controls to create, edit, rename, or delete permissions.

---

## 24. Read / manage separation

- `ROLES_READ` (or `merchant.roles.read`): Allows viewing role list, role details, and permission catalogue.
- `ROLES_MANAGE` (or `merchant.roles.manage`): Allows creating roles, editing role details, disabling/reactivating roles, and managing permissions.

`manage` does **not** imply `read`.

---

## 25. Manage-only UX

When a user possesses `ROLES_MANAGE` without `ROLES_READ`:
- The existing role list is hidden to prevent unauthorized data access.
- A dedicated card explains that role creation is allowed but viewing existing roles is restricted.
- A *"Create role"* action is available.

---

## 26. Staff integration

F3.2 Staff Management and F3.3 Roles Management share the exact same role state via `MerchantWorkspaceProvider`:
- Renaming a role in F3.3 instantly updates staff role badges in F3.2.
- Disabling a role in F3.3 renders it disabled on staff cards in F3.2.
- Reactivating a role restores active display in F3.2.

---

## 27. Mock-mode persistence

Role data changes persist in React session state (`roleOverrides` in `MerchantWorkspaceProvider`) per workspace. Switching between workspaces and back preserves session edits without using `localStorage`.

---

## 28. No backend requests

All F3.3 interactions operate entirely in MOCK MODE (`isMockMode()`). No `fetch` or HTTP requests are made.

---

## 29. Future live routes

When live backend integration is enabled, the endpoints will be:

```
GET    /merchants/:merchantId/roles
POST   /merchants/:merchantId/roles
PATCH  /merchants/:merchantId/roles/:roleId
PUT    /merchants/:merchantId/roles/:roleId/permissions
GET    /merchants/:merchantId/permissions
```

---

## 30. Frontend authorization is UX only

Frontend permission checks gate UI elements for user guidance. Server-side NestJS guards enforce authoritative authorization.

---

## 31. F4.1 Product Catalogue next

F4.1 Product Catalogue Workflows will begin after Team frontend stages are completed. No F4 code has been created.

---

## Component reference

| Component | File | Purpose |
|---|---|---|
| `RoleList` | `components/roles/role-list.tsx` | Desktop table + mobile cards |
| `RoleDetailPanel` | `components/roles/role-detail-panel.tsx` | Slide-in detail panel with grouped permissions |
| `RoleFormDialog` | `components/roles/role-form-dialog.tsx` | Create & Edit role dialog with duplicate check |
| `RoleStatusConfirmDialog` | `components/roles/role-status-confirm-dialog.tsx` | Disable/reactivate confirmation with staff count |
| `PermissionPickerDialog` | `components/roles/permission-picker-dialog.tsx` | Desired-state permission picker with diff review |
| `PermissionCatalogue` | `components/roles/permission-catalogue.tsx` | Searchable read-only 13-key permission catalog |

---

## Mock workspace permission matrix (roles)

| Workspace | Roles Read | Roles Manage |
|---|---|---|
| Dstyle Hub (OWNER) | ✅ | ✅ |
| Urban Steps (MANAGER) | ✅ | ✅ |
| Classic Wear (SUSPENDED) | ❌ | ❌ |
| Dstyle Hub — Roles read only | ✅ | ❌ |
| Dstyle Hub — Roles manage only | ❌ | ✅ |
