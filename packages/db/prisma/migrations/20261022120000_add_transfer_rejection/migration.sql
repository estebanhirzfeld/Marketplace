-- Rechazo de una declaración de cesión.
--
-- Un admin que encuentra falsa la declaración del vendedor (dijo que cedió y el
-- activo no llegó) vuelve la operación a «contrato firmado». El motivo queda en
-- la operación, a la vista del vendedor, y le llega un aviso.

ALTER TABLE "operations" ADD COLUMN "transferRejection" JSONB;

ALTER TYPE "NotificationType" ADD VALUE 'cesion_rechazada';
