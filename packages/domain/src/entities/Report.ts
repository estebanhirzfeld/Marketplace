import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { NegotiatingParty } from './Operation';
import { ForbiddenError, InvalidStateError, ValidationError } from '../errors/DomainError';

export type ReportReason =
    | 'metricas_falsas'
    | 'ingreso_falso'
    | 'activo_no_entregado'
    | 'activo_recuperado'
    | 'pago_no_recibido'
    | 'otro';

/**
 * Ninguno de los tres estados dice quién tiene razón.
 *
 * La plataforma no arbitra el fondo del reclamo: recibe la denuncia, la fecha,
 * avisa a la contraparte y reúne lo que registró. Un estado como "resuelto a
 * favor del comprador" implicaría un juicio que la plataforma no está en
 * condiciones de emitir ni quiere asumir.
 */
export type ReportStatus = 'open' | 'closed';

export interface ReportProps {
    operationId: UniqueEntityID;
    reportedBy: UniqueEntityID;
    /** Desde qué lado de la operación se denuncia. Se deriva al crearla. */
    reporterRole: NegotiatingParty;
    reportedUserId: UniqueEntityID;
    reason: ReportReason;
    detail: string;
    status: ReportStatus;
    closedAt?: Date;
    closedReason?: string;
}

const DETALLE_MINIMO = 20;

/**
 * Denuncia de una parte contra la otra sobre una operación.
 *
 * Existe porque después de firmar el contrato la cancelación deja de ser legal:
 * hasta ese momento el remedio ante cualquier sospecha es cancelar, y a partir
 * de ahí la única salida es reclamar. Esa es también la razón por la que no se
 * puede denunciar antes de la firma.
 *
 * Lo que la denuncia produce no es una resolución sino un legajo: la
 * plataforma entrega a las dos partes lo que registró —contratos firmados con
 * su huella, constancias de verificación, historial de negociación— para que
 * quien se considere perjudicado inicie las acciones que correspondan.
 */
export class Report extends Entity<ReportProps> {
    private constructor(props: ReportProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    public static create(props: Omit<ReportProps, 'status'>): Report {
        if (!props.detail || props.detail.trim().length < DETALLE_MINIMO) {
            throw new ValidationError(
                'Contá qué pasó con el detalle suficiente: es lo que va a leer la otra parte y lo que queda asentado.',
            );
        }
        if (props.reportedBy.toString() === props.reportedUserId.toString()) {
            throw new ValidationError('No podés denunciarte a vos mismo.');
        }

        return new Report({ ...props, detail: props.detail.trim(), status: 'open' });
    }

    public static reconstitute(props: ReportProps, id: UniqueEntityID, createdAt: Date): Report {
        return new Report(props, id, createdAt);
    }

    public get operationId(): UniqueEntityID {
        return this.props.operationId;
    }

    public get reportedBy(): UniqueEntityID {
        return this.props.reportedBy;
    }

    public get reportedUserId(): UniqueEntityID {
        return this.props.reportedUserId;
    }

    public get reporterRole(): NegotiatingParty {
        return this.props.reporterRole;
    }

    public get reason(): ReportReason {
        return this.props.reason;
    }

    public get detail(): string {
        return this.props.detail;
    }

    public get status(): ReportStatus {
        return this.props.status;
    }

    public get closedAt(): Date | undefined {
        return this.props.closedAt;
    }

    public get closedReason(): string | undefined {
        return this.props.closedReason;
    }

    /**
     * La cierra quien la abrió, cuando el asunto se resolvió entre las partes o
     * cuando pasó a la vía judicial. Cerrarla no significa que el reclamo fuera
     * infundado: significa que la plataforma ya no tiene nada más que aportar.
     */
    public close(reason: string): void {
        if (this.props.status === 'closed') {
            throw new InvalidStateError('Esta denuncia ya está cerrada.');
        }
        if (!reason || reason.trim() === '') {
            throw new ValidationError('Indicá por qué se cierra la denuncia.');
        }

        this.props.status = 'closed';
        this.props.closedAt = new Date();
        this.props.closedReason = reason.trim();
    }

    /** La ven las dos partes: quien denuncia y quien es denunciado. */
    public involves(actorId: string): boolean {
        return (
            this.props.reportedBy.toString() === actorId ||
            this.props.reportedUserId.toString() === actorId
        );
    }

    public assertInvolves(actorId: string): void {
        if (!this.involves(actorId)) {
            throw new ForbiddenError('Esta denuncia no es tuya.');
        }
    }

    /** Solo quien la abrió puede cerrarla. */
    public assertCanClose(actorId: string): void {
        if (this.props.reportedBy.toString() !== actorId) {
            throw new ForbiddenError('Solo quien abrió la denuncia puede cerrarla.');
        }
    }
}
