import { randomUUID } from "crypto";
import type {
  TenantContext,
  UniversalParty,
  PartyType,
  PartyRole,
  EngineDescriptor,
  EngineCommandEnvelope,
  EngineCommandResult,
  EngineQueryEnvelope,
} from "@kwakopos2/contracts";
import { CoreEngineRegistry } from "../engineRegistry/coreEngineRegistry.js";
import { DomainEventBusEngine } from "../foundation/eventBusEngine.js";
import { AuditComplianceEngine } from "../foundation/auditComplianceEngine.js";

export interface CreatePartyParams {
  tenantId: string;
  partyType: PartyType;
  roles: PartyRole[];
  name: string;
  email?: string | null;
  phone?: string | null;
  taxIdNumber?: string | null;
  nationalIdNumber?: string | null;
  address?: {
    street?: string;
    city?: string;
    region?: string;
    country?: string;
  };
  creditLimit?: number;
  metadata?: Record<string, any>;
}

export interface UpdatePartyParams {
  partyId: string;
  tenantId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  taxIdNumber?: string | null;
  nationalIdNumber?: string | null;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  address?: {
    street?: string;
    city?: string;
    region?: string;
    country?: string;
  };
  creditLimit?: number;
  metadata?: Record<string, any>;
}

export interface AdjustCreditBalanceParams {
  partyId: string;
  tenantId: string;
  amountDelta: number; // positive = increase owed balance (credit sale), negative = reduction (payment received)
  referenceType: "SALE" | "PAYMENT" | "CREDIT_NOTE" | "MANUAL_ADJUSTMENT";
  referenceId: string;
  notes?: string;
}

export class PartyContactEngine {
  private static instance: PartyContactEngine | null = null;
  private parties = new Map<string, UniversalParty>(); // key: partyId

  public static readonly ENGINE_ID = "core.party_contact";

  public static getInstance(): PartyContactEngine {
    if (!PartyContactEngine.instance) {
      PartyContactEngine.instance = new PartyContactEngine();
    }
    return PartyContactEngine.instance;
  }

  public static resetInstance(): void {
    PartyContactEngine.instance = new PartyContactEngine();
  }

  public constructor() {
    this.registerSelf();
  }

  private registerSelf(): void {
    const registry = CoreEngineRegistry.getInstance();
    const descriptor: EngineDescriptor = {
      engineId: PartyContactEngine.ENGINE_ID,
      name: "Party & Contact Management Core Engine",
      version: "2.0.0",
      layer: "BUSINESS_CORE",
      status: "ACTIVE",
      dependencies: ["core.event_bus", "core.audit_compliance"],
      extensionPoints: ["party.role_provider", "party.kyc_validator"],
      permissionsRequired: ["CUSTOMER_VIEW", "CUSTOMER_CREATE", "SUPPLIER_VIEW", "SUPPLIER_CREATE"],
      supportedCommands: [
        "CreateParty",
        "UpdateParty",
        "AssignRole",
        "AdjustCreditBalance",
      ],
      supportedQueries: [
        "GetPartyById",
        "ListPartiesByRole",
        "SearchParties",
        "GetCreditStatus",
      ],
      publishedEvents: [
        "PARTY_CREATED",
        "PARTY_UPDATED",
        "PARTY_ROLE_ASSIGNED",
        "PARTY_CREDIT_ADJUSTED",
      ],
      healthStatus: "HEALTHY",
    };

    try {
      registry.registerEngine(descriptor, {
        commandHandlers: {
          CreateParty: async (ctx, cmd) => this.handleCreatePartyCommand(ctx, cmd),
          UpdateParty: async (ctx, cmd) => this.handleUpdatePartyCommand(ctx, cmd),
          AdjustCreditBalance: async (ctx, cmd) => this.handleAdjustCreditCommand(ctx, cmd),
        },
        queryHandlers: {
          GetPartyById: async (ctx, qry) => this.handleGetPartyByIdQuery(ctx, qry),
          ListPartiesByRole: async (ctx, qry) => this.handleListPartiesByRoleQuery(ctx, qry),
          SearchParties: async (ctx, qry) => this.handleSearchPartiesQuery(ctx, qry),
        },
        healthCheck: async () => ({
          engineId: PartyContactEngine.ENGINE_ID,
          status: "HEALTHY",
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // already registered or reloaded
    }
  }

  private assertIsolation(ctx: TenantContext, tenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
    if (!isSuperAdmin && ctx.tenantId !== tenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access party belonging to '${tenantId}'.`
      );
    }
  }

  public createParty(ctx: TenantContext, params: CreatePartyParams): UniversalParty {
    this.assertIsolation(ctx, params.tenantId);

    if (!params.name || params.name.trim().length === 0) {
      throw new Error("PARTY_NAME_REQUIRED: Party name cannot be empty.");
    }
    if (!params.roles || params.roles.length === 0) {
      throw new Error("PARTY_ROLE_REQUIRED: At least one party role must be specified.");
    }

    // Uniqueness validation within tenant
    if (params.email) {
      const emailLower = params.email.trim().toLowerCase();
      for (const p of this.parties.values()) {
        if (p.tenantId === params.tenantId && p.email?.toLowerCase() === emailLower) {
          throw new Error(`PARTY_EMAIL_EXISTS: Party with email '${params.email}' already exists in tenant.`);
        }
      }
    }

    if (params.phone) {
      const phoneNorm = params.phone.trim();
      for (const p of this.parties.values()) {
        if (p.tenantId === params.tenantId && p.phone === phoneNorm) {
          throw new Error(`PARTY_PHONE_EXISTS: Party with phone '${params.phone}' already exists in tenant.`);
        }
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const address = {
      street: params.address?.street,
      city: params.address?.city,
      region: params.address?.region,
      country: params.address?.country || "Tanzania",
    };

    const party: UniversalParty = {
      id,
      tenantId: params.tenantId,
      partyType: params.partyType,
      roles: [...params.roles],
      name: params.name.trim(),
      email: params.email ? params.email.trim().toLowerCase() : null,
      phone: params.phone ? params.phone.trim() : null,
      taxIdNumber: params.taxIdNumber ? params.taxIdNumber.trim() : null,
      nationalIdNumber: params.nationalIdNumber ? params.nationalIdNumber.trim() : null,
      status: "ACTIVE",
      address,
      creditLimit: params.creditLimit !== undefined ? Math.max(0, params.creditLimit) : 0,
      currentCreditBalance: 0,
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.parties.set(id, party);

    // Audit compliance logging
    AuditComplianceEngine.getInstance().record(ctx, {
      action: "CREATE_PARTY",
      entityType: "PARTY",
      entityId: id,
      afterState: { name: party.name, roles: party.roles, type: party.partyType },
    });

    // Domain event publishing
    DomainEventBusEngine.getInstance().publish({
      eventType: "PARTY_CREATED",
      engineId: PartyContactEngine.ENGINE_ID,
      aggregateType: "PARTY",
      aggregateId: id,
      tenantId: params.tenantId,
      actorId: ctx.userId || "system",
      payload: { partyId: id, name: party.name, roles: party.roles },
    });

    return { ...party };
  }

  public updateParty(ctx: TenantContext, params: UpdatePartyParams): UniversalParty {
    this.assertIsolation(ctx, params.tenantId);

    const party = this.parties.get(params.partyId);
    if (!party) {
      throw new Error(`PARTY_NOT_FOUND: Party '${params.partyId}' does not exist.`);
    }
    this.assertIsolation(ctx, party.tenantId);

    if (params.name !== undefined) {
      if (params.name.trim().length === 0) {
        throw new Error("PARTY_NAME_REQUIRED: Party name cannot be empty.");
      }
      party.name = params.name.trim();
    }
    if (params.email !== undefined) {
      party.email = params.email ? params.email.trim().toLowerCase() : null;
    }
    if (params.phone !== undefined) {
      party.phone = params.phone ? params.phone.trim() : null;
    }
    if (params.taxIdNumber !== undefined) {
      party.taxIdNumber = params.taxIdNumber ? params.taxIdNumber.trim() : null;
    }
    if (params.nationalIdNumber !== undefined) {
      party.nationalIdNumber = params.nationalIdNumber ? params.nationalIdNumber.trim() : null;
    }
    if (params.status !== undefined) {
      party.status = params.status;
    }
    if (params.address !== undefined) {
      party.address = { ...party.address, ...params.address };
    }
    if (params.creditLimit !== undefined) {
      party.creditLimit = Math.max(0, params.creditLimit);
    }
    if (params.metadata !== undefined) {
      party.metadata = { ...party.metadata, ...params.metadata };
    }

    party.updatedAt = new Date().toISOString();
    this.parties.set(party.id, party);

    // Audit compliance logging
    AuditComplianceEngine.getInstance().record(ctx, {
      action: "UPDATE_PARTY",
      entityType: "PARTY",
      entityId: party.id,
      afterState: { updatedFields: Object.keys(params) },
    });

    // Domain event
    DomainEventBusEngine.getInstance().publish({
      eventType: "PARTY_UPDATED",
      engineId: PartyContactEngine.ENGINE_ID,
      aggregateType: "PARTY",
      aggregateId: party.id,
      tenantId: party.tenantId,
      actorId: ctx.userId || "system",
      payload: { partyId: party.id, name: party.name, status: party.status },
    });

    return { ...party };
  }

  public assignRole(ctx: TenantContext, partyId: string, role: PartyRole): UniversalParty {
    const party = this.parties.get(partyId);
    if (!party) {
      throw new Error(`PARTY_NOT_FOUND: Party '${partyId}' does not exist.`);
    }
    this.assertIsolation(ctx, party.tenantId);

    if (!party.roles.includes(role)) {
      party.roles.push(role);
      party.updatedAt = new Date().toISOString();
      this.parties.set(party.id, party);

      DomainEventBusEngine.getInstance().publish({
        eventType: "PARTY_ROLE_ASSIGNED",
        engineId: PartyContactEngine.ENGINE_ID,
        aggregateType: "PARTY",
        aggregateId: party.id,
        tenantId: party.tenantId,
        actorId: ctx.userId || "system",
        payload: { partyId: party.id, role },
      });
    }

    return { ...party };
  }

  public adjustCreditBalance(ctx: TenantContext, params: AdjustCreditBalanceParams): {
    partyId: string;
    previousBalance: number;
    newBalance: number;
    creditLimit: number;
    availableCredit: number;
  } {
    this.assertIsolation(ctx, params.tenantId);

    const party = this.parties.get(params.partyId);
    if (!party) {
      throw new Error(`PARTY_NOT_FOUND: Party '${params.partyId}' does not exist.`);
    }
    this.assertIsolation(ctx, party.tenantId);

    const previousBalance = party.currentCreditBalance;
    const newBalance = previousBalance + params.amountDelta;

    // Credit limit check: if balance is increasing, make sure it doesn't exceed limit (if limit > 0)
    if (params.amountDelta > 0 && party.creditLimit > 0 && newBalance > party.creditLimit) {
      throw new Error(
        `CREDIT_LIMIT_EXCEEDED: Transaction of ${params.amountDelta} would cause balance (${newBalance}) to exceed credit limit of ${party.creditLimit}.`
      );
    }

    party.currentCreditBalance = newBalance;
    party.updatedAt = new Date().toISOString();
    this.parties.set(party.id, party);

    AuditComplianceEngine.getInstance().record(ctx, {
      action: "ADJUST_CREDIT_BALANCE",
      entityType: "PARTY",
      entityId: party.id,
      beforeState: { balance: previousBalance },
      afterState: {
        balance: newBalance,
        delta: params.amountDelta,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      },
    });

    DomainEventBusEngine.getInstance().publish({
      eventType: "PARTY_CREDIT_ADJUSTED",
      engineId: PartyContactEngine.ENGINE_ID,
      aggregateType: "PARTY",
      aggregateId: party.id,
      tenantId: party.tenantId,
      actorId: ctx.userId || "system",
      payload: {
        partyId: party.id,
        previousBalance,
        newBalance,
        delta: params.amountDelta,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      },
    });

    return {
      partyId: party.id,
      previousBalance,
      newBalance,
      creditLimit: party.creditLimit,
      availableCredit: Math.max(0, party.creditLimit - newBalance),
    };
  }

  public getParty(ctx: TenantContext, partyId: string): UniversalParty | null {
    const party = this.parties.get(partyId);
    if (!party) return null;
    this.assertIsolation(ctx, party.tenantId);
    return { ...party };
  }

  public listPartiesByRole(ctx: TenantContext, tenantId: string, role: PartyRole): UniversalParty[] {
    this.assertIsolation(ctx, tenantId);
    return Array.from(this.parties.values())
      .filter((p) => p.tenantId === tenantId && p.roles.includes(role))
      .map((p) => ({ ...p }));
  }

  public searchParties(
    ctx: TenantContext,
    tenantId: string,
    query: string,
    options?: { role?: PartyRole; status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" }
  ): UniversalParty[] {
    this.assertIsolation(ctx, tenantId);
    const q = query.trim().toLowerCase();

    return Array.from(this.parties.values())
      .filter((p) => {
        if (p.tenantId !== tenantId) return false;
        if (options?.role && !p.roles.includes(options.role)) return false;
        if (options?.status && p.status !== options.status) return false;

        const matchName = p.name.toLowerCase().includes(q);
        const matchPhone = p.phone?.includes(q) ?? false;
        const matchEmail = p.email?.toLowerCase().includes(q) ?? false;
        const matchTax = p.taxIdNumber?.toLowerCase().includes(q) ?? false;
        return matchName || matchPhone || matchEmail || matchTax;
      })
      .map((p) => ({ ...p }));
  }

  // -------------------------------------------------------------------------
  // CQRS Envelope Handlers
  // -------------------------------------------------------------------------

  private async handleCreatePartyCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const party = this.createParty(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: party,
        eventsPublished: ["PARTY_CREATED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "CREATE_PARTY_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleUpdatePartyCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const party = this.updateParty(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: party,
        eventsPublished: ["PARTY_UPDATED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "UPDATE_PARTY_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleAdjustCreditCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const result = this.adjustCreditBalance(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: result,
        eventsPublished: ["PARTY_CREDIT_ADJUSTED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "ADJUST_CREDIT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleGetPartyByIdQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<UniversalParty | null> {
    return this.getParty(ctx, qry.parameters.partyId as string);
  }

  private async handleListPartiesByRoleQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<UniversalParty[]> {
    return this.listPartiesByRole(
      ctx,
      qry.tenantId,
      qry.parameters.role as PartyRole
    );
  }

  private async handleSearchPartiesQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<UniversalParty[]> {
    return this.searchParties(
      ctx,
      qry.tenantId,
      (qry.parameters.query as string) || "",
      qry.parameters.options as any
    );
  }
}
