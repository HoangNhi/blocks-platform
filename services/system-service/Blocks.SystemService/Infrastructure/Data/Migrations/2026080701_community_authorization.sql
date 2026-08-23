alter table role add column if not exists key text;
alter table role add column if not exists is_system boolean not null default false;
alter table role add column if not exists is_registration_eligible boolean not null default false;
alter table menu add column if not exists permission_key text;

do $$
declare
    existing_users integer;
    administrator_candidates integer;
    member_candidates integer;
begin
    select count(*) into existing_users from public."user";

    if exists (
        select 1
        from role
        where key in ('member', 'administrator')
        group by key
        having count(*) > 1
    ) then
        raise exception 'Community authorization migration found duplicate built-in role keys; explicitly retain one active role for each key and rerun.' using errcode = 'P0001';
    end if;

    if exists (
        select 1
        from role
        where key in ('member', 'administrator')
          and (not is_actived or is_deleted)
    ) then
        raise exception 'Community authorization migration found an inactive or deleted built-in role; explicitly resolve its lifecycle state and rerun.' using errcode = 'P0001';
    end if;

    select count(*) into administrator_candidates
    from role
    where key is null
      and lower(name) in ('administrator', 'quản trị')
      and is_actived
      and not is_deleted;
    if exists (
        select 1
        from role
        where key is null
          and lower(name) in ('administrator', 'quản trị')
          and (not is_actived or is_deleted)
    ) and administrator_candidates = 0 then
        raise exception 'Community authorization migration found only inactive or deleted administrator candidates; explicitly map an active role.key to administrator and rerun.' using errcode = 'P0001';
    end if;
    if administrator_candidates > 1 then
        raise exception 'Community authorization migration found ambiguous administrator mapping; explicitly set exactly one existing active role.key to administrator and rerun. No user was reassigned.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from role where key = 'administrator') and administrator_candidates = 1 then
        update role
        set key = 'administrator'
        where key is null
          and lower(name) in ('administrator', 'quản trị')
          and is_actived
          and not is_deleted;
    end if;
    if existing_users > 0 and not exists (
        select 1 from role where key = 'administrator' and is_actived and not is_deleted
    ) then
        raise exception 'Community authorization migration cannot safely map existing administrator; explicitly set exactly one active existing role.key to administrator and rerun. No user was reassigned.' using errcode = 'P0001';
    end if;

    select count(*) into member_candidates
    from role
    where key is null
      and lower(name) in ('user', 'member', 'người dùng')
      and is_actived
      and not is_deleted;
    if exists (
        select 1
        from role
        where key is null
          and lower(name) in ('user', 'member', 'người dùng')
          and (not is_actived or is_deleted)
    ) and member_candidates = 0 then
        raise exception 'Community authorization migration found only inactive or deleted member candidates; explicitly map an active role.key to member and rerun.' using errcode = 'P0001';
    end if;
    if member_candidates > 1 then
        raise exception 'Community authorization migration found ambiguous member mapping; explicitly set exactly one existing active role.key to member and rerun.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from role where key = 'member') and member_candidates = 1 then
        update role
        set key = 'member'
        where key is null
          and lower(name) in ('user', 'member', 'người dùng')
          and is_actived
          and not is_deleted;
    end if;
    if exists (select 1 from role where key is null or btrim(key) = '') then
        raise exception 'Community authorization migration found an unmapped role; operator must assign an approved stable role.key and rerun.' using errcode = 'P0001';
    end if;

    if not exists (select 1 from role where key = 'member') then
        insert into role (name, key, is_system, is_registration_eligible, created_by)
        values ('User', 'member', true, true, 'system-migration');
    end if;
    if not exists (select 1 from role where key = 'administrator') then
        insert into role (name, key, is_system, is_registration_eligible, created_by)
        values ('Administrator', 'administrator', true, false, 'system-migration');
    end if;

    update role
    set is_system = true,
        is_registration_eligible = true
    where key = 'member'
      and is_actived
      and not is_deleted
      and (not is_system or not is_registration_eligible);

    update role
    set is_system = true,
        is_registration_eligible = false
    where key = 'administrator'
      and is_actived
      and not is_deleted
      and (not is_system or is_registration_eligible);
end $$;

do $$
begin
    update menu
    set permission_key = case lower(controller)
        when 'user' then 'admin.users'
        when 'role' then 'admin.roles'
        when 'auditlog' then 'admin.audit'
        when 'systemgroup' then 'admin.permissions'
        when 'registrationadmin' then 'admin.registration'
        when 'menu' then 'admin.plugins'
        when 'hermes' then 'workspace.home'
        when 'tradelab' then 'tradelab.strategies'
        else permission_key
    end
    where permission_key is null;

    if exists (select 1 from menu where permission_key is null or btrim(permission_key) = '') then
        raise exception 'Community authorization migration found unknown menu controller; operator must assign an approved stable menu.permission_key and rerun.' using errcode = 'P0001';
    end if;
    if exists (select 1 from menu where permission_key is not null group by permission_key having count(*) > 1) then
        raise exception 'Community authorization migration found duplicate menu.permission_key values; explicitly assign unique approved stable keys and rerun.' using errcode = 'P0001';
    end if;
end $$;

do $$
declare
    registration_group_id uuid;
    registration_menu_count integer;
begin
    select count(*) into registration_menu_count
    from menu
    where permission_key = 'admin.registration';

    if registration_menu_count > 1 then
        raise exception 'Community authorization migration found duplicate admin.registration menus; explicitly retain one menu and rerun.' using errcode = 'P0001';
    end if;

    if registration_menu_count = 1 then
        update menu
        set can_view = true,
            can_add = true,
            can_update = true,
            is_actived = true,
            is_deleted = false
        where permission_key = 'admin.registration';
    else
        select id into registration_group_id
        from system_group
        where is_actived and not is_deleted
          and lower(name) in ('system administration', 'administration', 'quản trị hệ thống')
        order by sort, id
        limit 1;

        if registration_group_id is null then
            insert into system_group (id, name, sort, created_at, created_by, is_actived, is_deleted)
            values (gen_random_uuid(), 'System Administration', 0, now() at time zone 'UTC', 'system-migration', true, false)
            returning id into registration_group_id;
        end if;

        insert into menu (
            id, controller, name, permission_key, system_group_id, sort,
            can_view, can_add, can_update, can_delete, can_approve, can_analyze,
            created_at, created_by, is_actived, is_deleted, is_show_menu)
        values (
            gen_random_uuid(), 'RegistrationAdmin', 'Registration', 'admin.registration', registration_group_id, 0,
            true, true, true, false, false, false,
            now() at time zone 'UTC', 'system-migration', true, false, false);
    end if;
end $$;

alter table role alter column key set not null;
alter table menu alter column permission_key set not null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'role_key_not_blank') then
        alter table role add constraint role_key_not_blank check (btrim(key) <> '');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'menu_permission_key_not_blank') then
        alter table menu add constraint menu_permission_key_not_blank check (btrim(permission_key) <> '');
    end if;
    if not exists (select 1 from pg_constraint where conname = 'role_registration_eligibility_safety') then
        alter table role add constraint role_registration_eligibility_safety check (key not in ('administrator', 'operator') or not is_registration_eligible);
    end if;
end $$;

create unique index if not exists role_key_unique on role (key);
create unique index if not exists menu_permission_key_unique on menu (permission_key);
create unique index if not exists permission_role_menu_unique on permission (role_id, menu_id);
create unique index if not exists user_active_username_unique on public."user" (lower(username)) where is_actived and not is_deleted;
create unique index if not exists user_active_email_unique on public."user" (lower(email)) where is_actived and not is_deleted;

create table if not exists instance_setting (
    id uuid primary key default gen_random_uuid(),
    registration_mode varchar(32) not null,
    default_registration_role_id uuid,
    created_at timestamp without time zone not null default (now() at time zone 'UTC'),
    created_by varchar(255) not null,
    updated_at timestamp without time zone,
    updated_by varchar(255),
    is_active boolean not null default true,
    is_deleted boolean not null default false,
    constraint instance_setting_registration_mode_check check (registration_mode in ('open', 'invite_only', 'admin_provisioned')),
    constraint instance_setting_default_registration_role_fk foreign key (default_registration_role_id) references role (id) on delete set null
);

create table if not exists workspace (
    id uuid primary key default gen_random_uuid(),
    name varchar(255) not null,
    created_at timestamp without time zone not null default (now() at time zone 'UTC'),
    created_by varchar(255) not null,
    updated_at timestamp without time zone,
    updated_by varchar(255),
    is_active boolean not null default true,
    is_deleted boolean not null default false
);

create table if not exists workspace_member (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    user_id uuid not null,
    role varchar(32) not null,
    created_at timestamp without time zone not null default (now() at time zone 'UTC'),
    created_by varchar(255) not null,
    updated_at timestamp without time zone,
    updated_by varchar(255),
    is_active boolean not null default true,
    is_deleted boolean not null default false,
    constraint workspace_member_workspace_fk foreign key (workspace_id) references workspace (id) on delete cascade,
    constraint workspace_member_user_fk foreign key (user_id) references public."user" (id) on delete cascade
);

create unique index if not exists instance_setting_active_singleton_unique on instance_setting (is_active) where is_active and not is_deleted;

create unique index if not exists workspace_member_workspace_user_unique on workspace_member (workspace_id, user_id);

create table if not exists invitation (
    id uuid primary key default gen_random_uuid(),
    token_hash varchar(128) not null,
    expires_at timestamp without time zone not null,
    consumed_at timestamp without time zone,
    consumed_by uuid,
    target_workspace_id uuid,
    registration_role_id uuid,
    created_at timestamp without time zone not null default (now() at time zone 'UTC'),
    created_by varchar(255) not null,
    updated_at timestamp without time zone,
    updated_by varchar(255),
    is_active boolean not null default true,
    is_deleted boolean not null default false,
    constraint invitation_consumed_by_fk foreign key (consumed_by) references public."user" (id) on delete set null,
    constraint invitation_target_workspace_fk foreign key (target_workspace_id) references workspace (id) on delete set null,
    constraint invitation_registration_role_fk foreign key (registration_role_id) references role (id) on delete set null
);

create unique index if not exists invitation_token_hash_unique on invitation (token_hash);

insert into instance_setting (registration_mode, created_by)
select 'admin_provisioned', 'system-migration'
where not exists (
    select 1
    from instance_setting
    where is_active and not is_deleted
);
