import type { NextConfig } from "next";
import path from "node:path";

// La raíz del monorepo, dos niveles arriba de apps/web.
const repoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // La caja de producción (1 GB) no puede correr `next build`. El build se hace
  // en CI y a la VM llega solo `.next/standalone`, que se arranca con
  // `node apps/web/.next/standalone/apps/web/server.js` — sin `next start` y sin
  // instalar node_modules.
  output: "standalone",

  // Gotcha de monorepo: sin esto el trazado de archivos toma `apps/web` como
  // raíz y OMITE EN SILENCIO las dependencias que viven en la raíz del workspace
  // (el store `.pnpm`, los paquetes `@marketplace/*`). El bundle standalone
  // compila igual y después explota en runtime con MODULE_NOT_FOUND. Apuntando
  // el trazado a la raíz del monorepo, el standalone queda autocontenido.
  outputFileTracingRoot: repoRoot,

  // Turbopack infiere mal la raíz en un monorepo y avisa en cada build; se le
  // fija la misma raíz que al trazado.
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
