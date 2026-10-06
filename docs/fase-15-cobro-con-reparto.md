# Fase 15 — Cobro con reparto de Mercado Pago

> **Estado**: 🚧 En curso (implementada detrás de banderas; falta el recorrido de punta a punta en un entorno desplegado)
> **Fecha**: Octubre 2026
> **Objetivo**: Que el vendedor cobre directo en su cuenta de Mercado Pago, que la plataforma retenga su comisión en el mismo cobro y que el comprador pueda elegir entre Mercado Pago y transferencia, también cuando la operación está en dólares.

El 2 de octubre, una operación de US$ 73,50 se cobró como $ 111.720 (a 1.520 pesos por dólar) y la operación quedó en custodia aceptando pagos: `confirmBuyerPayment` exige la misma moneda y los mismos centavos, y Mercado Pago había cobrado en pesos. El cobro quedó rechazado por la validación con la plata ya movida. Un arreglo mínimo (PR #17: no generar el cobro por Mercado Pago fuera de ARS) se desplegó primero. Esta fase es el diseño de fondo.

---

## Objetivos cumplidos

- Cobro con reparto: la preferencia se crea con el token del vendedor y la plataforma retiene su comisión con `marketplace_fee`, siempre en pesos.
- Operaciones en dólares: la plataforma pesifica con la cotización A3500 del BCRA, la congela en la operación y cobra en pesos.
- Cuenta de Mercado Pago del vendedor: vinculación por OAuth con PKCE, tokens cifrados en reposo y renovación automática.
- Selector de método de pago: Mercado Pago o transferencia bancaria, en la moneda de la operación.
- Requisito de vincular Mercado Pago para publicar.
- Todo detrás de banderas, apagadas por defecto: desplegar no cambia nada hasta encenderlas.

---

## Lo que se verificó antes de construir

Un recorrido real en el sandbox, con una aplicación y un vendedor de prueba distintos (un reparto de una cuenta consigo misma no prueba nada):

- Una preferencia en USD se convierte a pesos en el cobro: US$ 100 pasaron a $ 152.000 (1.520), el mismo valor que la A3500 del último día hábil publicado.
- `marketplace_fee` se toma como pesos aunque la preferencia esté en dólares: una comisión de `10` en una preferencia en USD se cobró como $ 10.
- En un pago de $ 10.000 con comisión de $ 1.000, el vendedor recibió $ 8.590: $ 410 de comisión de Mercado Pago (4,1 %, es decir 3,39 % más IVA a 18 días) y $ 1.000 de la plataforma. Ambas las paga el vendedor.
- La comisión de la plataforma llega a la cuenta de la aplicación como "dinero a liquidar".
- El plazo de liberación (18 días en el sandbox) lo define la cuenta del vendedor, no la preferencia.

No se verificó: el reembolso proporcional, el contracargo y el aviso de pago real de un reparto.

---

## Decisiones técnicas

### 1. Dos modos de cobro y tres banderas

Sin reparto, la plataforma cobra a su cuenta y liquida a mano, como siempre. Con reparto, el vendedor cobra directo. Se enciende por variables de entorno de la VM, todas apagadas por defecto (solo el texto exacto `1` o `true` las enciende):

| Variable | Qué enciende |
|---|---|
| `MERCADOPAGO_SPLIT_ENABLED` | El cobro con reparto. Sin el OAuth de Mercado Pago ni la clave de cifrado, la API no arranca y dice qué falta. |
| `EXCHANGE_RATE_ENABLED` | La pesificación de operaciones en dólares con el BCRA. |
| `REQUIRE_MP_LINK_TO_PUBLISH` | Exigir la cuenta vinculada para publicar. Sin la clave de cifrado, la API no arranca. |

### 2. La cotización congelada

`SettlementQuote` guarda la tasa, la fecha de la A3500, el monto en pesos del comprador, lo que recibe el vendedor y la comisión. La comisión es la diferencia entre los dos montos ya en pesos, de modo que el redondeo lo absorbe la plataforma y los números cierran al centavo. Vence a las 24 horas; con reparto, el link de pago vence junto con ella. Las cotizaciones emitidas quedan en un historial que solo crece: un pago hecho desde un link anterior igual se reconoce. Si el BCRA no responde se usa la última tasa leída hasta cuatro días; pasado ese tiempo, Mercado Pago no se ofrece. `EXCHANGE_RATE_OVERRIDE_USD_ARS` fija una tasa manual de emergencia.

### 3. La cuenta del vendedor

Se vincula con OAuth y PKCE (`state` y verificador en una cookie `httpOnly` de un solo intento, comparación en tiempo constante antes de llamar a la API). Los dos tokens se cifran con AES-256-GCM con la clave `MP_TOKEN_ENCRYPTION_KEY`, que se genera una sola vez con `openssl rand -base64 32`, **no se puede recuperar** si se pierde y obliga a los vendedores a vincular de nuevo. Mercado Pago rota el token de renovación en cada uso, así que la renovación se serializa por vendedor y, si el guardado falla, se conserva la cuenta renovada en memoria. Una cuenta de Mercado Pago pertenece a un solo usuario (índice único).

### 4. El aviso de pago con reparto

El aviso trae el `user_id` del cobrador. Es una pista para elegir con qué token consultar el pago, no una prueba: el pago se vuelve a consultar y se concilia contra la operación. Si no se puede obtener el token del vendedor, la ruta responde 503 para que Mercado Pago reintente, en vez de dar el pago por perdido. Un pago con reparto no genera la liquidación manual.

### 5. El selector de método de pago

Con el activo en custodia, el comprador ve las dos opciones. Mercado Pago aparece deshabilitado, con el motivo, si el vendedor no vinculó su cuenta o no hay cotización. El vendedor ve el aviso con el enlace para vincular. Los datos bancarios salen de `TRANSFER_INSTRUCTIONS_ARS` y `TRANSFER_INSTRUCTIONS_USD` (texto libre, nunca en el código); sin texto para una moneda, la transferencia no se ofrece en esa moneda. Los ven el comprador y el admin, no el vendedor.

---

## Defectos encontrados al construirla

- Una transferencia en dólares se habría rechazado si la operación ya tenía cotizaciones, porque se comparaba contra el monto en pesos.
- El callback de vinculación redirigía a `localhost` en producción: el release se compila en CI sin `NEXT_PUBLIC_APP_URL`, y `env.example` la documenta vacía, con lo que además lanzaba un error de dirección inválida.
- El parser de cotizaciones aceptaba una fecha ilegible y números no finitos.
- La puerta de publicación descifraba los tokens solo para saber si existía la cuenta.
- Un test dependía del entorno de quien lo corría.

---

## Tests

| Paquete | Pruebas |
|---|---|
| Dominio | 779 |
| Base de datos (en una base descartable) | 76 |
| API | 296 |
| Web | 95 |
| Cliente de la API | 17 |

Las pruebas de base de datos y de la API completa **borran todos los datos** de la base a la que apunte `DATABASE_URL`: se corrieron siempre contra una base aparte (`marketplace_scratch`), nunca contra la de desarrollo. El typecheck de `api`, `domain`, `db`, `web` y del cliente está limpio.

---

## Deuda técnica conocida

- El candidato de revisión de toda la rama excede el presupuesto de contexto del revisor; se revisó tramo por tramo (cada uno aprobado).
- El candado de renovación de tokens es en proceso: con más de una instancia de la API haría falta uno compartido.
- La firma del webhook no es obligatoria si falta `MERCADOPAGO_WEBHOOK_SECRET`; no se hizo obligatoria porque no se puede ver la configuración de producción.
- La ruta de retorno de YouTube tiene el mismo patrón de dirección pública que ya se corrigió en la de Mercado Pago (está apagada en producción).
- La web detecta "falta vincular" por el texto del mensaje de la API; conviene un código propio.
- La cookie `secure` del intento de vinculación no tiene test.

---

## Dónde quedó cada pieza

| Pieza | Dónde |
|---|---|
| Cotización congelada | `packages/domain/src/value-objects/SettlementQuote.ts` |
| Puerto de cotización y cliente del BCRA | `packages/domain/src/ports/IExchangeRateProvider.ts`, `apps/api/src/adapters/BcraExchangeRateProvider.ts` |
| Cuenta del vendedor | `packages/domain/src/entities/SellerPaymentAccount.ts`, `packages/db/src/repositories/PrismaSellerPaymentAccountRepository.ts` |
| Cifrado de tokens | `apps/api/src/adapters/AesGcmSecretCipher.ts` |
| OAuth de Mercado Pago | `apps/api/src/adapters/MercadoPagoOAuthClient.ts`, `apps/api/src/routes/paymentAccount.ts` |
| Cobro con reparto | `packages/domain/src/use-cases/operation/PaymentUseCases.ts`, `apps/api/src/adapters/MercadoPagoGateway.ts` |
| Aviso de pago | `apps/api/src/routes/webhooks.ts` |
| Opciones de pago | `packages/domain/src/use-cases/operation/GetPaymentOptionsUseCase.ts`, `apps/web/src/components/PaymentChoice.tsx` |
| Vinculación en la web | `apps/web/src/app/mercadopago/callback/route.ts`, `apps/web/src/components/MercadoPagoPanel.tsx` |
| Migraciones | `add_settlement_quotes`, `add_seller_payment_accounts`, `add_unique_mp_user_id` |
| Bitácora de la feature | `odd/tasks/mp-split-cobro.md` |

---

## Prueba en producción con la integración de prueba

La aplicación de prueba `traspaso-mp-test` pertenece a una cuenta de prueba de Mercado Pago (tipo Marketplace), y solo operan con ella cuentas de prueba: es el entorno de demostración del sitio. Se prueba todo así y recién al final se cambia a la integración real (sección siguiente).

### Variables de la VM

Van en `/etc/marketplace/api.env`. Las que no figuran (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_BACK_URL`, `MERCADOPAGO_NOTIFICATION_URL`) se dejan como están.

| Variable | Valor | De dónde sale |
|---|---|---|
| `MP_OAUTH_CLIENT_ID` | `2147524912249393` | Número de la aplicación `traspaso-mp-test`. |
| `MP_OAUTH_CLIENT_SECRET` | secreto | Credenciales de esa aplicación en el panel de Mercado Pago. El que se compartió por chat conviene regenerarlo antes de cargarlo. |
| `MP_OAUTH_REDIRECT_URI` | `https://traspaso.forzalabs.online/mercadopago/callback` | Tiene que coincidir letra por letra con la registrada en la aplicación (junto con PKCE activado). |
| `MP_TOKEN_ENCRYPTION_KEY` | generar | `openssl rand -base64 32`, una sola vez, en la VM. No se puede recuperar: guardar una copia. |
| `MERCADOPAGO_SPLIT_ENABLED` | `1` | Enciende el cobro con reparto. Sin las cuatro variables de arriba, la API no arranca y dice cuál falta. |
| `EXCHANGE_RATE_ENABLED` | `1` | Pesificación de las operaciones en dólares. |
| `TRANSFER_INSTRUCTIONS_ARS` y `TRANSFER_INSTRUCTIONS_USD` | texto | Para la demostración, un texto de prueba, claramente marcado como tal. Sin texto, la transferencia no se ofrece en esa moneda. |
| `MERCADOPAGO_WEBHOOK_SECRET` | ver abajo | El secreto es **de cada aplicación**. |

`REQUIRE_MP_LINK_TO_PUBLISH` se deja apagada durante las pruebas, para que los vendedores demo puedan publicar sin vincular.

La firma del aviso de pago: si `MERCADOPAGO_WEBHOOK_SECRET` está cargada con el secreto de otra aplicación (por ejemplo `traspaso-mp`), la firma de los avisos no coincide, el aviso se ignora y el pago **nunca se confirma**. En el registro de la API aparece `Aviso de MercadoPago con firma inválida`. Se resuelve cargando el secreto de `traspaso-mp-test`, que es la aplicación que crea el cobro, o dejando la variable vacía mientras dure la prueba (sin ella no se valida la firma; no es peligroso, porque el pago se vuelve a consultar a Mercado Pago antes de darlo por válido).

Después de cambiar las variables hay que reiniciar la API (`sudo systemctl restart marketplace-api`).

### Recorrido

1. Como vendedor de la plataforma, ir a `/perfil`, tocar **Vincular Mercado Pago** e iniciar sesión en Mercado Pago con el **vendedor de prueba** (si el navegador ya tiene abierta otra cuenta de Mercado Pago, usar una ventana privada de otro navegador: si no, se autoriza con la cuenta equivocada). Al volver, el perfil dice que la cuenta está vinculada.
2. Llevar una operación de ese vendedor hasta `asset_in_custody` (aceptar, firmar, ceder, verificar la custodia).
3. Como comprador de la plataforma, abrir la operación: aparece **Elegí cómo pagar**. Tocar **Pagar con Mercado Pago** y pagar con el **comprador de prueba** (tiene que ser una cuenta distinta del vendedor de prueba).
4. Comprobar que la operación pasa a pago recibido, que el vendedor de prueba recibe el neto (el precio menos el 5 % y menos la comisión de Mercado Pago) y que la comisión de la plataforma aparece como "dinero a liquidar" en la cuenta de la aplicación.
5. Repetir con una operación en dólares: la pantalla avisa que se cobra en pesos al cambio oficial y Mercado Pago muestra el monto en pesos.
6. Sin avance después de pagar: mirar el registro de la API. `Aviso de MercadoPago con firma inválida` apunta a `MERCADOPAGO_WEBHOOK_SECRET`; `Token del vendedor no disponible` apunta a que hay que volver a vincular.

---

## Cambio a la integración real

Se hace cuando la prueba terminó. Los tokens que se guardaron durante la prueba son de la aplicación de prueba y no sirven para la real.

1. En la aplicación real (`traspaso-mp`) registrar la redirect URL `https://traspaso.forzalabs.online/mercadopago/callback` y activar PKCE (Configuraciones avanzadas de la aplicación), y tener habilitadas sus credenciales de producción.
2. Reemplazar `MP_OAUTH_CLIENT_ID` y `MP_OAUTH_CLIENT_SECRET` por los de la aplicación real. La redirect URL no cambia si se mantiene el mismo dominio. Si `MERCADOPAGO_WEBHOOK_SECRET` está cargada, reemplazarla por la de la aplicación real.
3. **Vaciar la tabla `seller_payment_accounts`** (`DELETE FROM seller_payment_accounts;`): los permisos guardados dejarían de renovarse y los vendedores verían "volver a vincular" sin entender por qué. Cada vendedor vincula de nuevo su cuenta real.
4. Reiniciar la API.
5. Hacer un cobro real de poco monto antes de abrir el sitio.

No cambian: `MP_TOKEN_ENCRYPTION_KEY`, las banderas ni los textos de transferencia.

---

## Pendiente

1. **Recorrido de punta a punta en un entorno desplegado** (se hace con la sección "Prueba en producción con la integración de prueba"). La vinculación y el aviso de pago necesitan una dirección pública, así que no se pueden recorrer en local. Antes de encender en producción: vincular un vendedor de prueba, pagar una operación en pesos y otra en dólares, y comprobar el reparto, el aviso y el avance a `payment_received`.
2. **Cargar la configuración en la VM**: `MP_TOKEN_ENCRYPTION_KEY` (con copia de resguardo), las tres variables `MP_OAUTH_*`, `TRANSFER_INSTRUCTIONS_ARS` y `_USD`; encender `MERCADOPAGO_SPLIT_ENABLED` recién después de probar.
3. **Reembolsos y contracargos** con reparto: no se verificaron.
4. **Vencimientos y recordatorios** de las operaciones trabadas: fase aparte.
