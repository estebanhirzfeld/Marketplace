import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../errors/DomainError';
import { AssetType } from '@marketplace/shared-types';

/**
 * La identidad real que sostiene un activo en custodia de la plataforma.
 *
 * El escrow no lo puede ejecutar una persona sin esto: el paso "el vendedor
 * invita a la plataforma como propietaria del canal" no dice a quién, y
 * `admin@traspaso.com` es un usuario para entrar al sitio, no una cuenta de
 * Google que pueda ser propietaria de una Cuenta de Marca. Esta entidad es esa
 * cuenta: la que el vendedor invita, la que figura como propietaria mientras
 * dura la custodia, y la que la constancia de acceso nombra.
 *
 * Es un agregado propio y no un valor dentro de la constancia de acceso porque
 * una misma cuenta sostiene varios activos a la vez, hay que poder consultar
 * cuáles, y tiene un ciclo de vida —alta, baja— independiente de cualquier
 * listing.
 */
export interface CustodyAccountProps {
    /** Cómo la nombra la operación por dentro: "Custodia YouTube 01". */
    label: string;
    /**
     * La dirección que el vendedor invita, o el usuario del registrador.
     *
     * Es lo único que se guarda de la cuenta: nunca su contraseña, su segundo
     * factor ni su correo de recuperación. Un identificador filtrado no
     * entrega el acceso; una credencial guardada sí.
     */
    identifier: string;
    /**
     * Contra qué tipo de activo puede recibir custodia. Se tipa por
     * `AssetType` y no por el `ownershipSource` del descriptor: para un sitio
     * web la titularidad se comprueba contra AdSense pero la custodia vive en
     * una cuenta de registrador. Son dos ejes distintos.
     */
    assetType: AssetType;
    isActive: boolean;
    notes?: string;
}

const TIPOS_VALIDOS: readonly AssetType[] = Object.values(AssetType);

function exigirTexto(valor: string, queFalta: string): string {
    const recortado = (valor ?? '').trim();
    if (recortado === '') {
        throw new ValidationError(queFalta);
    }
    return recortado;
}

function exigirAssetType(assetType: AssetType): void {
    if (!TIPOS_VALIDOS.includes(assetType)) {
        throw new ValidationError('El tipo de activo de la cuenta de custodia no es uno de los que la plataforma intermedia.');
    }
}

export class CustodyAccount extends Entity<CustodyAccountProps> {
    private constructor(props: CustodyAccountProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /**
     * Crea una cuenta NUEVA. Nace activa: no tiene sentido dar de alta una
     * cuenta que no se puede usar, y la baja es un acto explícito posterior.
     */
    public static create(props: Omit<CustodyAccountProps, 'isActive'>): CustodyAccount {
        exigirAssetType(props.assetType);

        return new CustodyAccount({
            label: exigirTexto(props.label, 'La cuenta de custodia necesita una etiqueta para reconocerla.'),
            identifier: exigirTexto(props.identifier, 'La cuenta de custodia necesita el identificador que el vendedor va a invitar.'),
            assetType: props.assetType,
            isActive: true,
            notes: props.notes?.trim() || undefined,
        });
    }

    /** Rehidrata una cuenta existente desde la base. Sin defaults. */
    public static reconstitute(
        props: CustodyAccountProps,
        id: UniqueEntityID,
        createdAt: Date,
    ): CustodyAccount {
        return new CustodyAccount(props, id, createdAt);
    }

    public get label(): string {
        return this.props.label;
    }

    public get identifier(): string {
        return this.props.identifier;
    }

    public get assetType(): AssetType {
        return this.props.assetType;
    }

    public get isActive(): boolean {
        return this.props.isActive;
    }

    public get notes(): string | undefined {
        return this.props.notes;
    }

    public rename(label: string): void {
        this.props.label = exigirTexto(label, 'La etiqueta de la cuenta no puede quedar vacía.');
    }

    public changeIdentifier(identifier: string): void {
        this.props.identifier = exigirTexto(
            identifier,
            'El identificador de la cuenta no puede quedar vacío.',
        );
    }

    public updateNotes(notes?: string): void {
        this.props.notes = notes?.trim() || undefined;
    }

    /**
     * Cambia contra qué tipo de activo recibe custodia.
     *
     * Recibe el número de activos sostenidos en vez de consultarlo: contar
     * exige cruzar a `Listing` y una entidad no cruza agregados. Con al menos
     * uno sostenido el cambio es ilegal: la constancia de acceso de ese activo
     * dice que se cedió a esta cuenta para su tipo, y cambiarlo la haría
     * mentir.
     */
    public changeAssetType(assetType: AssetType, heldAssetCount: number): void {
        exigirAssetType(assetType);
        if (heldAssetCount > 0) {
            throw new InvalidStateError(
                'La cuenta sostiene activos en custodia: no se le puede cambiar el tipo hasta que deje de sostenerlos.',
            );
        }
        this.props.assetType = assetType;
    }

    public activate(): void {
        this.props.isActive = true;
    }

    /**
     * Da de baja la cuenta. No la borra: las constancias que la nombran tienen
     * que seguir resolviéndose. Con activos sostenidos la baja es ilegal —
     * quedarían sin quién los sostenga.
     */
    public deactivate(heldAssetCount: number): void {
        if (heldAssetCount > 0) {
            throw new InvalidStateError(
                'La cuenta sostiene activos en custodia: no se puede desactivar hasta que deje de sostenerlos.',
            );
        }
        this.props.isActive = false;
    }

    public canHold(assetType: AssetType): boolean {
        return this.props.assetType === assetType;
    }

    public assertCanHold(assetType: AssetType): void {
        if (!this.canHold(assetType)) {
            throw new InvalidStateError(
                'La cuenta de custodia elegida no es para este tipo de activo.',
            );
        }
    }

    public assertIsActive(): void {
        if (!this.props.isActive) {
            throw new InvalidStateError(
                'La cuenta de custodia elegida está desactivada: no puede recibir activos nuevos.',
            );
        }
    }
}
