# Diseño: handover-journey

Las rutas son relativas a la raíz del repo. Plan aprobado el 21/10/2026:
`~/.claude/plans/quiero-que-razones-que-humming-crayon.md`.

## Decisiones del usuario (21/10/2026)

1. **Lo no verificable lo confirma el comprador.** Con el pago confirmado, el vendedor entrega directo
   lo que la plataforma no puede comprobar, con instrucciones por tipo. El comprador confirma o reclama
   dentro de un plazo; si no responde, se da por recibido. Un reclamo frena el cierre.
2. **Plazos que destraban.** Vendedor que no cede a tiempo después de firmar: la operación se cancela y
   el activo vuelve al mercado. Comprador que no paga a tiempo con el activo en custodia: se cancela y
   la plataforma le devuelve el activo al vendedor.
3. **Antes de firmar, el activo tiene que poder pasar a custodia sin esperas**, definido por cada
   estrategia. YouTube: siete días de acceso de la plataforma como administradora. Sitio: registrador
   Hostinger, activo y sin vencer pronto, por RDAP (la API de Hostinger no ve la cuenta del vendedor).
   Si no pasa, la firma se traba con una instrucción. La autoría para publicar sigue siendo el TXT.
4. **Transferencia bancaria dividida.** Recibir el total y pagarle después al vendedor sería retener
   fondos de terceros (`explore.md`, «Investigación»). El comprador hace dos transferencias:
   `sellerReceives` al CBU o alias del vendedor y `platformEarns` al de la plataforma
   (`TRANSFER_INSTRUCTIONS_ARS` / `_USD`), y sube los dos comprobantes, imagen o PDF. El vendedor
   confirma lo suyo y el admin la comisión. No existe un paso de pagarle al vendedor.
5. **Comprobantes detrás de un puerto `IFileStorage`:** disco en local y en tests; Cloudflare R2 en
   producción, a conectar después.
6. **En YouTube la recepción la confirma el comprador**, sin OAuth de su lado.
7. **Plazos por defecto**, configurables en un solo lugar: el vendedor tiene 10 días para ceder; el
   comprador, 5 días hábiles para pagar y 3 días para confirmar la entrega.
8. **El NDA del vendedor lo exige la publicación.** Modelo: `stuff/steps_yt/Trustiu_Contract_-_Lovi_En_Reddit.pdf`,
   adaptado a la ley argentina: declaración de titularidad y responsabilidad por lo publicado;
   confidencialidad con cláusula penal; no elusión con quien la plataforma le presentó (quien ofertó o
   firmó su NDA de comprador) y personas vinculadas, con indemnización del 50% del precio y nunca menos
   que el triple de la comisión; datos personales (Ley 25.326); ley y jurisdicción argentinas. Se firma
   en la app como el tripartito. La firma avanzada por un proveedor externo queda detrás de un puerto
   `ISignatureProvider`. El texto legal final lo revisa el usuario.
9. **Un activo publicado se retira solo sin operación viva.** La no elusión sigue 6 meses.
10. **El split de Mercado Pago queda como hoy** y el usuario consulta al equipo comercial por fechas de
    liberación.
11. **R2 para comprobantes**, con costo prácticamente nulo para este volumen.

## Criterios adoptados por defecto

- **YouTube:** la plataforma saca al vendedor del canal al confirmar la custodia, no al cierre; el
  comprador lo confirma de nuevo al recibir.
- **Entrega de un sitio:** el vendedor tiene 5 días desde el pago para declarar entregado lo no
  verificable. Los 3 días del comprador corren desde la última entrega: el dominio completado o lo
  demás declarado, lo que pase después. En YouTube corren desde que el admin promueve al comprador a
  propietario principal.
- **Reclamos:** se reutiliza `Report` (motivo `activo_no_entregado`). Un reclamo abierto congela la
  confirmación automática y el cierre. Lo cierra el admin: «seguir», que reinicia el plazo, o
  «resolución manual», fuera de la app.
- **Plazo de pago:** se pausa con un comprobante en revisión o un pago de Mercado Pago pendiente. No
  corre si no hay ningún medio disponible; en ese caso se avisa a la plataforma. Rechazar un
  comprobante se le avisa al comprador con el motivo.
- **Días hábiles:** lunes a viernes, menos una lista configurable de feriados argentinos.
- **Plazo del vendedor:** cubre su declaración (y en un sitio, el dominio en la cuenta de la
  plataforma), no la verificación del admin. Antes de cancelar, el job vuelve a consultar al
  registrador. Si el admin encuentra falsa la declaración, la operación vuelve a `contract_signed`.
- **Devolución del activo:** en un sitio se guarda el mail de Hostinger del vendedor al ceder y se le
  devuelve por traslado saliente; en YouTube el admin le devuelve la propiedad principal. Confirmada la
  devolución, el activo vuelve al mercado.
- **Vencimiento del dominio:** al menos 45 días antes de vencer para firmar.
- **NDA en activos ya publicados:** se firma antes de aceptar la próxima oferta.
- **Retiro con ofertas abiertas:** se cancelan con aviso. La no elusión corre 6 meses desde la última
  oferta o el retiro, lo que pase después.
- **Confirmación de la transferencia:** si el vendedor no confirma lo suyo en 2 días hábiles, lo decide
  el admin con el comprobante a la vista. El aviso `liquidacion_pendiente` desaparece en
  transferencias.

## Pasos completos con dueño

`TransferStep` ya tiene `requiredActor` y `check` (`packages/domain/src/strategies/IAssetStrategy.ts:32-73`).
Suma dos campos:

- `stage`: `listing`, `custody`, `payment`, `delivery` o `closing`. Reemplaza `phase`, que hoy deja
  afuera los pasos del comprador de YouTube.
- `gate`: lo que el paso traba, `sign`, `custody`, `payment`, `receipt` o `complete`.

Las dos estrategias declaran todos sus pasos y `Listing.handoverSteps()` deja de filtrar. El progreso
por paso es el `TransferStepProgress` de la fase 20, ahora para los dos tipos. Un test de estrategia
exige que todo paso tenga `requiredActor`, `check`, `stage` e instrucción si lo hace una persona.

## Listo para firmar

`IAssetStrategy.transferReadiness(facts)` es puro y devuelve si el activo está listo y, si no, la
instrucción. Los hechos los trae un puerto: el acceso y su espera en YouTube; en un sitio, el puerto
nuevo `IDomainRegistryLookup`, implementado con RDAP (registrador, estado, vencimiento).
`SignContractUseCase` reemplaza `listing.assertCanBeTransferred()` por `assertReadyToSign(readiness)`.
`AcceptOfferUseCase` deja de avisar `acceso_pendiente` en sitios.

## Próxima acción

Un servicio puro, `packages/domain/src/services/NextActions.ts`, recibe la operación, sus pasos y su
progreso, el pago, el rol y el reloj, y devuelve:

- la acción del rol (texto, botón, plazo) o a quién se está esperando;
- la línea de tiempo común a los tres roles.

En cada estado, a lo sumo un rol tiene acción, o todos esperan a la plataforma. La página de la
operación muestra «Tu próximo paso» y la línea de tiempo; reemplaza `queEsperar()` y las compuertas
sueltas. El panel del admin agrupa por a quién le toca con la misma fuente.

## `Operation`

Sin estados nuevos. Campos aditivos:

- `milestones`: firma, custodia, pago y entrega; son las anclas de los plazos.
- `paymentReceipts`: comprobantes por destinatario (vendedor o plataforma), con quién lo confirmó o
  rechazó y el motivo.
- `buyerReceipt`: confirmación del comprador, manual o automática.
- `cancellation`: motivo y estado de la devolución del activo.
- `sellerSourceIdentity`: la cuenta de origen del vendedor, para devolverle el activo.

Transiciones nuevas: `expireSellerDeadline`, `expireBuyerDeadline`, `rejectTransfer`, `markDelivered`,
`confirmReceipt`, `autoConfirmReceipt` y `confirmAssetReturned`.

`confirmBuyerPayment` se cumple por el webhook de Mercado Pago o con los dos comprobantes confirmados.

`complete()` deja de recibir casillas: exige pago confirmado, recepción del comprador y cuenta
receptora, y lo dispara el job al confirmarse la recepción. Hoy recibe `DeliveryVerificationInput`
(`packages/domain/src/entities/Operation.ts:750`), con `buyerIsPrimaryOwner`, `accessTransferred` y
`sellerRemoved` marcados por el admin.

## Cuenta bancaria del vendedor

Se declara como hoy se vincula Mercado Pago: CBU de 22 dígitos o alias, titular y moneda. Se le muestra
al comprador recién con el activo en custodia.

## Plazos

`packages/domain/src/value-objects/HandoverDeadlines.ts`, con un `BusinessCalendar`, configurados en
un solo lugar. Los vigila `RunTransferStepChecksUseCase`, el job horario de la fase 20. Cada
transición automática es idempotente.

## Lo que queda en manos del admin

- YouTube: confirmar la custodia, sacar al vendedor, invitar y promover al comprador, y devolver el
  activo cuando hace falta.
- Los dos tipos: confirmar el comprobante de la comisión y cerrar reclamos.

En un sitio, la custodia, el inicio de la entrega y el cierre son automáticos.

## Archivos

- `IFileStorage`: disco ahora, R2 después.
- `UploadToken` para el QR: aleatorio, guardado como hash, de un solo uso, vence en minutos, atado a
  una operación y con límite de intentos.

## `Listing`

Estado `withdrawn`, con `withdrawnAt` y su caso de uso.

## Avisos nuevos

Cada uno con su migración de `NotificationType`:

- recordatorios y vencimientos de plazos, al vendedor y al comprador;
- cancelación automática, a los dos;
- comprobante subido (admin) y rechazado (comprador);
- vendedor para confirmar que le llegó la transferencia;
- recordatorio de confirmar la entrega y «dado por recibido»;
- reclamo abierto, al admin y al vendedor;
- activo devuelto;
- comprador para declarar su cuenta receptora;
- vendedor con el activo en custodia;
- comprador con el pago confirmado.
