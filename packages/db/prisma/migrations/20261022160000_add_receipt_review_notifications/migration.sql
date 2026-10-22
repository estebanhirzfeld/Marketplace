-- Avisos de la revisión de un comprobante rechazado.
--
-- La revisión vive dentro de `paymentReceipts` (JSONB), así que no hay columnas
-- nuevas: solo los avisos a la plataforma, al vendedor y a las dos partes.

ALTER TYPE "NotificationType" ADD VALUE 'revision_solicitada';
ALTER TYPE "NotificationType" ADD VALUE 'revision_pendiente_vendedor';
ALTER TYPE "NotificationType" ADD VALUE 'revision_resuelta';
