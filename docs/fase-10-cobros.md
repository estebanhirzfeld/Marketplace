# Fase 10 — Cobros con MercadoPago

> **Estado**: ✅ Completa — falta completar el panel de MercadoPago
> **Fecha**: Agosto 2026
> **Objetivo**: Cobrarle al comprador sin que nadie confirme el pago a mano.

---

## El dato que definió la arquitectura

MercadoPago ofrece reserva con captura diferida: `capture: false` autoriza sin debitar y después se captura. Parece hecho a medida para un escrow.

No sirve: **el límite es 7 días desde la creación, y vencido eso la autorización expira**. Una operación sobre un canal de YouTube tarda como mínimo 14 días por las dos ventanas de propiedad que impone Google.

Entonces la pasarela **no es el mecanismo de custodia, es el medio de cobro**:

| | Quién |
|---|---|
| Cobra al comprador | La plataforma, a su propia cuenta |
| Retiene los fondos | La plataforma, en su cuenta — *eso es el escrow* |
| Paga al vendedor | La plataforma, al cerrar la operación |

Como efecto secundario, evita toda la complejidad del split de marketplace: la comisión ya está calculada en el dominio.

---

## Se aceptan todos los medios, incluida tarjeta

La exposición al contracargo se asume, por tres razones que se sostienen juntas:

1. **El modelo de seguridad es disuasivo.** Para llegar a pagar con una tarjeta robada hay que pasar antes la verificación de identidad con datos reales.
2. **El activo entra en custodia antes del cobro.** En una disputa se puede probar la entrega previa al cargo, que es exactamente la evidencia que pide un contracargo.
3. **Las cuotas son cómo se paga acá.** Restringir a transferencia sobre montos de miles de dólares deja afuera a la mayoría de los compradores.

Si aparecieran contracargos, restringir es agregar `excluded_payment_types` a la preferencia: un campo, no una reintegración.

---

## Del aviso solo se toma el identificador

Es lo que hace segura la integración. El estado, el monto y la referencia se consultan **contra la pasarela con nuestras credenciales**, nunca se leen del cuerpo del aviso.

```typescript
async execute(externalPaymentId: string): Promise<void> {
    const pago = await this.gateway.fetchPayment(externalPaymentId);
    if (!pago) return;
    if (pago.status !== 'approved') return;
    // …
}
```

Un aviso falsificado no puede dar por pagada una operación: en el peor caso provoca una consulta que no encuentra nada o que devuelve datos que no cierran.

La validación de la firma `x-signature` —manifiesto, HMAC-SHA256, comparación en tiempo constante— está implementada como **defensa en profundidad, no como defensa principal**.

El webhook **siempre responde 200**. Un 500 haría que MercadoPago reintente indefinidamente un aviso que no vamos a poder procesar; los problemas quedan en el log.

Y es idempotente, porque las pasarelas reintentan: si la operación ya está pagada, no hace nada y no falla.

---

## El cambio de dominio que vino con esto

`confirmBuyerPayment()` era un botón sin registro de por dónde había entrado la plata. Ahora exige la constancia y **valida que el monto coincida exactamente** con lo que el comprador debía.

```typescript
if (datos.amountCents !== this.props.buyerPays.getCents()) {
    throw new ValidationError('El monto pagado no coincide con el total de la operación.');
}
```

Un pago parcial ya no puede dar por cerrada la obligación y liberar un activo a medio cobrar. Uno por más tampoco: es señal de que ese pago no corresponde a esta operación.

Esa constancia, sumada a la de custodia, es la evidencia que se presenta ante un contracargo.

---

## Qué quedó automatizado y qué no

**El cobro, entero.** El botón de admin "confirmar el pago recibido" desapareció: el comprador ve el importe con el activo ya en custodia, paga, y el webhook confirma solo. Queda un botón de admin aparte para registrar transferencias bancarias, que son las que solo una persona puede ver llegar.

**La liberación al vendedor, no.** No se pudo confirmar si MercadoPago expone una API de pagos salientes en Argentina; la documentación consultada no fue concluyente. Hasta verificarlo con la cuenta de prueba, la transferencia se hace fuera de la plataforma y se registra a mano — igual que la constancia de custodia, que también es manual porque no hay alternativa.

---

## Pendiente

Completar el panel de MercadoPago: aplicación, cuentas de prueba, webhook y secreto de firma. Los pasos están en `docs/integracion-mercadopago.md`.

Para probar en local hace falta un túnel: el panel no acepta `localhost` como URL de notificación.

Sin credenciales la API arranca igual, la ruta de checkout responde 503 con el motivo y el pago por transferencia sigue funcionando.
