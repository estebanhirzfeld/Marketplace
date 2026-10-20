import 'dotenv/config';
import { createContainer } from '../container';
import { runTransferChecksJob } from './transferChecksJob';

/**
 * Entrypoint del job periódico del traspaso de sitios. Lo dispara
 * `infra/systemd/marketplace-transfer-checks.timer`; corre una vez y termina.
 */
async function main() {
    const container = createContainer();
    const code = await runTransferChecksJob(container.runTransferStepChecks, {
        info: (line) => console.log(line),
        error: (line) => console.error(line),
    });
    process.exit(code);
}

main();
