import 'dotenv/config';
import { createContainer } from '../container';
import { runAssetReceiptsJob, runReceiptReviewsJob, runTransferChecksJob } from './transferChecksJob';

/**
 * Entrypoint del job periódico del traspaso. Lo dispara
 * `infra/systemd/marketplace-transfer-checks.timer`; corre una vez y termina.
 * Además de los pasos que se comprueban solos, vence las revisiones de
 * comprobantes y da por recibidos los canales cuyo comprador no respondió en
 * su plazo: la misma corrida horaria, sin otra unidad que mantener.
 */
async function main() {
    const container = createContainer();
    const log = {
        info: (line: string) => console.log(line),
        error: (line: string) => console.error(line),
    };
    const steps = await runTransferChecksJob(container.runTransferStepChecks, log);
    const reviews = await runReceiptReviewsJob(container.expireReceiptReviews, log);
    const receipts = await runAssetReceiptsJob(container.deemAssetReceived, log);
    process.exit(Math.max(steps, reviews, receipts));
}

main();
