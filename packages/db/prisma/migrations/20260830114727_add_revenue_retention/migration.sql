-- Retención sobre el ingreso declarado.
--
-- El ingreso mensual de un canal de YouTube fija el precio y no se puede
-- comprobar contra ninguna API. Como el número no se puede verificar, parte
-- del cobro del vendedor queda retenida y se libera en proporción al ingreso
-- que el activo produce de verdad: declarar de más deja de rendir.
--
-- `revenueVerified` y `declaredRevenue` se congelan al crear la operación: el
-- listing puede cambiar después, pero el precio se acordó contra lo que decía
-- en ese momento.

ALTER TABLE "operations" ADD COLUMN "revenueVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "operations" ADD COLUMN "declaredRevenue" INTEGER;
ALTER TABLE "operations" ADD COLUMN "retention" JSONB;
