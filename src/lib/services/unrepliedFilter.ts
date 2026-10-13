import { HandlingStatus, type Prisma, ReplyState } from '@prisma/client'

/** 未返信一覧のURLパラメータ。画面と一括処理で同じものを受け取る */
export interface UnrepliedFilterParams {
  status?: string | undefined
  assignee?: string | undefined
  /** '0' のときだけ返信済みも含める */
  awaiting?: string | undefined
  q?: string | undefined
  /** 「3時間以上未返信だけ」のような絞り込み（分） */
  over?: string | undefined
}

export interface UnrepliedFilter {
  where: Prisma.ConversationWhereInput
  /** 画面に出す絞り込みの説明。一括処理の確認文にそのまま使う */
  description: string
}

/**
 * 未返信一覧の絞り込み条件を作る。
 *
 * **画面と一括処理で必ず同じ関数を使う。** 別々に組むと、表示している件数と
 * まとめて閉じる件数が食い違い、**見えていないものを閉じる**事故になる。
 * この一覧は「顧客を待たせていないか」を見る画面で、閉じる操作は
 * リマインドを止める確定操作なので、ここのズレは静かに人を放置させる。
 */
export function buildUnrepliedFilter(params: UnrepliedFilterParams, now: Date): UnrepliedFilter {
  const onlyAwaiting = params.awaiting !== '0'
  const status = params.status as HandlingStatus | undefined
  const assigneeId = params.assignee
  const q = params.q?.trim()
  const overMinutes = Number(params.over) > 0 ? Number(params.over) : null

  /**
   * 顧客側の条件は1つの `customer` にまとめる。
   * 担当者の絞り込みと検索を別々に書くと、後から広げたほうが
   * 前の条件を**黙って上書きする**（担当者で絞ったつもりが全員になる）。
   */
  const customerConditions: Prisma.CustomerWhereInput[] = []
  if (assigneeId) customerConditions.push({ assigneeId: assigneeId === 'none' ? null : assigneeId })
  if (q) {
    customerConditions.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { lineUserId: { contains: q } },
      ],
    })
  }

  const where: Prisma.ConversationWhereInput = {
    ...(onlyAwaiting ? { replyState: ReplyState.AWAITING } : {}),
    ...(overMinutes
      ? { firstUnrepliedAt: { not: null, lte: new Date(now.getTime() - overMinutes * 60_000) } }
      : {}),
    ...(status ? { handlingStatus: status } : {}),
    ...(customerConditions.length > 0 ? { customer: { AND: customerConditions } } : {}),
  }

  const parts: string[] = []
  if (onlyAwaiting) parts.push('未返信')
  if (overMinutes) parts.push(`${overMinutes}分以上経過`)
  if (status) parts.push(`状況=${status}`)
  if (assigneeId) parts.push(assigneeId === 'none' ? '担当者なし' : '担当者で絞り込み中')
  if (q) parts.push(`検索「${q}」`)

  return { where, description: parts.length > 0 ? parts.join(' / ') : 'すべて' }
}
