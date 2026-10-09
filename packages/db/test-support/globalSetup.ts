import path from "node:path";
import { config } from "dotenv";
import { provisionTestDatabase, useTestDatabase } from "./testDatabase";

/**
 * Antes de toda la suite: deriva la base de prueba, verifica el resguardo
 * (antes de abrir ninguna conexión) y la deja creada y migrada.
 */
export default async function setup(): Promise<void> {
    config({ path: path.resolve(__dirname, "../.env") });
    const url = useTestDatabase();
    await provisionTestDatabase(url);
}
