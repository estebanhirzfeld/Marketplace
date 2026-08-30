import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { ForbiddenError, InvalidStateError } from '../errors/DomainError';

export type ContractType = 'buyer_nda' | 'seller_nda' | 'tripartite';
export type PartyRole = 'buyer' | 'seller' | 'platform';

export interface Signature {
    role: PartyRole;
    signed: boolean;
    signedAt?: Date;
    signatureIp?: string;
}

export interface ContractProps {
    type: ContractType;
    listingId: UniqueEntityID;
    operationId?: UniqueEntityID;
    signerId?: UniqueEntityID;
    signatures: Signature[];
    externalSignatureId?: string;
    fileUrl?: string;
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

    /** Firma el contrato para un rol específico. Tell, don't ask. */
    public sign(role: PartyRole, ipAddress: string): void {
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

    public get signerId(): UniqueEntityID | undefined {
        return this.props.signerId;
    }

    public get signatures(): ReadonlyArray<Readonly<Signature>> {
        return this.props.signatures;
    }
}
