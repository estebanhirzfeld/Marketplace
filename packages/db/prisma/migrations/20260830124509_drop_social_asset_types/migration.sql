-- Instagram y TikTok salen del catálogo de activos.
--
-- El motivo es anterior al técnico: sus términos prohíben transferir una
-- cuenta —TikTok explícitamente, en su sección 3.2—, así que el activo no se
-- puede entregar de forma legítima y la plataforma estaría facilitando el
-- incumplimiento de sus propios usuarios frente a un tercero.
--
-- Postgres no permite quitar valores de un enum, así que se recrea el tipo.
-- Las publicaciones de esos tipos, si las hubiera, se borran antes: no se
-- pueden reconstituir sin una estrategia que ya no existe en el dominio.

DELETE FROM "listings" WHERE "assetType" IN ('instagram', 'tiktok');

ALTER TYPE "AssetType" RENAME TO "AssetType_old";
CREATE TYPE "AssetType" AS ENUM ('youtube', 'web');
ALTER TABLE "listings" ALTER COLUMN "assetType" TYPE "AssetType" USING ("assetType"::text::"AssetType");
DROP TYPE "AssetType_old";
