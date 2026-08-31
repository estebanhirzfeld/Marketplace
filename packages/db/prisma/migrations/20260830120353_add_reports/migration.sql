-- Denuncias de una parte contra la otra.
--
-- Solo tienen dos estados, y ninguno dice quién tiene razón: la plataforma no
-- arbitra el fondo del reclamo. Recibe la denuncia, la fecha, avisa a la
-- contraparte y reúne el legajo con lo que registró mientras la operación
-- transcurría, para que quien se considere perjudicado inicie las acciones que
-- correspondan.

CREATE TYPE "ReportReason" AS ENUM ('metricas_falsas', 'ingreso_falso', 'activo_no_entregado', 'activo_recuperado', 'pago_no_recibido', 'otro');
CREATE TYPE "ReportStatus" AS ENUM ('open', 'closed');

CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reporterRole" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "detail" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reports_reportedById_idx" ON "reports"("reportedById");
CREATE INDEX "reports_reportedUserId_idx" ON "reports"("reportedUserId");

ALTER TABLE "reports" ADD CONSTRAINT "reports_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
