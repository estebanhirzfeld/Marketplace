import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IFileStorage } from '@marketplace/domain/src/ports/IFileStorage';

/** Solo minúsculas, números y `/._-`, sin subir de carpeta: la clave nunca sale de la raíz. */
const SAFE_KEY = /^[a-z0-9][a-z0-9/._-]*$/;

/**
 * Los archivos en una carpeta del disco, con su tipo al lado. Para local y
 * tests; en producción va Cloudflare R2 detrás del mismo puerto.
 */
export class DiskFileStorage implements IFileStorage {
    constructor(private readonly root: string) {}

    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
        const file = this.pathOf(key);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes);
        await writeFile(`${file}.type`, contentType, 'utf8');
    }

    async get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
        const file = this.pathOf(key);
        try {
            const [bytes, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, 'utf8')]);
            return { bytes: new Uint8Array(bytes), contentType };
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw e;
        }
    }

    private pathOf(key: string): string {
        if (!SAFE_KEY.test(key) || key.split('/').some((part) => part === '..' || part === '.')) {
            throw new Error(`Clave de archivo inválida: ${key}`);
        }
        return path.join(this.root, key);
    }
}
