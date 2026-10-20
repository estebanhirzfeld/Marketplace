# avisos-traspaso-youtube — Pasos del traspaso de canal alineados con la prueba real

Rama: `feat/avisos-traspaso-youtube` (desde `origin/fase-5-frontend-y-avisos`).
TDD: activado (fuente: instrucciones del proyecto, "TDD is expected" en `CLAUDE.md`). Runner: `pnpm --filter @marketplace/domain exec vitest run tests/strategies/TransferSteps.test.ts` (y `make test-domain` para el conjunto).
Plan aprobado: `~/.claude/plans/teniendo-todo-el-panorama-wobbly-sphinx.md`.
Evidencia: Engram #266 a #271 (prueba real del 9/10/2026 con una cuenta descartable).

## Objetivo

Que los pasos que se le muestran al vendedor y a la plataforma en `YouTubeStrategy.getTransferSteps()` digan lo que pasó en la prueba real y no prometan lo que no se verificó.

## Alcance autorizado

- `packages/domain/src/strategies/YouTubeStrategy.ts`: textos y un paso nuevo.
- `packages/domain/tests/strategies/TransferSteps.test.ts` y `packages/domain/tests/PlatformHandover.test.ts`: tests nuevos y ajustes por el paso insertado.
- `apps/web/src/app/sistema/page.tsx`: la lista fija que repite los pasos.
- Fuera de alcance: ingesta de métricas, regla de silencio, cláusulas de `seller_nda`, write-up en `docs/`, cualquier cambio de modelo del dominio.

## Decisiones (de la prueba real)

- La plataforma debe aceptar la invitación como administradora: paso nuevo, actor `platform`.
- La plataforma se invita como administrador y nunca como propietario (el rol propietario permite borrar la cuenta de marca).
- El reloj de 7 días no se afirma desde la invitación: se redacta "como administradora".
- Lo más probable es que el canal pierda la verificación y la foto de perfil al pasar a cuenta de marca; el nombre del canal se mantiene aunque la cuenta de marca se llame distinto.
- Texto en español rioplatense como el resto del archivo; identificadores en inglés.

## Tareas

- [x] T1 Dominio: tests nuevos en rojo (6 fallos observados), luego los pasos de `getTransferSteps()` en verde. `PlatformHandover.test.ts` no necesitó cambios (filtra solo pasos del vendedor).
- [x] T2 Web: lista fija de `apps/web/src/app/sistema/page.tsx` actualizada (paso 3 como administrador, texto de promoción). El paso nuevo es de la plataforma y esa lista solo muestra pasos del vendedor.
- [x] T3 Verificación: dominio, `tsc`, `/sistema` y la respuesta de la API para un activo real de YouTube (ver Progreso). No se miró la pantalla de `/activos/[id]` en el navegador.

## Ruta por tarea

- T1 y T2: delegated direct, un solo escritor (3 archivos no triviales, dispara el trigger de escritura).
- T3: inline.

## Criterios de aceptación

- Los tests nuevos se vieron fallar antes de implementar.
- El paso de aceptación aparece entre la invitación del vendedor y la verificación de la plataforma.
- Ningún texto afirma que el canal toma el nombre de la cuenta de marca, ni que la verificación se conserva.
- `make test-domain` en verde y typecheck sin errores nuevos.

## Progreso

T1 y T2 hechas por un escritor delegado (una sola ruta). Revisión del padre: se cambió además la frase "arranca el plazo de siete días" del paso de invitación, que implicaba que el reloj corre desde la invitación; ahora dice que la plataforma "empieza a acumular los siete días".

Verificación observada:
- `pnpm --filter @marketplace/domain exec vitest run`: 58 archivos, 785 tests en verde.
- `tsc --noEmit` en `packages/domain` y `apps/web`: sin errores (no hay script `typecheck` en esos paquetes).
- `next dev` en el puerto 3100: `/sistema` responde 200 y muestra "como administrador del canal" y el texto nuevo de la promoción; ya no aparece "como propietaria del canal".
- Con la base local levantada (Docker reiniciado), API en el puerto 3001 y login como el vendedor sembrado, `GET /listings/f2fdc64f-0328-4dc6-90b7-954af8f2a348` (YouTube, publicado) devuelve en `handoverSteps` los 4 pasos del vendedor con los textos nuevos (ids 1, 2, 3 y 7; el paso de aceptación de la plataforma no aparece porque esa lista solo trae pasos del vendedor). Solo lecturas sobre la base, un login y nada escrito a propósito.
- No se miró la pantalla en el navegador: la página renderiza `instruction ?? description` de ese mismo DTO.

Commit de la unidad de trabajo: `325a131` (T1 y T2, 143 líneas cambiadas). Evaluación de riesgo nativa (`gentle-ai review assess` con base `origin/fase-5-frontend-y-avisos`, archivos sin seguimiento excluidos): riesgo medio por cambio ejecutable en `apps/web/src/app/sistema/page.tsx`, `review_due: false` con motivo `under_budget`. La revisión queda pendiente dentro de la rebanada hasta que otro commit alcance el presupuesto de unas 400 líneas.

## Próximo paso

Commit de la unidad de trabajo y revisión de `/activos/[id]`. Después, esperar al 16/10 para la prueba del reloj de 7 días.
