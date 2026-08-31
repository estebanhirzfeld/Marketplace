import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { isValidHash } from '../services/DocumentHash';
import { ForbiddenError, InvalidStateError, ValidationError } from '../errors/DomainError';

export type ContractType = 'buyer_nda' | 'seller_nda' | 'tripartite';
export type PartyRole = 'buyer' | 'seller' | 'platform';

export interface Signature {
    role: PartyRole;
    signed: boolean;
    signedAt?: Date;
    signatureIp?: string;
    /**
     * Hash del documento vigente al momento de firmar. Sin esto, la firma
     * registra que alguien apretó un botón, no qué texto aceptó.
     */
    documentHash?: string;
}

export interface ContractProps {
    type: ContractType;
    listingId: UniqueEntityID;
    operationId?: UniqueEntityID;
    signerId?: UniqueEntityID;
    signatures: Signature[];
    externalSignatureId?: string;
    fileUrl?: string;
    /** Huella del documento que las partes firman. */
    documentHash?: string;
}

export class Contract extends Entity<ContractProps> {
    private constructor(props: ContractProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    // ── Factories ──────────────────────────────────────────

    /** NDA entre el buyer y la plataforma — para ver datos reales del listing */
    public static createBuyerNda(listingId: UniqueEntityID, signerId: UniqueEntityID): Contract {
        return new Contract({
            type: 'buyer_nda',
            listingId,
            signerId,
            signatures: [
                { role: 'buyer', signed: false },
                { role: 'platform', signed: false },
            ],
        });
    }

    /** NDA entre el seller y la plataforma — para publicar el listing */
    public static createSellerNda(listingId: UniqueEntityID, signerId: UniqueEntityID): Contract {
        return new Contract({
            type: 'seller_nda',
            listingId,
            signerId,
            signatures: [
                { role: 'seller', signed: false },
                { role: 'platform', signed: false },
            ],
        });
    }

    /** Contrato tripartito — para cerrar la venta */
    public static createTripartite(listingId: UniqueEntityID, operationId: UniqueEntityID): Contract {
        return new Contract({
            type: 'tripartite',
            listingId,
            operationId,
            signatures: [
                { role: 'buyer', signed: false },
                { role: 'seller', signed: false },
                { role: 'platform', signed: false },
            ],
        });
    }

    /** Rehidrata un contrato existente desde la DB */
    public static reconstitute(props: ContractProps, id: UniqueEntityID, createdAt: Date): Contract {
        return new Contract(props, id, createdAt);
    }

    // ── Comportamiento ─────────────────────────────────────

    /**
     * Adjunta el documento que las partes van a firmar.
     *
     * Se guarda la huella, no el texto: el contenido se regenera de forma
     * determinista a partir de los datos de la operación, y el hash prueba que
     * lo regenerado es idéntico a lo firmado.
     */
    public attachDocument(hash: string): void {
        if (!isValidHash(hash)) {
            throw new ValidationError('La huella del documento no es un SHA-256 válido.');
        }

        // Cambiar el documento después de una firma la invalidaría en silencio:
        // esa persona habría firmado un texto que ya no es el vigente.
        if (this.props.signatures.some((s) => s.signed)) {
            throw new InvalidStateError(
                'No se puede cambiar el documento de un contrato que ya tiene firmas.'
            );
        }

        this.props.documentHash = hash.toLowerCase();
    }

    /** ¿Todas las firmas corresponden al documento vigente? */
    public signaturesMatchDocument(): boolean {
        return this.props.signatures
            .filter((s) => s.signed)
            .every((s) => s.documentHash === this.props.documentHash);
    }

    /** Firma el contrato para un rol específico. Tell, don't ask. */
    public sign(role: PartyRole, ipAddress: string): void {
        // Sin documento no hay nada que firmar. Registrar una firma sobre la
        // nada era exactamente lo que hacía este método antes.
        if (!this.props.documentHash) {
            throw new InvalidStateError(
                'Este contrato todavía no tiene un documento para firmar.'
            );
        }

        const signature = this.props.signatures.find(s => s.role === role);

        if (!signature) {
            throw new ForbiddenError(`El rol "${role}" no es parte de este contrato.`);
        }

        if (signature.signed) {
            throw new InvalidStateError(`El rol "${role}" ya firmó este contrato.`);
        }

        signature.signed = true;
        signature.signedAt = new Date();
        signature.signatureIp = ipAddress;
        signature.documentHash = this.props.documentHash;
    }

    /**
     * Firma de la plataforma. Es automática: no es un punto de control sino un
     * registro de auditoría de cuándo la plataforma se volvió parte. El control
     * humano del escrow vive en ConfirmCustody, que es donde la plataforma
     * efectivamente arriesga algo.
     */
    public signAsPlatform(): void {
        this.sign('platform', 'system');
    }

    /** ¿Firmaron todos? No importa cuántos sean ni quiénes. */
    public isFullySigned(): boolean {
        return this.props.signatures.every(s => s.signed);
    }

    /** ¿Este rol ya firmó? */
    public hasSignedBy(role: PartyRole): boolean {
        return this.props.signatures.some(s => s.role === role && s.signed);
    }

    // ── Getters ────────────────────────────────────────────

    public get type(): ContractType {
        return this.props.type;
    }

    public get listingId(): UniqueEntityID {
        return this.props.listingId;
    }

    public get operationId(): UniqueEntityID | undefined {
        return this.props.operationId;
    }

    public get documentHash(): string | undefined {
        return this.props.documentHash;
    }

    public get signerId(): UniqueEntityID | undefined {
        return this.props.signerId;
    }

    public get signatures(): ReadonlyArray<Readonly<Signature>> {
        return this.props.signatures;
    }
}
