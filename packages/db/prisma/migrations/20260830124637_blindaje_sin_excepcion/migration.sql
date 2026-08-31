-- Todo activo se publica blindado, sin excepción.
--
-- `isBlind` era una opción de quien publicaba: podía destildarla y exponer la
-- dirección de su canal a cualquiera que entrara al mercado. Que dependiera de
-- un checkbox significaba que un descuido —o un valor por defecto mal puesto
-- en cualquier capa— filtraba la identidad del activo.
--
-- Deja de ser una opción para pasar a ser una propiedad de la entidad: no hay
-- forma de representar un listing no blindado. La identidad se revela cuando
-- alguien la puede ver, no cuando alguien la dejó abierta.

ALTER TABLE "listings" DROP COLUMN "isBlind";
