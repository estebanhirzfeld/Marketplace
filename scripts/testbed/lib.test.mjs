// Tests del núcleo puro del testbed. Sin red, sin SSH, sin base de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TEST_PREFIX,
    STATES,
    buildListingBody,
    planForState,
    renderPlan,
    cleanupStatements,
    countStatements,
    assertSafeEmail,
    assertUuid,
    parseArgs,
} from './lib.mjs';

const NOW = new Date('2026-10-08T12:00:00Z');

test('el marcador es el prefijo "[TEST] "', () => {
    assert.equal(TEST_PREFIX, '[TEST] ');
});

test('buildListingBody: youtube lleva el marcador en el nombre y forma válida', () => {
    const body = buildListingBody('youtube', { now: NOW });
    assert.equal(body.assetType, 'youtube');
    assert.ok(body.assetData.name.startsWith(TEST_PREFIX));
    assert.equal(typeof body.assetData.subscribers, 'number');
    assert.equal(typeof body.assetData.isMonetized, 'boolean');
    assert.ok(Number.isInteger(body.assetData.monthlyRevenueUsdCents));
    assert.ok(Number.isInteger(body.askingPrice.cents));
    assert.equal(body.askingPrice.currency, 'USD');
});

test('buildListingBody: web lleva el marcador y respeta precio y moneda pedidos', () => {
    const body = buildListingBody('web', { now: NOW, price: 123400, currency: 'ARS' });
    assert.equal(body.assetType, 'web');
    assert.ok(body.assetData.name.startsWith(TEST_PREFIX));
    assert.equal(typeof body.assetData.domainAuthority, 'number');
    assert.deepEqual(body.askingPrice, { cents: 123400, currency: 'ARS' });
});

test('buildListingBody: tipo desconocido se rechaza', () => {
    assert.throws(() => buildListingBody('tiktok', { now: NOW }), /tipo/i);
});

const FINAL_KEY = {
    published: 'approve',
    offer: 'offer',
    contract_signed: 'sign-seller',
    in_custody: 'confirm-custody',
};

for (const state of STATES) {
    test(`planForState(${state}) termina en el paso correcto`, () => {
        const plan = planForState(state);
        assert.equal(plan.at(-1).key, FINAL_KEY[state]);
    });
}

test('los planes son prefijos unos de otros', () => {
    const keys = (s) => planForState(s).map((p) => p.key);
    assert.deepEqual(keys('offer').slice(0, keys('published').length), keys('published'));
    assert.deepEqual(keys('contract_signed').slice(0, keys('offer').length), keys('offer'));
    assert.deepEqual(keys('in_custody').slice(0, keys('contract_signed').length), keys('contract_signed'));
});

test('el acceso de la plataforma ocurre antes de aceptar la oferta', () => {
    const keys = planForState('in_custody').map((p) => p.key);
    assert.ok(keys.indexOf('platform-access') < keys.indexOf('accept'));
});

test('los planes solo usan la API: nunca SQL ni escrituras directas', () => {
    for (const state of STATES) {
        for (const step of planForState(state)) {
            assert.ok(['GET', 'POST'].includes(step.method));
            assert.ok(step.path.startsWith('/'));
            assert.ok(['seller', 'buyer', 'admin'].includes(step.actor));
            assert.doesNotMatch(JSON.stringify(step), /insert|update|delete|psql/i);
        }
    }
});

test('planForState: estado desconocido se rechaza', () => {
    assert.throws(() => planForState('completed'), /estado/i);
});

test('renderPlan: lista pasos numerados con actor, método y ruta', () => {
    const text = renderPlan(planForState('offer'));
    assert.match(text, /1\. \[seller\] POST \/listings/);
    assert.match(text, /\[buyer\] POST \/listings\/:listingId\/offers/);
});

test('cleanupStatements: transacción, orden seguro, acotada al marcador', () => {
    const statements = cleanupStatements();
    assert.equal(statements[0], 'BEGIN;');
    assert.equal(statements.at(-1), 'COMMIT;');

    const tables = statements
        .map((s) => s.match(/^DELETE FROM "(\w+)"/)?.[1])
        .filter(Boolean);
    assert.deepEqual(tables, ['notifications', 'reports', 'contracts', 'operations', 'listings']);

    const sql = statements.join('\n');
    assert.ok(sql.includes(TEST_PREFIX));
    for (const prohibido of ['users', 'seller_payment_accounts', 'custody_accounts']) {
        assert.ok(!sql.includes(prohibido), `no debe mencionar ${prohibido}`);
    }
    // Todo DELETE tiene WHERE: nada de borrados totales.
    for (const s of statements.filter((x) => x.startsWith('DELETE'))) {
        assert.match(s, /WHERE/);
    }
});

test('countStatements: solo lectura y acotada al marcador', () => {
    const sql = countStatements();
    assert.match(sql, /^SELECT/);
    assert.ok(sql.includes(TEST_PREFIX));
    assert.doesNotMatch(sql, /delete|update|insert/i);
});

test('assertSafeEmail acepta correos normales y rechaza inyección', () => {
    assert.equal(assertSafeEmail('seller@forzalabs.online'), 'seller@forzalabs.online');
    for (const malo of ["a'b@x.com", 'a@x.com; DROP TABLE users', 'sin-arroba', 'a b@x.com', '']) {
        assert.throws(() => assertSafeEmail(malo), /correo/i);
    }
});

test('assertUuid acepta uuid y rechaza el resto', () => {
    const ok = '0b8f5b0e-6b2a-4c53-9b64-7d1f6f4f2a11';
    assert.equal(assertUuid(ok), ok);
    for (const malo of ["x'; --", '123', ok + ' ', '']) {
        assert.throws(() => assertUuid(malo), /id/i);
    }
});

test('parseArgs: up con todas las opciones', () => {
    const parsed = parseArgs(['up', '--state', 'offer', '--type', 'web', '--price', '5000', '--currency', 'ARS', '--dry-run']);
    assert.equal(parsed.command, 'up');
    assert.deepEqual(parsed.flags, { state: 'offer', type: 'web', price: 5000, currency: 'ARS', dryRun: true, yes: false });
});

test('parseArgs: valores por defecto', () => {
    const { flags } = parseArgs(['up', '--state', 'published']);
    assert.equal(flags.type, 'youtube');
    assert.equal(flags.currency, 'USD');
    assert.equal(flags.price, undefined);
    assert.equal(flags.dryRun, false);
});

test('parseArgs: clean --yes', () => {
    assert.equal(parseArgs(['clean', '--yes']).flags.yes, true);
});

test('parseArgs rechaza comandos, estados, tipos, precios y monedas inválidos', () => {
    assert.throws(() => parseArgs(['nada']), /comando/i);
    assert.throws(() => parseArgs([]), /comando/i);
    assert.throws(() => parseArgs(['up']), /--state/);
    assert.throws(() => parseArgs(['up', '--state', 'completed']), /estado/i);
    assert.throws(() => parseArgs(['up', '--state', 'offer', '--type', 'x']), /tipo/i);
    assert.throws(() => parseArgs(['up', '--state', 'offer', '--price', '-3']), /precio/i);
    assert.throws(() => parseArgs(['up', '--state', 'offer', '--price', '1.5']), /precio/i);
    assert.throws(() => parseArgs(['up', '--state', 'offer', '--currency', 'EUR']), /moneda/i);
    assert.throws(() => parseArgs(['up', '--state', 'offer', '--raro']), /opción/i);
});

test('el dry-run no contiene tokens ni secretos', () => {
    const text = renderPlan(planForState('in_custody'));
    assert.doesNotMatch(text, /Bearer|JWT_SECRET|eyJ/);
});
