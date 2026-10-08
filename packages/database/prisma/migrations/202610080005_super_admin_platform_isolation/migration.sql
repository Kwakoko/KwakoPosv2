-- KwakoPos v2 — Super Admin Platform Isolation v1
-- Enforce that platform credentials are structurally distinct from tenant administrators.

DO $$
DECLARE
  platform_tenant_id TEXT;
  platform_role_id TEXT;
  legacy_role_id TEXT;
BEGIN
  SELECT id INTO platform_tenant_id
  FROM tenants
  WHERE slug = 'kwakoko-platform'
  LIMIT 1;

  IF platform_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO platform_role_id
  FROM roles
  WHERE tenant_id = platform_tenant_id
    AND name = 'PLATFORM_SUPER_ADMIN'
  LIMIT 1;

  SELECT id INTO legacy_role_id
  FROM roles
  WHERE tenant_id = platform_tenant_id
    AND name IN ('SUPER_ADMIN', 'SUPERADMIN')
  ORDER BY CASE name WHEN 'SUPER_ADMIN' THEN 0 ELSE 1 END
  LIMIT 1;

  IF platform_role_id IS NULL AND legacy_role_id IS NOT NULL THEN
    UPDATE roles
    SET name = 'PLATFORM_SUPER_ADMIN',
        permissions = ARRAY['platform:control'],
        is_system_role = TRUE,
        updated_at = NOW()
    WHERE id = legacy_role_id;
    platform_role_id := legacy_role_id;
  ELSIF platform_role_id IS NOT NULL THEN
    UPDATE roles
    SET permissions = ARRAY['platform:control'],
        is_system_role = TRUE,
        updated_at = NOW()
    WHERE id = platform_role_id;
    IF legacy_role_id IS NOT NULL AND legacy_role_id <> platform_role_id THEN
      UPDATE users
      SET role_id = platform_role_id
      WHERE tenant_id = platform_tenant_id
        AND role_id = legacy_role_id;
    END IF;
  END IF;

  -- Any platform security row that does not belong to the platform role is invalid.
  DELETE FROM platform_super_admin_security s
  USING users u, roles r
  WHERE s.user_id = u.id
    AND u.role_id = r.id
    AND r.name <> 'PLATFORM_SUPER_ADMIN';
END $$;

CREATE OR REPLACE FUNCTION enforce_platform_super_admin_role_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_slug TEXT;
BEGIN
  IF NEW.name = 'PLATFORM_SUPER_ADMIN' THEN
    SELECT slug INTO tenant_slug FROM tenants WHERE id = NEW.tenant_id;
    IF tenant_slug IS DISTINCT FROM 'kwakoko-platform' THEN
      RAISE EXCEPTION 'PLATFORM_SUPER_ADMIN_SCOPE_VIOLATION';
    END IF;
    NEW.is_system_role := TRUE;
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
  WHERE id = NEW.role_id;

  IF role_name = 'PLATFORM_SUPER_ADMIN' THEN
    SELECT slug INTO tenant_slug FROM tenants WHERE id = NEW.tenant_id;
    IF tenant_slug IS DISTINCT FROM 'kwakoko-platform'
       OR role_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
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
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = NEW.user_id;

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
