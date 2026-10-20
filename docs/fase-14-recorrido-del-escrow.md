# Fase 14 — Recorrido del escrow en la aplicación

> **Estado**: ✅ Completa
> **Fecha**: Septiembre 2026
> **Objetivo**: Que el escrow sea ejecutable de punta a punta por una persona, y cerrar los vacíos que aparezcan al hacerlo.

Las dos fases anteriores daban por completos flujos que nadie había recorrido. La 13
estaba declarada completa y sus dos migraciones no existían en ninguna base de datos.
Había 835 tests en verde y no decían nada sobre si una persona podía usar el producto.

---

## Objetivos cumplidos

- Migraciones de la fase 13 aplicadas (`add_cesion_pendiente_notification`, `add_transfer_initiation`).
- Escrow recorrido de punta a punta en la aplicación corriendo, con los cinco puntos del walkthrough pendiente.
- La cuenta receptora se valida contra el tipo de activo, en dominio y en API.
- La declaración de cesión se ve en pantalla, con su divergencia respecto de la custodia.
- El legajo probatorio incluye la declaración de cesión.
- `Email` pasa a tener suite propia: era uno de los dos value objects sin pruebas.
- Rescatados los arreglos de aprovisionamiento varados en `deploy-vps-oracle/05`.

---

## Decisiones técnicas

### 1. La validación de la cuenta receptora vive en la estrategia

El comprador declara dónde recibir el activo y ese dato no se validaba en ninguna capa:
un `"pepe@"` se guardaba y `complete()` lo copiaba a la constancia de entrega, donde ya
no se corrige.

No alcanzaba con exigir una dirección de correo porque el campo es polimórfico: cuenta de
Google para un canal, usuario del registrador para un dominio. La regla va en
`IAssetStrategy.normalizeRecipientIdentifier`, junto a `getPublicFields()` y
`getTransferSteps()`. YouTube exige formato de correo y baja a minúsculas; web solo exige
que exista y respeta mayúsculas. Las dos imponen el límite de 320 caracteres.

### 2. El cruce de agregados se resuelve en el caso de uso

`Operation` conoce su `listingId`, no el tipo de activo, así que
`DeclareRecipientIdentityUseCase` carga el `Listing` y le pide el identificador ya
normalizado. Mismo patrón que el congelado de la cuenta de custodia en
`InitiateTransferUseCase`. `Listing` delega en su estrategia, así que no hay ningún
`if (assetType === ...)` en ninguna parte.

### 3. No se revalida al cerrar la operación

Las operaciones que declararon un identificador antes de este cambio lo conservan.
Rechazarlas en `complete()` las dejaría sin poder cerrarse, que es peor que el defecto.
Mismo criterio que la fase 13 con las constancias que no existían.

### 4. El nombre de la cuenta de custodia se resuelve por separado

Las constancias guardan el identificador interno de la cuenta, que es lo correcto para
que la evidencia apunte a la misma fila aunque el correo cambie. Para la pantalla,
`GetOperationDetailsUseCase.custodyAccountNames` resuelve el nombre legible **por
separado** para la declarada y la verificada: el sentido de congelarlas en dos momentos
es poder compararlas, así que una resolución con cascada de respaldo devolvería la misma
para ambos lados y la divergencia dejaría de verse.

Tres estados y no dos: el nombre de la cuenta, `cuenta dada de baja` cuando hay
identificador pero la cuenta salió del padrón, y `sin registrar` cuando nunca hubo
ninguna. Decir "sin registrar" por una cuenta que sí se registró sería mentir.

### 5. La numeración de esta fase

El commit `3f64add` del 10 de septiembre se llama `chore(verify): fase 14` y nunca tuvo
documento. No era una fase: es el commit de verificación que cierra la 13, dentro de su
misma ventana. En `docs/gant.json` pasa a ser la subfase 13.1 y el número 14 queda para
este trabajo.

---

## Los cinco defectos del recorrido

Ninguno era detectable leyendo el código.

**El aprovisionamiento no podía terminar.** Un comentario de dos líneas había perdido el
numeral en la segunda:

```bash
	# `data` es el PGDATA real. Tiene que ser un subdirectorio: Postgres no
	inicializa sobre la raiz del volumen, que trae lost+found de fabrica.
```

Con `set -euo pipefail` esa línea se ejecuta como comando y aborta `bootstrap-vm.sh`
entero, dentro del bloque que monta el volumen. Ni `bash -n` ni `shellcheck -S warning`
lo detectan: es sintácticamente un comando válido.

**La cuenta de custodia se mostraba como UUID** en el panel de la declaración, donde
tenía que decir el correo que el vendedor invitó.

**La constancia de custodia no nombraba su propia cuenta.** Solo se veía la declarada, o
sea que no había nada que comparar.

**El copy se repetía.** La pantalla y el formulario decían casi textual lo mismo. La
primera corrección fue parcial y dejó la repetición justo donde más se nota, que es
cuando no hay pasos que mostrar.

**Los arreglos de aprovisionamiento estaban varados.** Los dos commits aprendidos
corriendo contra la VM real nunca habían llegado a la rama que el README manda desplegar.

---

## El recorrido, punto por punto

| Punto | Resultado |
|---|---|
| El vendedor de un canal ve su paso concreto | Correcto: promover la cuenta de custodia a propietaria principal desde la Cuenta de Marca |
| El vendedor de un sitio web declara con la lista vacía | Funciona, y deja a la vista que no recibe ninguna instrucción |
| El admin lee las dos cuentas congeladas | Correcto después de agregar la cuenta a la constancia de custodia |
| Los avisos se parten por parte | Vendedor `cesion_pendiente`, comprador `contrato_firmado`, oferta perdedora `oferta_cancelada` |
| El tablero separa las dos esperas | Correcto, cada bloque con su motivo escrito |

Se comprobaron además la cascada multi-oferta —aceptar una cancela las competidoras sobre
el mismo activo—, la creación automática del tripartito al aceptar, la transición
automática a `contract_signed` al completarse las firmas, el reparto 5/5 sobre un precio
real, y que un admin que escribe `/vender` en la barra de direcciones vuelva al panel.

> ⚠️ Las suites de `db` y de `api` truncan las tablas al correr. Después de `make test`
> hay que volver a sembrar con `make db-seed`, o la base queda vacía.

---

## Tests

| Suite | Tests | Requiere DB |
|---|---|---|
| `@marketplace/domain` | 635 | no |
| `@marketplace/db` | 45 | sí |
| `@marketplace/api` | 137 | sí |
| `web` | 21 | no |

`tsc --noEmit` limpio en los seis paquetes.

Agregados en esta fase: suite propia de `Email` con cuatro permisividades del patrón
documentadas —una apareció escribiéndola, porque `ana@gmail.com.` se acepta y se esperaba
que no—, la normalización del identificador receptor por estrategia, la resolución de
nombres de cuenta, el legajo con la declaración, y la regresión del copy repetido.

---

## Deuda técnica conocida

| Item | Prioridad | Descripción |
|---|---|---|
| `web-escrow-transfer-steps` | Alta | `WebStrategy` no enumera pasos posteriores a la firma, así que al vendedor de un sitio se le pide ceder el control sin decirle cómo. Exige investigar el traspaso real de un dominio (código EPP, bloqueo ICANN de 60 días). |
| Pasos posteriores al pago sin interfaz | Media | `YouTubeStrategy` los enumera y `Listing.handoverSteps()` los filtra por construcción. Nadie los ve. |
| Suite de `db` dependiente del estado | Media | Tres de sus cuatro archivos no limpian `custody_accounts` y el cuarto sí. Falló una vez con `Unique constraint failed on (identifier)` y no se pudo reproducir con base vacía, con seed ni repitiendo la secuencia. |
| Revelado en blanco | Baja | Tras cada navegación la página queda varios segundos vacía por la animación de revelado. |
| Walkthrough de `asset-custody-identity` incompleto | Baja | De sus cinco puntos se recorrieron dos: faltan `/admin/cuentas`, el `PlatformAccessForm` y la vista del comprador. |

---

## Siguiente paso

Archivar los tres cambios SDD, que siguen abiertos y sin `openspec/changes/archive/`.
Después, las integraciones externas —identidad, firma y pasarela de pagos—, que son lo
que queda entre el producto y una demostración completa.
