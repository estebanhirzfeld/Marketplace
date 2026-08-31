-- Se revierte la retención sobre el ingreso declarado.
--
-- La plataforma cobra 5% a cada parte y no asume el riesgo de que una de ellas
-- mienta. Ante un fraude no retiene fondos ni ajusta el precio: entrega la
-- documentación y los datos de la parte en falta a su contraparte para que
-- inicie las acciones legales que correspondan.
--
-- El ingreso declarado de un canal sigue sin poder verificarse. La respuesta a
-- eso es dejar constancia de qué se declaró, cuándo y quién lo declaró —no
-- garantizar el número.

ALTER TABLE "operations" DROP COLUMN "revenueVerified";
ALTER TABLE "operations" DROP COLUMN "declaredRevenue";
ALTER TABLE "operations" DROP COLUMN "retention";
