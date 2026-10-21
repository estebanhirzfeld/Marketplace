-- Avisos de la entrega del dominio de un sitio al comprador: el recordatorio a
-- él y el vencimiento a los administradores. `occursAt` lleva el plazo de la
-- invitación de Hostinger.
ALTER TYPE "NotificationType" ADD VALUE 'entrega_recordatorio';
ALTER TYPE "NotificationType" ADD VALUE 'entrega_vencida';
