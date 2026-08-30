# Integración con MercadoPago — configuración y decisiones

> **Objetivo**: cobrarle al comprador con MercadoPago, confirmando el pago contra la propia pasarela y sin que nadie lo toque a mano.

---

## La decisión que define la arquitectura

MercadoPago ofrece reserva con captura diferida: `capture: false` autoriza sin debitar y después se captura. Parece hecho a medida para un escrow, y no sirve: **el límite es 7 días desde la creación, y vencido eso la autorización expira**.

Una operación sobre un canal de YouTube tarda como mínimo 14 días, por las dos ventanas de propiedad que impone Google. No entra.

Entonces **la pasarela no es el mecanismo de custodia, es el medio de cobro**:

| | Quién |
|---|---|
| Cobra al comprador | La plataforma, a su propia cuenta |
| Retiene los fondos | La plataforma, en su cuenta — *eso es el escrow* |
| Paga al vendedor | La plataforma, al cerrar la operación |

Como efecto secundario, esto evita toda la complejidad del split de marketplace: no hay que dividir el pago en origen porque la comisión ya está calculada en el dominio.

---

## Medios de pago: se aceptan todos, incluida tarjeta

La exposición al contracargo es real y se asume, por tres razones que se sostienen juntas:

1. **La persuasión es el modelo de seguridad.** Identidad verificada y contrato con peso legal encarecen el fraude. Para llegar a pagar con una tarjeta robada hay que pasar antes la verificación de identidad con datos reales.
2. **El activo entra en custodia antes del cobro.** En una disputa se puede probar la entrega previa al cargo, que es exactamente la evidencia que pide un contracargo. La constancia de custodia guarda quién verificó, cuándo y qué.
3. **Las cuotas son cómo se paga acá.** Restringir a transferencia sobre montos de miles de dólares deja afuera a la mayoría de los compradores.

Si más adelante aparecieran contracargos, restringir es agregar `excluded_payment_types` a la preferencia — un campo, no una reintegración.

---

## Cómo se confirma un pago

**Del aviso de MercadoPago solo se toma el identificador del pago.** El estado, el monto y la referencia se consultan después contra la pasarela con nuestras credenciales.

Eso es lo que hace segura la integración: un aviso falsificado no puede dar por pagada una operación, porque en el peor caso provoca una consulta que no encuentra nada o que devuelve datos que no cierran. El monto lo valida la entidad y tiene que coincidir exactamente con lo que el comprador debía.

La validación de la firma `x-signature` está implementada como defensa en profundidad, no como defensa principal. Se reconstruye el manifiesto `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`, se le aplica HMAC-SHA256 con el secreto del webhook y se compara contra `v1` en tiempo constante.

El webhook **siempre responde 200**. Devolver un 500 haría que MercadoPago reintente indefinidamente un aviso que no vamos a poder procesar; los problemas quedan en el log.

---

## Pasos de configuración

1. Crear una aplicación en [MercadoPago Developers](https://www.mercadopago.com.ar/developers/panel) y anotar el **access token de prueba**.
2. Crear las **cuentas de prueba** —una vendedora y una compradora— desde el panel. Los pagos de prueba se hacen con esas cuentas y con las tarjetas de prueba que documenta MercadoPago.
3. Configurar el **webhook** apuntando a `/webhooks/mercadopago` y guardar el **secreto de firma** que genera el panel.

En `apps/api/.env`:

```
MERCADOPAGO_ACCESS_TOKEN=TEST-...
MERCADOPAGO_WEBHOOK_SECRET=...
MERCADOPAGO_BACK_URL=http://localhost:3000/operaciones
MERCADOPAGO_NOTIFICATION_URL=http://localhost:3001/webhooks/mercadopago
```

Para que MercadoPago pueda avisar a una máquina local hace falta exponer el puerto con un túnel; el panel no acepta `localhost` como URL de notificación.

Sin credenciales la API arranca igual: la ruta de checkout responde 503 con el motivo y el pago por transferencia sigue funcionando.

---

## Lo que queda pendiente

**La liberación de fondos al vendedor no está automatizada.** No pude confirmar si MercadoPago expone una API de pagos salientes en Argentina; la documentación que consulté no fue concluyente. Hasta verificarlo con la cuenta de prueba, la transferencia al vendedor se hace fuera de la plataforma y se registra a mano, igual que la constancia de custodia.

También quedó sin verificar la lista exacta de `payment_type_id` válidos para Argentina: las páginas de referencia devolvieron 404 al consultarlas. No hace falta hoy porque se aceptan todos los medios, pero sí el día que se quiera restringir.
