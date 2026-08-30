import { config } from 'dotenv';
import path from 'node:path';

/**
 * La API no tiene su propio .env todavía: comparte la base con el paquete de
 * persistencia, donde vive DATABASE_URL. Se carga con ruta explícita en vez de
 * `dotenv/config`, que resolvería contra el cwd de apps/api y no encontraría
 * nada.
 */
config({ path: path.resolve(__dirname, '../../../packages/db/.env') });
