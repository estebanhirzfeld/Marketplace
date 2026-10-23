# entrega-de-un-sitio — Entrega comprobable de un sitio web (en pausa)

Estado: **en pausa desde el 22/10/2026**. La venta de sitios web se deshabilitó (`WEBSITE_SALES_ENABLED = false` en `apps/web/src/lib/assetAvailability.ts`): `/vender` muestra la tarjeta «Sitio web» como «Próximamente» y la acción de publicar rechaza un sitio. El código de sitios (titularidad por TXT, custodia del dominio, RDAP) queda. Se retoma después de cerrar YouTube. Este documento junta lo investigado para no volver a empezar.

## Specs

- **S1** (por qué se pausó, verbatim, 22/10/2026): «creo que vamos a inhabolitar web por ahora, se documenta los descubrimientos y datos, pero queda para desp asi llegamos, nos centramos en yt, en /vender igual lo mostramos pero disabled y proximamente quiza».
- **S2** (el problema, verbatim): «Pasos 19 a 21 sigue siendo mágico como se hace el traspaso del sitio en si» y «aunque suban los archivos, tendriamos un problema y tampoco podemos validar que efectivamente sea el sitio como tal, sera que se les podra pedir mandar el codigo por github o similar? como lo resuelve la competencia?».
- **S3** (requisitos para publicar, verbatim, valen también para YouTube): «KYC (ej renaper, dni, etc ahora simulado) -NDA Firmado -Titularidad validad (TXT para web (hostinger récord que es solo para el traspaso), Integración para yt) Sin eso, el post es draft e inhabilitado para publicar».
- **S4** (el dominio, verbatim): «eso no lo podemos verificar nosotros? y en caso de detectar que no, madar el aviso?». Respuesta adoptada: RDAP al publicar, una vez por día mientras está publicado y al firmar; si no cumple (registrador Hostinger, más de 45 días para vencer, fuera del bloqueo de 60 días), se avisa al vendedor con la instrucción. Solo traba la firma.

## Lo investigado

### La competencia no valida los archivos

- **Flippa y Acquire.com** usan Escrow.com: el dinero queda retenido, el vendedor entrega y marca enviado, el comprador inspecciona en un plazo (24 h por defecto en Acquire, 2 a 7 días en Flippa) y el silencio libera el pago. [Flippa](https://support.flippa.com/hc/en-us/articles/12592894092943-Using-Escrow-com-for-Flippa-transactions), [Acquire](https://help.acquire.com/how-to-transfer-assets).
- **Empire Flippers** retiene el pago, migra con su propio equipo y da 14 días de inspección. [Empire Flippers](https://empireflippers.com/oba/buying-process/).
- El resguardo de todos es **el dinero retenido**. Acá no se retiene (el split le paga directo al vendedor, por las reglas del BCRA para PSP), así que el resguardo tiene que ser **el activo en custodia**.

### Hostinger

- **«Transfer ownership»** de un sitio entre cuentas, desde hPanel: solo WordPress (no Website Builder ni Horizons), sitio activo, sin migración pendiente y con al menos 7 días de plan. No mueve el dominio, el mail ni la zona DNS. El receptor acepta en 7 días y elige el plan de destino. Gratis en Cloud Professional y Enterprise; en el resto es un add-on pago. Unos 30 minutos. [Hostinger](https://www.hostinger.com/support/9214881-how-to-transfer-website-ownership-in-hostinger/).
- Un sitio PHP o HTML se mueve a mano con una copia de seguridad. [Hostinger](https://www.hostinger.com/support/move-website-within-hostinger/).
- La API de Hostinger solo opera la cuenta del token: no ve la del vendedor ni la del comprador.

### GitHub

- Transferir a una **cuenta personal**: el receptor acepta por mail y la invitación vence en **1 día**.
- Transferir a una **organización**: quien transfiere necesita permiso para crear repositorios en ella. Se podría automatizar invitando al vendedor como miembro sin acceso a nada más, comprobando por API que el dueño sea la organización y sacándolo. **Sin probar.**
- Se transfieren los issues, los PR y el historial; los forks del vendedor siguen existiendo. [GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository).

### Lo que no se puede probar

- Que un código o una copia sean el sitio que corre. Un archivo de verificación servido por el sitio (`/.well-known/traspaso-<código>.txt`) solo prueba que el vendedor controla el despliegue, no que el repositorio esté completo.
- Que el vendedor no se quede con una copia: lo digital se copia. El resguardo es el NDA (exclusividad, no competencia y multa).

## Propuesta a retomar

1. Custodia antes del pago de todo lo comprobable: **dominio** (ya está), **repositorio** en la organización de GitHub de la plataforma, y **hosting** en la cuenta de Hostinger de la plataforma cuando es WordPress en Hostinger (investigar el costo del add-on y del plan).
2. **La base de datos no pasa por la plataforma**: suele tener datos personales, y guardarla sería un tratamiento bajo la Ley 25.326. Va del vendedor al comprador después del pago.
3. **Plazo de inspección del comprador**, como la competencia, con el silencio como recibido. La plataforma guarda constancia de cada entrega (traslado del dominio, transferencia del repo, fechas) para que el vendedor pueda disputar un contracargo.

## Casos infelices a cubrir

- **Vendedor:** se queda con una copia (inherente; NDA); entrega un repo incompleto (reclamo en la inspección; ya cobró, el reclamo va contra él); rompe o vacía el sitio después de cobrar (**el hueco más grande** sin custodia del hosting); no entrega lo que falta (entregar antes del pago lo comprobable); redirige el tráfico o compite (no competencia, vía legal).
- **Comprador:** recibe todo y pide un contracargo en Mercado Pago (constancias de entrega); reclamo falso para frenar el cierre (motivo obligatorio, el admin lo cierra con la constancia a la vista; definir la consecuencia); quiere ver el código antes de pagar (decidir si hay una revisión previa); no paga (cancelación por plazo: el dominio y el repo vuelven al vendedor).

## Pendiente

- Probar la transferencia a una organización de GitHub con un repo real.
- Costo de la custodia del hosting en Hostinger.
- Qué pasa con los activos de sitio que ya existen como borrador o publicados.

## Log

- **L1** (22/10/2026): se pausa la venta de sitios (S1). Antecedentes en `odd/tasks/recorrido-del-traspaso.md`, L20 a L22.
