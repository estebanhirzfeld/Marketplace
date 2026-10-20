// Tests del cliente de la VPS: lo que se puede probar sin red ni SSH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    planForState,
    mintTokenScript,
    buildRequest,
    resolveConfig,
    userLookupSql,
    assertActorsReady,
    pickCustodyAccount,
    custodyAccountBody,
    PSQL_REMOTE_COMMAND,
} from './lib.mjs';

const ACTOR_ID = '0b8f5b0e-6b2a-4c53-9b64-7d1f6f4f2a11';
const NOW = new Date('2026-10-08T12:00:00Z');

function b64urlDecode(part) {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function withEnvFile(contents, fn) {
    const dir = mkdtempSync(join(tmpdir(), 'testbed-'));
    const envFile = join(dir, 'api.env');
    writeFileSync(envFile, contents);
    try {
        return fn(envFile);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('mintTokenScript: firma un JWT HS256 que verifica con el secreto y trae {id, role, iat, exp}', () => {
    withEnvFile('OTRA=1\nJWT_SECRET="secreto-falso-de-prueba"\n', (envFile) => {
        const script = mintTokenScript({ id: ACTOR_ID, role: 'admin' }, { envFile, ttlSeconds: 600 });
        const run = spawnSync('node', ['-'], { input: script, encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);

        const token = run.stdout.trim();
        const [h, p, s] = token.split('.');
        assert.deepEqual(b64urlDecode(h), { alg: 'HS256', typ: 'JWT' });
        const payload = b64urlDecode(p);
        assert.equal(payload.id, ACTOR_ID);
        assert.equal(payload.role, 'admin');
        assert.equal(payload.exp - payload.iat, 600);
        const esperado = createHmac('sha256', 'secreto-falso-de-prueba').update(`${h}.${p}`).digest('base64url');
        assert.equal(s, esperado);
        // Solo el token sale por stdout: ni el secreto ni líneas extra.
        assert.doesNotMatch(run.stdout, /secreto-falso/);
        assert.equal(run.stdout.trim().split('\n').length, 1);
    });
});

test('mintTokenScript: falla sin JWT_SECRET y no imprime nada', () => {
    withEnvFile('OTRA=1\n', (envFile) => {
        const script = mintTokenScript({ id: ACTOR_ID, role: 'seller' }, { envFile });
        const run = spawnSync('node', ['-'], { input: script, encoding: 'utf8' });
        assert.notEqual(run.status, 0);
        assert.equal(run.stdout, '');
    });
});

test('mintTokenScript: rechaza ids y roles inseguros', () => {
    assert.throws(() => mintTokenScript({ id: "x'); process.exit()", role: 'admin' }), /id/i);
    assert.throws(() => mintTokenScript({ id: ACTOR_ID, role: 'root' }), /rol/i);
});

test('PSQL_REMOTE_COMMAND usa sudo -n, el contenedor y corta ante el primer error', () => {
    assert.match(PSQL_REMOTE_COMMAND, /^sudo -n docker exec -i marketplace-db-1 sh -c /);
    assert.match(PSQL_REMOTE_COMMAND, /ON_ERROR_STOP=1/);
});

test('resolveConfig: el entorno pisa los valores por defecto y se valida', () => {
    const defaults = resolveConfig({});
    assert.equal(defaults.host, 'ubuntu@144.22.175.14');
    assert.equal(defaults.emails.seller, 'seller@forzalabs.online');
    assert.equal(defaults.emails.buyer, 'buyer@forzalabs.online');
    assert.equal(defaults.emails.admin, 'admin@forzalabs.online');

    const custom = resolveConfig({ TESTBED_HOST: 'u@h', TESTBED_SELLER_EMAIL: 'v@x.com' });
    assert.equal(custom.host, 'u@h');
    assert.equal(custom.emails.seller, 'v@x.com');
    assert.throws(() => resolveConfig({ TESTBED_BUYER_EMAIL: "a'b@x.com" }), /correo/i);
    assert.throws(() => resolveConfig({ TESTBED_HOST: '-oProxyCommand=x' }), /host/i);
    assert.throws(() => resolveConfig({ TESTBED_HOST: 'u@h -oX=1' }), /host/i);
});

test('userLookupSql: solo lectura, correos validados', () => {
    const sql = userLookupSql(['a@x.com', 'b@x.com']);
    assert.match(sql, /^SELECT/);
    assert.match(sql, /'a@x\.com','b@x\.com'/);
    assert.doesNotMatch(sql, /insert|update|delete/i);
    assert.throws(() => userLookupSql(["a@x.com' OR '1'='1"]), /correo/i);
});

const READY = {
    seller: { id: ACTOR_ID, email: 's@x.com', role: 'seller', kyc: true },
    buyer: { id: ACTOR_ID, email: 'b@x.com', role: 'buyer', kyc: true },
    admin: { id: ACTOR_ID, email: 'a@x.com', role: 'admin', kyc: false },
};

test('assertActorsReady: acepta usuarios completos y no exige KYC al admin', () => {
    assert.doesNotThrow(() => assertActorsReady(READY, 'in_custody'));
});

test('assertActorsReady: nombra al usuario sin KYC', () => {
    const sinKyc = { ...READY, seller: { ...READY.seller, kyc: false } };
    assert.throws(() => assertActorsReady(sinKyc, 'published'), /s@x\.com.*KYC/);
});

test('assertActorsReady: el comprador solo necesita KYC para firmar', () => {
    const sinKyc = { ...READY, buyer: { ...READY.buyer, kyc: false } };
    assert.doesNotThrow(() => assertActorsReady(sinKyc, 'offer'));
    assert.throws(() => assertActorsReady(sinKyc, 'contract_signed'), /b@x\.com.*KYC/);
});

test('assertActorsReady: falta un usuario o el admin no es admin', () => {
    assert.throws(() => assertActorsReady({ ...READY, buyer: undefined }, 'offer'), /buyer/);
    assert.throws(() => assertActorsReady({ ...READY, admin: { ...READY.admin, role: 'buyer' } }, 'published'), /admin/);
});

test('buildRequest: resuelve rutas con el contexto', () => {
    const step = planForState('contract_signed').find((s) => s.key === 'sign-buyer');
    const req = buildRequest(step, { contractId: ACTOR_ID }, {});
    assert.equal(req.method, 'POST');
    assert.equal(req.path, `/contracts/${ACTOR_ID}/sign`);
    assert.equal(req.body, undefined);
});

test('buildRequest: falla si falta un id del contexto o no es uuid', () => {
    const step = planForState('offer').find((s) => s.key === 'offer');
    assert.throws(() => buildRequest(step, {}, { price: 100, currency: 'USD' }), /listingId/);
    assert.throws(() => buildRequest(step, { listingId: '../x' }, { price: 100, currency: 'USD' }), /id/i);
});

test('buildRequest: el acceso se retrotrae al menos 8 días (YouTube espera 7)', () => {
    const step = planForState('in_custody').find((s) => s.key === 'platform-access');
    const req = buildRequest(step, { listingId: ACTOR_ID, custodyAccountId: ACTOR_ID }, { now: NOW });
    const dias = (NOW - new Date(req.body.accessSince)) / 86400000;
    assert.ok(dias >= 8, `retrotraído ${dias} días`);
    assert.equal(req.body.custodyAccountId, ACTOR_ID);
});

test('buildRequest: la oferta usa el precio y la moneda del activo', () => {
    const step = planForState('offer').find((s) => s.key === 'offer');
    const req = buildRequest(step, { listingId: ACTOR_ID }, { price: 777, currency: 'ARS' });
    assert.deepEqual(req.body, { offerPrice: { cents: 777, currency: 'ARS' } });
});

test('buildRequest: la oferta sin precio explícito usa el precio por defecto del tipo', () => {
    const step = planForState('offer').find((s) => s.key === 'offer');
    const yt = buildRequest(step, { listingId: ACTOR_ID }, { type: 'youtube', currency: 'USD' });
    assert.equal(yt.body.offerPrice.cents, 500000);
});

test('buildRequest: la custodia declara propiedad, accesos y métricas del tipo', () => {
    const step = planForState('in_custody').find((s) => s.key === 'confirm-custody');
    const yt = buildRequest(step, { operationId: ACTOR_ID }, { type: 'youtube' });
    assert.equal(yt.body.isPrimaryOwner, true);
    assert.equal(yt.body.accessSecured, true);
    assert.equal(typeof yt.body.metrics.subscribers, 'number');
    const web = buildRequest(step, { operationId: ACTOR_ID }, { type: 'web' });
    assert.equal(typeof web.body.metrics.sessions, 'number');
});

test('buildRequest: la cesión declara el control cedido', () => {
    const step = planForState('in_custody').find((s) => s.key === 'transfer');
    assert.deepEqual(buildRequest(step, { operationId: ACTOR_ID }, {}).body, { controlCeded: true });
});

test('pickCustodyAccount: primera activa del tipo, o null', () => {
    const cuentas = [
        { id: 'a', assetType: 'web', isActive: true },
        { id: 'b', assetType: 'youtube', isActive: false },
        { id: 'c', assetType: 'youtube', isActive: true },
        { id: 'd', assetType: 'youtube', isActive: true },
    ];
    assert.equal(pickCustodyAccount(cuentas, 'youtube').id, 'c');
    assert.equal(pickCustodyAccount(cuentas, 'web').id, 'a');
    assert.equal(pickCustodyAccount([], 'web'), null);
});

test('custodyAccountBody: placeholder del estilo del seed', () => {
    assert.equal(custodyAccountBody('youtube').identifier, 'custodia-yt-01@forzalabs.online');
    assert.equal(custodyAccountBody('web').identifier, 'custodia-web-01@forzalabs.online');
    assert.equal(custodyAccountBody('web').assetType, 'web');
});
