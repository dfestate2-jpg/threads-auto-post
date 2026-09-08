/**
 * フォームの選択肢。
 * 担当者・プロジェクト・課題の一覧は多くの画面で必要になるため、まとめて用意する。
 */
import type { Option } from '@/lib/company-os/formSpecs'
import { prisma } from '@/lib/prisma'

export interface LoadedOptions {
  members: Option[]
  projects: Option[]
  issues: Option[]
  meetings: Option[]
}

export async function loadFormOptions(companyId: string): Promise<LoadedOptions> {
  const [members, projects, issues, meetings] = await Promise.all([
    prisma.coMember.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.coProject.findMany({
      where: { companyId, status: { notIn: ['CANCELED'] } },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }],
    }),
    prisma.coIssue.findMany({
      where: { companyId, status: { notIn: ['RESOLVED'] } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.coMeeting.findMany({
      where: { companyId },
      select: { id: true, title: true },
      orderBy: { heldAt: 'desc' },
      take: 50,
    }),
  ])

  return {
    members: members.map((m) => ({ value: m.id, label: m.name })),
    projects: projects.map((p) => ({ value: p.id, label: p.name })),
    issues: issues.map((i) => ({ value: i.id, label: i.title })),
    meetings: meetings.map((m) => ({ value: m.id, label: m.title })),
  }
}
