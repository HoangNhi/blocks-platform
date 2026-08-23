update menu
set is_show_menu = true
where permission_key = 'admin.registration'
  and is_actived
  and not is_deleted;

insert into permission (
    id,
    role_id,
    menu_id,
    is_viewed,
    is_added,
    is_updated,
    is_deleted,
    is_approved,
    is_analyzed)
select
    gen_random_uuid(),
    role.id,
    menu.id,
    menu.can_view,
    menu.can_add,
    menu.can_update,
    menu.can_delete,
    menu.can_approve,
    menu.can_analyze
from role
cross join menu
where role.key = 'administrator'
  and role.is_actived
  and not role.is_deleted
  and menu.permission_key like 'admin.%'
  and menu.is_actived
  and not menu.is_deleted
  and not exists (
      select 1
      from permission existing
      where existing.role_id = role.id
        and existing.menu_id = menu.id
  );
