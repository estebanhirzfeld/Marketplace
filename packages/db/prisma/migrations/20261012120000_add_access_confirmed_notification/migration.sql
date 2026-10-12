-- Aviso al vendedor cuando la plataforma confirma su acceso, con la fecha a la que
-- se refiere (cuándo pasa a transferencia inmediata).
ALTER TYPE "NotificationType" ADD VALUE 'acceso_confirmado';
ALTER TABLE "notifications" ADD COLUMN "occursAt" TIMESTAMP(3);
