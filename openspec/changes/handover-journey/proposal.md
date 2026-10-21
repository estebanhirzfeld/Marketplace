# Propuesta: un recorrido del traspaso simple y coherente para sitios y canales

## Intención

La fase 20 dejó el motor del traspaso de un sitio: custodia del dominio en la cuenta de Hostinger de
la plataforma, comprobación automática, entrega por traslado saliente y un job horario con plazos.
La prueba local del 21/10/2026 con `deliaorrego.online` mostró que una persona no puede recorrer una
venta: los tres roles leen cosas que se contradicen, el pago termina en «abrí un reclamo», la firma de
un sitio está trabada por el acceso de YouTube, nadie pide la cuenta receptora y nadie entrega el
sitio en sí. En YouTube el comprador no ve sus pasos y se puede cerrar con el vendedor dentro del
canal. El detalle, con rutas y líneas, está en `explore.md`.

Este cambio arma un mismo modelo de traspaso para los dos tipos, con una sola próxima acción por rol,
la menor cantidad de pasos humanos y ninguna garantía del escrow perdida. Cada paso tiene quién lo
hace, cómo se comprueba, qué traba, su plazo y su aviso.

## Garantías del escrow que no cambian

1. Titularidad comprobada antes de publicar: OAuth en YouTube, registro TXT en un sitio (fase 18).
2. La plataforma toma el control antes del pago: propietaria principal en YouTube, dominio activo en su
   cuenta de Hostinger en un sitio.
3. El comprador paga solo con el activo en custodia.
4. Se entrega a la cuenta que declaró el comprador, congelada al entregar.
5. Se cierra solo con el comprador servido, el vendedor sin poder sobre el activo y el vendedor cobrado.

## Alcance

1. **Listo para firmar, por tipo de activo.** Antes de firmar el tripartito, el activo tiene que poder
   pasar a custodia sin esperas. YouTube: siete días de acceso de la plataforma como administradora
   (se mantiene «Transferencia inmediata» en canales). Sitio: registrador Hostinger, dominio activo y
   al menos 45 días antes de vencer, consultado por RDAP. Si no pasa, la firma se traba con una
   instrucción. Desaparecen en un sitio el acceso de la plataforma, «Transferencia inmediata» y el
   aviso `acceso_pendiente`.
2. **Pasos completos con dueño, para los dos tipos.** Todos los pasos de la estrategia se muestran,
   cada uno con quién lo hace, cómo se comprueba, qué traba y en qué etapa está.
3. **Una sola próxima acción por rol.** La página de la operación dice «Tu próximo paso» y muestra una
   línea de tiempo común; el panel del admin agrupa por a quién le toca. Las dos salen del mismo
   cálculo.
4. **Custodia automática de un sitio.** Ver el dominio activo en la cuenta de la plataforma confirma la
   custodia, sin formulario.
5. **Transferencia bancaria dividida, con comprobantes.** El comprador transfiere `sellerReceives` al
   vendedor y `platformEarns` a la plataforma, y sube los dos comprobantes (imagen o PDF), arrastrándolos
   o desde el teléfono por un QR sin sesión. El vendedor confirma lo suyo y el admin la comisión. El
   vendedor declara su cuenta bancaria para cobrar. El split de Mercado Pago queda como hoy.
6. **Entrega y recepción.** Con el pago confirmado, el vendedor entrega lo que no se puede comprobar
   (sitio: hosting, archivos, código, base de datos, cuentas; YouTube: cuentas asociadas) con
   instrucciones por tipo. El comprador confirma o reclama; si no responde en plazo, se da por recibido.
   Un reclamo abierto frena el cierre.
7. **Cierre automático.** La operación se completa sola cuando el pago está confirmado, el comprador
   recibió y hay cuenta receptora. Se retira el formulario de cierre del admin.
8. **Plazos que destraban.** Vendedor que no cede a tiempo: se cancela y el activo vuelve al mercado.
   Comprador que no paga con el activo en custodia: se cancela y la plataforma le devuelve el activo al
   vendedor. Es una excepción a «después de firmar no se cancela».
9. **NDA del vendedor al publicar.** Declaración de titularidad, confidencialidad, no elusión y
   exclusividad, adaptado a la ley argentina; se firma en la app.
10. **Retiro de un activo** sin operación viva.
11. **Arreglos menores:** se borran las máquinas xstate y la contraoferta usa la moneda de la operación.
12. **Los avisos que el recorrido necesita** y la prueba de punta a punta de los dos tipos.

## Fuera de alcance

- Demorar el cobro del vendedor con el split de Mercado Pago: la API pública no lo permite. El usuario
  lo consulta con el equipo comercial; si aparece una opción, entra en una fase posterior.
- Resolver un reclamo dentro de la app: el admin lo cierra, y la resolución manual queda fuera.
- La firma electrónica avanzada por un proveedor externo: queda detrás de un puerto, sin conectar.
- Conectar Cloudflare R2: los comprobantes se guardan en disco detrás de un puerto.
- Otros registradores, dominios `.ar` y el mail como canal de avisos.
- Comprobar de antemano que un mail tenga cuenta de Hostinger: la API no lo permite.

## Decisiones

Las tomó el usuario el 21/10/2026 y están en `design.md`, con los criterios adoptados por defecto.

## Riesgos

- La guarda de la firma es compartida por los dos tipos: se prueba con los dos.
- Cambiar cómo se confirma un pago y la firma de `Operation.complete()` toca el cierre de toda venta.
- El QR de subida sin sesión es una puerta de entrada sin autenticación: token aleatorio guardado como
  hash, de un solo uso, que vence en minutos, atado a una operación y con límite de intentos.
- La cancelación por plazo es una excepción a una regla decidida: se acota a dos casos, con aviso y
  devolución del activo.
- Los textos de sitios tienen que pasar la guarda `apps/web/tests/websiteCopyGuard.test.tsx` y los de
  canales no pueden cambiar sin querer.
