import type {
    RunTransferStepChecksUseCase,
    TransferStepChecksSummary,
} from '@marketplace/domain/src/use-cases/operation/RunTransferStepChecksUseCase';

export interface JobLog {
    info(line: string): void;
    error(line: string): void;
}

const JOB = 'transfer-checks';

/**
 * Una corrida del job y su código de salida.
 *
 * Aparte del entrypoint para poder probarla sin base ni red. Cada línea es un
 * JSON para que `journalctl -u marketplace-transfer-checks` se pueda filtrar.
 *
 * Sale con 1 si falló algo, aunque sea un solo dominio: así systemd marca la
 * unidad como fallida y aparece en `systemctl --failed`. Las demás operaciones
 * se procesaron igual; el caso de uso no corta el recorrido.
 */
export async function runTransferChecksJob(
    useCase: Pick<RunTransferStepChecksUseCase, 'execute'>,
    log: JobLog,
): Promise<number> {
    let summary: TransferStepChecksSummary;
    try {
        summary = await useCase.execute();
    } catch (error) {
        log.error(JSON.stringify({ job: JOB, error: error instanceof Error ? error.message : String(error) }));
        return 1;
    }

    log.info(JSON.stringify({ job: JOB, ...summary }));
    for (const failure of summary.failures) {
        log.error(JSON.stringify({ job: JOB, ...failure }));
    }
    return summary.failures.length > 0 ? 1 : 0;
}
