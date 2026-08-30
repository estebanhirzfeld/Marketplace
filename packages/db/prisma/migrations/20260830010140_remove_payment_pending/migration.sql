-- Elimina el estado `payment_pending` del enum OperationStatus.
--
-- Ninguna transición del dominio lo producía: `asset_in_custody` ya significa
-- "esperando el pago". Dejarlo en el enum sugería una etapa del escrow que no
-- existe.
--
-- Postgres no permite quitar un valor de un enum, así que se recrea el tipo.
-- El USING re-castea la columna pasando por texto; si alguna fila tuviera el
-- valor eliminado, la migración fallaría en vez de corromper el dato.

ALTER TYPE "OperationStatus" RENAME TO "OperationStatus_old";

CREATE TYPE "OperationStatus" AS ENUM (
    'offer_sent',
    'negotiating',
    'contract_pending',
    'contract_signed',
    'transfer_in_progress',
    'asset_in_custody',
    'payment_received',
    'completed',
    'cancelled'
);

ALTER TABLE "operations" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "operations"
    ALTER COLUMN "status" TYPE "OperationStatus"
    USING ("status"::text::"OperationStatus");

ALTER TABLE "operations" ALTER COLUMN "status" SET DEFAULT 'offer_sent';

DROP TYPE "OperationStatus_old";
