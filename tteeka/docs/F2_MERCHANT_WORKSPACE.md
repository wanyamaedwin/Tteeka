# F2 — Merchant Workspace & Permission UX

## Preview personas

Mock mode exposes Dstyle Hub (Owner), Urban Steps (Manager), Classic Wear (suspended), and a disabled-membership persona in the workspace switcher. Switching is local preview state only and never calls the backend.

## Permission rules

Permissions are canonical exact strings in `lib/workspaces.ts`. Navigation, Home actions, and route content are permission-aware. `canManage()` preserves no-manage-implies-read: a manage action is visible when the user has the manage permission or its corresponding read permission, while direct route gates still require the relevant read permission.

## Workspace states

Suspended workspaces and disabled memberships remain signed in and show a recovery state with a return path to Overview, where the user can switch workspace. They do not silently expose protected mock content.
