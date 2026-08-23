# System migration baseline

Task 1 database review ran against PostgreSQL database `system` in Docker container `postgres-container` on 2026-08-08. Query reviewed:

```sql
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_user_checkpermission', 'fn_menu_getbyuser',
    'fn_permission_getbyrole', 'fn_permission_getbyuser')
order by p.proname;
```

No connection string or credential was recorded.

## Reviewed functions

- `fn_user_checkpermission(i_user_id uuid, i_controller text, i_action integer)` returns JSONB with `has_permission`. It requires active, non-deleted user, role, and menu rows; joins permission by role and menu without permission-row active/deleted predicates; matches the controller with `LIKE`; maps actions 1 through 6 to view, add, update, delete, approve, and analyze; requires both the menu capability and role permission flag.
- `fn_menu_getbyuser(i_user_id uuid)` returns an ordered JSONB menu array. It requires active, non-deleted user, role, system-group, and menu rows; joins permission by role and menu without permission-row active/deleted predicates; includes only shown menus with role view permission; returns menu metadata, capability flags, group metadata, and timestamps; returns an empty array when no rows match.
- `fn_permission_getbyrole(i_role_id uuid)` returns grouped JSON permissions ordered by system-group and menu sort. It includes active, non-deleted menus and groups, left joins the requested role permissions without permission-row active/deleted predicates, and defaults missing permission flags to false.
- `fn_permission_getbyuser(i_user_id uuid)` returns an ordered JSONB array keyed by controller. It requires an active, non-deleted user and role, joins permission rows for that role without permission-row active/deleted predicates, filters non-deleted system groups and menus, and returns an empty array when no rows match.

## Compatibility observations

The reviewed functions use the existing `is_actived` columns on users, roles, system groups, and menus. `fn_permission_getbyuser` explicitly filters active, non-deleted users and active roles, but does not explicitly filter active system groups or active menus; it does filter non-deleted system groups and menus. No function body was changed by Task 1.


## Harness behavior

System migrations are embedded from `Infrastructure/Data/Migrations/*.sql`, selected in ordinal filename order, serialized by PostgreSQL transaction advisory lock `42425253`, journaled in `system_schema_migration`, and applied in one transaction. A migration error is rethrown so startup fails and the transaction rolls back.
