# Exploración — handover-journey

Recorrido de la venta de un activo (sitio o canal de YouTube) para el vendedor, el comprador y el
admin, de punta a punta. Empezó como el recorrido de un sitio (`website-handover-journey`) y se
extendió a los dos tipos el 21/10/2026, cuando el usuario pidió que el rediseño fuera «tanto para web
como para yt».
Sale de la prueba local del 21/10/2026 con `deliaorrego.online` (operación en `marketplace_dev`),
que el usuario cortó con «imposible asi, hay que saltear esto e ir directo a la siguiente fase con
planning y artifacts». Las rutas son relativas a la raíz del repo; «la página de la operación» es
`apps/web/src/app/operaciones/[id]/page.tsx`.

## Lo que se vio en la prueba

Con el activo en custodia, cada rol lee algo distinto y ninguno puede avanzar:

- **Vendedor:** «Esperando el pago del comprador. No tenés nada que hacer por ahora.»
  (`apps/web/src/components/PaymentChoice.tsx:199-201`).
- **Admin:** «El activo está en custodia. Se está esperando el pago del comprador; si entró por
  transferencia bancaria, se registra desde acá.»
- **Comprador:** «Por ahora no podés pagar desde acá. El activo sigue en custodia, así que no
  perdiste nada. Abrí un reclamo más abajo y te ayudamos a resolverlo.» (`PaymentChoice.tsx:60`), al
  lado de «Recién ahora corresponde pagar» (la página de la operación, `:107`).

La causa inmediata es de configuración: sin `MERCADOPAGO_ACCESS_TOKEN` ni `TRANSFER_INSTRUCTIONS_ARS` /
`TRANSFER_INSTRUCTIONS_USD`, `GetPaymentOptionsUseCase` no ofrece ningún medio
(`packages/domain/src/use-cases/operation/GetPaymentOptionsUseCase.ts:100,106`). Pero la pantalla lo
convierte en un reclamo del comprador, y el admin no se entera: las opciones de pago no se piden
para un admin (la página de la operación, `:155`).

## Problemas del recorrido de un sitio

1. **La firma de un sitio está trabada por el acceso de YouTube.** `SignContractUseCase.ts:65`
   llama a `listing.assertCanBeTransferred()` al firmar el tripartito, y eso falla sin
   `platformAccess` (`packages/domain/src/entities/Listing.ts:389-401`), aunque desde la fase 20 la
   custodia de un sitio ocurre durante la operación. Por eso al aceptar una oferta sale
   `acceso_pendiente` a los admins (`AcceptOfferUseCase.ts:89`) y el admin tiene que completar
   `PlatformAccessForm`, cuyo texto es de YouTube («Cuenta de Marca», «Con acceso desde»;
   `PlatformAccessForm.tsx:12,66,186`). El documento de la fase 20 decía que esta guarda no se
   llamaba en ningún lado: es falso.
2. **«Verificar acceso» no puede andar para un sitio.** La bandeja de accesos lista sitios
   (`AdminInbox.tsx:62-66`) y el botón abre el OAuth de Google, que responde «Este activo no es un
   canal de YouTube» (`VerifyPlatformAccessUseCases.ts:32`).
3. **Restos de YouTube a la vista en un sitio:** «+2 NIVELES», «Desbloqueá TRANSFERENCIA INMEDIATA» y
   «Ya lo hice» (`AccessPanel.tsx:118,176,196`); «Estamos revisando tu invitación»
   (`AccessStatusPanel.tsx:43`); el aviso `acceso_confirmado` («pasa a transferencia inmediata»,
   `apps/web/src/lib/notifications.ts:90`); el cartel «TRANSFERENCIA INMEDIATA»
   (`apps/web/src/app/activos/[id]/page.tsx:220`, `Transferability.tsx:74`); el formulario de
   custodia («propietaria principal», «Correos de recuperación y segundo factor», «suscriptores»,
   «Sin strikes activos»; `CustodyVerificationForm.tsx:37-61`) y el de entrega («su espera de siete
   días… Google»; `DeliveryVerificationForm.tsx:63`).
4. **El pago es un callejón sin salida y los roles se contradicen** (ver arriba). Además, el aviso
   de `?pago=no-disponible` dice «pagá por transferencia» aunque la transferencia esté apagada (la
   página de la operación, `:491-496`) y `activo_en_custodia` dice «Te toca transferir» sea cual
   sea el medio disponible (`notifications.ts:46`).
5. **Avisos que los textos prometen y nunca salen:** al vendedor no le llega que el activo está en
   custodia (`assetInCustody` va solo al comprador, `NegotiationNotifier.ts:158`), aunque se le dice
   «te avisamos cuando quede en nuestra custodia» (la página de la operación, `:94`); al comprador no
   le llega que se confirmó su pago (`paymentConfirmed` va solo al vendedor, `:192`), aunque
   `PaymentChoice.tsx:146` dice «te avisamos»; `traspaso_vencido` dice «El vendedor tiene que
   iniciar el traslado de nuevo» pero va solo a los admins, y el vendedor no tiene cómo hacerlo; no
   hay aviso al cancelar a mano.
6. **Nadie le pide al comprador el mail de su cuenta de Hostinger.** El formulario aparece desde
   `contract_pending` (la página de la operación, `:169-174`) pero ningún aviso lo pide:
   `contrato_firmado` dice «Sigue la transferencia del activo» (`notifications.ts:37`). Si falta, el
   admin choca al cerrar (`DeliveryVerificationForm.tsx:35-41`). Tampoco hay forma de comprobar antes
   que el mail tenga cuenta: la API de Hostinger no lo permite; se sabe recién al iniciar el traslado.
7. **Nadie entrega ni recibe el sitio en sí** (hosting, archivos, código, base de datos, cuentas).
   Son pasos declarados del vendedor (`packages/domain/src/strategies/WebStrategy.ts:158-183`) que se
   tildan todos con una sola casilla, «Ya cedí el control» (`TransferInitiationForm.tsx:79`); el
   «Dar por cumplido» del admin no traba nada (ni `ConfirmCustodyUseCase` ni
   `CompleteOperationUseCase` lo leen); el comprador no los ve (la página de la operación, `:638`) ni
   tiene un paso para recibirlos. Mientras tanto, en `transfer_in_progress` el vendedor lee «No hace
   falta que hagas nada» (`:94`) con esos pasos en PENDIENTE y el traslado del dominio todavía a su
   cargo.
8. **Acciones del admin duplicadas o que se contradicen:** «Comprobar el dominio en Hostinger» y el
   formulario de custodia (que ya consulta al registrador e ignora la casilla «propietaria
   principal», `ConfirmCustodyUseCase.ts:62-64`, pero la sigue exigiendo,
   `CustodyVerificationForm.tsx:27`); «Comprobar la entrega» y el formulario de cierre (que ya
   comprueba la entrega e ignora `buyerIsPrimaryOwner`, `CompleteOperationUseCase.ts:56-59`, pero la
   exige); los «Dar por cumplido» visibles en tres estados sin trabar nada; `transfer_in_progress`
   bajo «ESPERANDO A LA PLATAFORMA» (`GetPlatformDashboardUseCase.ts:72`) cuando en un sitio el
   próximo movimiento es del vendedor; `PROXIMO_PASO` de `payment_received` sin mencionar la entrega
   (`apps/web/src/app/admin/page.tsx:48`).
9. **El esfuerzo del admin:** unas diez acciones separadas, en dos páginas (el activo y la
   operación) y cuatro estados, para cerrar una venta de un sitio: registrar el acceso, comprobar el
   dominio, tres «Dar por cumplido», el formulario de custodia, registrar la transferencia, iniciar la
   entrega, comprobar la entrega y el formulario de cierre.

## Lo que ya funciona y se conserva

El motor de la fase 20: el progreso por paso, la comprobación del dominio contra Hostinger (cartera
activa, traslado entrante y saliente), la entrega por traslado saliente, el job horario con
recordatorios y vencimientos, y la búsqueda del perfil WHOIS. Lo que falla es el recorrido que se
arma encima, no la comprobación.

## Problemas del recorrido de un canal de YouTube

1. **El comprador no ve sus pasos.** `Listing.handoverSteps()` filtra por `phase` y los pasos del
   comprador en `YouTubeStrategy` (`buyer-pays`, `buyer-accepts`, `buyer-secures-access`;
   `packages/domain/src/strategies/YouTubeStrategy.ts:405-433`) no la declaran, así que se descartan.
2. **Se puede cerrar con el vendedor dentro del canal.** `sellerRemoved` viaja como casilla del
   formulario de cierre (`CompleteOperationUseCase.ts:18,66`) y `Operation.complete()` no la exige
   (`Operation.ts:147`): la garantía de que el vendedor ya no tiene poder sobre el activo depende de que
   el admin la marque.
3. **El cierre no exige que el vendedor haya cobrado.** Con el split de Mercado Pago cobra solo; con
   transferencia bancaria solo existe el aviso `liquidacion_pendiente`.

## Problemas de la maquinaria común

1. **Las máquinas xstate están muertas.** `packages/domain/src/machines/` no lo importa ningún archivo
   de `apps/` ni `packages/`; documentan un ciclo que las entidades ya imponen.
2. **El NDA del vendedor no se pide nunca.** `Contract` tiene el tipo `seller_nda`, pero ninguna
   pantalla ni requisito de publicación lo usa.
3. **La contraoferta tiene la moneda fija.** `apps/web/src/app/operaciones/actions.ts:163` arma el
   `Money` en `'USD'` sea cual sea la moneda de la operación.
4. **No hay plazos que destraben.** Un vendedor que firma y no cede, o un comprador que no paga con el
   activo en custodia, dejan la operación abierta para siempre: después de firmar no se puede cancelar.

## Investigación

### Demorar el cobro del vendedor con el split de Mercado Pago

- En el split 1:1 la liberación del dinero la define la cuenta del vendedor; por la API pública solo se
  fija la comisión (`marketplace_fee`), y la fecha de liberación de la comisión se arregla con un
  ejecutivo comercial
  ([prerrequisitos](https://www.mercadopago.com/developers/es/docs/split-payments/split-1-1/prerequisites)).
- `capture: false` reserva el monto, pero en Argentina vence a los 7 días y solo sirve con tarjeta
  ([captura](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/payment-management/capture-authorized-payment)).
  No alcanza para un traspaso que puede durar más.
- Un contracargo retiene el monto disputado en la cuenta del vendedor mientras dura la disputa
  ([contracargos](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/chargebacks)).

Conclusión: el split queda como hoy y el usuario consulta al equipo comercial por fechas de liberación
o pagos avanzados. Lo no verificable lo cubren el reclamo y el contracargo.

### Recibir el total por transferencia y pagarle después al vendedor

Recibir el pago del comprador en una cuenta de la plataforma y transferirle luego su parte al vendedor
es retener fondos de terceros: encuadra en la «cuenta de pago» que define el BCRA para los
proveedores de servicios de pago (Comunicación "A" 8454, §1.4.1) y vuelve a la plataforma sujeto
obligado ante la UIF (Resolución 200/2024). La fase 20 ya lo había descartado. Por eso la transferencia
bancaria se divide como el split: el comprador le transfiere `sellerReceives` al vendedor y
`platformEarns` a la plataforma.

### Almacenamiento de comprobantes en Cloudflare R2

Nivel gratuito por mes: 10 GB, 1 millón de operaciones de clase A, 10 millones de clase B, egreso sin
cargo ([precios](https://developers.cloudflare.com/r2/pricing/)). Para dos comprobantes por venta el
costo es prácticamente nulo.
