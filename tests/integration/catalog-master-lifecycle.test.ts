import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaCatalogRepository, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";

describe("Catalog master lifecycle: PostgreSQL + sync + fresh client", () => {
  it("persists and converges Category/Brand across clients, edit, delete/reassign and tenant boundaries", async () => {
    const tenantA = randomUUID(); const branchA = randomUUID(); const tenantB = randomUUID(); const branchB = randomUUID();
    const ctxA: any = { tenantId: tenantA, branchId: branchA, userId: randomUUID() }; const ctxB: any = { tenantId: tenantB, branchId: branchB, userId: randomUUID() };
    const categoryId = randomUUID(); const replacementCategoryId = randomUUID(); const brandId = randomUUID(); const replacementBrandId = randomUUID(); const productId = randomUUID();
    const hierarchyRootId = randomUUID(); const hierarchyChildId = randomUUID(); const hierarchyGrandchildId = randomUUID();
    const catalog = new PrismaCatalogRepository(); const products = new PrismaProductRepository(); const stock = new PrismaStockRepository(); const sync = new PrismaSyncEngine(products, stock);
    try {
      await prisma.tenant.create({ data: { id: tenantA, name: "Catalog Test A", slug: `catalog-a-${tenantA.slice(0,8)}`, branches: { create: { id: branchA, name: "Main A", code: `A-${branchA.slice(0,6)}` } } } });
      await prisma.tenant.create({ data: { id: tenantB, name: "Catalog Test B", slug: `catalog-b-${tenantB.slice(0,8)}`, branches: { create: { id: branchB, name: "Main B", code: `B-${branchB.slice(0,6)}` } } } });
      const c1 = await catalog.createCategory(ctxA, { id: categoryId, name: "Audit Category", code: "AUDIT_CATEGORY" });
      const c2 = await catalog.createCategory(ctxA, { id: replacementCategoryId, name: "Replacement Category", code: "REPLACEMENT_CATEGORY" });
      const hierarchyRoot = await catalog.createCategory(ctxA, { id: hierarchyRootId, name: "Hierarchy Root", code: "HIERARCHY_ROOT" });
      const hierarchyChild = await catalog.createCategory(ctxA, { id: hierarchyChildId, name: "Hierarchy Child", code: "HIERARCHY_CHILD", parentId: hierarchyRootId });
      const hierarchyGrandchild = await catalog.createCategory(ctxA, { id: hierarchyGrandchildId, name: "Hierarchy Grandchild", code: "HIERARCHY_GRANDCHILD", parentId: hierarchyChildId });
      expect(hierarchyChild.parentId).toBe(hierarchyRootId);
      expect(hierarchyGrandchild.parentId).toBe(hierarchyChildId);
      await expect(catalog.updateCategory(ctxA, hierarchyRootId, { parentId: hierarchyGrandchildId })).rejects.toThrow("circular parent chain");
      const b1 = await catalog.createBrand(ctxA, { id: brandId, name: "Audit Brand", code: "AUDIT_BRAND" });
      const b2 = await catalog.createBrand(ctxA, { id: replacementBrandId, name: "Replacement Brand", code: "REPLACEMENT_BRAND" });
      expect(c1.tenantId).toBe(tenantA); expect(b1.branchId).toBe(branchA);

      const client1 = new LocalIndexedDbStore();
      const client2 = new LocalIndexedDbStore();
      await client1.ready; await client2.ready;
      client1.saveCatalogCategoriesLocal([c1, c2], { tenantId: tenantA, branchId: branchA });
      client1.saveCatalogBrandsLocal([b1, b2], { tenantId: tenantA, branchId: branchA });
      await products.createProduct(ctxA, { id: productId, name: "Catalog Lifecycle Product", sku: `CAT-${productId.slice(0,8)}`, categoryId, brandId, category: c1.name, brand: b1.name, buyingPrice: 10, sellingPrice: 15, hasVariants: false });
      const edited = await catalog.updateCategory(ctxA, categoryId, { name: "Audit Category Edited" });
      const editedBrand = await catalog.updateBrand(ctxA, brandId, { name: "Audit Brand Edited" });
      const renamedProduct = await prisma.product.findUnique({ where: { id: productId } });
      expect(renamedProduct?.category).toBe("Audit Category Edited");
      expect(renamedProduct?.brandId).toBe(brandId);
      const bootstrapBeforeDelete = await sync.processBootstrap(ctxA, { deviceId: "catalog-client-1", schemaVersion: client1.schemaVersion });
      await client2.bootstrapFromAuthoritativeSnapshot(bootstrapBeforeDelete, { tenantId: tenantA, branchId: branchA });
      expect(client2.getConfigurationLocal("inventory_categories_meta", { tenantId: tenantA, branchId: branchA }).some((c: any) => c.id === categoryId && c.name === "Audit Category Edited")).toBe(true);
      expect(client2.getConfigurationLocal("inventory_brands_meta", { tenantId: tenantA, branchId: branchA }).some((b: any) => b.id === brandId && b.name === "Audit Brand Edited")).toBe(true);


      const foreignRead = await catalog.listCategories(ctxB);
      const foreignBrandRead = await catalog.listBrands(ctxB);
      expect(foreignRead.some((c) => c.id === categoryId)).toBe(false);
      expect(foreignBrandRead.some((b) => b.id === brandId)).toBe(false);

      const deletedCategory = await catalog.deleteCategory(ctxA, categoryId, replacementCategoryId);
      const deletedBrand = await catalog.deleteBrand(ctxA, brandId, replacementBrandId);
      expect(deletedCategory.reassigned).toBe(1); expect(deletedBrand.reassigned).toBe(1);
      const persistedProduct = await prisma.product.findUnique({ where: { id: productId } });
      expect(persistedProduct?.categoryId).toBe(replacementCategoryId); expect(persistedProduct?.brandId).toBe(replacementBrandId);

      const delta = await sync.processDelta(ctxA, { since: new Date(Date.now() - 60_000).toISOString() });
      expect(delta.categories.some((c: any) => c.id === categoryId && c.isActive === false)).toBe(true);
      expect(delta.brands.some((b: any) => b.id === brandId && b.isActive === false)).toBe(true);
      await client2.applyServerDelta(delta);
      const client2Cats = client2.getConfigurationLocal("inventory_categories_meta", { tenantId: tenantA, branchId: branchA });
      const client2Brands = client2.getConfigurationLocal("inventory_brands_meta", { tenantId: tenantA, branchId: branchA });
      expect(client2Cats.some((c: any) => c.id === categoryId)).toBe(false); expect(client2Brands.some((b: any) => b.id === brandId)).toBe(false);
      expect(client2Cats.some((c: any) => c.id === replacementCategoryId)).toBe(true); expect(client2Brands.some((b: any) => b.id === replacementBrandId)).toBe(true);
      expect(edited.name).toBe("Audit Category Edited"); expect(editedBrand.name).toBe("Audit Brand Edited");
    } finally {
      await prisma.product.deleteMany({ where: { tenantId: tenantA } });
      await prisma.category.deleteMany({ where: { tenantId: tenantA } });
      await prisma.brand.deleteMany({ where: { tenantId: tenantA } });
      await prisma.branch.deleteMany({ where: { tenantId: tenantA } });
      await prisma.tenant.deleteMany({ where: { id: tenantA } });
      await prisma.branch.deleteMany({ where: { tenantId: tenantB } });
      await prisma.tenant.deleteMany({ where: { id: tenantB } });
    }
  });
});



