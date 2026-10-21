# Propuesta: que vender un sitio sea un recorrido claro para las tres partes

## Intención

La fase 20 dejó el motor del traspaso de un sitio: el dominio entra en custodia en la cuenta de
Hostinger de la plataforma, se comprueba solo, se entrega al comprador por un traslado saliente y
tiene plazos con avisos. Pero la prueba local del 21/10/2026 mostró que una persona no puede
recorrerlo: la firma de un sitio sigue trabada por el acceso de YouTube, los tres roles leen cosas
que se contradicen, el pago termina en «abrí un reclamo», nadie le pide al comprador el mail de
Hostinger y nadie entrega ni recibe el sitio en sí. El detalle, con rutas y líneas, está en
`explore.md`.

Este cambio rehace el recorrido de un sitio sobre ese motor, sin tocar el de YouTube.

## Alcance

1. **Sacar el modelo de YouTube del recorrido de un sitio.** La firma del tripartito de un sitio
   deja de exigir `platformAccess`; aceptar una oferta por un sitio deja de avisar
   `acceso_pendiente`; un sitio no aparece en la bandeja de accesos ni muestra «Transferencia
   inmediata», niveles o «Ya lo hice». Los formularios de custodia y de cierre de un sitio piden
   solo lo que el registrador no comprueba, sin textos de YouTube. La autoría para publicar sigue
   siendo el TXT de la fase 18; la API de Hostinger es para el traspaso.
2. **Entregar el sitio en sí, no solo el dominio.** Definir cómo llegan al comprador el hosting, los
   archivos, el código, la base de datos y las cuentas asociadas; escribir los pasos con
   instrucciones concretas para el vendedor; darle al comprador un paso para recibirlos y
   confirmarlos.
3. **Una sola próxima acción por rol.** En cada estado, la página de la operación dice a cada parte
   qué le toca, sin contradecirse con lo que ven las otras; el panel del admin muestra el próximo
   paso real de un sitio; las acciones del admin que se pisan (comprobar el dominio y declarar la
   custodia, comprobar la entrega y cerrar) se juntan.
4. **Un pago que no termina en un reclamo.** Si no hay ningún medio de pago disponible, el comprador
   lo lee como algo de la plataforma y no como un problema suyo, y el admin se entera.
5. **Los avisos que el recorrido necesita:** al comprador para declarar el mail de su cuenta de
   Hostinger y si Hostinger lo rechaza; al vendedor cuando el activo está en custodia; al comprador
   cuando se confirmó su pago; a la plataforma si falta un perfil WHOIS; y los que los textos ya
   prometen.
6. **La prueba de punta a punta** que la fase 20 dejó pendiente, con `deliaorrego.online` y dos
   cuentas de Hostinger, como validación de este cambio.

## Fuera de alcance

- El recorrido de un canal de YouTube.
- Otros registradores y dominios `.ar`.
- Mail como canal de avisos: los avisos siguen siendo los de la campana.
- Crear perfiles WHOIS desde la app.
- Comprobar de antemano que un mail tenga cuenta de Hostinger: la API no lo permite.

## Decisiones pendientes del usuario

1. **Cómo se entrega el hosting y los archivos.** Por ejemplo: el vendedor sube un respaldo a la
   plataforma; le pasa al comprador el acceso al panel del hosting; o el vendedor elige y lo declara.
   Define el paso del vendedor, el del comprador y qué comprueba el admin.
2. **Si los pasos declarados traban el cierre.** Hoy «Dar por cumplido» no traba nada; si el sitio
   se entrega por pasos, ¿el cierre exige que estén todos cumplidos?
3. **Qué ve el comprador si no hay medio de pago,** y si eso se resuelve solo con texto o
   configurando la transferencia bancaria por defecto.

## Riesgos

- Cambiar la guarda de la firma toca el contrato de firma, que también usa YouTube: el cambio tiene
  que quedar acotado a sitios y probado contra los dos tipos.
- Los textos nuevos tienen que seguir pasando la guarda de textos de sitios
  (`apps/web/tests/websiteCopyGuard.test.tsx`), y los de YouTube no pueden cambiar.
