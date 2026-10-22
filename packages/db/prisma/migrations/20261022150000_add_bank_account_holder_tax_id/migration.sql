-- CUIT o CUIL del titular de la cuenta bancaria del vendedor.
--
-- La cuenta tiene que estar a nombre del vendedor: su CUIT se compara con el
-- DNI verificado al declararla. Acepta nulos porque las cuentas declaradas
-- antes de pedirlo siguen siendo válidas hasta que el vendedor las actualice.

ALTER TABLE "seller_bank_accounts" ADD COLUMN "holderTaxId" TEXT;
