-- Hitos de la operación que anclan los plazos del traspaso.
--
-- La firma del tripartito no quedaba registrada en la operación, y de ella
-- corre el plazo del vendedor para ceder el activo. La custodia y el pago ya
-- tienen su constancia con fecha, así que no se repiten acá.
--
-- Relleno: para las operaciones ya firmadas, `signedAt` es la última firma del
-- tripartito completo, tomada de `contracts.signatures`.

ALTER TABLE "operations" ADD COLUMN "milestones" JSONB;

UPDATE "operations" AS o
SET "milestones" = jsonb_build_object('signedAt', s."signedAt")
FROM (
    SELECT
        c."operationId",
        to_char(
            max((sig->>'signedAt')::timestamptz) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) AS "signedAt"
    FROM "contracts" AS c, jsonb_array_elements(c."signatures") AS sig
    WHERE c."type" = 'tripartite' AND c."operationId" IS NOT NULL
    GROUP BY c."operationId"
    HAVING bool_and((sig->>'signed')::boolean) AND bool_and(sig->>'signedAt' IS NOT NULL)
) AS s
WHERE o."id" = s."operationId"
  AND o."status" IN ('contract_signed', 'transfer_in_progress', 'asset_in_custody', 'payment_received', 'completed');
