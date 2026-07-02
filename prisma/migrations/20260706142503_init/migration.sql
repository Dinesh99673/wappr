-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "status" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BulkJobRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "message" TEXT,
    "attachmentUrl" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    CONSTRAINT "BulkJobRecipient_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
