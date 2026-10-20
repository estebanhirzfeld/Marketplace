// Tests de status y clean: parseo de la salida de psql y garantías del SQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TEST_PREFIX,
    parseCounts,
    totalCount,
    parseUserRows,
    statusListStatement,
    cleanupStatements,
    countStatements,
} from './lib.mjs';

const ID = '0b8f5b0e-6b2a-4c53-9b64-7d1f6f4f2a11';

test('parseCounts: lee filas tabla|cantidad', () => {
    assert.deepEqual(parseCounts('listings|2\noperations|1\ncontracts|0\n'), {
        listings: 2,
        operations: 1,
        contracts: 0,
    });
    assert.deepEqual(parseCounts(''), {});
});

test('totalCount: suma todas las tablas', () => {
    assert.equal(totalCount({ listings: 2, operations: 1, contracts: 0 }), 3);
    assert.equal(totalCount({}), 0);
});

test('parseCounts rechaza salida que no sea numérica', () => {
    assert.throws(() => parseCounts('listings|abc'), /conteo/i);
});

test('parseUserRows: lee id|correo|rol|kyc', () => {
    const rows = parseUserRows(`${ID}|a@x.com|admin|t\n${ID}|b@x.com|buyer|f\n`);
    assert.deepEqual(rows, [
        { id: ID, email: 'a@x.com', role: 'admin', kyc: true },
        { id: ID, email: 'b@x.com', role: 'buyer', kyc: false },
    ]);
    assert.throws(() => parseUserRows('no-es-uuid|a@x.com|admin|t'), /id/i);
});

test('statusListStatement: solo lectura y acotado al marcador', () => {
    const sql = statusListStatement();
    assert.ok(sql.includes(TEST_PREFIX));
    assert.doesNotMatch(sql, /delete|update|insert/i);
});

test('el conteo y el borrado comparten exactamente el mismo criterio de marcado', () => {
    const criterio = /starts_with\("assetData"->>'name', '\[TEST\] '\)/;
    assert.match(countStatements(), criterio);
    for (const s of cleanupStatements().filter((x) => x.startsWith('DELETE'))) {
        assert.match(s, criterio);
    }
});

test('el borrado no deja operaciones, contratos ni avisos huérfanos antes de borrar el activo', () => {
    const tablas = cleanupStatements()
        .map((s) => s.match(/^DELETE FROM "(\w+)"/)?.[1])
        .filter(Boolean);
    const pos = (t) => tablas.indexOf(t);
    assert.ok(pos('reports') < pos('operations'));
    assert.ok(pos('contracts') < pos('operations'));
    assert.ok(pos('operations') < pos('listings'));
    assert.ok(pos('notifications') < pos('listings'));
});
