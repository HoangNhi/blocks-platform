# Task 8 UI Contract

## Scope

Minimal public authentication and administration surfaces for community authorization. Keep operational pages and V6 theme unchanged. Use existing shadcn primitives and Vietnamese copy with diacritics.

## Accepted interactions

- Login requests `GET /api/system/Auth/registration-availability`; Register link renders only when response reports registration available.
- Register uses one route and one public payload: `username`, `email`, `fullname`, `password`, optional `invitationToken`. No mode, role, permission, workspace, active, or admin fields.
- Open registration shows normal account fields plus optional invitation token input.
- Invite-only registration uses same Register route. Invitation token remains in form state and may be prefilled from `?invitationToken=`; query state updates the token field.
- Admin-provisioned registration hides Login's Register link. Direct Register navigation shows unavailable state with Login action.
- Successful registration immediately navigates to Login with `registrationSuccess` status and username prefilled.
- 403 states stay inline in current surface, use `role="alert"`, focus the alert summary, and never navigate to dedicated access-denied route.
- `/system/overview` renders Registration Settings inside System Overview, including editable registration mode and eligible default-registration-role selector.
- Users keeps Invitations in internal tab. Invitation creation validates future expiry, submits ISO timestamp, and reveals plaintext token once in confirmation state.
- Roles & Permissions is one workflow: role creation/editing and permission editing share page. Role table exposes stable key, protected/system state, registration eligibility, and default-registration-role indicator. Permission matrix exposes supported actions; unsupported cells are disabled/non-interactive and explain why through accessible name/title. Permission load/save errors are inline and focused; successful save is announced with text.
- Validation errors attach to labeled fields with stable IDs, summary uses `role="alert"`, and failed-submit focus is predictable. Success is communicated with text, not color alone.

## Component map

- Authentication: existing `Card`, `Input`, `FormLabel`, `Button`, `Alert`.
- Administration: existing `Card`, `Select`, `Button`, `Alert`, `Table`, `Tabs`, `Dialog`, `Checkbox`.
- Existing list scaffolds and API client remain integration boundary.

## Verification journey

1. Open Login, confirm conditional Register link.
2. Open Register, confirm public fields and no role/mode controls.
3. Open Register with `?invitationToken=`, confirm same-route token prefill.
4. Submit invalid form, confirm summary, field IDs, and focus.
5. Submit valid form, confirm strict API payload and immediate Login navigation with username/status.
6. Render admin-provisioned state, confirm unavailable message and Login action.
7. Open System Overview, select eligible default role, save settings, confirm status text.
8. Open Users > Invitations, reject past expiry, create future invitation, confirm token shown once.
9. Open Roles & Permissions, create/edit role, inspect safety fields, toggle supported permission, confirm unsupported action explanation, save and confirm status/error states.
10. Load 403, confirm inline announced denial without `/403`.
11. Repeat key journeys at desktop and around 390px when runtime is available.
