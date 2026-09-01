import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Money } from '../value-objects/Money';
import { AssetTypeDescriptor, IAssetStrategy, TransferContext, TransferStep } from '../strategies/IAssetStrategy';
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
    notes?: string;
}

export type PlatformAccessInput = Omit<PlatformAccessRecord, 'verifiedAt' | 'custodyAccountId'> & {
    /** Obligatorio en todo registro nuevo: sin cuenta, el vendedor no sabe a quién invitar. */
    custodyAccountId: UniqueEntityID;
};

/** De dónde salió la comprobación. Cada fuente expone cosas distintas. */
export type VerificationSource = 'youtube' | 'adsense';

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

    public handoverSteps(context?: TransferContext): TransferStep[] {
        const pasos = this.props.assetStrategy.getTransferSteps(context);
        const corte = pasos.findIndex((p) => p.requiredActor !== 'seller');
        return corte === -1 ? pasos : pasos.slice(0, corte);
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

    // State transitions would trigger through XState machine normally,
    // but domain logic guarantees rules before allowing transition.
    public submitForReview(): void {
        if (this.props.status !== 'draft' && this.props.status !== 'rejected') {
            throw new InvalidStateError("Solo un activo en borrador o rechazado puede enviarse a revisión.");
        }
        this.props.status = 'under_review';
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
