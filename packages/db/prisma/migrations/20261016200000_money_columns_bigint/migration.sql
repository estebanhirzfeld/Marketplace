-- Las columnas de dinero pasan de INTEGER (32 bits, tope 2.147.483.647 centavos)
-- a BIGINT. Es una ampliación: todo valor existente cabe en el tipo nuevo, así
-- que no se pierde ni se reescribe ningún dato.

-- AlterTable
ALTER TABLE "listings" ALTER COLUMN "askingPrice" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "operations" ALTER COLUMN "offerPrice" SET DATA TYPE BIGINT,
ALTER COLUMN "finalPrice" SET DATA TYPE BIGINT,
ALTER COLUMN "buyerCommission" SET DATA TYPE BIGINT,
ALTER COLUMN "sellerCommission" SET DATA TYPE BIGINT,
ALTER COLUMN "buyerPays" SET DATA TYPE BIGINT,
ALTER COLUMN "sellerReceives" SET DATA TYPE BIGINT,
ALTER COLUMN "platformEarns" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "amountCents" SET DATA TYPE BIGINT;
