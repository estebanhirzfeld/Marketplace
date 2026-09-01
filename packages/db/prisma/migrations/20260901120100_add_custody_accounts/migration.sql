-- Identidad de custodia y constancia de entrega.
-- Todo aditivo y nullable: ninguna fila existente se reescribe ni queda
-- inválida. Las constancias `platformAccess` previas quedan con
-- `custodyAccountId` NULL a propósito y sin backfill.

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "custodyAccountId" TEXT;

-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "deliveryCheck" JSONB,
ADD COLUMN     "recipientIdentity" JSONB;

-- CreateTable
CREATE TABLE "custody_accounts" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custody_accounts_identifier_key" ON "custody_accounts"("identifier");

-- CreateIndex
CREATE INDEX "custody_accounts_assetType_isActive_idx" ON "custody_accounts"("assetType", "isActive");

-- CreateIndex
CREATE INDEX "listings_custodyAccountId_idx" ON "listings"("custodyAccountId");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_custodyAccountId_fkey" FOREIGN KEY ("custodyAccountId") REFERENCES "custody_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
