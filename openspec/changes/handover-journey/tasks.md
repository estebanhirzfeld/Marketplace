# Tasks: handover-journey

El seguimiento vivo está en `odd/tasks/recorrido-del-traspaso.md`. Esta lista fija el orden y el
alcance de cada unidad; cada una lleva su código, sus tests y sus docs.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 5000–7000 (autoría, en 19 unidades) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Una PR por grupo de unidades, en cadena |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

## Unidades

| # | Unidad | Specs | Riesgo |
|---|--------|-------|--------|
| 1 | Docs y decisiones: este cambio, `CLAUDE.md`, feature document | todas | — |
| 2 | Investigación del split de Mercado Pago y de R2 (hecha, en `explore.md`) | split-bank-transfer | — |
| 3 | Borrar las máquinas xstate | — | — |
| 4 | Contraoferta en la moneda de la operación | — | — |
| 5 | Listo para firmar por estrategia, RDAP, guarda nueva de la firma, sin `acceso_pendiente` en sitios | sign-readiness | alto (guarda compartida) |
| 6 | Restos de YouTube fuera de los sitios | sign-readiness | — |
| 7 | Modelo de pasos completo (`stage`, `gate`, sin filtro) | handover-steps | contrato de la API |
| 8 | Hitos y plazos (`milestones`, `HandoverDeadlines`, `BusinessCalendar`) | handover-deadlines | migración aditiva |
| 9 | `NextActions` y página de la operación nueva | next-actions | — |
| 10 | Custodia automática de un sitio, `sellerSourceIdentity`, `rejectTransfer` | handover-deadlines | — |
| 11 | Transferencia dividida con comprobantes | split-bank-transfer | alto (confirmación del pago) |
| 12 | QR de subida sin sesión | split-bank-transfer | alto (seguridad) |
| 13 | Entrega y recepción del comprador, reclamo que congela | delivery-receipt | — |
| 14 | `complete()` nuevo y automático | delivery-receipt | alto (firma de `complete()`) |
| 15 | Cancelación por plazo y devolución del activo | handover-deadlines | alto (excepción a una regla) |
| 16 | NDA del vendedor al publicar | seller-nda | — |
| 17 | Retiro de un activo | listing-withdrawal | — |
| 18 | Panel del admin y avisos pendientes | next-actions | — |
| 19 | Prueba de punta a punta y write-up `docs/fase-21-*.md` | todas | — |

Las unidades 3, 4 y 5–6 no dependen entre sí; de la 9 en adelante todo pasa por `NextActions`.

## Verificación

- TDD por regla, un archivo de test por flujo.
- `NextActions`: tabla de estado × rol × tipo.
- Integración de `packages/db`: ida y vuelta de cada campo nuevo y `reconstitute` de filas viejas.
- Guardas de textos: la de sitios se amplía; una nueva de YouTube fija los textos de canales.
- Punta a punta de un sitio (`deliaorrego.online`, dos cuentas de Hostinger) y de un canal de prueba,
  siguiendo solo lo que indica cada pantalla, con los casos de plazo vencido.
