-- Enforce the one-to-one DrawerOperation -> Payment relation represented by
-- DrawerOperation.paymentByPaymentId in Prisma.
CREATE UNIQUE INDEX IF NOT EXISTS "drawer_operations_paymentId_key"
  ON "drawer_operations"("paymentId");