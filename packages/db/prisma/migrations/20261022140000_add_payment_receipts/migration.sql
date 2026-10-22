-- Comprobantes de la transferencia dividida.
--
-- Con la transferencia, cada uno recibe lo suyo: el comprador le transfiere al
-- vendedor lo que le corresponde y a la plataforma la comisión, y sube un
-- comprobante de cada una. Lo confirma quien recibió la plata. Los archivos
-- viven en el almacenamiento de archivos; acá, su clave y su estado.

ALTER TABLE "operations" ADD COLUMN "paymentReceipts" JSONB;

ALTER TYPE "NotificationType" ADD VALUE 'comprobante_subido';
ALTER TYPE "NotificationType" ADD VALUE 'comprobante_rechazado';
