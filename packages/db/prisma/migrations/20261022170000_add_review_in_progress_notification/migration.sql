-- Aviso al comprador de que su comprobante pasó a la revisión de la plataforma.
--
-- El segundo rechazo de un mismo comprobante abre la revisión solo: el aviso de
-- rechazo le pedía adjuntar otro, que es justo lo que la revisión bloquea.

ALTER TYPE "NotificationType" ADD VALUE 'revision_en_curso';
