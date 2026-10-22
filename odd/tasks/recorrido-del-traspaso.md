# recorrido-del-traspaso — Recorrido del traspaso, simple y coherente (YouTube y sitios)

Rama: `feat/recorrido-traspaso-sitio` (apilada sobre `feat/traspaso-de-sitios`). Cambio de OpenSpec: `openspec/changes/handover-journey/`. Plan aprobado: `~/.claude/plans/quiero-que-razones-que-humming-crayon.md`.
TDD: activado. Runners: `corepack pnpm --filter @marketplace/domain exec vitest run`, `--filter @marketplace/api`, `--filter @marketplace/db` (contra `marketplace_test`), `--filter web`. Entrega: `ask-on-risk`, pronóstico 5000–7000 líneas; cadena `feature-branch-chain` (elegida el 21/10/2026): cada PR contra la rama anterior, empezando por `feat/traspaso-de-sitios`.

## Specs

- **S1** (alcance, L1): «simplificar, reducir pasos e interfaz pero que se mantenga la eficiencia y seguridad», «esto va tanto para web como para yt», «es imperante que nada quede colgando que todo sea coherente tambien». Cada paso tiene quién lo hace, cómo se comprueba, qué traba, su plazo y su aviso. Las cinco garantías del escrow de `design.md` no cambian.
- **S2** (lo no verificable): «Confirma el comprador». Con el pago confirmado el vendedor entrega con instrucciones por tipo; el comprador confirma o reclama en plazo; sin respuesta se da por recibido; un reclamo frena el cierre. Spec: `delivery-receipt`.
- **S3** (plazos): «Plazos que destraban». Vendedor que no cede: se cancela y vuelve al mercado. Comprador que no paga con el activo en custodia: se cancela y se le devuelve el activo al vendedor. Spec: `handover-deadlines`.
- **S4** (listo para firmar): «pero tener en cuenta si los sitios tienen bloqueo». YouTube, 7 días de acceso; sitio, Hostinger, activo y a más de 45 días de vencer, por RDAP; si no, la firma se traba con instrucción. La autoría para publicar sigue siendo el TXT: «la verificacion de hostinguer es para cuando este en proceso de traspaso, la verificacion para publicar es con los txt para verificar autoria». Desaparecen en sitios el acceso de la plataforma y «Transferencia inmediata»: «toda la ux ui de transferencia inmediata en web deberia volar». Spec: `sign-readiness`.
- **S5** (transferencia bancaria): «para transferencias, se debe tener un alis o cbu para la administracion, el buyer hace la tranferencia, debe notificar y adjuntar captura (mostrar qr para que pueda escanear y subir desde el telefono […] el link del qr tenia un token especifico para esa operacion y un usuario deslogueado podia subir el comprobante, nose si hay mejores formas o si fue inseguro, pero era practico)», «los comprobantes pueden ser imagenes o pdfs». Revisada tras la investigación con «Cada uno recibe lo suyo»: dos transferencias (`sellerReceives` al vendedor, `platformEarns` a la plataforma), dos comprobantes; el vendedor confirma lo suyo y el admin la comisión. Spec: `split-bank-transfer`.
- **S6** (almacenamiento): «tengo cuenta en cloudflare, desp vemos como lo conectamos». Puerto `IFileStorage`, disco ahora, R2 después.
- **S7** (plazos por defecto): «Sí, esos». Vendedor 10 días para ceder; comprador 5 días hábiles para pagar y 3 días para confirmar.
- **S8** (NDA del vendedor): «el nda para seller cubre la titularidad o al menos la declaracion del mismo y ademas da exclusividad a vender con nosotros y una multa por concretar operacion con nosotros o vender por fuera de la plataforma (por eso es que no se puede borrar un activo una vez publicado (habria que ver como y en que casos se podria))». Modelo: «/Users/macpro/Documents/Projects/Marketplace/stuff/steps_yt/Trustiu_Contract_-_Lovi_En_Reddit.pdf ese el NDA para publicar (osea habria que adptarlo con nuestros datos y leyes argentinas, etc) […] acordate que desp debemos usar una api para firmar como "SIGNATURA CONNECT" por ejemplo». Spec: `seller-nda`.
- **S9** (retiro): «Sin operación viva». Spec: `listing-withdrawal`.
- **S10** (split de Mercado Pago): «Investigar demorar la liberación», luego «Como hoy y consultar a MP». Hallazgos en `explore.md`.
- **S11** (próxima acción): una sola próxima acción por rol y una línea de tiempo común; el panel del admin agrupa por a quién le toca. Spec: `next-actions`.
- **S12** (pasos completos): todos los pasos de las dos estrategias, con `stage` y `gate`, sin filtro. Spec: `handover-steps`.
- **S13** (arreglos menores): borrar las máquinas xstate; la contraoferta en la moneda de la operación.

## Tasks

| ID | Unidad | Specs | Ruta | Estado | Commit |
|----|--------|-------|------|--------|--------|
| T1 | Docs y decisiones (OpenSpec, `CLAUDE.md`, este documento) | S1–S13 | inline | hecha | pendiente |
| T2 | Investigación del split y de R2 | S6, S10 | inline | hecha (en `explore.md`) | con T1 |
| T3 | Borrar las máquinas xstate | S13 | inline | hecha: `git grep` sin importadores, typecheck de dominio y API, 1238 tests del dominio | ver Log L5 |
| T4 | Contraoferta en la moneda de la operación | S13 | inline | hecha: RED 3 de 4 en `apps/web/tests/counterOffer.test.tsx`, GREEN 4/4, 561 tests de la web | ver Log L5 |
| T5 | Listo para firmar, RDAP, guarda de la firma, sin `acceso_pendiente` en sitios | S4 | inline (mapa por explorador) | hecha: RED 22 + 5 + adaptador; GREEN dominio 1262, API 573; RDAP en vivo con `deliaorrego.online` | ver Log L6 |
| T6 | Restos de YouTube fuera de los sitios | S4 | inline (mapa por explorador) | hecha: dominio 1269, API 573, web 574; API local verificada con los dos sitios | ver Log L8 |
| T7 | Modelo de pasos completo | S12 | inline | pendiente | |
| T8 | Hitos y plazos | S3, S7 | inline | pendiente | |
| T9 | `NextActions` y página de la operación | S11 | inline | pendiente | |
| T10 | Custodia automática de un sitio, `sellerSourceIdentity`, `rejectTransfer` | S3 | inline | pendiente | |
| T11 | Transferencia dividida con comprobantes | S5, S6 | inline | pendiente | |
| T12 | QR de subida sin sesión | S5 | inline | pendiente | |
| T13 | Entrega y recepción del comprador | S2 | inline | pendiente | |
| T14 | `complete()` nuevo y automático | S2 | inline | pendiente | |
| T15 | Cancelación por plazo y devolución del activo | S3 | inline | pendiente | |
| T16 | NDA del vendedor al publicar | S8 | inline | pendiente | |
| T17 | Retiro de un activo | S9 | inline | pendiente | |
| T18 | Panel del admin y avisos pendientes | S11 | inline | pendiente | |
| T19 | Prueba de punta a punta y write-up `docs/fase-21-*.md` | S1 | inline | pendiente | |

Ruta: inline por defecto; ninguna unidad tiene hoy un motivo de escritor delegado. Las unidades de alto riesgo (T5, T11, T12, T14, T15) llevan su propio commit y verificador independiente.

## Log

- **L1** (21/10/2026, pedido original): «quiero que razones, que seas resolutivo, que te pongas en el rol del comprador, del vendedor y del agente, en conjunto e individualmente, la idea es simplificar, reducir pasos e interfaz pero que se mantenga la eficiencia y seguridad, se riguroso, podes hacerme preguntas, hagamos planning y desp avanzamos con artifacts, esto va tanto para web como para yt, es imperante que nada quede colgando que todo sea coherente tambien»
- **L2** (21/10/2026): antecedente, la prueba local con `deliaorrego.online` se cortó con «imposible asi, hay que saltear esto e ir directo a la siguiente fase con planning y artifacts, no se puede asi». La exploración está en `openspec/changes/handover-journey/explore.md`.
- **L3** (21/10/2026): investigación, «la investigacion para ahora». El split 1:1 no deja demorar el cobro del vendedor por la API pública; recibir el total por transferencia sería retener fondos de terceros. Decisiones: «Como hoy y consultar a MP» y «Cada uno recibe lo suyo».
- **L4** (21/10/2026): plan aprobado. T1 escrita: el cambio `website-handover-journey` pasa a `handover-journey` y cubre los dos tipos. Cadena elegida: «feature-branch-chain (Recommended)». Espejo de Engram pendiente: la escritura falló por varias sesiones activas del proyecto. Siguiente: T3.
- **L5** (21/10/2026): T3 (commit «chore(domain): se borran las máquinas xstate»): nadie importaba `packages/domain/src/machines/`; se quitó la dependencia `xstate`. T4 (commit «fix(web): la contraoferta va en la moneda de la operación»): la acción y el formulario tenían `USD` fijo, y en un activo en pesos toda contraoferta chocaba con «La contraoferta debe estar en ARS, la moneda de la negociación». Siguiente: T5.
- **L6** (21/10/2026): T5. `Listing.assertCanBeTransferred` pasa a `assertReadyToSign(registry)` y la decide cada estrategia (`transferReadiness`). Sitio: Hostinger por IANA Registrar ID `1636` (o el nombre), sin estados EPP que lo traben, a más de 45 días de vencer; el candado «client transfer prohibited» no traba. Puerto `IDomainRegistryLookup`, adaptador `RdapDomainRegistryLookup` por rdap.org. Hallazgo en vivo: rdap.org responde 403 al User-Agent `node` de `fetch`; el adaptador se identifica como `Marketplace-RDAP/1.0`. RDAP de `deliaorrego.online` no publica «active», solo «client transfer prohibited». El intento de revisión del candidato acumulado desde `5f91f67` (consentido por el usuario) terminó en `lens_context_budget_exceeded`, como se anticipó. Siguiente: T6.
- **L7** (21/10/2026): verificador independiente de T5: sin bloqueos; todos los escenarios de S4 cumplidos salvo la bandeja de accesos y «Transferencia inmediata», que son de T6; la firma de un canal es idéntica a la base con 0, 3, 6,99, 7 y 8 días. Se corrigió un aviso: sin vencimiento publicado el dominio contaba como listo; ahora no lo está. Para T6: el botón de firmar de la página de la operación depende de `op.transferable` (`GetOperationDetailsUseCase.ts:229`, `isReadyToTransfer()`), así que un sitio sin acceso todavía no puede firmar desde la web.
- **L8** (21/10/2026): revisiones de RDD declinadas por el usuario con «Skip this time»: el candidato acumulado desde `5f91f67` y T5 solo (base `e94ab07`). T6, en dos commits. Dominio: un sitio no puede pedir ni registrar acceso de la plataforma, no tiene fecha de transferible (ni con una constancia guardada de antes), no aparece en la bandeja de accesos ni como firma trabada por acceso; el descriptor dice `requiresPlatformAccess`. Web: un sitio firma desde la operación sin acceso (si el dominio no está listo, la firma devuelve la instrucción de RDAP); el vendedor de un sitio ve «ANTES DE VENDER» (`SaleRequirementsPanel`) en lugar del panel de acceso, sin la fila de acceso del nivel (su máximo es 2), sin la tarjeta de acceso ni «Danos acceso»; la página pública de un sitio no muestra `TransferStatus` ni el formulario de acceso del admin; el filtro «Solo transferencia inmediata» queda solo para canales. Se dejan para T10 y T14 los formularios de custodia y de cierre del admin (hoy son la única forma de cerrar una venta de un sitio). La API local corría sin reiniciar desde antes de T5; reiniciada, los dos sitios salen con `transferable: false`. Siguiente: T7.
