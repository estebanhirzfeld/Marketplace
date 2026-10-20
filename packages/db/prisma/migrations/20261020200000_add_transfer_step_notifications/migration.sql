-- Avisos a los administradores durante el traslado del dominio de un sitio a la
-- cuenta de la plataforma. `occursAt` lleva el plazo de la invitación.
ALTER TYPE "NotificationType" ADD VALUE 'traspaso_recordatorio';
ALTER TYPE "NotificationType" ADD VALUE 'traspaso_vencido';
ALTER TYPE "NotificationType" ADD VALUE 'dominio_en_custodia';
