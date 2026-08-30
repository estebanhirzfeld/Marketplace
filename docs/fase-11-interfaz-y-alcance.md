# Fase 11 — Interfaz para el usuario y recorte del alcance

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Que la aplicación le hable al cliente y no al desarrollador, y que el catálogo se limite a lo que se puede entregar de forma legítima.

---

## Una fuga de confidencialidad, y por qué pasó

En el mercado se veía la dirección del canal de un activo publicado, **sin iniciar sesión y sin NDA**. La causa era un corto-circuito:

```typescript
if (!this.props.isBlind || revelarConfidenciales) {
    return { assetType, assetData, hiddenFields: [] };  // todo, sin filtrar
}
```

Con `isBlind: false` el filtro se salteaba entero.

El defecto de fondo no era ese `if`: era que **quien publica podía decidir si la identidad de su activo era reservada**. Qué es confidencial lo declara la estrategia, y la dirección lo es porque es lo que identifica al activo — un listing blind sin la identidad reservada no es un listing blind.

La corrección fue eliminar `isBlind` del dominio en vez de forzarlo a `true`. **La entidad ya no tiene forma de representar un activo no blindado**, así que el bypass no puede volver por descuido. Salió también de los DTOs, del schema del POST, de la columna de Prisma y del formulario.

El test que lo fija no confía en la lista de campos: verifica que el JSON serializado **no contenga `youtube.com/@` ni el dominio**. Una regla de confidencialidad se prueba mirando lo que efectivamente sale, no lo que se declaró que iba a salir.

---

## Los textos eran para el desarrollador

La interfaz mezclaba "asset" y "activo" para lo mismo, y explicaba mecanismos internos en vez de decirle a la persona qué iba a pasar. Se unificó en **"activo"**, que ya era lo que usaban el título del sitio, la línea de tiempo y todos los avisos.

Pero había algo peor. **El renombrado de identificadores a inglés de la Fase 10 se filtró dentro de la copy visible.** El script protegía los literales entre comillas, y el texto JSX no va entre comillas. La aplicación mostraba frases como:

> *"El seller eligió no exponer públicamente los form que identifican el asset"*
> *"Comisión de la platform"* · *"Ingresar para makeOffer"*

Treinta y siete frases en diecisiete archivos, más siete mensajes de error del dominio que decían "listing" y "seller" donde el usuario espera "activo" y "vendedor".

**El renombrado había pasado `tsc`, `next build` y las 585 pruebas.** Ninguna de esas herramientas lee el texto que ve el usuario. Es el mismo patrón que este proyecto viene encontrando desde la Fase 5.1 —verde no prueba correcto, prueba que coincide con lo que alguien escribió que esperaba— aplicado esta vez a una superficie que no tenía ninguna verificación automática.

Quedó un barrido que busca palabras inglesas dentro de frases en español, sobre el texto JSX, los valores de props de copy y los mensajes de error del dominio.

---

## Instagram y TikTok fuera del catálogo

La decisión que la investigación había dejado abierta. TikTok prohíbe explícitamente transferir una cuenta en sus términos, e Instagram parece hacer lo mismo. Si transferir esas cuentas viola los términos de la plataforma, el problema **no es que no haya API**: es que el activo no se puede entregar de forma legítima, y el marketplace quedaría facilitando un incumplimiento de sus propios usuarios frente a un tercero.

Se acotó a **canales de YouTube y sitios web**. Salieron del enum `AssetType`, del enum de Prisma —con una migración que recrea el tipo, porque Postgres no permite quitar valores—, de la factory y de toda la interfaz. `SocialStrategy` se eliminó.

Una fila vieja con uno de esos tipos ya no se reconstituye: la factory la rechaza, con un test que lo fija. Fallar es correcto — un activo que no se puede entregar no debería poder volver a la vida por una consulta.

---

## Mercado, publicación y avisos

**Filtros y orden, separados según cómo se usan.** Los filtros viven en una columna al costado, fija al hacer scroll: se dejan puestos. El orden va en una barra sobre la grilla, con el conteo de resultados: se toca seguido.

El tipo es navegación con enlaces indexables; el resto es un formulario GET, así que cada búsqueda tiene su propia URL y funciona sin JavaScript. El orden viaja como campo oculto para que buscar no lo pierda, y cambiar de tipo limpia los filtros del tipo anterior pero conserva el orden.

Cuatro criterios de orden, cada uno con su ícono en línea siguiendo el patrón que ya existía. Tocar el criterio activo invierte la dirección; cambiar de criterio arranca de mayor a menor. Son enlaces, así que cada orden conserva su URL. La moneda es **obligatoria** al acotar por precio: comparar centavos de monedas distintas no significa nada, y se rechaza con un mensaje claro en vez de devolver una lista sin sentido. Un filtro de un tipo aplicado a otro devuelve 400 en lugar de una lista vacía sin explicación.

En la URL los precios van en unidades enteras, no en centavos: es lo que la persona escribe y lo que ve si comparte el enlace.

**Publicación.** El país de la audiencia pasó a un `select` agrupado por nivel de publicidad. Quedó documentado que el Reino Unido va como `UK` y no `GB` porque `getAudienceDelta()` compara contra ese código, y cambiarlo le bajaría el múltiplo a esos canales en silencio. El precio acepta ARS o USD con aviso de conversión al tipo de cambio del día del pago.

**Avisos.** La campana abre un desplegable con las novedades recientes y un enlace a la bandeja completa. Sigue siendo Server Component y **redacta los textos del lado del servidor**, así el diccionario de mensajes no viaja al navegador y hay un solo lugar donde se escribe el copy.

---

## Estado

```
domain      418 passed
db           37 passed
api         118 passed
api-client   12 passed
next build   ✓    seed ✓
```
