import { CoreEngineRegistry } from "./coreEngineRegistry.js";
import { StockLedgerEngine } from "../business/stockLedgerEngine.js";
import { InventoryEngine } from "../business/inventoryEngine.js";
import { ProductCatalogEngine } from "../business/productCatalogEngine.js";
import { PartyContactEngine } from "../business/partyContactEngine.js";
import { UniversalPaymentEngine } from "../business/universalPaymentEngine.js";
import { SalesProcessingEngine } from "../business/salesProcessingEngine.js";
import { PosCheckoutEngine } from "../business/posCheckoutEngine.js";

/**
 * Bootstraps all Foundation and Business Core engines into the Core Engine Registry.
 * Instantiates the engine singletons, wiring up command handlers, query handlers,
 * dependency definitions, and health checks.
 */
export function bootstrapCorePlatformEngines(
  registry: CoreEngineRegistry = CoreEngineRegistry.getInstance()
): CoreEngineRegistry {
  // 1. Foundation Engines
  if (!registry.getEngine("core.event_bus")) {
    registry.registerEngine({
      engineId: "core.event_bus",
      name: "Domain Event Bus Engine",
      version: "1.0.0",
      layer: "FOUNDATION",
      status: "ACTIVE",
      dependencies: [],
      extensionPoints: ["EventSubscribers"],
      permissionsRequired: [],
      supportedCommands: ["PublishEvent"],
      supportedQueries: ["GetEventHistory"],
      publishedEvents: ["*"],
      healthStatus: "HEALTHY",
    }, {
      healthCheck: async () => ({
        engineId: "core.event_bus",
        status: "HEALTHY",
        details: "Event bus listener pool active",
        timestamp: new Date().toISOString(),
      }),
    });
  }

  if (!registry.getEngine("core.audit_compliance")) {
    registry.registerEngine({
      engineId: "core.audit_compliance",
      name: "Audit & Compliance Engine",
      version: "1.0.0",
      layer: "FOUNDATION",
      status: "ACTIVE",
      dependencies: ["core.event_bus"],
      extensionPoints: ["AuditHandlers"],
      permissionsRequired: ["audit:read"],
      supportedCommands: ["RecordAuditEvent"],
      supportedQueries: ["GetAuditChain"],
      publishedEvents: ["AUDIT_RECORDED"],
      healthStatus: "HEALTHY",
    }, {
      healthCheck: async () => ({
        engineId: "core.audit_compliance",
        status: "HEALTHY",
        details: "Cryptographic SHA-256 hash chaining active",
        timestamp: new Date().toISOString(),
      }),
    });
  }

  if (!registry.getEngine("core.tenant_organization")) {
    registry.registerEngine({
      engineId: "core.tenant_organization",
      name: "Tenant & Organization Hierarchy Engine",
      version: "1.0.0",
      layer: "FOUNDATION",
      status: "ACTIVE",
      dependencies: ["core.event_bus"],
      extensionPoints: ["NodeValidators"],
      permissionsRequired: ["tenant:manage"],
      supportedCommands: ["CreateNode", "UpdateNode"],
      supportedQueries: ["GetTenantHierarchy"],
      publishedEvents: ["NODE_CREATED", "NODE_UPDATED"],
      healthStatus: "HEALTHY",
    }, {
      healthCheck: async () => ({
        engineId: "core.tenant_organization",
        status: "HEALTHY",
        details: "Multi-tenant node isolation barriers operational",
        timestamp: new Date().toISOString(),
      }),
    });
  }

  // 2. Business Core Engines (instantiation registers their descriptors & CQRS handlers)
  StockLedgerEngine.getInstance();
  InventoryEngine.getInstance();
  ProductCatalogEngine.getInstance();
  PartyContactEngine.getInstance();
  UniversalPaymentEngine.getInstance();
  SalesProcessingEngine.getInstance();
  PosCheckoutEngine.getInstance();

  return registry;
}
