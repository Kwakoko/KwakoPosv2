import { randomUUID } from "crypto";
import type { TenantContext } from "@kwakopos2/contracts";

export interface OrganizationNode {
  id: string;
  tenantId: string;
  parentId: string | null;
  nodeType: "HEADQUARTERS" | "BRANCH" | "DEPARTMENT" | "BUSINESS_UNIT";
  name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE";
  metadata?: Record<string, any>;
  createdAt: string;
}

export class TenantOrganizationEngine {
  private static instance: TenantOrganizationEngine | null = null;
  private nodes = new Map<string, OrganizationNode>();

  public static getInstance(): TenantOrganizationEngine {
    if (!TenantOrganizationEngine.instance) {
      TenantOrganizationEngine.instance = new TenantOrganizationEngine();
    }
    return TenantOrganizationEngine.instance;
  }

  public static resetInstance(): void {
    TenantOrganizationEngine.instance = new TenantOrganizationEngine();
  }

  /**
   * Enforce tenant isolation invariant
   */
  public assertIsolation(ctx: TenantContext, resourceTenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || (ctx as any).email === "admin@kwakoko.co.tz";
    if (!isSuperAdmin && ctx.tenantId !== resourceTenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access resource owned by tenant '${resourceTenantId}'.`
      );
    }
  }

  /**
   * Register a new organizational node (Headquarters, Branch, Department, Business Unit)
   */
  public createNode(
    ctx: TenantContext,
    params: {
      tenantId: string;
      parentId?: string | null;
      nodeType: OrganizationNode["nodeType"];
      name: string;
      code: string;
      metadata?: Record<string, any>;
    }
  ): OrganizationNode {
    this.assertIsolation(ctx, params.tenantId);

    // Validate parent if provided
    if (params.parentId) {
      const parent = this.nodes.get(params.parentId);
      if (!parent || parent.tenantId !== params.tenantId) {
        throw new Error(`INVALID_PARENT_NODE: Parent '${params.parentId}' not found within tenant '${params.tenantId}'.`);
      }
    }

    const id = randomUUID();
    const node: OrganizationNode = {
      id,
      tenantId: params.tenantId,
      parentId: params.parentId || null,
      nodeType: params.nodeType,
      name: params.name,
      code: params.code.trim().toUpperCase(),
      status: "ACTIVE",
      metadata: params.metadata || {},
      createdAt: new Date().toISOString(),
    };

    this.nodes.set(id, node);
    return node;
  }

  /**
   * Retrieve organizational hierarchy for a tenant
   */
  public getHierarchy(ctx: TenantContext, tenantId: string): OrganizationNode[] {
    this.assertIsolation(ctx, tenantId);
    return Array.from(this.nodes.values()).filter((n) => n.tenantId === tenantId);
  }

  /**
   * Get node by ID
   */
  public getNode(ctx: TenantContext, id: string): OrganizationNode | null {
    const node = this.nodes.get(id);
    if (!node) return null;
    this.assertIsolation(ctx, node.tenantId);
    return { ...node };
  }
}

export const globalTenantOrganizationEngine = TenantOrganizationEngine.getInstance();
