#!/usr/bin/env node
// Testbed de la VPS: crea activos y operaciones de prueba en estados concretos y
// los borra con un comando. Sin dependencias (Node 20+).
//
//   node scripts/testbed/cli.mjs up --state <published|offer|contract_signed|in_custody> [--type youtube|web] [--price <centavos>] [--currency ARS|USD] [--dry-run]
//   node scripts/testbed/cli.mjs status
//   node scripts/testbed/cli.mjs clean [--yes]
//   node scripts/testbed/cli.mjs list-users
//
// Configuración por entorno: TESTBED_HOST, TESTBED_SELLER_EMAIL,
// TESTBED_BUYER_EMAIL, TESTBED_ADMIN_EMAIL.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline/promises';
import {
    TEST_PREFIX,
    parseArgs,
    resolveConfig,
    planForState,
    renderPlan,
    buildRequest,
    countStatements,
    cleanupStatements,
    statusListStatement,
    userLookupSql,
    parseUserRows,
    assertActorsReady,
    pickCustodyAccount,
    custodyAccountBody,
    mintTokenScript,
    PSQL_REMOTE_COMMAND,
} from './lib.mjs';

const REMOTE_API_PORT = 3001;
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];

// ── SSH ────────────────────────────────────────────────────────────────────

/** Ejecuta un comando remoto. El comando es siempre una constante; los datos van por stdin. */
function ssh(host, remoteCommand, input) {
    const run = spawnSync('ssh', [...SSH_OPTIONS, host, remoteCommand], { input, encoding: 'utf8' });
    if (run.error) throw new Error(`No se pudo ejecutar ssh: ${run.error.message}`);
    if (run.status !== 0) {
        throw new Error(`Falló el comando remoto (código ${run.status}): ${run.stderr.trim()}`);
    }
    return run.stdout;
}

function runSql(cfg, sql) {
    return ssh(cfg.host, PSQL_REMOTE_COMMAND, sql);
}

function mintToken(cfg, user, role) {
    // `node` lee el programa de stdin: no hay nada que escapar en la línea remota.
    return ssh(cfg.host, 'sudo -n node', mintTokenScript({ id: user.id, role })).trim();
}

// ── Túnel hacia la API ─────────────────────────────────────────────────────

function freeLocalPort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openTunnel(cfg) {
    const port = await freeLocalPort();
    const child = spawn(
        'ssh',
        [...SSH_OPTIONS, '-o', 'ExitOnForwardFailure=yes', '-N', '-L', `${port}:127.0.0.1:${REMOTE_API_PORT}`, cfg.host],
        { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    let exited = false;
    child.on('exit', () => { exited = true; });

    const close = () => { if (!exited) child.kill(); };
    process.on('exit', close);
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => { close(); process.exit(130); });
    }

    for (let i = 0; i < 40; i++) {
        if (exited) throw new Error(`El túnel SSH se cerró: ${stderr.trim()}`);
        try {
            const res = await fetch(`http://127.0.0.1:${port}/health`);
            if (res.ok) return { port, close };
        } catch { /* el túnel todavía no escucha */ }
        await sleep(250);
    }
    close();
    throw new Error('El túnel SSH no respondió a /health a tiempo.');
}

async function api({ port }, token, { method, path, body }) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`${method} ${path} respondió ${res.status}: ${text}`);
    }
    return text ? JSON.parse(text) : undefined;
}

// ── Usuarios ───────────────────────────────────────────────────────────────

function resolveUsers(cfg) {
    const rows = parseUserRows(runSql(cfg, userLookupSql(Object.values(cfg.emails))));
    const byEmail = new Map(rows.map((r) => [r.email, r]));
    return {
        seller: byEmail.get(cfg.emails.seller),
        buyer: byEmail.get(cfg.emails.buyer),
        admin: byEmail.get(cfg.emails.admin),
    };
}

// ── Comandos ───────────────────────────────────────────────────────────────

async function cmdUp(cfg, flags) {
    const plan = planForState(flags.state);

    if (flags.dryRun) {
        console.log(`Plan para "${flags.state}" (${flags.type}), contra ${cfg.host}:`);
        console.log(renderPlan(plan));
        console.log('\nLos tokens se firman en la VPS y no se muestran. Dry-run: no se hizo ninguna llamada remota.');
        return;
    }

    const users = resolveUsers(cfg);
    assertActorsReady(users, flags.state);

    const roles = [...new Set(plan.map((s) => s.actor))];
    const tokens = Object.fromEntries(roles.map((r) => [r, mintToken(cfg, users[r], r)]));
    const tunnel = await openTunnel(cfg);

    const ctx = {};
    const opts = { type: flags.type, price: flags.price, currency: flags.currency, now: new Date() };

    try {
        for (const [i, step] of plan.entries()) {
            console.log(`[${i + 1}/${plan.length}] ${step.actor} ${step.method} ${step.path.replace(/:\w+/g, '…')}`);
            const token = tokens[step.actor];
            try {
                await runStep(tunnel, token, step, ctx, opts);
            } catch (error) {
                console.error(`\nFalló el paso ${i + 1} (${step.key}): ${error.message}`);
                if (ctx.listingId) {
                    console.error(`Quedó creado el activo ${ctx.listingId}. Se borra con: make testbed-clean`);
                }
                process.exitCode = 1;
                return;
            }
        }
    } finally {
        tunnel.close();
    }

    console.log(`\nListo: estado "${flags.state}".`);
    console.log(`  activo:     ${ctx.listingId}`);
    if (ctx.operationId) console.log(`  operación:  ${ctx.operationId}`);
    console.log(`  abrir:      ${ctx.operationId ? `/operaciones/${ctx.operationId}` : `/activos/${ctx.listingId}`}`);
}

async function runStep(tunnel, token, step, ctx, opts) {
    const request = buildRequest(step, ctx, opts);

    switch (step.key) {
        case 'create-listing': {
            const created = await api(tunnel, token, request);
            ctx.listingId = created.id;
            return;
        }
        case 'offer': {
            const created = await api(tunnel, token, request);
            ctx.operationId = created.id;
            return;
        }
        case 'custody-account': {
            const accounts = await api(tunnel, token, request);
            let account = pickCustodyAccount(accounts, opts.type);
            if (!account) {
                console.log('      no hay cuenta de custodia activa del tipo: se crea una con datos de ejemplo');
                account = await api(tunnel, token, {
                    method: 'POST',
                    path: '/admin/custody-accounts',
                    body: custodyAccountBody(opts.type),
                });
            }
            ctx.custodyAccountId = account.id;
            return;
        }
        case 'find-contract': {
            const detail = await api(tunnel, token, request);
            const tripartite = detail.contracts.find((c) => c.type === 'tripartite');
            if (!tripartite) throw new Error('La operación no tiene contrato tripartito.');
            ctx.contractId = tripartite.id;
            return;
        }
        default:
            await api(tunnel, token, request);
    }
}

function parseCounts(output) {
    const counts = {};
    for (const line of output.split('\n').filter(Boolean)) {
        const [table, n] = line.split('|');
        counts[table] = Number(n);
    }
    return counts;
}

const formatCounts = (counts) =>
    Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(', ');

const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

function cmdStatus(cfg) {
    const counts = parseCounts(runSql(cfg, countStatements()));
    console.log(`Filas marcadas con "${TEST_PREFIX.trim()}" en ${cfg.host}`);
    console.log(`  ${formatCounts(counts)}`);

    const rows = runSql(cfg, statusListStatement()).split('\n').filter(Boolean);
    for (const row of rows) {
        const [kind, id, state, name] = row.split('|');
        console.log(`  ${kind.padEnd(9)} ${id}  ${state.padEnd(20)} ${name}`);
    }
}

async function confirm(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await rl.question(`${question} [y/N] `);
        return /^y(es)?$/i.test(answer.trim());
    } finally {
        rl.close();
    }
}

async function cmdClean(cfg, flags) {
    const before = parseCounts(runSql(cfg, countStatements()));
    console.log(`Se van a borrar (marcados con "${TEST_PREFIX.trim()}"): ${formatCounts(before)}`);
    if (total(before) === 0) {
        console.log('No hay nada para borrar.');
        return;
    }
    if (!flags.yes && !(await confirm('¿Borrar estas filas de la base de la VPS?'))) {
        console.log('Cancelado, no se borró nada.');
        return;
    }

    runSql(cfg, cleanupStatements().join('\n'));

    const after = parseCounts(runSql(cfg, countStatements()));
    if (total(after) !== 0) {
        throw new Error(`Quedaron filas marcadas después del borrado: ${formatCounts(after)}`);
    }
    console.log('Borrado completo: no queda ninguna fila marcada.');
}

function cmdListUsers(cfg) {
    const users = resolveUsers(cfg);
    for (const [who, user] of Object.entries(users)) {
        console.log(user
            ? `${who.padEnd(7)} ${user.id}  ${user.email}  rol=${user.role}  kyc=${user.kyc ? 'sí' : 'no'}`
            : `${who.padEnd(7)} (no existe un usuario con ${cfg.emails[who]})`);
    }
}

// ── Entrada ────────────────────────────────────────────────────────────────

async function main() {
    const { command, flags } = parseArgs(process.argv.slice(2));
    const cfg = resolveConfig(process.env);

    switch (command) {
        case 'up': return cmdUp(cfg, flags);
        case 'status': return cmdStatus(cfg);
        case 'clean': return cmdClean(cfg, flags);
        case 'list-users': return cmdListUsers(cfg);
    }
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
});
