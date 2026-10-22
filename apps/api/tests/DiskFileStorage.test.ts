import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DiskFileStorage } from '../src/adapters/DiskFileStorage';

/** El almacenamiento en disco de los comprobantes. Una clave nunca puede salir de su carpeta. */

let root: string;

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'comprobantes-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('DiskFileStorage', () => {
    it('guarda y devuelve el archivo con su tipo', async () => {
        const storage = new DiskFileStorage(root);
        const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

        await storage.put('receipts/op1/seller-abc.pdf', bytes, 'application/pdf');

        expect(await storage.get('receipts/op1/seller-abc.pdf')).toEqual({ bytes, contentType: 'application/pdf' });
    });

    it('una clave que no existe devuelve null', async () => {
        expect(await new DiskFileStorage(root).get('receipts/no/existe.pdf')).toBeNull();
    });

    it.each([['../afuera.pdf'], ['receipts/../../afuera.pdf'], ['/etc/passwd'], ['Receipts/Mayus.pdf']])(
        'rechaza la clave «%s»',
        async (key) => {
            await expect(new DiskFileStorage(root).put(key, new Uint8Array([1]), 'application/pdf')).rejects.toThrow();
        },
    );
});
