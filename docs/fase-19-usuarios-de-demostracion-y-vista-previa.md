# Fase 19 — Usuarios de demostración y vista previa al compartir

> **Estado**: ✅ Completa
> **Fecha**: Octubre 2026
> **Objetivo**: Mostrar la plataforma a personas de afuera para recibir comentarios: dos cuentas listas para usar y un enlace a la portada que se vea con título, descripción e imagen al compartirlo.

Las cuentas del seed de producción tienen contraseñas aleatorias, y el seed no se puede volver a correr porque borra la base. La portada no tenía metadatos para compartir: pegada en WhatsApp, salía como un enlace sin imagen. Entró por el PR #38 hacia `fase-5-frontend-y-avisos`.

---

## Objetivos cumplidos

- `seller3@forzalabs.online` («Test Seller», vendedor) y `buyer3@forzalabs.online` («Test Buyer», comprador), con KYC verificado.
- Script `db:demo-users` que crea solo las que faltan, para correr en la VM sin tocar nada más.
- La portada trae `metadataBase`, Open Graph, `twitter:card=summary_large_image`, imagen de 1200×630 e íconos de la marca.

---

## Decisiones técnicas

### 1. Contraseña igual al correo en las dos cuentas de demostración

El seed evita esto en producción (`SEED_CREDENTIALS_FILE`) porque el repositorio es público. Para estas dos cuentas fue una decisión explícita del usuario: tienen que poder compartirse sin pasar un secreto, y no son administradoras. El riesgo aceptado es que cualquiera que lea el repositorio entre como ellas y publique u oferte. El seed también las crea, pero con `SEED_CREDENTIALS_FILE` les toca una contraseña aleatoria como al resto; quien fija la contraseña igual al correo es el script.

### 2. Script aparte e idempotente

`ensureDemoUsers` (`packages/db/src/demoUsers.ts`) busca cada usuario por correo y crea solo los que faltan; no borra ni actualiza nada. Lo comparten el seed y `prisma/demo-users.ts`. Correrlo dos veces deja una fila por usuario.

### 3. Dirección pública con valor de reserva

El release se compila en CI, donde `NEXT_PUBLIC_APP_URL` no existe. `siteBaseUrl` usa la variable si es una URL válida y, si no, `https://traspaso.forzalabs.online`: la vista previa nunca apunta a `localhost` ni rompe el render.

### 4. Vista previa independiente de la indexación

`robots` sigue gobernado por `SEARCH_INDEXING`. Las vistas previas de WhatsApp o Twitter leen las etiquetas `og:*` igual con la indexación apagada.

### 5. Imagen generada por convención de archivos

`opengraph-image.tsx` y `twitter-image.tsx` generan la imagen con `ImageResponse`, con la marca y la propuesta («Canales de YouTube y sitios web»). No se guarda un PNG en el repositorio.

---

## Uso en producción

Después del despliegue, una sola vez, en `/srv/marketplace` (ver `infra/README.md`, 8.1):

```bash
sudo -E DATABASE_URL="$(sudo sed -n 's/^DATABASE_URL=//p' /etc/marketplace/api.env)" \
  pnpm --filter @marketplace/db db:demo-users
```

---

## Tests

| Paquete | Pruebas |
|---|---|
| Base de datos (`marketplace_test`) | 126 (`demoUsers.test.ts` corre la creación dos veces) |
| Web | 518 (11 nuevas en `siteMetadata.test.ts`) |

`tsc` sin errores en ambos. Verificado en local: el HTML de `/` trae las etiquetas `og:*` y `twitter:card`, y `/opengraph-image` responde 200 `image/png`.

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|---|---|---|
| Imagen por aviso | Baja | Solo la portada tiene imagen para compartir; los avisos usan la general. |
| `generateMetadata` del layout sin test directo | Baja | El layout importa `next/font/google`; se prueba `siteMetadata()`, que es lo que devuelve. |
| `sitemap.xml` | Baja | No existe; tiene sentido cuando se encienda `SEARCH_INDEXING`. |

---

## Siguiente paso

Correr `db:demo-users` en la VM y compartir el enlace. Los comentarios que lleguen se suman como ítems a `odd/epica-cierre-mvp.md`.
