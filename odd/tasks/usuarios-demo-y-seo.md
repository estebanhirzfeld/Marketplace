# Usuarios de demostración y vista previa al compartir

## Objetivo

Que el usuario pueda pasarle a sus amigos dos cuentas listas (`seller3` y `buyer3`) y un enlace a la portada que, al compartirlo, se vea con título, descripción e imagen.

## Problema

- Las cuentas del seed de producción tienen contraseñas aleatorias y el seed no se vuelve a correr (borra todo). No hay forma de sumar una cuenta demo sin tocar la base a mano.
- La portada no tiene `metadataBase`, Open Graph, Twitter card, imagen para compartir ni íconos: un enlace pegado en WhatsApp sale pelado.

## Alcance

- Script idempotente `db:demo-users` que crea `seller3@forzalabs.online` («Test Seller», vendedor) y `buyer3@forzalabs.online` («Test Buyer», comprador), con la contraseña igual al correo y KYC verificado. Si ya existen, no hace nada. También van al seed de desarrollo.
- Metadata de la portada: `metadataBase`, `openGraph`, `twitter`, imagen generada (`opengraph-image`), íconos desde `public/brand`.

Fuera de alcance: crear los usuarios en producción (lo corre el usuario por SSH), imágenes por aviso, sitemap.

## Restricciones

- La contraseña igual al correo es una decisión del usuario para la demo. No es admin: el riesgo es que cualquiera que lea el repo entre como esas cuentas.
- `robots` sigue gobernado por `SEARCH_INDEXING`; la vista previa al compartir no depende de la indexación.
- Identificadores en inglés, textos en español.

## TDD

Activo (configuración del proyecto). Runner: Vitest (`pnpm --filter <paquete> exec vitest run`).

## Tareas

- [ ] T1 · Script `db:demo-users` idempotente + usuarios en el seed. Ruta: delegada (2+ archivos).
- [ ] T2 · Metadata de la portada, imagen para compartir e íconos. Ruta: delegada (2+ archivos).

## Criterios de aceptación

- Correr `db:demo-users` dos veces crea los dos usuarios una sola vez; se puede ingresar con correo = contraseña.
- El HTML de `/` trae `og:title`, `og:description`, `og:image` absoluta, `twitter:card=summary_large_image` y los íconos.

## Entrega

Pronóstico: menos de 400 líneas, un solo PR hacia `fase-5-frontend-y-avisos`.

## Progreso

Rama `feat/usuarios-demo-y-seo`.
