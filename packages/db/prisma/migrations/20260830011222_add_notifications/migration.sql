-- Bandeja de avisos.
--
-- La negociación tiene turnos: sin avisos, enterarse de que te toca responder
-- depende de entrar a mirar.
--
-- No se guarda el texto del mensaje, solo el tipo y las referencias. Redactar
-- es responsabilidad de la vista: así se cambia la redacción sin migrar.

CREATE TYPE "NotificationType" AS ENUM (
    'oferta_recibida',
    'contraoferta_recibida',
    'oferta_aceptada',
    'oferta_cancelada',
    'listing_aprobado',
    'listing_rechazado',
    'contrato_firmado',
    'activo_en_custodia',
    'pago_confirmado',
    'operacion_completada'
);

CREATE TABLE "notifications" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "type"        "NotificationType" NOT NULL,
    "operationId" TEXT,
    "listingId"   TEXT,
    "amountCents" INTEGER,
    "currency"    TEXT,
    "readAt"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- La bandeja se consulta siempre por usuario y ordenada por fecha.
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
