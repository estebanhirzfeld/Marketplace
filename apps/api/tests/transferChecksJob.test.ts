import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContainer } from '../src/container';
import { runReceiptReviewsJob, runTransferChecksJob } from '../src/jobs/transferChecksJob';
import { RunTransferStepChecksUseCase } from '@marketplace/domain/src/use-cases/operation/RunTransferStepChecksUseCase';
import type { TransferStepChecksSummary } from '@marketplace/domain/src/use-cases/operation/RunTransferStepChecksUseCase';

/** El job periódico del traspaso de sitios: cableado y código de salida. No toca la base ni la red. */

afterEach(() => {
    vi.unstubAllEnvs();
});

function aLog() {
    const info: string[] = [];
    const error: string[] = [];
    return { info, error, log: { info: (l: string) => info.push(l), error: (l: string) => error.push(l) } };
}

function aJob(result: TransferStepChecksSummary | Error) {
    return {
        execute: vi.fn(async () => {
            if (result instanceof Error) throw result;
            return result;
        }),
    };
}

describe('Contenedor — job de comprobaciones del traspaso', () => {
    it('lo arma aunque no haya registrador: los plazos se vigilan igual', () => {
        vi.stubEnv('HOSTINGER_API_TOKEN', '');

        expect(createContainer().runTransferStepChecks).toBeInstanceOf(RunTransferStepChecksUseCase);
    });

    it('con registrador también lo arma', () => {
        vi.stubEnv('HOSTINGER_API_TOKEN', 'tok_de_prueba');

        expect(createContainer().runTransferStepChecks).toBeInstanceOf(RunTransferStepChecksUseCase);
    });
});

describe('runTransferChecksJob', () => {
    it('sin fallas sale con 0 y deja el resumen en una línea JSON', async () => {
        const summary = { checked: 2, failures: [], reminded: 1, escalated: 0 };
        const { log, info, error } = aLog();

        const code = await runTransferChecksJob(aJob(summary), log);

        expect(code).toBe(0);
        expect(info).toHaveLength(1);
        expect(JSON.parse(info[0])).toEqual({ job: 'transfer-checks', ...summary });
        expect(error).toHaveLength(0);
    });

    it('con alguna falla sale con 1 para que systemd la marque, y deja cada una en el log de errores', async () => {
        const summary = {
            checked: 1,
            failures: [{ operationId: 'op-1', error: 'Hostinger no responde' }],
            reminded: 0,
            escalated: 0,
        };
        const { log, info, error } = aLog();

        const code = await runTransferChecksJob(aJob(summary), log);

        expect(code).toBe(1);
        expect(JSON.parse(info[0])).toMatchObject({ job: 'transfer-checks', checked: 1 });
        expect(error).toEqual([
            JSON.stringify({ job: 'transfer-checks', operationId: 'op-1', error: 'Hostinger no responde' }),
        ]);
    });

    it('si la corrida entera se cae, sale con 1 y deja el motivo', async () => {
        const { log, info, error } = aLog();

        const code = await runTransferChecksJob(aJob(new Error('la base no responde')), log);

        expect(code).toBe(1);
        expect(info).toHaveLength(0);
        expect(error).toEqual([JSON.stringify({ job: 'transfer-checks', error: 'la base no responde' })]);
    });
});

describe('runReceiptReviewsJob', () => {
    it('registra cuántos recordatorios y pagos dados por acreditados hubo, y sale con 0', async () => {
        const { info, log } = aLog();
        const useCase = { execute: vi.fn(async () => ({ reminded: 1, confirmed: 2 })) };

        expect(await runReceiptReviewsJob(useCase, log)).toBe(0);
        expect(info.map((l) => JSON.parse(l))).toEqual([{ job: 'receipt-reviews', reminded: 1, confirmed: 2 }]);
    });

    it('si falla, lo registra y sale con 1 para que systemd lo marque', async () => {
        const { error, log } = aLog();
        const useCase = { execute: vi.fn(async () => { throw new Error('sin base'); }) };

        expect(await runReceiptReviewsJob(useCase, log)).toBe(1);
        expect(JSON.parse(error[0])).toEqual({ job: 'receipt-reviews', error: 'sin base' });
    });

    it('el contenedor lo arma', () => {
        expect(createContainer().expireReceiptReviews).toBeDefined();
    });
});
