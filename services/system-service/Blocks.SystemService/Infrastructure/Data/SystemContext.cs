using System;
using System.Collections.Generic;
using Blocks.SystemService.Entities;
using Microsoft.EntityFrameworkCore;

namespace Blocks.SystemService.Infrastructure.Data;

public partial class SystemContext : DbContext
{
    public SystemContext(DbContextOptions<SystemContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<InstanceSetting> InstanceSettings { get; set; }

    public virtual DbSet<Invitation> Invitations { get; set; }

    public virtual DbSet<Menu> Menus { get; set; }

    public virtual DbSet<Permission> Permissions { get; set; }

    public virtual DbSet<RefreshToken> RefreshTokens { get; set; }

    public virtual DbSet<Role> Roles { get; set; }

    public virtual DbSet<SystemGroup> SystemGroups { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<Workspace> Workspaces { get; set; }

    public virtual DbSet<WorkspaceMember> WorkspaceMembers { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("audit_log_pkey");

            entity.ToTable("audit_log");

            entity.HasIndex(e => e.Action, "ix_audit_log_action");

            entity.HasIndex(e => e.CreatedAt, "ix_audit_log_created_at");

            entity.HasIndex(e => e.EntityName, "ix_audit_log_entity_name");

            entity.HasIndex(e => e.IsSuccess, "ix_audit_log_is_success");

            entity.HasIndex(e => e.UserId, "ix_audit_log_user_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Action)
                .HasMaxLength(100)
                .HasDefaultValueSql("''::character varying")
                .HasColumnName("action");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.EntityId)
                .HasMaxLength(255)
                .HasColumnName("entity_id");
            entity.Property(e => e.EntityName)
                .HasMaxLength(255)
                .HasDefaultValueSql("''::character varying")
                .HasColumnName("entity_name");
            entity.Property(e => e.ErrorMessage).HasColumnName("error_message");
            entity.Property(e => e.IpAddress)
                .HasMaxLength(50)
                .HasColumnName("ip_address");
            entity.Property(e => e.IsSuccess)
                .HasDefaultValue(true)
                .HasColumnName("is_success");
            entity.Property(e => e.NewValues)
                .HasColumnType("jsonb")
                .HasColumnName("new_values");
            entity.Property(e => e.OldValues)
                .HasColumnType("jsonb")
                .HasColumnName("old_values");
            entity.Property(e => e.ServiceName)
                .HasMaxLength(100)
                .HasColumnName("service_name");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.UserName)
                .HasMaxLength(255)
                .HasDefaultValueSql("''::character varying")
                .HasColumnName("user_name");

            entity.HasOne(d => d.User).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AuditLog_User");
        });

        modelBuilder.Entity<InstanceSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("instance_setting_pk");

            entity.ToTable("instance_setting");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.RegistrationMode)
                .HasMaxLength(32)
                .HasColumnName("registration_mode");
            entity.Property(e => e.DefaultRegistrationRoleId).HasColumnName("default_registration_role_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasMaxLength(255).HasColumnName("created_by");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp without time zone").HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255).HasColumnName("updated_by");
            entity.Property(e => e.IsActive).HasDefaultValue(true).HasColumnName("is_active");
            entity.Property(e => e.IsDeleted).HasDefaultValue(false).HasColumnName("is_deleted");
            entity.HasIndex(e => e.IsActive, "instance_setting_active_singleton_unique")
                .IsUnique()
                .HasFilter("is_active AND NOT is_deleted");

            entity.HasOne(e => e.DefaultRegistrationRole).WithMany(e => e.RegistrationSettings)
                .HasForeignKey(e => e.DefaultRegistrationRoleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("instance_setting_default_registration_role_fk");
        });

        modelBuilder.Entity<Invitation>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("invitation_pk");

            entity.ToTable("invitation");

            entity.HasIndex(e => e.TokenHash, "invitation_token_hash_unique").IsUnique();

            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()").HasColumnName("id");
            entity.Property(e => e.TokenHash).HasMaxLength(128).HasColumnName("token_hash");
            entity.Property(e => e.ExpiresAt).HasColumnType("timestamp without time zone").HasColumnName("expires_at");
            entity.Property(e => e.ConsumedAt).HasColumnType("timestamp without time zone").HasColumnName("consumed_at");
            entity.Property(e => e.ConsumedBy).HasColumnName("consumed_by");
            entity.Property(e => e.TargetWorkspaceId).HasColumnName("target_workspace_id");
            entity.Property(e => e.RegistrationRoleId).HasColumnName("registration_role_id");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)").HasColumnType("timestamp without time zone").HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasMaxLength(255).HasColumnName("created_by");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp without time zone").HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255).HasColumnName("updated_by");
            entity.Property(e => e.IsActive).HasDefaultValue(true).HasColumnName("is_active");
            entity.Property(e => e.IsDeleted).HasDefaultValue(false).HasColumnName("is_deleted");

            entity.HasOne(e => e.TargetWorkspace).WithMany(e => e.Invitations)
                .HasForeignKey(e => e.TargetWorkspaceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invitation_target_workspace_fk");
            entity.HasOne(e => e.RegistrationRole).WithMany(e => e.Invitations)
                .HasForeignKey(e => e.RegistrationRoleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invitation_registration_role_fk");
            entity.HasOne(e => e.Consumer).WithMany(e => e.ConsumedInvitations)
                .HasForeignKey(e => e.ConsumedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invitation_consumed_by_fk");
        });

        modelBuilder.Entity<Menu>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("menu_pk");

            entity.ToTable("menu");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CanAdd).HasColumnName("can_add");
            entity.Property(e => e.CanAnalyze).HasColumnName("can_analyze");
            entity.Property(e => e.CanApprove).HasColumnName("can_approve");
            entity.Property(e => e.CanDelete).HasColumnName("can_delete");
            entity.Property(e => e.CanUpdate).HasColumnName("can_update");
            entity.Property(e => e.CanView).HasColumnName("can_view");
            entity.Property(e => e.Controller)
                .HasMaxLength(255)
                .HasColumnName("controller");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy)
                .HasMaxLength(255)
                .HasColumnName("created_by");
            entity.Property(e => e.IsActived)
                .HasDefaultValue(true)
                .HasColumnName("is_actived");
            entity.Property(e => e.IsDeleted)
                .HasDefaultValue(false)
                .HasColumnName("is_deleted");
            entity.Property(e => e.IsShowMenu)
                .HasDefaultValue(true)
                .HasColumnName("is_show_menu");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.PermissionKey)
                .HasMaxLength(255)
                .HasColumnName("permission_key");
            entity.HasIndex(e => e.PermissionKey, "menu_permission_key_unique").IsUnique();
            entity.Property(e => e.Sort)
                .HasDefaultValue(0)
                .HasColumnName("sort");
            entity.Property(e => e.SystemGroupId).HasColumnName("system_group_id");
            entity.Property(e => e.UpdatedAt)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy)
                .HasMaxLength(255)
                .HasColumnName("updated_by");

            entity.HasOne(d => d.SystemGroup).WithMany(p => p.Menus)
                .HasForeignKey(d => d.SystemGroupId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("menu_system_group_id_fk");
        });

        modelBuilder.Entity<Permission>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("permission_pk");

            entity.ToTable("permission");

            entity.HasIndex(e => new { e.RoleId, e.MenuId }, "permission_role_menu_unique").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.IsAdded)
                .HasDefaultValue(false)
                .HasColumnName("is_added");
            entity.Property(e => e.IsAnalyzed)
                .HasDefaultValue(false)
                .HasColumnName("is_analyzed");
            entity.Property(e => e.IsApproved)
                .HasDefaultValue(false)
                .HasColumnName("is_approved");
            entity.Property(e => e.IsDeleted)
                .HasDefaultValue(false)
                .HasColumnName("is_deleted");
            entity.Property(e => e.IsUpdated)
                .HasDefaultValue(false)
                .HasColumnName("is_updated");
            entity.Property(e => e.IsViewed)
                .HasDefaultValue(false)
                .HasColumnName("is_viewed");
            entity.Property(e => e.MenuId).HasColumnName("menu_id");
            entity.Property(e => e.RoleId).HasColumnName("role_id");

            entity.HasOne(d => d.Menu).WithMany(p => p.Permissions)
                .HasForeignKey(d => d.MenuId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_permission_menu");

            entity.HasOne(d => d.Role).WithMany(p => p.Permissions)
                .HasForeignKey(d => d.RoleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_permission_role");
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("refresh_token_pk");

            entity.ToTable("refresh_token");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedByIp).HasColumnName("created_by_ip");
            entity.Property(e => e.ExpiresAt)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("expires_at");
            entity.Property(e => e.ReasonRevoked).HasColumnName("reason_revoked");
            entity.Property(e => e.ReplacedByToken).HasColumnName("replaced_by_token");
            entity.Property(e => e.RevokedAt)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("revoked_at");
            entity.Property(e => e.RevokedByIp).HasColumnName("revoked_by_ip");
            entity.Property(e => e.Token).HasColumnName("token");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.RefreshTokens)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("refresh_token_user_id_fk");
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("role_pk");

            entity.ToTable("role");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy)
                .HasMaxLength(255)
                .HasColumnName("created_by");
            entity.Property(e => e.IsActived)
                .HasDefaultValue(true)
                .HasColumnName("is_actived");
            entity.Property(e => e.IsDeleted)
                .HasDefaultValue(false)
                .HasColumnName("is_deleted");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.Key)
                .HasMaxLength(100)
                .HasColumnName("key");
            entity.Property(e => e.IsSystem)
                .HasDefaultValue(false)
                .HasColumnName("is_system");
            entity.Property(e => e.IsRegistrationEligible)
                .HasDefaultValue(false)
                .HasColumnName("is_registration_eligible");
            entity.HasIndex(e => e.Key, "role_key_unique").IsUnique();
            entity.Property(e => e.UpdatedAt)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy)
                .HasMaxLength(255)
                .HasColumnName("updated_by");
        });

        modelBuilder.Entity<SystemGroup>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("system_group_pk");

            entity.ToTable("system_group");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy)
                .HasMaxLength(255)
                .HasColumnName("created_by");
            entity.Property(e => e.IsActived)
                .HasDefaultValue(true)
                .HasColumnName("is_actived");
            entity.Property(e => e.IsDeleted)
                .HasDefaultValue(false)
                .HasColumnName("is_deleted");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");
            entity.Property(e => e.Sort).HasColumnName("sort");
            entity.Property(e => e.UpdatedAt)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy)
                .HasMaxLength(255)
                .HasColumnName("updated_by");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("FK_SystemGroup_SystemGroup");
        });

        modelBuilder.Entity<Workspace>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("workspace_pk");

            entity.ToTable("workspace");

            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()").HasColumnName("id");
            entity.Property(e => e.Name).HasMaxLength(255).HasColumnName("name");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)").HasColumnType("timestamp without time zone").HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasMaxLength(255).HasColumnName("created_by");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp without time zone").HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255).HasColumnName("updated_by");
            entity.Property(e => e.IsActive).HasDefaultValue(true).HasColumnName("is_active");
            entity.Property(e => e.IsDeleted).HasDefaultValue(false).HasColumnName("is_deleted");
        });

        modelBuilder.Entity<WorkspaceMember>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("workspace_member_pk");

            entity.ToTable("workspace_member");

            entity.HasIndex(e => new { e.WorkspaceId, e.UserId }, "workspace_member_workspace_user_unique").IsUnique();

            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()").HasColumnName("id");
            entity.Property(e => e.WorkspaceId).HasColumnName("workspace_id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Role).HasMaxLength(32).HasColumnName("role");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)").HasColumnType("timestamp without time zone").HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasMaxLength(255).HasColumnName("created_by");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp without time zone").HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255).HasColumnName("updated_by");
            entity.Property(e => e.IsActive).HasDefaultValue(true).HasColumnName("is_active");
            entity.Property(e => e.IsDeleted).HasDefaultValue(false).HasColumnName("is_deleted");

            entity.HasOne(e => e.Workspace).WithMany(e => e.Members)
                .HasForeignKey(e => e.WorkspaceId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("workspace_member_workspace_fk");
            entity.HasOne(e => e.User).WithMany(e => e.WorkspaceMemberships)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("workspace_member_user_fk");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("user_pk");

            entity.ToTable("user");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Avatar).HasColumnName("avatar");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(now() AT TIME ZONE 'UTC'::text)")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy)
                .HasMaxLength(255)
                .HasColumnName("created_by");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.Fullname).HasColumnName("fullname");
            entity.Property(e => e.IsActived)
                .HasDefaultValue(true)
                .HasColumnName("is_actived");
            entity.Property(e => e.IsDeleted)
                .HasDefaultValue(false)
                .HasColumnName("is_deleted");
            entity.Property(e => e.Password).HasColumnName("password");
            entity.Property(e => e.PasswordSalt).HasColumnName("password_salt");
            entity.Property(e => e.RoleId).HasColumnName("role_id");
            entity.Property(e => e.UpdatedAt)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy)
                .HasMaxLength(255)
                .HasColumnName("updated_by");
            entity.Property(e => e.Username)
                .HasMaxLength(255)
                .HasColumnName("username");
            entity.HasOne(d => d.Role).WithMany(p => p.Users)
                .HasForeignKey(d => d.RoleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_user_role");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
