# Fase 9 — Reclamos y legajo probatorio

> **Estado**: ✅ Completa
> **Fecha**: Agosto 2026
> **Objetivo**: Que cuando una parte incumple, la otra tenga con qué reclamar.

---

## La decisión de negocio que ordena la fase

Hubo un intento anterior, y se descartó. Se había diseñado una retención sobre el ingreso declarado: parte del cobro del vendedor quedaba retenida y se liberaba en proporción al ingreso real, de modo que inflar el número no rindiera.

El mecanismo era coherente y estaba probado, y **estaba mal**: movía a la plataforma de intermediaria a garante. Esa es una decisión de modelo de negocio, y ya estaba tomada.

> La plataforma cobra 5% a cada parte y no asume el riesgo de que una de ellas mienta. Ante un fraude no retiene fondos ni ajusta el precio: entrega la documentación y los datos de la parte en falta a su contraparte para que inicie las acciones legales que correspondan.

Se revirtió por completo. Lo que sigue es lo que la plataforma sí puede ofrecer con honestidad.

---

## El modelo de seguridad es disuasivo

La prevención del fraude no pasa por maquinaria financiera sino por **encarecerle el fraude a quien lo intenta**: identidad verificada, contrato con peso legal, firma con fecha, IP y huella del documento.

De ahí que el trabajo de esta fase no sea arbitrar nada, sino **reunir y entregar evidencia**.

---

## Ningún estado dice quién tiene razón

`Report` tiene exactamente dos estados: `open` y `closed`.

```typescript
/**
 * Ninguno de los tres estados dice quién tiene razón.
 *
 * La plataforma no arbitra el fondo del reclamo: recibe la denuncia, la fecha,
 * avisa a la contraparte y reúne lo que registró. Un estado como "resuelto a
 * favor del comprador" implicaría un juicio que la plataforma no está en
 * condiciones de emitir ni quiere asumir.
 */
export type ReportStatus = 'open' | 'closed';
```

Cerrar un reclamo no significa que fuera infundado: significa que la plataforma ya no tiene nada más que aportar.

---

## Tres reglas que salieron del dominio existente

**No se puede reclamar antes de firmar el contrato.** La razón reusa una regla que ya estaba: hasta ese punto cancelar es legal, así que retirarse es el remedio. Recién cuando la cancelación deja de estar disponible el reclamo tiene sentido.

**Lo ven las dos partes.** El denunciado accede al mismo legajo, con el mismo contenido. Un reclamo que la otra parte no puede leer ni responder no le sirve a nadie.

**Solo lo cierra quien lo abrió.** Que el denunciado pudiera darlo por terminado sería cerrar un reclamo en su contra por decisión propia.

---

## El legajo

Es el producto real de la fase. Reúne en un solo lugar lo que la plataforma ya venía registrando y que hasta ahora no estaba junto en ninguna parte:

- Contratos firmados con su **huella SHA-256**, y la fecha e **IP de cada firma**
- Constancia de titularidad: qué devolvió Google, cuándo, y el identificador canónico del activo — o el hecho de que nunca se comprobó
- Constancia de custodia: qué verificó el admin y con qué métricas
- Historial completo de la negociación, con quién propuso qué y cuándo
- Lo que el vendedor declaró al publicar, **sin el filtro del listing blind**: ante un reclamo importa qué se declaró, no qué alcanzaba a ver alguien que no había firmado el NDA

Se genera en cada consulta en vez de guardarse, igual que el documento de un contrato: así refleja siempre lo que la base tiene, sin una copia que pueda quedar desactualizada.

### Sobre los datos personales

Entregar el nombre y el DNI de la contraparte parecía el punto espinoso, y no lo es: **ambas partes firmaron un contrato tripartito que ya los contiene**. El legajo no revela nada nuevo, los reúne junto al resto de la evidencia — que es el trabajo que nadie estaba haciendo.

---

## Estado

| Pieza | Dónde |
|---|---|
| Entidad y sus reglas | `packages/domain/src/entities/Report.ts` |
| Casos de uso y legajo | `packages/domain/src/use-cases/report/ReportUseCases.ts` |
| Persistencia | `packages/db/src/repositories/PrismaReportRepository.ts` |
| Rutas | `apps/api/src/routes/reports.ts` |
| Pantallas | `apps/web/src/app/denuncias/` |

El texto de cierre del legajo lo dice explícitamente: la plataforma conserva la documentación, no arbitra el fondo ni responde por el incumplimiento de una de las partes.
