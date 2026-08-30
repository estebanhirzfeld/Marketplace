-- Constancia de que el vendedor controla el activo.
--
-- A diferencia de las otras dos constancias, esta no la atestigua un admin:
-- sale de la propia fuente. Google devuelve qué canales controla quien otorgó
-- el permiso, y AdSense qué dominios reporta su cuenta.
--
-- Guarda el identificador canónico que devolvió la fuente —no el que el
-- vendedor escribió— y, cuando la fuente lo expone, el ingreso comprobado.

ALTER TABLE "listings" ADD COLUMN "ownershipCheck" JSONB;
