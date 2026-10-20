-- CreateTable
CREATE TABLE "transfer_step_progress" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "deadlineAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "attestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_step_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfer_step_progress_status_idx" ON "transfer_step_progress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_step_progress_scope_scopeId_stepKey_key" ON "transfer_step_progress"("scope", "scopeId", "stepKey");
