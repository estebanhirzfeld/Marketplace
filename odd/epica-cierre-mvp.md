# Épica — Cierre del MVP de la tesis

> **Estado**: 🚧 En curso · abierta el 13 de octubre de 2026

Backlog único del que salen los planning hasta la defensa. Junta lo que quedó repartido entre los documentos de feature, los hallazgos de las revisiones, las pruebas en producción y las conversaciones con el usuario.

## Objetivo

Que el circuito completo se pueda demostrar y defender ante la comisión: publicar, negociar, firmar, custodia, cobro y entrega al comprador.

## Definición de terminado

El flujo completo corre en producción con canales reales, la app Android cubre seguimiento, avisos y respuesta a ofertas, y cada fase tiene su write-up en `docs/fase-*.md`.

## Regla de trabajo

- Todo planning nuevo empieza tomando un ítem de esta épica.
- Lo que aparezca en el camino se agrega acá antes de trabajarlo.
- Al planificar un ítem, se le agrega el enlace a su documento `odd/tasks/<feature>.md`. Al cerrarlo, se tilda y se enlaza su `docs/fase-*.md`.
- Las etapas están ordenadas por dependencia y riesgo: lo que valida la premisa del negocio va antes que lo cosmético.

Cada ítem lleva su origen entre corchetes: [usuario], [revisión], [producción] (la prueba de punta a punta) o [análisis].

## Etapa 0 · Deuda de documentación

- [ ] **Write-up de «Conectar un canal de YouTube» y de «Vender y publicación directa»**, más `docs/gant.json`. Hoy no tienen documento de fase y los PRs superaron las 400 líneas. [análisis]
- [ ] **Cierre de la fase 15** (cobro con reparto): documentar la prueba en producción. [análisis]
- [ ] **Estado final de `odd/tasks/vender-y-publicacion-directa.md`**: sacar la línea vieja de T7. [análisis]

## Etapa 1 · Validación de la custodia

La premisa del negocio: si el traspaso de la propiedad principal no funciona como se diseñó, cambia el flujo de la operación entera.

- [ ] **Experimento del 16/10:** traspaso de propietario principal con Pc Lover, y registro del resultado. Si falla, ajustar el flujo antes de seguir. [análisis]
- [ ] **Endurecimiento de la cuenta de custodia:** verificación en dos pasos con llave o app, códigos de recuperación guardados, uso exclusivo, y evaluar una cuenta de dominio propio. Es configuración del usuario, no código. Hoy es un punto único de falla para todos los activos. [análisis]
- [ ] **Cierre del traspaso en la operación:** los pasos de la fase de operación (quitar el acceso directo, propietario principal) y la entrega al comprador, probados de punta a punta. [análisis]
- [ ] **Pasos del traspaso más cortos:** [usuario]
  - menos pasos;
  - comprobarlos con la API donde se pueda;
  - menos texto;
  - avisar a vendedor y comprador cuando todavía no es traspasable porque no pasaron los 7 días.

## Etapa 1b · Sitios web

El equivalente para sitios web de lo que ya se hizo con los canales de YouTube. Hasta ahora casi todo el trabajo se centró en YouTube. [usuario]

- [x] **Reglas reales del traspaso de un dominio, verificadas el 13/10/2026:** el bloqueo de ICANN de 60 días después de un cambio de titular (y si se puede pedir que no se aplique), y qué más se transfiere además del dominio: hosting, código, cuentas de analítica, plataforma de tienda. Define qué se le promete al comprador, como hicieron los 7 días en YouTube. [análisis]
  - **Dominios genéricos (`.com`, `.net`):** cambiar de titular activa un bloqueo de 60 días para cambiar de registrador (Transfer Policy de ICANN, II.C.2). El titular puede eximirse solo antes del cambio y solo si su registrador lo ofrece. No impide un nuevo cambio de titular. ICANN aprobó la revisión de la política el 7/6/2026 (Resolución 2026.06.07.04), pero la implementación está pendiente; mientras tanto rige la actual.
  - **Dominios `.ar`:** la transferencia se hace por TAD y vale cuando el destinatario la acepta y paga el arancel (Resolución 2/22 de NIC Argentina, arts. 24 y 25). Cuenta como un alta nueva de un año. No se puede en período de gracia, disputa u orden judicial (art. 26). El destinatario necesita CUIT o CUIL y Clave Fiscal. El arancel de transferencia de un `.com.ar` es el mismo que el del alta (Resolución 5/24).
  - **Comprobación del titular:** el RDAP de NIC Argentina (`rdap.nic.ar/domain/<dominio>`) es público y devuelve el CUIT del titular y las fechas de alta y vencimiento. En los genéricos el titular suele venir oculto; el registrador y el estado de bloqueo sí se ven.
  - **Google Analytics 4:** mover una propiedad exige que una misma persona sea Administradora y Editora en la cuenta de origen y en la de destino. Se mueven los datos, los flujos y los vínculos, y el ID `G-…` no cambia. No se puede entre organizaciones distintas de Google Marketing Platform ni con Ad Manager vinculado ([ayuda de GA4](https://support.google.com/analytics/answer/9305872)).
  - **Shopify:** la tienda se transfiere desde la configuración y el destinatario acepta por mail. Se bloquea con crédito de Shopify o saldo pendiente; las deudas pasan al nuevo dueño. Un dominio comprado en Shopify se transfiere aparte.
  - **Defecto en `WebStrategy`:** los pasos piden el código EPP, que en `.ar` no existe, y no pasan por la custodia. El aviso de los 60 días dice que el traspaso es un cambio de titular dentro del mismo registrador, pero el paso 3 hace que el comprador cambie de registrador, que es justo lo que el bloqueo impide.
  - **Decisión (20/10/2026): por ahora no se admiten dominios `.ar`.** Verificado: NIC Argentina permite designar un Representante desde el Administrador de Relaciones de Clave Fiscal (reglamento de 2016, art. 14; Res. 43/19, art. 5), pero es una delegación personal con Clave Fiscal propia y el titular la revoca cuando quiere, así que la plataforma no puede custodiar el dominio. La alternativa, que la plataforma sea titular, implica dos transferencias, dos aranceles, CUIT propio y asumir riesgo legal. No se pudo leer el anexo vigente de la Res. 2/22 ni se encontró el plazo de aceptación de una transferencia ni quién puede cancelarla. Sin eso no se puede prometer la custodia ni el momento de liberar el pago.
  - **Pendiente para volver a admitir `.ar`:** dos pruebas en TAD con un dominio propio y una segunda cuenta. (1) Delegar «Administración de dominios» a otro CUIT y comprobar si el representante puede cambiar DNS e iniciar una transferencia, y qué tan rápido revoca el titular. (2) Iniciar una transferencia y anotar el plazo de aceptación, quién puede cancelar y cuánto tarda el RDAP en mostrar el CUIT nuevo. Si salen bien, la opción es que el vendedor inicie la transferencia, el comprador acepte y pague, y el pago se libere cuando el RDAP muestre el CUIT nuevo.
  - **Para los genéricos** queda la propuesta de custodiar solo lo que controla el sitio (el dominio, y GA4 o la tienda si existen) y que el hosting y el código pasen directo después del pago.
- [ ] **Traspaso de un sitio con pasos comprobables y plazos:** cada paso tiene una señal, un plazo y una escalada (recordatorio y, si no se cumple, aviso al admin). Una tarea periódica consulta las señales y avanza el paso sola. Corrección del 20/10/2026: los pendientes de acceso de YouTube no son un patrón periódico sino una cola manual del admin, y el sistema no tiene ninguna tarea periódica; este ítem construye la primera (caso de uso invocado por un script y un timer de systemd, como el backup). `TransferStep.automated` pasa a ser un tipo de comprobación (automática, declarada o por el admin). [usuario]
  - Dominio `.ar`: el CUIT del titular en RDAP.
  - Dominio genérico: el estado de bloqueo y el registrador en RDAP, y un registro TXT con un código nuestro para probar quién lo controla.
  - GA4: en qué cuenta está la propiedad y quién tiene acceso, por la Admin API (sin probar).
  - Hosting: un archivo con un código en `/.well-known/`, leído por HTTP, o los DNS apuntando al servidor del comprador.
  - Shopify y cuentas de afiliados: sin señal externa; las confirman las partes, con el admin de respaldo.
  - El trámite de TAD no se puede observar en curso: solo su resultado.
  - Zona DNS: si la zona está alojada en el registrador anterior, cambiar de registrador puede borrar los registros y cortar el sitio y el mail. Antes del traspaso, el vendedor exporta la zona o la mueve a un proveedor neutral; la plataforma no puede leerla entera desde afuera. La plataforma guarda una foto de los registros públicos (A o CNAME del dominio y de `www`, MX y TXT) y después del traspaso la compara: si coinciden, avisa que el sitio y el mail siguen funcionando; si no, alerta al comprador y al admin.
  - Probado el 13 y el 15/10/2026: RDAP de nic.ar y del registro de los `.com` devuelven las señales esperadas, y un TXT cargado en `deliaorrego.online` apareció en sus servidores DNS al primer chequeo.
  - **Cómo se custodia un dominio genérico (20/10/2026, decisión pendiente de una prueba real):**
    - Con el split de Mercado Pago el vendedor cobra directo ([`docs/fase-15-cobro-con-reparto.md`](../docs/fase-15-cobro-con-reparto.md)) y el split 1:1 no permite retener su parte: la fecha de liberación solo se configura para la comisión y a través de un ejecutivo comercial (requisitos de Split de Pagos 1:1 en developers de Mercado Pago). Por eso la plataforma protege al comprador reteniendo el activo y no la plata. Es lo que exige `Listing.assertCanBeTransferred()`, que hoy un sitio no puede cumplir.
    - **Retener la plata queda descartado.** Es lo que hacen Flippa y Acquire.com (con Escrow.com) y Empire Flippers (con fondos propios). En Argentina, recibir y liberar fondos de terceros encaja funcionalmente como Proveedor de Servicios de Pago del BCRA (texto ordenado de PSP, puntos 1.2.1 y 1.4) y como sujeto obligado ante la UIF (Ley 25.246 art. 20 inc. 5, Res. UIF 200/2024). Eso exige persona jurídica, registro y prevención de lavado, y puede sumar impuestos sobre el precio total. Además contradice la regla de no retener fondos. Solo se reconsidera con dictamen de un abogado bancario y de un contador.
    - **Candidato: retener el dominio sin cambiar el titular.** La plataforma tiene una cuenta en un registrador. El vendedor le pasa el dominio por push si están en el mismo registrador, o lo muda con el código EPP si no. La plataforma lo controla sin figurar como titular, y después del pago lo entrega por push a una cuenta del comprador en ese registrador o con el EPP hacia el registrador del comprador. El bloqueo de 60 días de ICANN lo dispara el cambio de titular, no el cambio de cuenta (Transfer Policy II.C.2), así que solo aplica cuando el comprador pasa el dominio a su nombre. No figurar como titular también reduce los reclamos de marca (UDRP), la responsabilidad por el contenido y la lectura impositiva de compra y reventa.
    - **Prueba real antes de planificar el código**, con `deliaorrego.online` u otro dominio descartable: (1) si el registrador permite mover el dominio a otra cuenta; (2) si ese movimiento cambia el titular o activa algún bloqueo, y si el sitio sigue; (3) si el titular puede recuperar el dominio por su cuenta durante la custodia (preguntarlo al soporte del registrador); (4) la entrega a una tercera cuenta con cambio de titular y si se ofrece eximirse del bloqueo; (5) opcional, el camino por EPP hacia otro registrador. Foto inicial del 20/10/2026: registrador Hostinger, estado `client transfer prohibited`, última modificación el 10/02/2026, registro A en `54.232.119.62` (también `www`), sin MX y con tres TXT de verificación.
    - **Resultado de la prueba en Hostinger (20/10/2026)**, con un traslado de ida a una segunda cuenta y uno de vuelta:
      - Hostinger permite trasladar un dominio a otra cuenta, pero **la cuenta que lo recibe tiene que cargar los datos del titular**, todos obligatorios (nombre, mail, teléfono y dirección; hay una opción para datos de empresa). En este registrador, trasladar es cambiar el titular: **no se puede custodiar sin ser titular**, y vuelven los riesgos de figurar como titular (reclamos de marca, contenido, lectura impositiva).
      - El traslado activa el bloqueo de 60 días, pero solo para mudarlo a otro registrador. El traslado a una tercera cuenta de Hostinger se pudo iniciar enseguida, así que la entrega a un comprador con cuenta en Hostinger funciona; el que lo quiera en otro registrador espera.
      - El traslado necesita la confirmación por mail de las dos cuentas, y hasta entonces la cuenta original puede rechazarlo. La invitación vence a los 10 días y quien la envía la puede cancelar: es un plazo real para el paso «el comprador acepta el dominio».
      - Una vez completado, **la cuenta original pierde todo control**: el dominio desaparece de su lista y no puede editar DNS ni pedir el EPP.
      - El sitio siguió respondiendo en todo momento, con los mismos DNS.
      - Desde afuera el cambio casi no se ve: el titular está oculto por privacidad y el estado ya era `client transfer prohibited` antes. Lo único que cambió en RDAP fue la fecha de última modificación (20/10/2026 19:47 UTC). La señal de «dominio en custodia» tiene que ser la cuenta de la plataforma en el registrador (por API, sin verificar si Hostinger la ofrece, o confirmada por el admin), no RDAP.
      - **Respuesta del asistente de soporte de Hostinger** (es una IA, no una fuente autoritativa): una vez completado, el titular anterior no puede revertir el traslado por su cuenta, pero Hostinger investiga si se alega un traslado no autorizado, robo de cuenta, datos falsos o una disputa de titularidad, y pide pruebas. La plataforma tiene que poder mostrar que el traslado lo inició el vendedor: contrato firmado y registro del pedido. Dijo también que los traslados entre cuentas se limitan a uno cada 10 días, pero en la prueba la ida y la vuelta se hicieron el mismo día, así que ese límite no se confirma.
      - **Custodia sin ser titular, posible a confirmar:** según el asistente, si al aceptar se cargan exactamente los mismos datos del titular, el titular registral no cambia. La API lo respalda: al aceptar un traslado, los contactos del dominio pasan a ser perfiles WHOIS de la cuenta que lo recibe. La plataforma podría aceptarlo con un perfil con los datos reales del vendedor, que sigue siendo el titular. Falta probar si así se evita el bloqueo de 60 días.
      - **API de Hostinger (verificada en su especificación OpenAPI, `developers.hostinger.com/openapi/openapi.json`, 20/10/2026):** tiene `GET/PUT/DELETE /api/domains/v1/move/incoming/{domain}` (ver, aceptar con perfiles WHOIS o rechazar un traslado entrante), `POST/GET/DELETE /api/domains/v1/move/outgoing/{domain}` (iniciar, seguir o cancelar el traslado a otra cuenta), `GET /api/domains/v1/portfolio` y `/portfolio/{domain}` (lista y detalle), `GET /portfolio/{domain}/auth-code` (código EPP), `PUT/DELETE /portfolio/{domain}/domain-lock`, perfiles WHOIS y `GET/DELETE /api/domains/v1/irtp/{domain}` (cambio de titular pendiente, que confirman titular viejo y nuevo y vence a los 5 días). Con eso, recibir el dominio, comprobar que está en custodia y entregarlo se puede automatizar en Hostinger, sin depender de RDAP.
      - Pendiente: repetir el traslado aceptando con los mismos datos del titular y ver si aparece el bloqueo, y probar otro registrador antes de generalizar.
    - En ninguno de los dos modelos los términos y condiciones blindan a la plataforma frente a un consumidor (Ley 24.240 art. 37, Código Civil y Comercial art. 1743). La protección viene del diseño del proceso.
- [x] **Titularidad por registro DNS:** un registro TXT en el dominio, verificado automáticamente. Es universal, no depende de Google y deja AdSense como opción y no como requisito. Search Console queda como alternativa. [análisis] Cerrado: [`docs/fase-18-titularidad-de-un-sitio-por-dns.md`](../docs/fase-18-titularidad-de-un-sitio-por-dns.md); tareas en [`odd/tasks/titularidad-dns.md`](tasks/titularidad-dns.md).
  - Reutiliza la tarjeta «Comprobar titularidad» de YouTube; en un sitio abre un modal con el valor del TXT para copiar, las instrucciones del proveedor de DNS deducido de sus servidores (por ejemplo, `nsone.net` es Hostinger) y un estado que cambia solo cuando la plataforma encuentra el registro. [usuario]
  - Después del MVP: la Site Verification API de Google (`webResource.list`) como segunda fuente en el mismo modal, para quien ya verificó el dominio en Search Console. Suma el permiso `siteverification` y probablemente una revisión de la app. [usuario]
- [x] **Rechazar dominios `.ar` al publicar un sitio**, con un mensaje que diga que por ahora solo se admiten dominios genéricos. Va antes de planificar el traspaso de un sitio. [usuario]
- [ ] **Números verificados de un sitio:** hoy el tráfico y los ingresos son declarados. Evaluar Search Console (tráfico) o Analytics, como se hizo con YouTube Analytics. [análisis]
- [ ] **Prueba real de publicar un sitio en producción**, después del rediseño de «Vender»: datos, precio, comprobar la titularidad y publicar o enviar a revisión. [análisis]
- [ ] **Pasos del traspaso de un sitio, revisados con una prueba real**, como se hizo con Pc Lover. [análisis]

## Etapa 2 · Comunicación

- [ ] **Centro de avisos:** el dominio emite un evento (oferta recibida, acceso confirmado, pago, reclamo) y el centro decide por qué canales sale (en la app, mail o push) según las preferencias del usuario. Va antes que el mail y el push, para no programar cada aviso tres veces. [análisis]
- [ ] **Avisos por mail de las operaciones:** ofertas, «Confirmamos tu acceso», pagos y reclamos. Antes, investigar el costo del servicio de envío. [usuario]
- [ ] **Resumen semanal de activos destacados:** es promocional, así que va con consentimiento y con forma de darse de baja (ley 25.326), separado de los avisos de las operaciones. [usuario]
- [ ] **Recuperación de la contraseña.** Hoy no existe. [análisis]
- [ ] **Aviso al admin con el nombre del vendedor y del canal.** Hoy dice «Un vendedor ya nos invitó». [revisión]

## Etapa 3 · App móvil Android

Requisito de la tesis. [usuario]

- [ ] **Alcance justificado.** Una compra de alto valor, con NDA, contrato y pago, se hace en la computadora; el móvil sirve para estar atento. Incluye:
  - ver el mercado y el detalle de un activo;
  - seguir mis activos y operaciones, con la línea de tiempo de la custodia;
  - notificaciones push;
  - responder ofertas (contraofertar o aceptar), que es urgente y el caso móvil más claro.

  Publicar, firmar y pagar quedan fuera: la app manda a continuar en la computadora.
- [ ] **Base técnica:** React Native con Expo, reusando `packages/api-client` y `packages/api-contract`. Push con Expo Notifications (Firebase en Android), conectado al centro de avisos.
- [ ] **Write-up** con la justificación del alcance, para la comisión.

## Etapa 4 · Marca «Traspaso»

- [ ] **«Traspaso inmediato» en lugar de «transferencia inmediata»** en todos los textos. Los identificadores del código, como `transferable`, no cambian. Además de ser marca, desambigua: «transferencia» ya nombra la transferencia bancaria como medio de pago. [usuario]
- [ ] **«Traspaso» en los textos del producto**, sin exagerar. [usuario]

## Etapa 5 · Robustez

- [ ] **Verificar a qué cuenta entra el pago por transferencia bancaria.** Los datos bancarios los ven el comprador y el admin, no el vendedor, y el pago lo confirma un admin (fase 15), lo que sugiere una cuenta de la plataforma. Si es así, ese medio ya recibe fondos de terceros, también en YouTube, con la exposición regulatoria descrita para los sitios web (PSP del BCRA, UIF e impuestos sobre el total). [análisis]
- [ ] **Prueba de navegador del flujo principal:** publicar, «Ya los invité» y verificar el acceso. Los errores del 11 y 12/10 aparecieron recién probando a mano. [producción]
- [ ] **Hallazgos de las revisiones:** [revisión]
  - avisos que se pierden si falla la notificación después de guardar;
  - carrera entre «Ya los invité» y la confirmación del admin;
  - código de error propio para «otra cuenta» (hoy se detecta por el texto);
  - un error de Google informado como «cancelada»;
  - con varias cuentas de custodia activas se usa la primera;
  - precio con centavos de más;
  - refresco parcial de otras vistas después de «Ya los invité»;
  - `occursAt` sin documentar en el contrato.
- [ ] **Verificación periódica de los canales y aviso de vencimiento.** Sin ella, los números verificados quedan congelados en el día de la publicación. [análisis]

## Etapa 6 · Confianza

- [ ] **Reputación o calificaciones** después de la operación. [análisis]
- [ ] **Listado de reclamos para el admin.** Hoy solo ve el conteo. [revisión]
- [ ] **Regla de silencio y consecuencias por manipular métricas.** Planning pendiente desde la integración con YouTube. [usuario]
- [ ] **Verificación en dos pasos propia, con TOTP:** los códigos de una app como Google Authenticator (un secreto por usuario, un QR de alta y la validación). Empieza por el admin. Las llaves de acceso (passkeys) quedan como mejora posterior. [usuario]

## Etapa 7 · Mejoras

- [ ] **Sitios web con dos dimensiones,** cada una con su ícono y su filtro en el mercado: [usuario]
  - modelo de negocio (e-commerce, contenido o afiliados, SaaS, servicios), que cambia la valuación;
  - plataforma (WordPress, Shopify, desarrollo propio), que cambia los pasos del traspaso y los filtros.
- [ ] **Historial de precios:** mostrar el precio anterior cuando baja. Requiere guardar el historial ahora que el vendedor puede cambiar el precio. [usuario]
- [ ] **Banda de precio sugerido** (venta rápida, normal o lenta) alrededor de la valuación, aclarada como estimación. Se calibra cuando haya operaciones cerradas. [usuario]
- [ ] **Selector de canales nuevo con reintento:** volver a `enable_yt_permissions` en la conexión del vendedor y, si faltan los permisos de Analytics, reintentar una vez sin el parámetro. Antes, comprobar qué pasa con el permiso después de mover el canal a una cuenta de marca. [producción]
- [ ] **Gráficos de la serie mensual,** y orden y ranking del mercado con esos datos. [usuario]
- [ ] **Valuación en pesos** (necesita un endpoint de cotización). [revisión]
- [ ] **Favoritos.** [análisis]

## Después del MVP

- Activos promocionados pagos.
- La capa de analítica que sostiene el seguimiento de precios, las ofertas y las promociones.

## Fuera del alcance de la tesis

- Redes sociales como tipo de activo.
- KYC real.
- Firma con validez legal.
- Verificación de marca y de la app en Google para salir del modo prueba.

## Riesgos conocidos

- La custodia depende de las cuentas de marca, y Google está migrando a permisos de canal.
- `enable_yt_permissions` no tiene documentación pública: la verificación del acceso depende de él.
- La cuenta de custodia es un punto único de falla.
- La app de Google está en modo prueba: solo conectan los usuarios de prueba.
