import type { NextResponse } from 'next/server'

import { handleDelete, handleUpdate } from '@/lib/services/companyOs/routeHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ resource: string; id: string }> }

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const { resource, id } = await params
  return handleUpdate(request, resource, id)
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const { resource, id } = await params
  return handleDelete(request, resource, id)
}
