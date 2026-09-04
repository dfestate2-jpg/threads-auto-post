-- 業務システムポータル：トップページに並べるシステムの登録先
CREATE TABLE "portal_systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🔗',
    "accent" TEXT NOT NULL DEFAULT 'slate',
    "description" TEXT,
    "url" TEXT NOT NULL,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "minRole" "UserRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_systems_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portal_systems_published_sortOrder_idx" ON "portal_systems"("published", "sortOrder");
