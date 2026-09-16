# Fase 14 — Recorrido del escrow en la aplicación

> **Estado**: ✅ Completa
> **Fecha**: Septiembre 2026
> **Objetivo**: Que el escrow sea ejecutable de punta a punta por una persona, y cerrar los vacíos que aparezcan al hacerlo.

El proyecto tenía dominio, back, front y despliegue, y se sentía terminado. No lo
estaba, y el problema no era funcionalidad faltante sino verificación: nadie había
recorrido nunca los flujos que las dos fases anteriores daban por completos.

---

## El problema

La fase 13 estaba declarada completa y sus dos migraciones no existían en ninguna
base de datos. La tarea que las aplicaba quedó sin tildar porque Prisma bloquea
`migrate reset` para un agente sin consentimiento explícito, y nadie la corrió
después. Los walkthroughs manuales de `asset-custody-identity` y de
`simplify-transfer-flow` tampoco se ejecutaron.

Había 835 tests en verde en ese momento. No decían nada sobre si una persona podía
usar el producto: validaban las reglas que alguien pensó en escribir, y el recorrido
era justamente lo que faltaba para descubrir las que nadie pensó.

---

## La cuenta receptora se valida contra el tipo de activo

El comprador declara dónde quiere recibir el activo, y ese dato no se validaba en
ninguna de las cuatro capas: el input solo tenía `required`, la server action
recortaba espacios, el esquema de Fastify pedía un string de 1 a 320 caracteres y la
entidad rechazaba únicamente la cadena vacía. Un `"pepe@"` se guardaba, y
`complete()` lo copia tal cual a la constancia de entrega, así que quedaba
inmortalizado en una operación cerrada.

No alcanzaba con exigir una dirección de correo, porque el campo es polimórfico: para
un canal es la cuenta de Google que recibe la invitación, y para un dominio es el
usuario del registrador, que cambia de proveedor a proveedor. El propio copy del
formulario ya lo decía.

La regla vive entonces en la estrategia, junto a `getPublicFields()` y
`getTransferSteps()`:

```typescript
normalizeRecipientIdentifier(identifier: string): string;
```

YouTube exige el formato de una dirección y baja a minúsculas; web solo exige que el
dato exista y respeta las mayúsculas, porque en varios registradores el usuario las
distingue. Las dos imponen el límite de 320 caracteres, el mismo que ya declaraba la
ruta.

El cruce de agregados se resuelve en el caso de uso, igual que el congelado de la
cuenta de custodia en `InitiateTransferUseCase`: la `Operation` conoce su `listingId`,
no el tipo de activo. `Listing` delega en su estrategia y el caso de uso ni se entera
de cuál es, así que no aparece ningún `if (assetType === ...)`.

**No se revalida en `complete()`.** Las operaciones que declararon un identificador
antes de este cambio lo conservan: rechazarlas ahí las dejaría sin poder cerrarse, que
es peor que el defecto. Mismo criterio que la fase 13 con las constancias que no
existían.

---

## La declaración de cesión en pantalla

`transferInitiation` viajaba al DTO y estaba tipada en el contrato, pero un `grep`
sobre `apps/web/src` daba cero: ninguna pantalla la leía. Había panel de verificación
de la custodia y de constancia de entrega, y ninguno de la declaración. Por eso el
paso se sentía vacío — el vendedor declaraba y no aparecía nada.

El panel nuevo muestra cuándo declaró, qué declaró, la cuenta de custodia congelada y
sus notas, y se muestra a las dos partes por el mismo motivo que la custodia: es lo
que explica por qué la operación avanzó.

Con eso queda cumplido el requisito 3 del spec de `asset-handover`, que estaba sin
cumplir: cuando la cuenta congelada al declarar no coincide con la que la plataforma
verificó después, la diferencia se nombra en pantalla. No bloquea nada —el acceso se
pudo haber vuelto a registrar por razones legítimas— pero son dos copias tomadas en
momentos distintos y compararlas es el único control que existe sobre ese tramo.

La comparación es realizable porque `ConfirmCustodyUseCase` ya congela su propia copia
desde la fase 13. La pregunta abierta del diseño de `simplify-transfer-flow` que decía
que nadie escribía ese campo quedó resuelta al aplicarse, y el documento no se
actualizó.

El legajo probatorio también incluye ahora la declaración. Es la única pieza del
escrow que aporta el vendedor y no la plataforma, así que es la que responde el
reclamo típico de "dijo que me lo había cedido y nunca pasó".

---

## Los cinco defectos del recorrido

Cinco defectos, y **ninguno era detectable leyendo el código**.

**El aprovisionamiento no podía terminar.** Rescatando dos commits varados en
`deploy-vps-oracle/05` —los arreglos aprendidos corriendo contra la VM real, que nunca
habían llegado a la rama de despliegue— apareció un comentario de dos líneas que había
perdido el numeral en la segunda:

```bash
	# `data` es el PGDATA real. Tiene que ser un subdirectorio: Postgres no
	inicializa sobre la raiz del volumen, que trae lost+found de fabrica.
```

Con `set -euo pipefail`, esa línea se ejecuta como comando y aborta `bootstrap-vm.sh`
entero, dentro del bloque que monta el volumen de datos. Ni `bash -n` ni
`shellcheck -S warning` lo detectan: es sintácticamente un comando válido.

**La cuenta de custodia se mostraba como UUID.** El panel nuevo decía
`1b944cfd-9bd2-47ad-977d-8c9f939aaca4` donde tenía que decir el correo que el vendedor
invitó. Las constancias siguen guardando el identificador interno, que es lo correcto
para que la evidencia apunte a la misma fila aunque el correo cambie; lo que se agregó
es la resolución a nombre legible, por separado para la cuenta declarada y la
verificada. Tres estados y no dos: el nombre, `cuenta dada de baja` cuando hay
identificador pero la cuenta salió del padrón, y `sin registrar` cuando nunca hubo
ninguna.

**La constancia de custodia no nombraba su propia cuenta.** Solo se veía la declarada,
así que no había nada que comparar — que es exactamente para lo que se congelan dos
veces.

**El copy se repetía.** La pantalla decía "queda un último paso tuyo: cedernos el
control" y el formulario lo repetía casi textual. La primera corrección fue parcial:
dejó la frase para el caso sin pasos, que es donde más se nota porque no queda nada
más para leer.

---

## El recorrido, punto por punto

| Punto | Resultado |
|---|---|
| El vendedor de un canal ve su paso concreto | Correcto: promover la cuenta de custodia a propietaria principal desde la Cuenta de Marca |
| El vendedor de un sitio web declara con la lista vacía | Funciona, y deja a la vista que no recibe ninguna instrucción |
| El admin lee las dos cuentas congeladas | Correcto después de agregar la cuenta a la constancia de custodia |
| Los avisos se parten por parte | Vendedor `cesion_pendiente`, comprador `contrato_firmado`, oferta perdedora `oferta_cancelada` |
| El tablero separa las dos esperas | Correcto, cada bloque con su motivo escrito |

Se comprobaron además la cascada multi-oferta —aceptar una cancela las competidoras
sobre el mismo activo—, la creación automática del tripartito al aceptar, la transición
automática a `contract_signed` al completarse las firmas, el reparto 5/5 sobre un precio
real, y que un admin que escribe `/vender` en la barra de direcciones vuelva al panel.

---

## Tests

| Suite | Tests | Requiere base |
|---|---|---|
| `@marketplace/domain` | 635 | no |
| `@marketplace/db` | 45 | sí |
| `@marketplace/api` | 137 | sí |
| `web` | 21 | no |

`tsc --noEmit` limpio en los seis paquetes.

Los agregados: `Email` tenía cobertura solo indirecta y ahora tiene suite propia, con
cuatro permisividades del patrón documentadas — una apareció escribiéndola, porque
`ana@gmail.com.` se acepta y se esperaba que no. La normalización del identificador
receptor por estrategia, la resolución de nombres de cuenta, el legajo con la
declaración, y la regresión del copy repetido.

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|---|---|---|
| `web-escrow-transfer-steps` | Alta | `WebStrategy` no enumera pasos posteriores a la firma, así que al vendedor de un sitio se le pide ceder el control sin decirle cómo. Exige investigar el traspaso real de un dominio (código EPP, bloqueo ICANN de 60 días) antes de poder escribir una instrucción. |
| Pasos posteriores al pago sin interfaz | Media | `YouTubeStrategy` los enumera y `Listing.handoverSteps()` los filtra por construcción. Nadie los ve. |
| Suite de `db` dependiente del estado | Media | Tres de sus cuatro archivos no limpian `custody_accounts` y el cuarto sí. Falló una vez con `Unique constraint failed on (identifier)` y no se pudo reproducir con base vacía, con seed ni repitiendo la secuencia. |
| Revelado en blanco | Baja | Tras cada navegación la página queda varios segundos vacía por la animación de revelado. |

---

## Sobre la numeración

El commit `3f64add`, del 10 de septiembre, se llama `chore(verify): fase 14` y nunca
tuvo documento. No era una fase: es el commit de verificación que cierra la 13, dentro
de su misma ventana de trabajo. Se corrige en `docs/gant.json`, donde figuraba como una
fase sin doc, y el número 14 queda para este trabajo.

---

## Siguiente paso

Archivar los tres cambios SDD, que siguen abiertos y sin `openspec/changes/archive/`.
Después, las integraciones externas —identidad, firma y pasarela de pagos—, que son lo
que queda entre el producto y una demostración completa.
