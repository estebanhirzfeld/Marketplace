import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Money } from '../value-objects/Money';
import { createAssetStrategy } from '../strategies/AssetStrategyFactory';
import {
    AssetTypeDescriptor,
    IAssetStrategy,
    TransferContext,
    TransferPhase,
    TransferStep,
} from '../strategies/IAssetStrategy';

/**
 * Un paso de la cesión que le toca al vendedor.
 *
 * `phase` (heredada del paso) dice cuándo se le muestra; `afterPlatformStarts`
 * es el mismo dato como booleano, para las pantallas que ya separaban «ahora»
 * de «con el contrato firmado». Es `true` solo en la fase de operación.
 */
export type HandoverStep = TransferStep & { phase: TransferPhase; afterPlatformStarts: boolean };

/**
 * Dónde está el acceso de la plataforma al activo, visto desde el vendedor.
 *
 * - `pending`: no hizo nada todavía.
 * - `verifying`: declaró que invitó a la plataforma y falta que un admin lo confirme.
 * - `waiting`: confirmado, pero la plataforma del activo todavía impone espera.
 * - `immediate`: confirmado y sin espera: se puede transferir ya.
 */
export type PlatformAccessStatus = 'pending' | 'verifying' | 'waiting' | 'immediate';
import { ForbiddenError, InvalidStateError, ValidationError } from '../errors/DomainError';

export type ListingStatus =
    | 'draft'
    | 'under_review'
    | 'published'
    | 'in_operation'
    | 'sold'
    | 'rejected';

/**
 * Constancia de que la plataforma tiene acceso al activo.
 *
 * La atestigua un admin y no una API a propósito: `channels.list` no expone
 * ningún campo que indique si un canal es Cuenta de Marca ni que liste sus
 * propietarios, y quien es invitado a administrar un canal tampoco puede usar
 * las APIs de YouTube. El estado no es verificable por software.
 */
/**
 * Con qué rol figura la plataforma sobre el activo.
 *
 * No es lo mismo tener acceso que tener control, y esa diferencia es la
 * propuesta de valor entera. Google admite que la antigüedad como
 * administrador cuente para el plazo de siete días, y un administrador no
 * puede eliminar el canal ni quitar propietarios: el vendedor puede sumarnos
 * con permisos mínimos, seguir siendo el dueño, y el reloj corre igual
 * mientras recibe ofertas. El control se cede una sola vez, al final.
 */
export type PlatformHeldRole = 'manager' | 'owner';

export interface PlatformAccessRecord {
    verifiedBy: UniqueEntityID;
    verifiedAt: Date;
    /**
     * Desde cuándo la plataforma figura con acceso. Es el único dato del que
     * depende el plazo: los días transcurridos se calculan, no se guardan.
     */
    accessSince: Date;
    /**
     * A qué cuenta de custodia se le cedió el activo. Es parte de lo que se
     * atestiguó: la constancia dice a quién invitó el vendedor, que es
     * exactamente lo que el vendedor necesita saber para invitar.
     *
     * Opcional en el tipo —no en el registro nuevo— solo porque las
     * constancias anteriores a este cambio no lo tienen: se rehidratan con
     * este campo ausente y se muestran como "cuenta sin asignar". Todo
     * `registerPlatformAccess` de acá en adelante lo exige.
     */
    custodyAccountId?: UniqueEntityID;
    /**
     * Con qué rol quedamos. Opcional en el tipo por el mismo motivo que
     * `custodyAccountId`: las constancias anteriores a este cambio no lo
     * tienen y se muestran como "rol sin registrar". Rellenarlas con un valor
     * plausible sería afirmar algo que nadie atestiguó.
     */
    heldRole?: PlatformHeldRole;
    notes?: string;
}

export type PlatformAccessInput = Omit<
    PlatformAccessRecord,
    'verifiedAt' | 'custodyAccountId' | 'heldRole'
> & {
    /** Obligatorio en todo registro nuevo: sin cuenta, el vendedor no sabe a quién invitar. */
    custodyAccountId: UniqueEntityID;
    /** Obligatorio en todo registro nuevo: sin rol, la constancia no dice qué poder tenemos. */
    heldRole: PlatformHeldRole;
};

/** De dónde salió la comprobación. Cada fuente expone cosas distintas. */
export type VerificationSource = 'youtube' | 'adsense' | 'dns';

/**
 * Constancia de que el vendedor controla el activo.
 *
 * A diferencia de las otras dos constancias, esta no la atestigua un admin:
 * sale de la propia fuente, que devuelve qué activos controla quien otorgó el
 * permiso. Por eso guarda el identificador canónico que devolvió la fuente y
 * no el que el vendedor había escrito.
 */
export interface OwnershipVerification {
    verifiedAt: Date;
    verifiedBy: UniqueEntityID;
    assetId: string;
    source: VerificationSource;
    /**
     * Ingreso mensual comprobado contra la fuente, en centavos. Ausente cuando
     * la fuente no lo expone —que es siempre el caso de YouTube—, y presente
     * cuando sí, como en AdSense para un sitio web.
     */
    monthlyRevenueCents?: number;
}

export type OwnershipVerificationInput = Omit<OwnershipVerification, 'verifiedAt'>;

export interface ListingProps {
    sellerId: UniqueEntityID;
    assetStrategy: IAssetStrategy;
    status: ListingStatus;
    askingPrice: Money;
    publishedAt?: Date;
    rejectionReason?: string;
    platformAccess?: PlatformAccessRecord;
    /** Cuándo el vendedor declaró que ya invitó a la plataforma. Es una declaración, no una constancia. */
    platformAccessRequestedAt?: Date;
    ownershipVerification?: OwnershipVerification;
}

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export class Listing extends Entity<ListingProps> {
    private constructor(props: ListingProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Crea un listing NUEVO — arranca en draft */
    public static create(
        props: Omit<ListingProps, 'status' | 'publishedAt'>
    ): Listing {
        return new Listing({
            ...props,
            status: 'draft',
        });
    }

    /** Rehidrata un listing existente desde la DB */
    public static reconstitute(props: ListingProps, id: UniqueEntityID, createdAt: Date): Listing {
        return new Listing(props, id, createdAt);
    }

    public get sellerId(): UniqueEntityID {
        return this.props.sellerId;
    }

    public get status(): ListingStatus {
        return this.props.status;
    }

    public get estimatedPrice(): Money {
        return this.props.assetStrategy.calculateEstimatedPrice();
    }

    public get askingPrice(): Money {
        return this.props.askingPrice;
    }

    /**
     * Qué datos del activo se muestran, y cuáles quedan ocultos.
     *
     * Todo activo está blindado, sin excepción: expone solo lo que su strategy
     * declara público. Antes era una opción de quien publicaba, y eso
     * significaba que un descuido bastaba para dejar la identidad del activo
     * a la vista de cualquiera. Ahora la entidad no tiene forma de
     * representar un listing no blindado.
     *
     * La decisión vive acá y no en un use case porque es una regla del
     * negocio: dentro de GetListingDetailsUseCase, la ruta del listado la
     * salteaba sin que nada lo advirtiera.
     *
     * `revealConfidential` lo decide quien llama: el dueño siempre puede, un
     * comprador solo con el NDA firmado.
     */
    public assetDataFor(revealConfidential: boolean): {
        assetType: string;
        assetData: Record<string, unknown>;
        hiddenFields: string[];
    } {
        const { assetType, assetData } = this.props.assetStrategy.toJSON();

        if (revealConfidential) {
            return { assetType, assetData, hiddenFields: [] };
        }

        const publicos = this.props.assetStrategy.getPublicFields();
        const filtrado: Record<string, unknown> = {};
        for (const campo of publicos) {
            if (campo in assetData) filtrado[campo] = assetData[campo];
        }

        return {
            assetType,
            assetData: filtrado,
            hiddenFields: this.props.assetStrategy.getConfidentialFields(),
        };
    }

    // ── Acceso de la plataforma al activo ──────────────────

    public get platformAccess(): PlatformAccessRecord | undefined {
        return this.props.platformAccess;
    }

    /**
     * Un admin deja constancia de que la plataforma obtuvo acceso al activo.
     *
     * Cederlo es opcional y se puede hacer apenas se publica: el plazo de
     * espera corre igual mientras el listing está en el mercado, así que
     * adelantarlo convierte tiempo muerto en tiempo que iba a transcurrir de
     * todos modos.
     */
    public registerPlatformAccess(data: PlatformAccessInput): void {
        if (!data.verifiedBy) {
            throw new ValidationError('Falta registrar quién verificó el acceso.');
        }
        if (!data.custodyAccountId) {
            throw new ValidationError(
                'Falta indicar a qué cuenta de custodia se cedió el activo: sin ella el vendedor no sabe a quién invitar.',
            );
        }
        if (!data.heldRole) {
            throw new ValidationError(
                'Falta indicar con qué rol quedó la plataforma sobre el activo.',
            );
        }
        if (data.accessSince.getTime() > Date.now()) {
            throw new ValidationError(
                'La fecha de acceso no puede ser futura: adelantarla adelantaría el plazo de espera.',
            );
        }

        this.props.platformAccess = { ...data, verifiedAt: new Date() };
    }

    /**
     * Borra la constancia cuando la plataforma perdió el acceso.
     *
     * Durante la espera el vendedor sigue siendo propietario principal y puede
     * expulsar a la plataforma sin que ninguna API nos avise. Cuando un admin
     * lo detecta tiene que poder corregirlo: una constancia que miente es peor
     * que ninguna. Volver a registrar el acceso reinicia el conteo, porque los
     * días de la invitación anterior se perdieron con ella.
     */
    public revokePlatformAccess(): void {
        this.props.platformAccess = undefined;
        // La solicitud vieja también cae: quedaría «verificando» algo que el
        // vendedor tiene que volver a hacer, porque la plataforma ya no está.
        this.props.platformAccessRequestedAt = undefined;
    }

    public get platformAccessRequestedAt(): Date | undefined {
        return this.props.platformAccessRequestedAt;
    }

    /**
     * El vendedor declara que ya invitó a la plataforma.
     *
     * No mueve ningún plazo: el que cuenta es el de la constancia que registra
     * un admin. Sirve para que la cola de revisión sepa qué activos mirar y
     * para que el vendedor vea «verificando» en vez de nada.
     *
     * Conserva la PRIMERA fecha: repetir el pedido no lo manda al fondo de la
     * cola. Con la constancia ya registrada no hace nada, a propósito y sin
     * error: el estado ya está más adelante y un doble clic o una carrera con el
     * admin no justifica un mensaje de falla. Solo en borrador o publicado;
     * en cualquier otro estado el activo no está a la espera de sumar a la
     * plataforma.
     */
    public requestPlatformAccess(at: Date): void {
        if (this.props.status !== 'draft' && this.props.status !== 'published') {
            throw new InvalidStateError(
                'Solo se puede pedir la verificación del acceso de un activo en borrador o publicado.',
            );
        }
        if (this.props.platformAccess || this.props.platformAccessRequestedAt) return;

        this.props.platformAccessRequestedAt = at;
    }

    /**
     * El admin no encontró la invitación del vendedor: la solicitud cae y el
     * activo vuelve a «pending», para que el vendedor invite de nuevo y
     * vuelva a avisar. Solo tiene sentido mientras se espera la verificación.
     */
    public rejectPlatformAccessRequest(): void {
        if (this.props.platformAccess || !this.props.platformAccessRequestedAt) {
            throw new InvalidStateError('Este activo no está esperando la verificación del acceso.');
        }
        this.props.platformAccessRequestedAt = undefined;
    }

    public platformAccessStatus(ahora: Date = new Date()): PlatformAccessStatus {
        if (this.props.platformAccess) {
            return this.isReadyToTransfer(ahora) ? 'immediate' : 'waiting';
        }
        return this.props.platformAccessRequestedAt ? 'verifying' : 'pending';
    }

    /**
     * Lo que el vendedor tiene que hacer para cedernos el activo.
     *
     * Es el tramo inicial de la lista de traspaso: todo lo que le toca a él
     * antes de que intervenga nadie más. Se corta ahí y no se filtra por rol
     * porque más adelante vuelve a haber pasos suyos —migrar el hosting, ceder
     * las cuentas afiliadas— que son parte de la venta y no de la cesión:
     * pedírselos ahora sería adelantarle trabajo que todavía no corresponde.
     *
     * La lista existía en cada estrategia desde el principio y no se mostraba
     * en ninguna pantalla, así que el vendedor no tenía cómo saber qué hacer.
     */
    /** Lo que su tipo de activo sabe de sí mismo. */
    public describeAssetType(): AssetTypeDescriptor {
        return this.props.assetStrategy.describe();
    }

    /**
     * Comprueba la cuenta donde el comprador quiere recibir este activo y la
     * devuelve normalizada.
     *
     * Lo resuelve la estrategia, que es la única que sabe si el dato es una
     * cuenta de Google o un usuario de registrador. La `Operation` no puede
     * hacerlo por su cuenta: conoce el `listingId`, no el tipo de activo.
     */
    public normalizeRecipientIdentifier(identifier: string): string {
        return this.props.assetStrategy.normalizeRecipientIdentifier(identifier);
    }

    public handoverSteps(
        context?: TransferContext,
        phase: TransferPhase = 'listing',
    ): HandoverStep[] {
        /*
         * La fase la declara cada paso en su estrategia, y acá solo se filtra.
         * Antes se deducía de la posición —el tramo anterior al comprador, y
         * «después del primer paso nuestro» para lo que llegaba con el
         * contrato—, y esa inferencia dejó de alcanzar cuando hubo pasos del
         * vendedor que no son de la cesión (migrar el hosting) y otros que se
         * esconden a propósito hasta la operación.
         *
         * Por defecto es la fase de publicación: es lo único que se le muestra
         * al vendedor mientras no haya una venta en curso.
         */
        return this.props.assetStrategy
            .getTransferSteps(context)
            .filter((p): p is TransferStep & { phase: TransferPhase } => p.phase === phase)
            .map((paso) => ({ ...paso, afterPlatformStarts: paso.phase === 'operation' }));
    }

    /**
     * Desde cuándo se puede transferir el activo. `undefined` mientras no haya
     * constancia: sin acceso no hay fecha que prometerle a nadie.
     */
    public transferableFrom(): Date | undefined {
        const constancia = this.props.platformAccess;
        if (!constancia) return undefined;

        const espera = this.props.assetStrategy.transferWaitingDays();
        return new Date(constancia.accessSince.getTime() + espera * MILISEGUNDOS_POR_DIA);
    }

    public isReadyToTransfer(ahora: Date = new Date()): boolean {
        const desde = this.transferableFrom();
        return desde !== undefined && ahora.getTime() >= desde.getTime();
    }

    /**
     * El candado del tripartito. Firmarlo compromete a las dos partes —después
     * de eso la cancelación es ilegal—, así que nadie debería quedar atado a
     * una operación que la plataforma todavía no puede cerrar de forma segura.
     */
    public assertCanBeTransferred(ahora: Date = new Date()): void {
        if (!this.props.platformAccess) {
            throw new InvalidStateError(
                'La plataforma todavía no tiene acceso al activo: no puede garantizar la custodia.',
            );
        }
        if (!this.isReadyToTransfer(ahora)) {
            const desde = this.transferableFrom()!;
            throw new InvalidStateError(
                `El activo todavía está en el período de espera de su plataforma. ` +
                `Va a poder transferirse a partir del ${desde.toLocaleDateString('es-AR')}.`,
            );
        }
    }

    // ── Titularidad comprobada contra la fuente ────────────

    public get ownershipVerification(): OwnershipVerification | undefined {
        return this.props.ownershipVerification;
    }

    public isOwnershipVerified(): boolean {
        return this.props.ownershipVerification !== undefined;
    }

    /**
     * Deja constancia de que el vendedor demostró controlar el activo.
     *
     * Reemplaza cualquier constancia anterior: dice que una persona controlaba
     * un activo determinado en una fecha, así que si el listing pasa a publicar
     * otro activo lo comprobado deja de corresponderse con lo publicado.
     */
    public registerOwnershipVerification(datos: OwnershipVerificationInput): void {
        if (!datos.verifiedBy) {
            throw new ValidationError('Falta registrar quién demostró controlar el activo.');
        }
        if (!datos.assetId || datos.assetId.trim() === '') {
            throw new ValidationError('Falta el identificador del activo que devolvió la fuente.');
        }

        this.props.ownershipVerification = {
            ...datos,
            assetId: datos.assetId.trim(),
            verifiedAt: new Date(),
        };
    }

    // ── Pertenencia ────────────────────────────────────────

    /** ¿Este actor es el vendedor de este listing? */
    public isOwnedBy(actorId: string): boolean {
        return this.props.sellerId.toString() === actorId;
    }

    public assertOwnedBy(actorId: string): void {
        if (!this.isOwnedBy(actorId)) {
            throw new ForbiddenError('No sos el vendedor de este activo.');
        }
    }

    public submitForReview(): void {
        if (this.props.status !== 'draft' && this.props.status !== 'rejected') {
            throw new InvalidStateError("Solo un activo en borrador o rechazado puede enviarse a revisión.");
        }
        this.props.status = 'under_review';
    }

    /**
     * Publica sin pasar por la revisión de un admin.
     *
     * Solo cuando la fuente ya demostró que el vendedor controla el activo: la
     * revisión existe para dudar de lo que dijo una persona, y acá no hay nada
     * que dudar. Sin esa constancia el único camino sigue siendo `submitForReview`.
     */
    public publish(): void {
        // Un rechazado NO: el admin ya dijo que no, y publicar directo sería
        // saltarse esa decisión. Tiene que volver a revisión.
        if (this.props.status !== 'draft') {
            throw new InvalidStateError(
                'Solo un activo en borrador puede publicarse sin revisión: uno rechazado tiene que volver a enviarse a revisión.',
            );
        }
        if (!this.isOwnershipVerified()) {
            throw new InvalidStateError(
                'Para publicar sin revisión hay que comprobar la titularidad del activo: sin eso, enviá el activo a revisión.',
            );
        }
        this.props.status = 'published';
        this.props.publishedAt = new Date();
        this.props.rejectionReason = undefined;
    }

    /**
     * Edita lo que el vendedor tipeó: rubro, contenido sin rostro y precio.
     *
     * Las métricas (suscriptores, ingreso, país) no se pueden tocar a
     * propósito: cuando las leyó YouTube son una constancia, y cuando las
     * declaró el vendedor cambiarlas después de crear el borrador permitiría
     * reescribir el activo entero. Solo en borrador o rechazado, porque lo
     * publicado es lo que un comprador ya vio.
     */
    public editDraft(changes: {
        niche?: string;
        hasNoFaceContent?: boolean;
        askingPrice?: Money;
    }): void {
        if (this.props.status !== 'draft' && this.props.status !== 'rejected') {
            throw new InvalidStateError('Solo un activo en borrador o rechazado puede editarse.');
        }
        const { niche, hasNoFaceContent, askingPrice } = changes;
        if (niche === undefined && hasNoFaceContent === undefined && askingPrice === undefined) {
            throw new ValidationError('No hay ningún cambio para guardar.');
        }
        if (askingPrice) this.assertValidAskingPrice(askingPrice);

        let strategy = this.props.assetStrategy;
        if (niche !== undefined || hasNoFaceContent !== undefined) {
            const { assetType, assetData } = strategy.toJSON();
            if (hasNoFaceContent !== undefined && !('hasNoFaceContent' in assetData)) {
                throw new ValidationError('Este tipo de activo no tiene contenido sin rostro.');
            }
            // Se reconstruye por la fábrica: es quien valida el rubro y la
            // misma ruta por la que entra todo activo, así que no hay un
            // segundo camino con otro rigor.
            strategy = createAssetStrategy(assetType, {
                ...assetData,
                ...(niche !== undefined ? { niche } : {}),
                ...(hasNoFaceContent !== undefined ? { hasNoFaceContent } : {}),
            });
        }

        this.props.assetStrategy = strategy;
        if (askingPrice) this.props.askingPrice = askingPrice;
    }

    /**
     * Cambia el precio pedido.
     *
     * Se permite también publicado: es lo único que el vendedor ajusta con el
     * activo en el mercado. En revisión no, porque el admin está evaluando lo
     * que se le mandó; en operación y vendido el precio ya lo fija la
     * negociación, no el pedido.
     */
    public changePrice(price: Money): void {
        const permitidos: ListingStatus[] = ['draft', 'rejected', 'published'];
        if (!permitidos.includes(this.props.status)) {
            throw new InvalidStateError('El precio solo puede cambiarse en un activo en borrador, rechazado o publicado.');
        }
        this.assertValidAskingPrice(price);
        this.props.askingPrice = price;
    }

    private assertValidAskingPrice(price: Money): void {
        if (price.getCents() <= 0) {
            throw new ValidationError('El precio pedido tiene que ser mayor a cero.');
        }
    }

    /** Solo un borrador o un rechazado puede eliminarse: nadie lo vio ni negoció sobre él. */
    public assertCanBeDiscarded(): void {
        if (this.props.status !== 'draft' && this.props.status !== 'rejected') {
            throw new InvalidStateError('Solo un activo en borrador o rechazado puede eliminarse.');
        }
    }

    public approve(): void {
        if (this.props.status !== 'under_review') {
            throw new InvalidStateError("El activo debe estar en revisión para ser aprobado.");
        }
        this.props.status = 'published';
        this.props.publishedAt = new Date();
    }

    public reject(reason: string): void {
        if (this.props.status !== 'under_review') {
            throw new InvalidStateError("El activo debe estar en revisión para ser rechazado.");
        }
        if (!reason || reason.trim() === '') {
            throw new ValidationError("Debe proveer un motivo de rechazo.");
        }
        this.props.status = 'rejected';
        this.props.rejectionReason = reason;
    }

    public markInOperation(): void {
        if (this.props.status !== 'published') {
            throw new InvalidStateError("El activo debe estar publicado para entrar en operación.");
        }
        this.props.status = 'in_operation';
    }

    public markSold(): void {
        if (this.props.status !== 'in_operation') {
            throw new InvalidStateError("El activo debe estar en operación para marcarse como vendido.");
        }
        this.props.status = 'sold';
    }

    /**
     * Devuelve al mercado un activo cuya operación se cayó.
     *
     * Aceptar una oferta saca el activo del mercado, pero la cancelación sigue
     * siendo legal hasta que se firma el contrato. Sin este camino de vuelta el
     * activo quedaba en `in_operation` para siempre: no aceptaba ofertas nuevas
     * y su dueño no tenía forma de reactivarlo.
     */
    public returnToMarket(): void {
        if (this.props.status !== 'in_operation') {
            throw new InvalidStateError("Solo un activo en operación puede volver al mercado.");
        }
        this.props.status = 'published';
    }
}
