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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BulkJob" ("createdAt", "failed", "id", "sent", "status", "total", "type", "updatedAt") SELECT "createdAt", "failed", "id", "sent", "status", "total", "type", "updatedAt" FROM "BulkJob";
DROP TABLE "BulkJob";
ALTER TABLE "new_BulkJob" RENAME TO "BulkJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
