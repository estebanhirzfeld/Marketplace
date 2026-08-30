# Fase 5 — Frontend con Next.js

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Construir la interfaz web sobre la API de la Fase 4, renderizada en el servidor y con el contrato compartido preparado para la futura app móvil.

---

## Decisión previa: el contrato antes que la interfaz

Antes de escribir una sola pantalla se extrajeron dos paquetes nuevos. El motivo es que hay una app React Native planificada, y **el límite de reuso entre web y móvil no es la UI: es la capa de datos.**

React Native no puede reusar Server Components, Server Actions, el App Router, elementos del DOM ni clases de Tailwind. Perseguir componentes compartidos con `react-native-web` cuesta más de lo que ahorra. Lo que sí viaja es TypeScript sin framework.

| Paquete | Qué contiene |
|---|---|
| `@marketplace/api-contract` | DTOs de request y response. Sin dependencias del dominio: un cliente móvil no debe arrastrar entidades ni repositorios. |
| `@marketplace/api-client` | `MarketplaceClient`, un envoltorio de `fetch` en TypeScript puro. Corre igual en un Server Component, en el navegador y en React Native. |

**El contrato lo verifica el compilador.** Las rutas de Fastify declaran `Reply` contra los DTOs, así que si una ruta y su consumidor se desincronizan, `apps/api` deja de compilar.

Eso detectó una debilidad de inmediato: `ListingDetailView.status` estaba tipado como `string` en el dominio, ensanchando un valor que la entidad conoce exacto.

### Un solo cliente, dos formas de guardar la credencial

`TokenProvider` es una función que puede devolver una promesa:

```typescript
export type TokenProvider = () => string | undefined | Promise<string | undefined>;
```

La web lee una cookie **httpOnly** desde el servidor; React Native leerá secure storage, que es asíncrono. La API acepta Bearer en los dos casos y no necesita cambios.

---

## Por qué SSR

No es solo preferencia: encaja con el modelo de confidencialidad. Un buscador anónimo renderiza en el servidor y recibe **solo** `getPublicFields()` — nicho, suscriptores, ingreso. Los campos confidenciales nunca llegan al HTML.

Se consigue SEO sobre lo público sin filtrar lo protegido, y sale gratis del modelo que ya existía.

---

## Rutas

14 rutas, todas renderizadas en el servidor:

| Ruta | Qué hace |
|---|---|
| `/` | Landing: hero, proceso del escrow, activos publicados, comisión |
| `/listings` | Mercado con filtros por tipo y rango de precio |
| `/listings/[id]` | Detalle con el gate de NDA |
| `/ingresar` · `/registro` | Sesión en cookie httpOnly |
| `/verificar` | Verificación de identidad |
| `/vender` | Publicar un activo y ver los propios |
| `/vender/[id]/ofertas` | Ofertas recibidas por un listing |
| `/operaciones` · `/operaciones/[id]` | Operaciones propias y timeline del escrow |
| `/avisos` | Bandeja de notificaciones |
| `/admin` | Cola de revisión |
| `/sistema` | Catálogo de componentes |

---

## Next.js 16: las APIs de request son asíncronas

`apps/web/AGENTS.md` advierte que esta versión tiene cambios que rompen respecto de lo conocido, y la advertencia es correcta. El cambio que más pesa:

> A partir de Next.js 16 el acceso sincrónico está **completamente eliminado**. `cookies`, `headers`, `draftMode`, `params` y `searchParams` solo pueden accederse de forma asíncrona.

Eso obliga a que los helpers de sesión sean `async` y a que las páginas reciban `params` como promesa:

```typescript
export default async function DetalleListing(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
```

También se limpiaron dos archivos de `create-next-app` que estaban dentro de `apps/web` y provocaban un warning de lockfiles múltiples, y se fijó `turbopack.root` al raíz del monorepo.

---

## Identidad visual en un solo bloque

Todos los colores, fuentes, radios y curvas de animación viven en el bloque `@theme` de `globals.css`. Cambiar la identidad de marca del producto entero es editar ese bloque, no perseguir hex sueltos por los componentes.

```css
@theme {
  --color-fondo: #0b0c0e;
  --color-acento: #cff245;
  --color-alerta: #e8a33d;
  /* Salida expo: arranca rápido y frena largo. */
  --ease-salida: cubic-bezier(0.16, 1, 0.3, 1);
  /* Pasa de largo y vuelve — para hover, no para entradas. */
  --ease-rebote: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

El único color saturado además del acento es el ámbar, y está reservado a un significado: **dato bajo NDA**. El color señala el diferencial del producto en lugar de decorar.

---

## `/sistema` en lugar de Storybook

Se evaluó Storybook y se descartó, con evidencia de su propia documentación:

- El soporte de React Server Components está marcado **experimental** y requiere un feature flag.
- *"Wrapping your server components in Suspense does not help if your server components access server-side resources"*.
- El soporte de Server Actions figura como pendiente, no disponible.
- `cookies()` y `headers()` solo funcionan **mockeados**.

Esa es exactamente la arquitectura de esta aplicación: Server Components que leen datos con un token de una cookie httpOnly, y mutaciones por Server Actions. Storybook probaría una versión simulada de lo que realmente corre.

Además, el objetivo declarado —poder cambiar la identidad de marca sin dolor— ya lo resuelve el bloque de tokens. Storybook no facilita el cambio; facilita **verlo**.

La ruta `/sistema` da eso mismo usando Server Components reales y tokens reales, sin dependencias nuevas: paleta, escala tipográfica, botones, estados de operación, formularios, superficies, mensajes y la línea de tiempo en dos momentos distintos.

---

## Movimiento

El problema a resolver era concreto: las secciones **pasaban de largo**. Animar todo al cargar significa que el usuario se pierde la mayor parte del movimiento.

Un único componente cliente, `Revelar`, usa `IntersectionObserver` para disparar la animación cuando el bloque entra en pantalla. Todo lo demás sigue siendo Server Component.

En el proceso del escrow: una línea que se traza al entrar, los cuatro pasos escalonados a 110 ms, y el paso **03 · Activo en custodia** destacado en acento, porque es el momento en que el modelo se distingue de cualquier otro marketplace.

Respeta `prefers-reduced-motion`: quien pidió menos movimiento recibe menos movimiento.

---

## Detalles de interfaz que expresan reglas del dominio

- **Campos ocultos que no desaparecen.** En un listing blind, los campos confidenciales se muestran como filas con el nombre visible y el valor difuminado. El comprador ve exactamente qué le falta antes de decidir si firma, en vez de encontrarse un hueco sin explicación. En la grilla se indica la cantidad: *"3 datos reservados bajo NDA"*.
- **Comisión visible al ofertar.** El formulario calcula en vivo cuánto termina pagando el comprador. El 5 % no debería ser una sorpresa al final.
- **Conteo de ofertas solo si hay.** Con cero ofertas la línea no se renderiza: anunciar "0 ofertas" le regala al comprador una palanca de negociación que el modelo a sobre cerrado le estaba negando.
- **Acciones según posición.** En el detalle de operación, qué botones aparecen sale del estado y de la posición de quien mira. Un admin que no es parte recibe `miParte: undefined` y nunca ve una acción de parte.

---

## Endpoints que hubo que agregar

Construir el front expuso que la API no tenía forma de responder tres preguntas:

| Falta | Solución |
|---|---|
| Los activos propios de un vendedor | `findBySeller` + `GetMyListingsUseCase` + `GET /me/listings` |
| El detalle de una operación | `GetOperationDetailsUseCase` + `GET /operations/:id` |
| La cola de revisión del admin | `findByStatus` + `GetListingsForReviewUseCase` + `GET /admin/listings` |

Agregar métodos a los puertos hizo que **todos los mocks tipados desactualizados dejaran de compilar**, en siete archivos de test. Ese es el rédito de anotar los dobles en vez de castearlos: con un `as` habrían seguido compilando contra un contrato que ya no existía.

---

## Tests

| Paquete | Tests | Requiere DB |
|---|---|---|
| `@marketplace/domain` | 203 | ❌ |
| `@marketplace/db` — integración | 27 | ✅ |
| `@marketplace/api-client` | 12 | ❌ |
| `@marketplace/api` — HTTP + adaptador | 42 | ✅ |
| **Total** | **284** | |

```bash
make test       # todo
make front      # DB + API + front
```

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| Sin tests de UI | Media | Los componentes React no tienen pruebas propias; lo que se verifica es la API que los alimenta. |
| Sin carga de imágenes | Media | Un listing no tiene capturas ni logo del activo. Requiere almacenamiento de archivos. |
| Sin paginación | Baja | El mercado trae hasta lo que devuelva `findPublished`. Con volumen real hace falta paginar. |
| Nombre de marca provisorio | Baja | "Traspaso" es un placeholder en toda la interfaz. |

---

## Siguiente paso

→ **Fase 5.1**: Verificación de identidad y saldado de deudas del dominio.
