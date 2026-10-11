# Vender, publicación directa, acceso y verificaciones

## Objetivo

Que el vendedor elija el tipo de activo, ponga su precio sin confundirlo con la valuación, publique sin revisión cuando la titularidad está comprobada, pueda editar y borrar, y entienda qué le suma darnos acceso y vincular Mercado Pago.

## Problema y por qué

Observado en producción: `/vender` no elige tipo, el precio se confunde con la valuación, crear deja al vendedor sin saber qué sigue, nada se edita ni se borra, y el panel «Acceso de la plataforma» explica de más y expone la logística.

## Alcance autorizado

Plan aprobado el 11/10: `~/.claude/plans/pasted-content-id-7d4b-primero-que-nested-finch.md`.
Diseño cerrado en el lienzo https://claude.ai/artifact/Mr8uBXhWWn79eSDk6bB3XU (VenderFlujo, PrecioA, BorradorV4, BorradorSinVerificar, PanelD/F, ModalH, VerifL).

## Restricciones

- TDD estricto: RED → GREEN → REFACTOR. Origen: CLAUDE.md del proyecto. Runner: Vitest (`make test-domain`, `pnpm --filter <pkg> exec vitest run`).
- Los tests de base corren contra `marketplace_test`; nunca resetear `marketplace_dev`.
- Identificadores en inglés y textos en español.
- Commits Conventional sin atribución.
- Next.js 16: leer `node_modules/next/dist/docs/` antes de tocar páginas.
- Antes de la venta solo se explica el acceso de administración. Quitar el acceso directo y el propietario principal van en la operación.
- Nivel de vendedor: titularidad +1, acceso +2 y Mercado Pago +1, sobre 4. KYC es requisito, no suma.

## Tareas

- [ ] T1 · Dominio y API: `publish()` con titularidad comprobada, `editDraft()`, `changePrice()` y `discard()`; casos de uso y rutas `POST /listings/:id/publish`, `PATCH /listings/:id` y `DELETE /listings/:id`. Ruta: delegado (2+ archivos no triviales).
- [ ] T2 · Dominio: pasos por fase en `getTransferSteps`; `requestPlatformAccess()` con `platformAccessRequestedAt` (migración y mapper); ruta de acceso solicitado; estado del acceso en el DTO. Ruta: delegado.
- [ ] T3 · Verificación del acceso con OAuth de la cuenta de custodia y botón en `/admin`. Ruta: delegado.
- [ ] T4 · Mercado: `sort=relevance` por defecto (transferibles primero). Ruta: delegado.
- [ ] T5 · Web `/vender`: tarjetas por tipo con indicador de pasos, precio primero con la referencia al costado, redirección al borrador. Ruta: delegado.
- [ ] T6 · Web: borrador (publicar, editar, borrar), panel de acceso de 2 pasos, modal H, Verificaciones L con nivel, isotipo de Mercado Pago, `/sistema`. Ruta: delegado.
- [ ] T7 · Producción: habilitar `YOUTUBE_*` en la VM (requiere autorización explícita).

## Criterios de aceptación

- Un canal conectado se publica sin pasar por `under_review`.
- Un sitio web sin titularidad va a revisión.
- El precio se edita estando publicado; el borrador se edita y se borra.
- «Ya los invité» muestra «Verificando» y el admin confirma con OAuth.
- El mercado ordena primero los activos con transferencia inmediata.

## Entrega

Forecast: unas 2500 líneas en total. Estrategia: ask-on-risk → **feature-branch-chain** (elegida el 11/10). Cada rebanada es un PR contra la rama anterior y todo se integra en `feat/vender-y-publicacion-directa`, que se mergea al final.

## Progreso y evidencia

(sin tareas cerradas)

## Siguiente paso

T1.
