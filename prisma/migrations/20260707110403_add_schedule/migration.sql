-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "intervalKind" TEXT,
    "intervalN" INTEGER,
    "atTime" TEXT,
    "weekday" INTEGER,
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "endAt" DATETIME,
    "maxRuns" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "minDelaySec" INTEGER NOT NULL DEFAULT 5,
    "maxDelaySec" INTEGER NOT NULL DEFAULT 15,
    "recipientsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BulkJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "minDelaySec" INTEGER NOT NULL DEFAULT 5,
    "maxDelaySec" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "scheduleId" TEXT,
    CONSTRAINT "BulkJob_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BulkJob" ("createdAt", "failed", "id", "maxDelaySec", "minDelaySec", "sent", "status", "total", "type", "updatedAt") SELECT "createdAt", "failed", "id", "maxDelaySec", "minDelaySec", "sent", "status", "total", "type", "updatedAt" FROM "BulkJob";
DROP TABLE "BulkJob";
ALTER TABLE "new_BulkJob" RENAME TO "BulkJob";
CREATE INDEX "BulkJob_scheduleId_idx" ON "BulkJob"("scheduleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Schedule_status_nextRunAt_idx" ON "Schedule"("status", "nextRunAt");
