-- CreateTable
CREATE TABLE "seller_payment_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mpUserId" TEXT NOT NULL,
    "accessTokenCipher" TEXT NOT NULL,
    "refreshTokenCipher" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_payment_accounts_userId_key" ON "seller_payment_accounts"("userId");

-- AddForeignKey
ALTER TABLE "seller_payment_accounts" ADD CONSTRAINT "seller_payment_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
