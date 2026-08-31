import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';
import type {
    CloseReportRequest,
    EvidenceDossierDto,
    FileReportRequest,
    ReportDto,
} from '@marketplace/api-contract';
import { Report } from '@marketplace/domain/src/entities/Report';

interface IdParams { id: string }

function aReportDto(report: Report, actorId: string): ReportDto {
    const { id, createdAt, props } = report.toSnapshot();

    return {
        id,
        operationId: props.operationId.toString(),
        reason: props.reason,
        detail: props.detail,
        status: props.status,
        miRol: props.reportedBy.toString() === actorId ? 'denunciante' : 'denunciado',
        closedAt: props.closedAt?.toISOString(),
        closedReason: props.closedReason,
        createdAt: createdAt.toISOString(),
    };
}

export function registerReportRoutes(app: FastifyInstance, c: Container): void {
    app.get<{ Reply: ReportDto[] }>(
        '/me/reports',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const actor = actorOf(request);
            const reports = await c.misDenuncias.execute(actor);
            return reply.send(reports.map((r) => aReportDto(r, actor.id)));
        },
    );

    app.post<{ Body: FileReportRequest; Reply: ReportDto }>(
        '/reports',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['operationId', 'reason', 'detail'],
                    properties: {
                        operationId: { type: 'string' },
                        reason: {
                            type: 'string',
                            enum: [
                                'metricas_falsas',
                                'ingreso_falso',
                                'activo_no_entregado',
                                'activo_recuperado',
                                'pago_no_recibido',
                                'otro',
                            ],
                        },
                        detail: { type: 'string', minLength: 20, maxLength: 4000 },
                    },
                },
            },
        },
        async (request, reply) => {
            const actor = actorOf(request);
            const report = await c.denunciar.execute(request.body, actor);
            return reply.code(201).send(aReportDto(report, actor.id));
        },
    );

    /**
     * El legajo. Lo ven las dos partes de la denuncia, no solo quien la abrió:
     * un reclamo sin la posibilidad de que el denunciado vea la misma evidencia
     * no sirve para nada.
     */
    app.get<{ Params: IdParams; Reply: EvidenceDossierDto }>(
        '/reports/:id/legajo',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const d = await c.legajo.execute(request.params.id, actorOf(request));

            return reply.send({
                ...d,
                filedAt: d.filedAt.toISOString(),
                operation: {
                    ...d.operation,
                    createdAt: d.operation.createdAt.toISOString(),
                    completedAt: d.operation.completedAt?.toISOString(),
                },
                negotiations: d.negotiations.map((n) => ({
                    ...n,
                    proposedAt: n.proposedAt.toISOString(),
                })),
                verifications: {
                    ownership: d.verifications.ownership && {
                        ...d.verifications.ownership,
                        verifiedAt: d.verifications.ownership.verifiedAt.toISOString(),
                    },
                    platformAccess: d.verifications.platformAccess && {
                        verifiedAt: d.verifications.platformAccess.verifiedAt.toISOString(),
                        accessSince: d.verifications.platformAccess.accessSince.toISOString(),
                    },
                    custody: d.verifications.custody && {
                        ...d.verifications.custody,
                        verifiedAt: d.verifications.custody.verifiedAt.toISOString(),
                    },
                },
                contracts: d.contracts.map((ct) => ({
                    ...ct,
                    signatures: ct.signatures.map((s) => ({
                        ...s,
                        signedAt: s.signedAt?.toISOString(),
                    })),
                })),
            });
        },
    );

    app.post<{ Params: IdParams; Body: CloseReportRequest }>(
        '/reports/:id/cerrar',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['reason'],
                    properties: { reason: { type: 'string', minLength: 1, maxLength: 2000 } },
                },
            },
        },
        async (request, reply) => {
            await c.cerrarDenuncia.execute(request.params.id, request.body.reason, actorOf(request));
            return reply.code(204).send();
        },
    );
}
