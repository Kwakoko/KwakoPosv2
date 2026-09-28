import { prisma } from "@kwakopos2/database";
import { generateAccessToken } from "@kwakopos2/auth";

const tenantId = crypto.randomUUID();
const branchId = crypto.randomUUID();
const userId = crypto.randomUUID();
const customerId = crypto.randomUUID();
const token = generateAccessToken({
  userId, tenantId, branchId, email: "debug@kwakopos.test",
  roles: ["ADMIN"], permissions: ["*"], deviceId: "DEBUG-DELTA"
});

async function main() {
  await prisma.tenant.create({ data: { id: tenantId, name: "Debug Delta", slug: "debug-" + tenantId.slice(0, 8) }});
  await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: "DBG-" + branchId.slice(0,8) }});
  const acceptance = await fetch("http://127.0.0.1:3000/api/legal/acceptance/accept-all", {
    method: "POST",
    headers: { authorization: "Bearer " + token },
  });
  console.log("ACCEPT", acceptance.status, await acceptance.text());

  const push = await fetch("http://127.0.0.1:3000/sync/push", {
    method: "POST",
    headers: {"content-type":"application/json", authorization:"Bearer " + token},
    body: JSON.stringify({
      deviceId:"DEBUG-DELTA",
      operations:[{
        operationId: crypto.randomUUID(), entityType:"Customer", entityId:customerId, operationType:"CREATE",
        payload:{id:customerId, customerCode:"DBG-"+customerId.slice(0,8), name:"Debug Delta Customer", status:"ACTIVE"},
        clientCreatedAt:new Date().toISOString(), idempotencyKey:"DBG-"+customerId
      }]
    })
  });
  console.log("PUSH", push.status, await push.text());
  const rows = await prisma.$queryRawUnsafe("SELECT revision, tenant_id, branch_id, operation_id, entity_type FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2 ORDER BY revision", tenantId, branchId);
  console.log("JOURNAL", rows);
  const delta = await fetch("http://127.0.0.1:3000/sync/delta?since=rev:0", {
    headers:{authorization:"Bearer " + token}
  });
  console.log("DELTA", delta.status, await delta.text());
  await prisma.tenant.delete({where:{id:tenantId}});
}
main().catch(e=>{console.error(e); process.exitCode=1}).finally(()=>prisma.$disconnect());
