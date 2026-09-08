/**
 * 横断検索。
 *
 * 「あの話どこに書いたっけ」を1か所で解決するための機能。
 * 種類ごとに別々の画面を探しに行かせない。
 */
import type { CoRole } from '@prisma/client'

import { visibilityFilter } from '@/lib/company-os/access'
import { prisma } from '@/lib/prisma'

export type SearchKind = 'task' | 'project' | 'issue' | 'decision' | 'question' | 'meeting' | 'document' | 'member'

export interface SearchHit {
  kind: SearchKind
  id: string
  title: string
  snippet: string | null
  href: string
  meta: string | null
}

export const KIND_LABEL: Record<SearchKind, string> = {
  task: 'タスク',
  project: 'プロジェクト',
  issue: '経営課題',
  decision: '意思決定',
  question: '未決事項',
  meeting: '会議ログ',
  document: '書類',
  member: 'メンバー',
}

const ROOT = '/company-os'
const PER_KIND = 8

/** 前後を少し残して抜き出す。全文を出すと一覧が読めなくなる */
function snippetOf(text: string | null, query: string, length = 90): string | null {
  if (!text) return null
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return text.slice(0, length) + (text.length > length ? '…' : '')
  const start = Math.max(0, index - 30)
  const excerpt = text.slice(start, start + length)
  return `${start > 0 ? '…' : ''}${excerpt}${start + length < text.length ? '…' : ''}`
}

export async function searchAll(companyId: string, role: CoRole, rawQuery: string): Promise<SearchHit[]> {
  const query = rawQuery.trim()
  if (query.length === 0) return []
  const like = { contains: query, mode: 'insensitive' as const }

  const [tasks, projects, issues, decisions, questions, meetings, documents, members] = await Promise.all([
    prisma.coTask.findMany({
      where: { companyId, OR: [{ title: like }, { description: like }, { relatedCustomer: like }] },
      select: { id: true, title: true, description: true, status: true, dueOn: true },
      take: PER_KIND,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.coProject.findMany({
      where: { companyId, OR: [{ name: like }, { description: like }] },
      select: { id: true, name: true, description: true, status: true },
      take: PER_KIND,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.coIssue.findMany({
      where: {
        companyId,
        ...visibilityFilter(role),
        OR: [{ title: like }, { detail: like }, { cause: like }, { countermeasure: like }],
      },
      select: { id: true, title: true, detail: true, status: true },
      take: PER_KIND,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.coDecision.findMany({
      where: {
        companyId,
        ...visibilityFilter(role),
        OR: [{ title: like }, { background: like }, { reason: like }],
      },
      select: { id: true, title: true, reason: true, decidedOn: true },
      take: PER_KIND,
      orderBy: { decidedOn: 'desc' },
    }),
    prisma.coQuestion.findMany({
      where: { companyId, OR: [{ title: like }, { point: like }, { recommendation: like }] },
      select: { id: true, title: true, point: true, status: true },
      take: PER_KIND,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.coMeeting.findMany({
      where: { companyId, ...visibilityFilter(role), OR: [{ title: like }, { agenda: like }, { minutes: like }] },
      select: { id: true, title: true, minutes: true, heldAt: true },
      take: PER_KIND,
      orderBy: { heldAt: 'desc' },
    }),
    prisma.coDocument.findMany({
      where: { companyId, ...visibilityFilter(role), OR: [{ name: like }, { note: like }, { location: like }] },
      select: { id: true, name: true, note: true, expiresOn: true },
      take: PER_KIND,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.coMember.findMany({
      where: { companyId, OR: [{ name: like }, { title: like }, { department: like }, { email: like }] },
      select: { id: true, name: true, title: true, department: true },
      take: PER_KIND,
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const hits: SearchHit[] = []
  for (const t of tasks) {
    hits.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      snippet: snippetOf(t.description, query),
      href: `${ROOT}/tasks/${t.id}`,
      meta: t.status,
    })
  }
  for (const p of projects) {
    hits.push({
      kind: 'project',
      id: p.id,
      title: p.name,
      snippet: snippetOf(p.description, query),
      href: `${ROOT}/projects/${p.id}`,
      meta: p.status,
    })
  }
  for (const i of issues) {
    hits.push({
      kind: 'issue',
      id: i.id,
      title: i.title,
      snippet: snippetOf(i.detail, query),
      href: `${ROOT}/issues/${i.id}`,
      meta: i.status,
    })
  }
  for (const d of decisions) {
    hits.push({
      kind: 'decision',
      id: d.id,
      title: d.title,
      snippet: snippetOf(d.reason, query),
      href: `${ROOT}/decisions`,
      meta: d.decidedOn.toISOString().slice(0, 10),
    })
  }
  for (const q of questions) {
    hits.push({
      kind: 'question',
      id: q.id,
      title: q.title,
      snippet: snippetOf(q.point, query),
      href: `${ROOT}/questions`,
      meta: q.status,
    })
  }
  for (const m of meetings) {
    hits.push({
      kind: 'meeting',
      id: m.id,
      title: m.title,
      snippet: snippetOf(m.minutes, query),
      href: `${ROOT}/meetings/${m.id}`,
      meta: m.heldAt.toISOString().slice(0, 10),
    })
  }
  for (const d of documents) {
    hits.push({
      kind: 'document',
      id: d.id,
      title: d.name,
      snippet: snippetOf(d.note, query),
      href: `${ROOT}/company/documents`,
      meta: d.expiresOn ? `期限 ${d.expiresOn.toISOString().slice(0, 10)}` : null,
    })
  }
  for (const m of members) {
    hits.push({
      kind: 'member',
      id: m.id,
      title: m.name,
      snippet: [m.title, m.department].filter(Boolean).join(' / ') || null,
      href: `${ROOT}/company/members`,
      meta: null,
    })
  }
  return hits
}
