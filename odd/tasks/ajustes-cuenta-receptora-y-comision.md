# ajustes-cuenta-receptora-y-comision — Textos y actualización de pantalla

Rama: `feat/aviso-comision-mp` (desde `origin/fase-5-frontend-y-avisos`).
TDD: activado (fuente: instrucciones del proyecto). Runner: lo resuelve el escritor desde `apps/web/package.json`.

## Objetivo

1. El formulario donde el comprador declara dónde recibir el activo debe estar escrito para el comprador,
   según el tipo de activo, y la pantalla debe actualizarse al enviarlo sin recargar a mano.
2. El vendedor debe saber, antes de que el comprador pague, que si se paga por Mercado Pago le descuentan
   la comisión de Mercado Pago y el dinero se acredita en los plazos de Mercado Pago.

## Decisiones ya tomadas

- Cuenta receptora de un canal: se acepta cualquier correo con formato válido; el texto aclara que debe ser
  una cuenta de Google. No se exige Gmail (la ayuda oficial no lo exige; no está verificado el caso de
  correos que no son de Gmail ni de Google Workspace). Endurecer después es un cambio de una línea.
- Cuenta receptora de un dominio: cualquier usuario del registrador, nombrado como tal.
- La plataforma no absorbe la comisión de Mercado Pago (regla de "la plataforma no asume riesgo"):
  se avisa, no se traslada al comprador.
- Evidencia real (2026-10-08, VPS): pago de $ 7.956.375, cargo de Mercado Pago $ 326.211,38 (4,10 %),
  comisión de la plataforma $ 757.750, neto del vendedor $ 6.872.413,62, a liquidar el 26/oct.
  El texto no debe fijar porcentajes ni plazos exactos: dependen del medio de pago.

## Tareas

- [x] T1 Cuenta receptora del comprador: textos por tipo de activo, ejemplo del campo por tipo, y actualización
      de la pantalla al enviar (diagnosticar la causa antes de arreglar), con tests. Commit `f178017`.
- [x] T2 Aviso de comisión de Mercado Pago en la vista del vendedor, con tests; reflejarlo en `/sistema`
      y en `docs/fase-15-cobro-con-reparto.md`. Commit `d8542b3`.

## Ruta por tarea

- T1–T2: delegated direct (un solo escritor; 2+ archivos no triviales y lectura previa a la escritura).

## Progreso

Runner: `vitest run` desde `apps/web` (`./node_modules/.bin/vitest`). Tipos: `tsc --noEmit`. Build: `next build`.

- T1 — RED: 10 de 14 tests nuevos fallaban (`tests/RecipientIdentityForm.test.tsx`); GREEN: 14/14.
  Los textos dependen del tipo (`youtube`, `web`, genérico); la espera de siete días solo se nombra para
  canales; el mensaje de la API llega tal cual al comprador (test de la acción); la cuenta guardada queda a la
  vista (`RecipientIdentitySaved`) y el formulario muestra `state.ok`.
- T1 — causa de la pantalla desactualizada: **no confirmada contra la app corriendo** (no se reprodujo para no
  escribir en la base de desarrollo). Descartado por código: la caché del cliente (usa `fetch` sin caché y la
  página es dinámica, `ƒ` en el build), la ruta de `revalidatePath` (coincide con `/operaciones/[id]`; la guía de
  Next 16 dice que en una Server Function actualiza la interfaz al instante) y la falta de `router.refresh`
  (ningún formulario del repo lo usa). Lo que sí se verificó: el componente solo dibujaba `state.error`, y en la
  primera declaración la página cambia el formulario por un desplegable cerrado, de modo que el mensaje de éxito
  se perdía con el desmontaje y no quedaba nada a la vista. Arreglo con el patrón de `OperationAction` (mostrar
  `state.ok`) más la cuenta guardada siempre visible. Si en la app real la pantalla sigue sin cambiar tras
  guardar, el siguiente paso es mirar el HTML de la respuesta de la acción en el navegador.
- T2 — RED: 10 tests fallaban (`tests/PaymentChoice.test.tsx`); GREEN: 126/126 en toda la suite de `apps/web`.
  El aviso vive en `SellerPaymentWait`; visibilidad por rol y estado en `showSellerPaymentWait`. Se decide con
  `paymentOptions` (disponible o `seller_not_linked`); no hizo falta endpoint nuevo.
- Verificación: `tsc --noEmit` sin errores; `next build` correcto.

## Siguiente paso

Revisión del usuario, recorrido en la app corriendo para confirmar la pantalla tras guardar, y push (decisión del usuario).
