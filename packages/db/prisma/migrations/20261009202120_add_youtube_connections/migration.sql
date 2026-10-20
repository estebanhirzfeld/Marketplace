-- CreateTable
CREATE TABLE "youtube_connections" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "grantedScopes" TEXT[],
    "refreshTokenCipher" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "connectedAt" TIMESTAMP(3) NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "lastSnapshot" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "youtube_connections_sellerId_channelId_key" ON "youtube_connections"("sellerId", "channelId");

-- AddForeignKey
ALTER TABLE "youtube_connections" ADD CONSTRAINT "youtube_connections_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un canal de YouTube publicado a la vez.
--
-- La regla "un canal ya publicado no se publica de nuevo" la comprueba el caso
-- de uso consultando y después guardando; dos pedidos simultáneos pasan ambos
-- la consulta. Este índice único PARCIAL es el respaldo en la base, y es el
-- mecanismo más simple que ella misma garantiza: sin tabla nueva, sin
-- columna duplicada ni sincronización, porque indexa el dato que ya está en
-- `assetData` (la URL `https://www.youtube.com/channel/<id>` que escribe el
-- alta desde una conexión).
--
-- Alcance, a propósito acotado:
--   * solo activos de YouTube creados desde una conexión, que son los que
--     llevan `verifiedFromYouTubeAt`: los cargados a mano (sin marca) y los
--     anteriores a este cambio no se tocan, así que la migración no puede
--     fallar por datos viejos duplicados;
--   * solo estados vigentes. Un activo `rejected` o `sold` libera el canal, lo
--     mismo que hace el caso de uso.
-- La aplicación traduce la violación a `ChannelAlreadyListedError`.
CREATE UNIQUE INDEX "listings_active_youtube_channel_key"
    ON "listings" (("assetData" ->> 'channelUrl'))
    WHERE "assetType" = 'youtube'
      AND "status" IN ('draft', 'under_review', 'published', 'in_operation')
      AND ("assetData" ->> 'verifiedFromYouTubeAt') IS NOT NULL
      AND ("assetData" ->> 'channelUrl') IS NOT NULL;
