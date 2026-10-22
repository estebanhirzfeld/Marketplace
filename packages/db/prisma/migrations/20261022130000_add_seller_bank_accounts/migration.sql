-- Cuenta bancaria del vendedor para cobrar por transferencia.
--
-- Con la transferencia, cada parte recibe lo suyo: el comprador le transfiere
-- al vendedor lo que le corresponde, directo a su cuenta, y la comisión a la
-- plataforma. Una cuenta por moneda.

CREATE TABLE "seller_bank_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "cbu" TEXT,
    "alias" TEXT,
    "holder" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_bank_accounts_userId_currency_key" ON "seller_bank_accounts"("userId", "currency");

ALTER TABLE "seller_bank_accounts" ADD CONSTRAINT "seller_bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
