do $$
declare
    group_id uuid;
begin
    select id into group_id
    from system_group
    where is_actived and not is_deleted
    order by sort, id
    limit 1;

    if group_id is null then
        insert into system_group (id, name, sort, created_at, created_by, is_actived, is_deleted)
        values (gen_random_uuid(), 'Platform', 0, now() at time zone 'UTC', 'system-migration', true, false)
        returning id into group_id;
    end if;

    insert into menu (
        id, controller, name, permission_key, system_group_id, sort,
        can_view, can_add, can_update, can_delete, can_approve, can_analyze,
        created_at, created_by, is_actived, is_deleted, is_show_menu)
    select gen_random_uuid(), item.controller, item.name, item.permission_key, group_id, item.sort,
        true, true, true, true, true, true,
        now() at time zone 'UTC', 'system-migration', true, false, false
    from (values
        ('FileLibrary', 'Files', 'files.library', 20),
        ('AiVideoProjects', 'AI Video Projects', 'ai-video.projects', 21),
        ('TradeLabDatasets', 'TradeLab Datasets', 'tradelab.datasets', 22),
        ('TradeLabBacktests', 'TradeLab Backtests', 'tradelab.backtests', 23),
        ('TradeLabRiskProfiles', 'TradeLab Risk Profiles', 'tradelab.risk-profiles', 24)
    ) as item(controller, name, permission_key, sort)
    where not exists (
        select 1 from menu existing where existing.permission_key = item.permission_key
    );

    insert into permission (
        id, role_id, menu_id, is_viewed, is_added, is_updated, is_deleted, is_approved, is_analyzed)
    select gen_random_uuid(), role.id, menu.id, true, false, false, false, false, false
    from role
    cross join menu
    where role.key = 'member'
      and menu.permission_key = 'workspace.home'
      and role.is_actived and not role.is_deleted
      and menu.is_actived and not menu.is_deleted
      and not exists (
          select 1
          from permission existing
          where existing.role_id = role.id and existing.menu_id = menu.id
      );
end $$;
