alter table audit_log alter column user_id drop not null;
alter table audit_log drop constraint if exists FK_AuditLog_User;
alter table audit_log add constraint FK_AuditLog_User foreign key (user_id) references public."user" (id) on delete set null;
