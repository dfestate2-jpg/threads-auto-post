/**
 * リソース API の実処理。
 *
 * ルートファイルから切り出してあるのは、静的セグメント（/tasks/... など）を
 * 持つルートと汎用ルート（/[resource]/...）の両方から同じ処理を呼ぶため。
 * Next.js のルート解決は後戻りしないので、静的な入口を作った時点で
 * 同じ階層の汎用ルートには落ちてこない。処理を1か所に置いて食い違いを防ぐ。
 */
import { NextResponse } from 'next/server'

import { assertSameOrigin } from '@/lib/http'
import { apiContext, requireCompany, requireCompanyAdmin, requireEditor } from './context'
import { coError, jsonSafe } from './http'
import { findResource, updateSchemaOf, type ResourceDef } from './resources'

async function prepare(request: Request, def: ResourceDef) {
  const ctx = await apiContext()
  assertSameOrigin(request)
  const company = requireCompany(ctx)
  if (def.adminOnly) requireCompanyAdmin(ctx)
  else requireEditor(ctx)
  return { ctx, company }
}

export async function handleCreate(request: Request, resource: string): Promise<NextResponse> {
  try {
    const def = findResource(resource)
    if (!def?.create) return NextResponse.json({ error: '不明なリソースです' }, { status: 404 })
    const { ctx, company } = await prepare(request, def)

    const input = def.schema.parse(await request.json())
    const created = await def.create(ctx, company.id, input as never)
    return NextResponse.json({ ok: true, data: jsonSafe(created) }, { status: 201 })
  } catch (e) {
    return coError(e)
  }
}

export async function handleUpdate(request: Request, resource: string, id: string): Promise<NextResponse> {
  try {
    const def = findResource(resource)
    if (!def?.update) return NextResponse.json({ error: '不明なリソースです' }, { status: 404 })
    const { ctx, company } = await prepare(request, def)

    const input = updateSchemaOf(def).parse(await request.json())
    const updated = await def.update(ctx, company.id, id, input as never)
    if (!updated) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true, data: jsonSafe(updated) })
  } catch (e) {
    return coError(e)
  }
}

export async function handleDelete(request: Request, resource: string, id: string): Promise<NextResponse> {
  try {
    const def = findResource(resource)
    if (!def?.remove) return NextResponse.json({ error: '不明なリソースです' }, { status: 404 })
    const { company } = await prepare(request, def)

    const removed = await def.remove(company.id, id)
    if (!removed) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return coError(e)
  }
}
