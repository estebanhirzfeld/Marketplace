-- Constancia de que la plataforma tiene acceso al activo.
--
-- No es verificable por API: `channels.list` no expone ningún campo que
-- indique si un canal es Cuenta de Marca ni que liste sus propietarios, y
-- quien es invitado a administrar un canal tampoco puede usar las APIs de
-- YouTube. La atestigua un admin.
--
-- Guarda desde cuándo hay acceso; los días de espera que impone la plataforma
-- del activo se calculan a partir de esa fecha, no se guardan.

ALTER TABLE "listings" ADD COLUMN "platformAccess" JSONB;
