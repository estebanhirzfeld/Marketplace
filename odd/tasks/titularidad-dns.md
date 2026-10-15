# titularidad-dns — Titularidad de un sitio por registro DNS

Rama: `feat/titularidad-dns` (desde `origin/fase-5-frontend-y-avisos`).
TDD: activado (fuente: `CLAUDE.md` del proyecto, "TDD is expected"). Runners: `pnpm --filter @marketplace/domain exec vitest run`, `pnpm --filter @marketplace/api exec vitest run`, `pnpm --filter @marketplace/db exec vitest run` (contra `marketplace_test`), `pnpm --filter web exec vitest run`.
Plan aprobado: `~/.claude/plans/si-dale-con-el-idempotent-otter.md`. Evidencia previa: Engram #292 a #294.
Ítem de la épica: «Titularidad por registro DNS», etapa 1b de `odd/epica-cierre-mvp.md`.
Entrega: estrategia `ask-on-risk`; al pasar las ~400 líneas se pregunta si se encadenan PRs hacia `fase-5-frontend-y-avisos`.
Revisión: el modo de revisión con recibos está activado (global); se evalúa el riesgo después de cada commit.

## Objetivo

Que un vendedor compruebe la titularidad de un sitio con un registro TXT en su DNS y publique sin revisión del admin, sin depender de AdSense.

## Problema

Hoy la única fuente de titularidad de un sitio es AdSense (`WebStrategy.ownershipSource = 'adsense'`). Un sitio sin AdSense no puede comprobar que es suyo.

## Decisiones (del usuario, 15/10/2026)

- Se reutiliza la tarjeta «Comprobar titularidad» de YouTube. En un sitio abre un modal con el valor del TXT para copiar, las instrucciones del proveedor de DNS deducido de sus servidores y un estado que cambia solo cuando aparece el registro.
- AdSense queda como opción dentro del modal: es la que además comprueba los ingresos.
- La Site Verification API de Google queda para después del MVP. Domain Connect queda descartado.

## Decisiones de diseño

- El valor del TXT se deriva con HMAC-SHA256 (secreto `DNS_CHALLENGE_SECRET`, `listingId:dominio`), truncado a 24 caracteres hexadecimales. No hay tabla ni migración. Sin secreto, la fuente queda «no configurada».
- Los TXT se consultan en los servidores autoritativos del dominio, para evitar la caché negativa de un resolvedor público.
- El estado cambia solo mientras el modal está abierto (consulta cada 10 segundos con tope de intentos, más el botón «Ya lo cargué»). No hay tarea en segundo plano.
- Fuera de alcance: revocar la constancia si se borra el TXT. Va con el ítem «Traspaso de un sitio con pasos comprobables y plazos».

## Tareas

- [ ] T1 Dominio: value object `DomainName`; `'dns'` en `VerificationSource`; puertos `IOwnershipChallengeIssuer` e `IDnsResolver`; casos de uso `GetDomainOwnershipChallengeUseCase` y `VerifyDomainOwnershipUseCase`; `WebStrategy` con `ownershipSource: 'dns'` y textos revisados. Ruta: escritor delegado (más de 2 archivos no triviales).
- [ ] T2 Infraestructura: `'dns'` en `ListingMapper`; adaptadores `HmacOwnershipChallengeIssuer` y `NodeDnsResolver`; `identifyDnsProvider`; rutas `GET /listings/:id/verificacion-dns` y `POST /listings/:id/verificar/dns`; contrato, cliente y contenedor. Ruta: escritor delegado.
- [ ] T3 Web: `DnsVerificationDialog`, variante DNS de `VerificationCards`, consulta repetida, `CopyValueButton`, textos de `/vender` y de `activos/[id]`, `/sistema`. Ruta: escritor delegado.
- [ ] T4 Prueba real con `deliaorrego.online` en local y en producción; write-up en `docs/fase-*.md`, `docs/gant.json` y el ítem tildado en la épica. Ruta: en línea.

## Criterios de aceptación

- Un sitio con el TXT correcto queda con titularidad comprobada (`source: 'dns'`, `assetId` = dominio normalizado) y se puede publicar sin revisión.
- Sin el TXT, la comprobación responde `verified: false` sin error, y el modal sigue esperando.
- El modal reconoce Hostinger por `nsone.net` y muestra pasos genéricos para un proveedor desconocido.
- AdSense sigue funcionando como fuente alternativa.

## Verificación

- `make test-domain` después de T1; `make test` después de T2 y T3; `pnpm lint` en `apps/web`.
- Prueba de punta a punta con `deliaorrego.online`, comprobada en la app.

## Fuera del alcance, anotado

- Demo de la tesis: `deliaorrego.online` es el único dominio extra del usuario. Si se lo traspasa con éxito, documentarlo y avisarle para que grabe la demo.
- Bloqueo de 60 días: después de cambiar de registrador corre otro bloqueo de 60 días. La custodia no puede pasar por el registrador de la plataforma sin trabar la entrega al comprador.

## Progreso

Sin tareas cerradas todavía.

## Siguiente paso

T1.
