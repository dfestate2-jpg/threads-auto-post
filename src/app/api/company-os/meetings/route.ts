import type { NextResponse } from 'next/server'

import { handleCreate } from '@/lib/services/companyOs/routeHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** /api/company-os/meetings の新規作成 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleCreate(request, 'meetings')
}
