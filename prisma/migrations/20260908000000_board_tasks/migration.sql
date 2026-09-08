-- CreateTable
CREATE TABLE "board_tasks" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "title" TEXT NOT NULL,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_tasks_staffId_dueOn_idx" ON "board_tasks"("staffId", "dueOn");

-- CreateIndex
CREATE INDEX "board_tasks_doneAt_idx" ON "board_tasks"("doneAt");

-- AddForeignKey
ALTER TABLE "board_tasks" ADD CONSTRAINT "board_tasks_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

