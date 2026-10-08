export interface BundleComponentSnapshot {
  variantId: string;
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface BundleResolution {
  isBundle: boolean;
  parentVariantId: string;
  definitionVersion: string;
  unitCost: number;
  components: BundleComponentSnapshot[];
}

function readBundleComponents(variant: any): any[] | null {
  const attributes = variant?.attributes && typeof variant.attributes === "object" ? variant.attributes : {};
  const raw = attributes.bundleComponents;
  if (attributes.__bundle === true || Array.isArray(raw)) {
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("BUNDLE_DEFINITION_INVALID");
    return raw;
  }
  return null;
}

export async function resolveBundleDefinition(
  tx: any,
  tenantId: string,
  branchId: string,
  variantId: string,
): Promise<BundleResolution> {
  const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.tenantId !== tenantId || variant.branchId !== branchId || variant.isActive === false) {
    throw new Error("FINANCE_VARIANT_BOUNDARY_VIOLATION");
  }

  const components = readBundleComponents(variant);
  const definitionVersion = variant.updatedAt ? new Date(variant.updatedAt).toISOString() : "UNKNOWN";
  if (!components) {
    return {
      isBundle: false,
      parentVariantId: variant.id,
      definitionVersion,
      unitCost: Number(variant.costPrice || 0),
      components: [{
        variantId: variant.id,
        productId: variant.productId,
        quantity: 1,
        unitCost: Number(variant.costPrice || 0),
      }],
    };
  }

  const seen = new Set<string>();
  const resolved: BundleComponentSnapshot[] = [];
  for (const component of components) {
    const componentVariantId = String(component?.variantId || "").trim();
    const componentQty = Number(component?.quantity);
    if (!componentVariantId || componentVariantId === variant.id || seen.has(componentVariantId)) {
      throw new Error(componentVariantId === variant.id ? "BUNDLE_SELF_REFERENCE" : "BUNDLE_COMPONENT_DUPLICATE");
    }
    if (!Number.isFinite(componentQty) || componentQty <= 0) throw new Error("BUNDLE_COMPONENT_QUANTITY_INVALID");
    seen.add(componentVariantId);

    const componentVariant = await tx.productVariant.findUnique({ where: { id: componentVariantId } });
    if (!componentVariant || componentVariant.tenantId !== tenantId || componentVariant.branchId !== branchId || componentVariant.isActive === false) {
      throw new Error("BUNDLE_COMPONENT_OUT_OF_SCOPE");
    }
    const nested = readBundleComponents(componentVariant);
    if (nested) throw new Error("BUNDLE_NESTING_NOT_SUPPORTED");

    resolved.push({
      variantId: componentVariant.id,
      productId: componentVariant.productId,
      quantity: componentQty,
      unitCost: Number(componentVariant.costPrice || 0),
    });
  }

  const unitCost = resolved.reduce((sum, component) => sum + component.quantity * component.unitCost, 0);
  return {
    isBundle: true,
    parentVariantId: variant.id,
    definitionVersion,
    unitCost,
    components: resolved,
  };
}
