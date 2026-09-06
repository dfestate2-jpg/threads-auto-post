-- CreateEnum
CREATE TYPE "BoardOutcome" AS ENUM ('CONTRACTED', 'LOST_OTHER', 'NO_CHANCE');

-- CreateEnum
CREATE TYPE "BoardEventType" AS ENUM ('ANGLE_SET', 'CALL_MEMO', 'CALLED', 'NO_ANSWER', 'ENDED', 'NOTIFIED');

-- CreateTable
CREATE TABLE "board_entries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "angle" INTEGER,
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "noAnswerStreak" INTEGER NOT NULL DEFAULT 0,
    "customerTask" TEXT,
    "staffTask" TEXT,
    "lastActionAt" TIMESTAMP(3),
    "notifiedOn" TEXT,
    "endedAt" TIMESTAMP(3),
    "endedOutcome" "BoardOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_call_memos" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "calledOn" TIMESTAMP(3) NOT NULL,
    "staffId" TEXT,
    "angle" INTEGER NOT NULL,
    "customerTask" TEXT,
    "staffTask" TEXT,
    "dueOverride" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_call_memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_events" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "type" "BoardEventType" NOT NULL,
    "angleBefore" INTEGER,
    "angleAfter" INTEGER,
    "outcome" "BoardOutcome",
    "staffId" TEXT,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "angle5Ladder" TEXT NOT NULL DEFAULT '2',
    "angle4Ladder" TEXT NOT NULL DEFAULT '3,5,7',
    "angle3Ladder" TEXT NOT NULL DEFAULT '7,14,30',
    "angle2Ladder" TEXT NOT NULL DEFAULT '14,30,end',
    "angle1Ladder" TEXT NOT NULL DEFAULT 'off',
    "notifyHour" INTEGER NOT NULL DEFAULT 9,
    "notifyMinute" INTEGER NOT NULL DEFAULT 0,
    "notifyToStaff" BOOLEAN NOT NULL DEFAULT true,
    "notifyToGroup" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "askAngleAfterCall" BOOLEAN NOT NULL DEFAULT true,
    "messageTemplate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_entries_customerId_key" ON "board_entries"("customerId");

-- CreateIndex
CREATE INDEX "board_entries_dueAt_idx" ON "board_entries"("dueAt");

-- CreateIndex
CREATE INDEX "board_entries_assigneeId_dueAt_idx" ON "board_entries"("assigneeId", "dueAt");

-- CreateIndex
CREATE INDEX "board_entries_angle_idx" ON "board_entries"("angle");

-- CreateIndex
CREATE INDEX "board_entries_endedAt_idx" ON "board_entries"("endedAt");

-- CreateIndex
CREATE INDEX "board_call_memos_entryId_calledOn_idx" ON "board_call_memos"("entryId", "calledOn");

-- CreateIndex
CREATE INDEX "board_events_entryId_at_idx" ON "board_events"("entryId", "at");

-- CreateIndex
CREATE INDEX "board_events_type_at_idx" ON "board_events"("type", "at");

-- AddForeignKey
ALTER TABLE "board_entries" ADD CONSTRAINT "board_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_entries" ADD CONSTRAINT "board_entries_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_call_memos" ADD CONSTRAINT "board_call_memos_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "board_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_events" ADD CONSTRAINT "board_events_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "board_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

