-- Avisos de la entrega de un canal.
--
-- Al comprador: la plataforma lo invitó a la cuenta de marca, y ya es
-- propietario principal con su plazo para confirmar la recepción. A las dos
-- partes: la recepción quedó confirmada, por el comprador o al vencer su plazo.

ALTER TYPE "NotificationType" ADD VALUE 'invitacion_enviada';
ALTER TYPE "NotificationType" ADD VALUE 'recepcion_pendiente';
ALTER TYPE "NotificationType" ADD VALUE 'activo_recibido';
