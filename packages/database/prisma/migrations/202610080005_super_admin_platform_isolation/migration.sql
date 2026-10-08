-- KwakoPos v2 — Super Admin Platform Isolation v1
-- Enforce that platform credentials are structurally distinct from tenant administrators.

-- Migrate the platform tenant away from the legacy tenant-admin Super Admin role.
-- The first statement renames the legacy role only when the dedicated platform role does not exist.
UPDATE roles AS legacy
SET name = 'PLATFORM_SUPER_ADMIN',
    permissions = ARRAY['platform:control'],
    "isSystemRole" = TRUE,
    "updatedAt" = NOW()
WHERE legacy.id = (
  SELECT r.id
  FROM roles r
  JOIN tenants t ON t.id = r."tenantId"
  WHERE t.slug = 'kwakoko-platform'
    AND r.name IN ('SUPER_ADMIN', 'SUPERADMIN')
    AND NOT EXISTS (
      SELECT 1
      FROM roles existing_platform
      WHERE existing_platform."tenantId" = r."tenantId"
        AND existing_platform.name = 'PLATFORM_SUPER_ADMIN'
    )
  ORDER BY CASE r.name WHEN 'SUPER_ADMIN' THEN 0 ELSE 1 END
  LIMIT 1
);

-- Where the dedicated platform role already exists, move platform users off legacy role records.
UPDATE users AS u
SET "roleId" = platform.id
FROM roles platform
JOIN tenants t ON t.id = platform."tenantId"
WHERE t.slug = 'kwakoko-platform'
  AND platform.name = 'PLATFORM_SUPER_ADMIN'
  AND u."tenantId" = platform."tenantId"
  AND EXISTS (
    SELECT 1
    FROM roles legacy
    WHERE legacy.id = u."roleId"
      AND legacy.name IN ('SUPER_ADMIN', 'SUPERADMIN')
      AND legacy."tenantId" = u."tenantId"
  );

-- Force the dedicated platform role to a non-tenant wildcard permission set.
UPDATE roles AS platform
SET permissions = ARRAY['platform:control'],
    is_system_role = TRUE,
    updated_at = NOW()
FROM tenants t
WHERE platform."tenantId" = t.id
  AND t.slug = 'kwakoko-platform'
  AND platform.name = 'PLATFORM_SUPER_ADMIN';

-- Any platform security row that does not belong to the dedicated platform role is invalid.
DELETE FROM platform_super_admin_security s
WHERE EXISTS (
  SELECT 1
  FROM users u
  JOIN roles r ON r.id = u."roleId"
  WHERE s.user_id = u.id
    AND r.name <> 'PLATFORM_SUPER_ADMIN'
);

-- Invalidate any pre-lock tenant-scoped sessions so legacy Super Admin credentials
-- cannot remain usable after the platform role is migrated.
UPDATE device_sessions ds
SET revoked_at = NOW(),
    status = 'REVOKED',
    revoke_reason = 'SUPER_ADMIN_PLATFORM_ISOLATION_MIGRATION'
WHERE ds."revokedAt" IS NULL
  AND ds."userId" IN (
    SELECT u.id
    FROM users u
    JOIN roles r ON r.id = u."roleId"
    JOIN tenants t ON t.id = u."tenantId"
    WHERE t.slug = 'kwakoko-platform'
      AND r.name = 'PLATFORM_SUPER_ADMIN'
  );

CREATE OR REPLACE FUNCTION enforce_platform_super_admin_role_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_slug TEXT;
BEGIN
  IF NEW.name = 'PLATFORM_SUPER_ADMIN' THEN
    SELECT slug INTO tenant_slug FROM tenants WHERE id = NEW."tenantId";
    IF tenant_slug IS DISTINCT FROM 'kwakoko-platform' THEN
      RAISE EXCEPTION 'PLATFORM_SUPER_ADMIN_SCOPE_VIOLATION';
    END IF;
    NEW."isSystemRole" := TRUE;
    NEW.permissions := ARRAY['platform:control'];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_super_admin_role_scope ON roles;
CREATE TRIGGER trg_platform_super_admin_role_scope
BEFORE INSERT OR UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION enforce_platform_super_admin_role_scope();

CREATE OR REPLACE FUNCTION enforce_platform_super_admin_user_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role_name TEXT;
  role_tenant_id TEXT;
  tenant_slug TEXT;
BEGIN
  SELECT name, tenant_id INTO role_name, role_tenant_id
  FROM roles
  WHERE id = NEW."roleId";

  IF role_name = 'PLATFORM_SUPER_ADMIN' THEN
    SELECT slug INTO tenant_slug FROM tenants WHERE id = NEW."tenantId";
    IF tenant_slug IS DISTINCT FROM 'kwakoko-platform'
       OR role_tenant_id IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'PLATFORM_SUPER_ADMIN_USER_SCOPE_VIOLATION';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_super_admin_user_scope ON users;
CREATE TRIGGER trg_platform_super_admin_user_scope
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_platform_super_admin_user_scope();

CREATE OR REPLACE FUNCTION enforce_platform_super_admin_security_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role_name TEXT;
BEGIN
  SELECT r.name INTO role_name
  FROM users u
  JOIN roles r ON r.id = u."roleId"
  WHERE u.id = NEW."userId";

  IF role_name IS DISTINCT FROM 'PLATFORM_SUPER_ADMIN' THEN
    RAISE EXCEPTION 'PLATFORM_SUPER_ADMIN_SECURITY_ROLE_VIOLATION';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_super_admin_security_role ON platform_super_admin_security;
CREATE TRIGGER trg_platform_super_admin_security_role
BEFORE INSERT OR UPDATE ON platform_super_admin_security
FOR EACH ROW
EXECUTE FUNCTION enforce_platform_super_admin_security_role();
