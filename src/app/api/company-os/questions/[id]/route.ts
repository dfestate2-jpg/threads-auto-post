import type { NextResponse } from 'next/server'

import { handleDelete, handleUpdate } from '@/lib/services/companyOs/routeHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * /api/company-os/questions/:id
 * この階層には静的セグメント（questions）があるため、汎用の [resource] ルートには
 * 解決されない。処理そのものは routeHandlers を共有している。
 */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  return handleUpdate(request, 'questions', id)
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  return handleDelete(request, 'questions', id)
}
