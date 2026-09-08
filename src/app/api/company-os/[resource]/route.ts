import type { NextResponse } from 'next/server'

import { handleCreate } from '@/lib/services/companyOs/routeHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** リソースの新規作成（/api/company-os/projects など） */
export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }): Promise<NextResponse> {
  const { resource } = await params
  return handleCreate(request, resource)
}
