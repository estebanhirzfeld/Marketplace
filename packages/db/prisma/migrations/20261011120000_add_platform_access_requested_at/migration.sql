-- Cuándo el vendedor declaró que ya invitó a la plataforma.
--
-- Es una declaración y no una constancia: la constancia sigue siendo
-- "platformAccess", que la registra un admin. Esta columna solo permite que la
-- cola de revisión vea qué activos esperan verificación.

ALTER TABLE "listings" ADD COLUMN "platformAccessRequestedAt" TIMESTAMP(3);
