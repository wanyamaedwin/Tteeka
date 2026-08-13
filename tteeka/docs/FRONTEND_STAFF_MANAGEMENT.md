# F3.2 — Frontend Staff Management

**Stage:** F3.2
**Route:** `/app/team/staff`
**Status:** Complete
**Next stage:** F3.3 — Roles & Permissions Management

---

## 1. Purpose

F3.2 implements a polished, production-quality Staff Management experience on `/app/team/staff`. It allows administrators to view the staff directory, add existing Tteeka users by phone, manage membership lifecycle (ACTIVE/DISABLED), assign roles with exact desired-state semantics, and browse per-staff details — all in MOCK MODE with no backend calls.

---

## 2. User vs. MerchantMembership distinction

The backend model is:

```
User → MerchantMembership → MembershipRole → Role
```

Staff administration manages the **MerchantMembership**, not the global User. A Merchant does **not** own the global User account. Disabling a Membership does not affect the User's account elsewhere. Multiple Merchants may have Memberships for the same User.

The frontend UX reflects this: the add-staff flow adds by phone (User lookup), not by creating a User.

---

## 3. Staff listing

The staff list is per-Merchant, derived from `useMerchantWorkspace().staffList`. This draws from a session-mutable overlay seeded from `MOCK_MERCHANT_STAFF[workspaceId]` in `lib/mock-staff.ts`.

**Desktop:** polished table — Staff member | Phone | Status | Roles | Actions
**Mobile:** structured card layout — no horizontal overflow

A small summary strip shows Active / Disabled / Total counts above the list.

---

## 4. Add existing User by phone

The "Add staff" button opens `AddStaffDialog`. The form accepts a phone number and looks it up in `MOCK_GLOBAL_USERS`. On success, a new `StaffMemberPreview` is created with:
- `membershipStatus: 'ACTIVE'`
- `roleIds: []`

No name, email, password, or role is collected during the add flow.

---

## 5. No invitation / signup

There is no "Invite staff", "Send invitation", or "Create account" flow. The add flow is strictly:
> Enter a phone number already registered to the person's Tteeka account.

---

## 6. Generic add failure

If the phone does not match an eligible ACTIVE User in the mock directory, the UI shows:

> Unable to add staff member. Check the phone number and try again.

This mirrors the backend's deliberate avoidance of account-enumeration detail. The same message is shown for:
- Unknown phone
- Phone matching a DISABLED global User

---

## 7. Existing Membership conflict

If the entered phone already has a Membership in the current Merchant:

> This person is already part of this business.

This maps to the backend's `409 Conflict` response. No duplicate Membership is created.

---

## 8. New Membership default status

New Memberships always start `ACTIVE`. The backend does not create pending/invited Memberships.

---

## 9. Zero Roles on creation

New Memberships start with `roleIds: []`. The UI shows:

> No role assigned

The user may optionally assign roles afterward. No default role is ever applied.

---

## 10. Membership ACTIVE/DISABLED lifecycle

The manage user can:
- **Disable access** — changes `membershipStatus` from `ACTIVE → DISABLED`
- **Reactivate access** — changes `DISABLED → ACTIVE`

No other status values exist (`PENDING`, `INVITED`, `DELETED`, `SUSPENDED` are not implemented and do not exist in the backend contract).

---

## 11. No hard delete

There is no "Delete staff", "Remove permanently", or "Delete Membership" action. The backend uses lifecycle disablement only.

---

## 12. Disabled Membership retains Roles

When a Membership is disabled, its `roleIds` array is **preserved unchanged**. This mirrors the backend behavior where disabling does not clear `MembershipRole` records.

The UI reflects this: disabled staff still show their assigned roles in the list and detail panel.

---

## 13. Reactivation restores Role participation

When a Membership is reactivated, the existing `roleIds` take effect again. The reactivation confirmation explains:

> They will regain access to this business with their previously assigned roles.

---

## 14. Exact desired-state Role replacement

The role assignment dialog collects a checkbox selection and saves via `updateMockMembershipRoles(membershipId, newRoleIds)`. This **replaces** the full `roleIds` array.

- If `Catalogue Manager` + `Viewer` are assigned and user saves only `Viewer` → result is `['role-viewer']`
- If all checkboxes are cleared → result is `[]` (valid empty set)
- Unchecked roles are **not** treated as "leave unchanged"

This mirrors the backend `PUT /staff/:membershipId/roles` desired-state semantics.

---

## 15. Empty Role set valid

Saving with zero roles selected is valid. The Membership retains `roleIds: []`. The backend permits this.

---

## 16. Disabled Role historical visibility

A Role record can have `status: 'DISABLED'`. If a staff member already has such a Role assigned (historical), it is shown in:
- The staff list (strikethrough pill)
- The detail panel (strikethrough with "Role disabled" label)
- The role assignment dialog (informational section, cannot be newly selected)

If the user saves a desired-state list that omits the disabled Role, its link is removed. It is not automatically re-added.

---

## 17. Read/manage permission separation

| Permission | What it grants |
|---|---|
| `STAFF_READ` | View staff directory and details |
| `STAFF_MANAGE` | Add staff, disable/reactivate, manage roles |

These are checked via `hasPermission()` from `useMerchantWorkspace()`. Manage does **not** imply read. Read does **not** imply manage. Checks are UX-only — the backend is authoritative.

---

## 18. Manage-only UX

When `STAFF_MANAGE` is granted but `STAFF_READ` is not:

- Existing staff directory is **not shown**
- A card explains: "You can add or update staff access, but your current workspace permissions do not allow you to view the staff directory."
- "Add staff" button is available
- Successful adds work (new Membership is created)
- Existing Membership IDs are not surfaced (no searchable workaround invented)

---

## 19. Mock global User directory

`MOCK_GLOBAL_USERS` in `lib/mock-staff.ts` is the global Tteeka User directory, separate from Merchant Memberships. It contains:

| Name | Phone | Status |
|---|---|---|
| Sarah Namusoke | +256 772 410 225 | ACTIVE (already on Dstyle Hub) |
| Brian Kato | +256 701 544 912 | ACTIVE (already on Dstyle Hub) |
| Amina Nakato | +256 758 293 441 | ACTIVE (already on Dstyle Hub) |
| Kenneth Ssebugwawo | +256 700 123 009 | ACTIVE (already on Dstyle Hub) |
| Grace Atim | +256 785 114 650 | ACTIVE — available to add |
| Joel Musoke | +256 704 808 211 | ACTIVE — available to add |
| Peter Mugisha | +256 752 619 844 | DISABLED — generic failure |

---

## 20. Mock per-Merchant state

Staff state is managed in `MerchantWorkspaceProvider` as a per-workspace session overlay (`staffOverrides`). The overlay is seeded from `MOCK_MERCHANT_STAFF[workspaceId]` on first access.

Mutations (`addMockStaff`, `updateMockMembershipStatus`, `updateMockMembershipRoles`) write to the overlay, not to the static fixture. Switching merchants and returning preserves updates for the session. No `localStorage` is used.

---

## 21. No backend calls

All staff interactions are mock-only. `isMockMode()` guards all mutators — they are no-ops in live mode. No `fetch` or API client calls exist in any F3.2 component.

---

## 22. Future API routes

When live integration is ready, the endpoints are already defined in `lib/api/endpoints.ts`:

```
GET  /merchants/:merchantId/staff
POST /merchants/:merchantId/staff
PATCH /merchants/:merchantId/staff/:membershipId
PUT  /merchants/:merchantId/staff/:membershipId/roles
```

---

## 23. Frontend UX — not security authority

All permission checks are UX-only. The backend enforces actual authorization. Role assignments and membership mutations are validated server-side during live integration.

---

## 24. F3.3 Shared Role state integration

F3.2 Staff Management and F3.3 Roles & Permissions Management share the exact same Role state through `MerchantWorkspaceProvider`:
- `rolesList` and `staffRoles` point to the same session-mutable `roleOverrides` array.
- When F3.3 renames a Role, the new name is immediately displayed on staff role badges in F3.2.
- When F3.3 disables a Role, staff members holding that Role display it as disabled with a strikethrough in F3.2 (assignments are preserved).
- When F3.3 reactivates a Role, staff members holding that Role regain active display in F3.2.


---

## Component reference

| Component | File | Purpose |
|---|---|---|
| `StaffList` | `components/staff/staff-list.tsx` | Desktop table + mobile cards |
| `StaffSearchBar` | `components/staff/staff-search-bar.tsx` | Search, status, role filter toolbar |
| `StaffDetailPanel` | `components/staff/staff-detail-panel.tsx` | Slide-in detail panel |
| `AddStaffDialog` | `components/staff/add-staff-dialog.tsx` | Phone-based add flow |
| `RoleAssignmentDialog` | `components/staff/role-assignment-dialog.tsx` | Checkbox role picker + diff confirmation |
| `DisableConfirmDialog` | `components/staff/disable-confirm-dialog.tsx` | Disable/reactivate confirmation |
| `StaffEmptyState` | `components/staff/staff-empty-state.tsx` | no-staff / no-results states |

---

## Mock workspace permission matrix (staff)

| Workspace | Staff Read | Staff Manage |
|---|---|---|
| Dstyle Hub (OWNER) | ✅ | ✅ |
| Urban Steps (MANAGER) | ✅ | ✅ |
| Classic Wear (SUSPENDED) | ❌ | ❌ |
| Dstyle Hub — Disabled | ❌ | ❌ |
| Dstyle Hub — Staff read only | ✅ | ❌ |
| Dstyle Hub — Staff manage only | ❌ | ✅ |
