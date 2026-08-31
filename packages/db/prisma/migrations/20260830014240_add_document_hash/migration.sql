-- Huella del documento firmado.
--
-- Hasta ahora una firma registraba rol, IP y fecha, pero no existía ningún
-- documento al que refiriera: el sistema guardaba que alguien apretó un botón
-- sin poder responder qué aceptó.
--
-- El texto no se guarda: se regenera de forma determinista desde los datos de
-- la operación, y este hash prueba que lo regenerado es idéntico a lo firmado.
-- Cada firma guarda además, dentro del JSON de `signatures`, el hash vigente
-- al momento de firmarse.

ALTER TABLE "contracts" ADD COLUMN "documentHash" TEXT;
