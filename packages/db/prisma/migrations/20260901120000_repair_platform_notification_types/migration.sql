-- Las 4 variantes de NotificationType dirigidas a la plataforma se habían
-- agregado al schema por db:push en una fase anterior sin migración. Esto
-- repara el historial para que make db-reset produzca un enum completo.
ALTER TYPE "NotificationType" ADD VALUE 'revision_pendiente';
ALTER TYPE "NotificationType" ADD VALUE 'acceso_pendiente';
ALTER TYPE "NotificationType" ADD VALUE 'custodia_pendiente';
ALTER TYPE "NotificationType" ADD VALUE 'liquidacion_pendiente';
