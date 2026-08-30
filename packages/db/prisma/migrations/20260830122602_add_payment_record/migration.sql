-- Constancia del pago del comprador.
--
-- Confirmar el pago era un botón sin registro de por dónde había entrado la
-- plata. Guardar el identificador de la pasarela permite reconciliar más
-- adelante y, sobre todo, es la evidencia que se presenta ante un contracargo
-- junto con la constancia de custodia: prueba que el activo ya estaba en manos
-- de la plataforma cuando se cobró.

ALTER TABLE "operations" ADD COLUMN "payment" JSONB;
