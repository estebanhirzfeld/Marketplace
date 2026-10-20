import path from "node:path";
import { config } from "dotenv";
import { useTestDatabase } from "./testDatabase";

/**
 * Por cada archivo de test, antes de importar nada del cliente: reapunta
 * `DATABASE_URL` a la base de prueba y aborta si no termina en `_test`.
 */
config({ path: path.resolve(__dirname, "../.env") });
useTestDatabase();
