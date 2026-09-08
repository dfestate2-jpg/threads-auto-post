-- CreateEnum
CREATE TYPE "CoRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "CoStage" AS ENUM ('IDEA', 'PREPARING', 'ESTABLISHED', 'GROWING', 'ACQUIRED');

-- CreateEnum
CREATE TYPE "CoTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'ON_HOLD', 'CANCELED');

-- CreateEnum
CREATE TYPE "CoPriority" AS ENUM ('TOP', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CoArea" AS ENUM ('COMPANY', 'LEGAL', 'MANAGEMENT', 'BUSINESS', 'SALES', 'CUSTOMER', 'DEVELOPMENT', 'SUBSIDY', 'MA', 'FINANCE', 'HR', 'OTHER');

-- CreateEnum
CREATE TYPE "CoProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "CoIssueStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ACTING', 'RESOLVED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "CoSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CoQuestionStatus" AS ENUM ('OPEN', 'DISCUSSING', 'DECIDED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "CoObjectiveStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED', 'DROPPED');

-- CreateEnum
CREATE TYPE "CoVisibility" AS ENUM ('ALL', 'MANAGERS', 'OWNERS');

-- CreateTable
CREATE TABLE "co_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "stage" "CoStage" NOT NULL DEFAULT 'IDEA',
    "purpose" TEXT,
    "vision" TEXT,
    "industry" TEXT,
    "foundedOn" DATE,
    "capital" BIGINT,
    "fiscalMonth" INTEGER,
    "corporateNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "CoRole" NOT NULL DEFAULT 'MEMBER',
    "title" TEXT,
    "department" TEXT,
    "isOfficer" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_shareholders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCompany" BOOLEAN NOT NULL DEFAULT false,
    "shares" INTEGER,
    "ratio" DOUBLE PRECISION,
    "amount" BIGINT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_shareholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_projects" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CoProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "area" "CoArea" NOT NULL DEFAULT 'OTHER',
    "priority" "CoPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerId" TEXT,
    "startOn" DATE,
    "dueOn" DATE,
    "progressOverride" INTEGER,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_milestones" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dueOn" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_tasks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CoTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "CoPriority" NOT NULL DEFAULT 'MEDIUM',
    "area" "CoArea" NOT NULL DEFAULT 'OTHER',
    "projectId" TEXT,
    "assigneeId" TEXT,
    "issueId" TEXT,
    "meetingId" TEXT,
    "startOn" DATE,
    "dueOn" DATE,
    "completedAt" TIMESTAMP(3),
    "relatedCustomer" TEXT,
    "relatedParty" TEXT,
    "revenueImpact" INTEGER NOT NULL DEFAULT 0,
    "riskImpact" INTEGER NOT NULL DEFAULT 0,
    "templateKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_task_dependencies" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "co_task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_checklist_items" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "issueId" TEXT,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "co_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_issues" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "severity" "CoSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "CoIssueStatus" NOT NULL DEFAULT 'OPEN',
    "area" "CoArea" NOT NULL DEFAULT 'MANAGEMENT',
    "occurredOn" DATE,
    "dueOn" DATE,
    "resolvedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "projectId" TEXT,
    "meetingId" TEXT,
    "cause" TEXT,
    "countermeasure" TEXT,
    "nextAction" TEXT,
    "visibility" "CoVisibility" NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_decisions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "background" TEXT,
    "reason" TEXT,
    "decidedOn" DATE NOT NULL,
    "deciderId" TEXT,
    "deciderName" TEXT,
    "area" "CoArea" NOT NULL DEFAULT 'MANAGEMENT',
    "important" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "CoVisibility" NOT NULL DEFAULT 'ALL',
    "projectId" TEXT,
    "issueId" TEXT,
    "meetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_decision_revisions" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "co_decision_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_questions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "point" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT,
    "status" "CoQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "CoSeverity" NOT NULL DEFAULT 'MEDIUM',
    "area" "CoArea" NOT NULL DEFAULT 'MANAGEMENT',
    "dueOn" DATE,
    "ownerId" TEXT,
    "projectId" TEXT,
    "meetingId" TEXT,
    "decisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_meetings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "agenda" TEXT,
    "minutes" TEXT,
    "visibility" "CoVisibility" NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_objectives" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isKpi" BOOLEAN NOT NULL DEFAULT false,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "unit" TEXT,
    "status" "CoObjectiveStatus" NOT NULL DEFAULT 'ON_TRACK',
    "area" "CoArea" NOT NULL DEFAULT 'MANAGEMENT',
    "periodLabel" TEXT,
    "metricKey" TEXT,
    "dueOn" DATE,
    "ownerId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "co_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "area" "CoArea" NOT NULL DEFAULT 'COMPANY',
    "note" TEXT,
    "expiresOn" DATE,
    "visibility" "CoVisibility" NOT NULL DEFAULT 'ALL',
    "projectId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "co_companies_archived_sortOrder_idx" ON "co_companies"("archived", "sortOrder");

-- CreateIndex
CREATE INDEX "co_members_companyId_active_idx" ON "co_members"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "co_members_companyId_userId_key" ON "co_members"("companyId", "userId");

-- CreateIndex
CREATE INDEX "co_shareholders_companyId_idx" ON "co_shareholders"("companyId");

-- CreateIndex
CREATE INDEX "co_projects_companyId_status_sortOrder_idx" ON "co_projects"("companyId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "co_milestones_projectId_sortOrder_idx" ON "co_milestones"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "co_tasks_companyId_status_dueOn_idx" ON "co_tasks"("companyId", "status", "dueOn");

-- CreateIndex
CREATE INDEX "co_tasks_companyId_assigneeId_status_idx" ON "co_tasks"("companyId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "co_tasks_projectId_sortOrder_idx" ON "co_tasks"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "co_tasks_companyId_templateKey_key" ON "co_tasks"("companyId", "templateKey");

-- CreateIndex
CREATE INDEX "co_task_dependencies_dependsOnId_idx" ON "co_task_dependencies"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "co_task_dependencies_taskId_dependsOnId_key" ON "co_task_dependencies"("taskId", "dependsOnId");

-- CreateIndex
CREATE INDEX "co_checklist_items_taskId_sortOrder_idx" ON "co_checklist_items"("taskId", "sortOrder");

-- CreateIndex
CREATE INDEX "co_comments_taskId_createdAt_idx" ON "co_comments"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "co_comments_issueId_createdAt_idx" ON "co_comments"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "co_issues_companyId_status_severity_idx" ON "co_issues"("companyId", "status", "severity");

-- CreateIndex
CREATE INDEX "co_decisions_companyId_decidedOn_idx" ON "co_decisions"("companyId", "decidedOn");

-- CreateIndex
CREATE INDEX "co_decision_revisions_decisionId_createdAt_idx" ON "co_decision_revisions"("decisionId", "createdAt");

-- CreateIndex
CREATE INDEX "co_questions_companyId_status_dueOn_idx" ON "co_questions"("companyId", "status", "dueOn");

-- CreateIndex
CREATE INDEX "co_meetings_companyId_heldAt_idx" ON "co_meetings"("companyId", "heldAt");

-- CreateIndex
CREATE INDEX "co_objectives_companyId_sortOrder_idx" ON "co_objectives"("companyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "co_objectives_companyId_metricKey_key" ON "co_objectives"("companyId", "metricKey");

-- CreateIndex
CREATE INDEX "co_documents_companyId_area_idx" ON "co_documents"("companyId", "area");

-- AddForeignKey
ALTER TABLE "co_members" ADD CONSTRAINT "co_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_shareholders" ADD CONSTRAINT "co_shareholders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_projects" ADD CONSTRAINT "co_projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_projects" ADD CONSTRAINT "co_projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "co_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_milestones" ADD CONSTRAINT "co_milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "co_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_tasks" ADD CONSTRAINT "co_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_tasks" ADD CONSTRAINT "co_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "co_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_tasks" ADD CONSTRAINT "co_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "co_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_tasks" ADD CONSTRAINT "co_tasks_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "co_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_tasks" ADD CONSTRAINT "co_tasks_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "co_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_task_dependencies" ADD CONSTRAINT "co_task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "co_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_task_dependencies" ADD CONSTRAINT "co_task_dependencies_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "co_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_checklist_items" ADD CONSTRAINT "co_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "co_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_comments" ADD CONSTRAINT "co_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "co_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_comments" ADD CONSTRAINT "co_comments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "co_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_comments" ADD CONSTRAINT "co_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "co_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_issues" ADD CONSTRAINT "co_issues_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_issues" ADD CONSTRAINT "co_issues_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "co_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_issues" ADD CONSTRAINT "co_issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "co_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_issues" ADD CONSTRAINT "co_issues_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "co_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_decisions" ADD CONSTRAINT "co_decisions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_decisions" ADD CONSTRAINT "co_decisions_deciderId_fkey" FOREIGN KEY ("deciderId") REFERENCES "co_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_decisions" ADD CONSTRAINT "co_decisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "co_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_decisions" ADD CONSTRAINT "co_decisions_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "co_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_decisions" ADD CONSTRAINT "co_decisions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "co_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_decision_revisions" ADD CONSTRAINT "co_decision_revisions_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "co_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_questions" ADD CONSTRAINT "co_questions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_questions" ADD CONSTRAINT "co_questions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "co_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_questions" ADD CONSTRAINT "co_questions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "co_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_questions" ADD CONSTRAINT "co_questions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "co_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_questions" ADD CONSTRAINT "co_questions_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "co_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_meetings" ADD CONSTRAINT "co_meetings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_objectives" ADD CONSTRAINT "co_objectives_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_objectives" ADD CONSTRAINT "co_objectives_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "co_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_documents" ADD CONSTRAINT "co_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "co_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_documents" ADD CONSTRAINT "co_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "co_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_documents" ADD CONSTRAINT "co_documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "co_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
