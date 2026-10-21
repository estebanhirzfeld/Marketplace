# Exploración — website-handover-journey

Recorrido de la venta de un sitio para el vendedor, el comprador y el admin, de punta a punta.
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
