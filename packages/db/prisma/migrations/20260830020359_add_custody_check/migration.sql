-- Constancia de la verificación de custodia.
--
-- Confirmar custodia era un admin apretando un botón, sin registro de qué
-- había verificado. Es el paso donde la plataforma asume el riesgo y habilita
-- el pago del comprador: es el que más necesita constancia.
--
-- Guarda quién verificó, cuándo, si la plataforma quedó como propietaria
-- principal, si los accesos están asegurados y una foto de las métricas.

ALTER TABLE "operations" ADD COLUMN "custodyCheck" JSONB;
