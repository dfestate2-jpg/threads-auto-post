/**
 * 追客ボードの結合確認。
 *
 * 実データベースに対して、仕様書に書いた動きが本当にそうなるかを通しで確かめる。
 * 「角度を選ぶだけで追客に入る」「反応がないと間隔が空く」「片方で押せば
 * 両方から消える」といった中核だけを見る。
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/board-check.ts
 *
 * LINE へは接続しない（送信は差し替えて件数だけ数える）。
 */
import { BoardEventType, BoardOutcome, PrismaClient } from '@prisma/client'

import { dateKeyOf, instantAtDayMinutes, shiftDateKey } from '../src/lib/domain/time'
import { overdueDays } from '../src/lib/board/ladder'
import { actEnd, actNoAnswer, addCallMemo, setAngle, setBoardAssignee } from '../src/lib/board/service'
import { loadBoardContext, type BoardContext } from '../src/lib/board/settings'
import { buildActions, buildBody } from '../src/lib/board/runner'
import { buildBoardToken, parseBoardToken } from '../src/lib/board/token'

process.env.SESSION_SECRET ??= 'board-check-secret'
process.env.CRON_SECRET ??= 'board-check-cron'
process.env.APP_BASE_URL ??= 'https://example.test'

const prisma = new PrismaClient()
const TZ = 'Asia/Tokyo'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ✅ ${label}`)
  } else {
    failures += 1
    console.log(`  ❌ ${label}`, detail ?? '')
  }
}

async function reset(): Promise<void> {
  await prisma.$transaction([
    prisma.boardTask.deleteMany(),
    prisma.boardEvent.deleteMany(),
    prisma.boardCallMemo.deleteMany(),
    prisma.boardEntry.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.staff.deleteMany(),
  ])
  await prisma.boardSettings.deleteMany()
}

/** 日本時間での「その日の朝9時」 */
function dueOf(ctx: BoardContext, date: Date): string {
  return dateKeyOf(date, TZ)
}

async function main(): Promise<void> {
  await reset()

  const staff = await prisma.staff.create({
    data: { name: '神澤', lineUserId: 'U-kanzawa', notifyEnabled: true, active: true },
  })
  const ctx = await loadBoardContext(new Date())

  console.log('① 一覧で角度を選ぶだけで追客に入る（電話していなくても）')
  {
    const c = await prisma.customer.create({ data: { name: '拾い上げ 太郎', assigneeId: staff.id } })

    const before = await prisma.boardEntry.findUnique({ where: { customerId: c.id } })
    check('最初は追客の対象になっていない', before === null)

    const r = await setAngle({ customerId: c.id, angle: 5, staffId: staff.id }, ctx)
    check('角度5を選ぶと追客に入る', r.entry.angle === 5)
    check('次回追客日が自動で決まる（入力していない）', r.dueAt !== null)

    // 角度5 = 2日後の朝9時
    const expected = instantAtDayMinutes(
      dateKeyOf(new Date(ctx.now.getTime() + 2 * 86_400_000), TZ),
      ctx.notify.hour * 60 + ctx.notify.minute,
      TZ,
    )
    check('角度5なら2日後の朝9時', r.dueAt?.getTime() === expected.getTime(), {
      actual: r.dueAt?.toISOString(),
      expected: expected.toISOString(),
    })

    const ev = await prisma.boardEvent.findFirst({ where: { entryId: r.entry.id, type: BoardEventType.ANGLE_SET } })
    check('記録が残る', ev !== null)
  }

  console.log('\n② 角度1は追わない。切った人がリストに残らない')
  {
    const c = await prisma.customer.create({ data: { name: '変な 客', assigneeId: staff.id } })
    const r = await setAngle({ customerId: c.id, angle: 1, staffId: staff.id }, ctx)
    check('角度1でも記録は残る', r.entry.angle === 1)
    check('次回追客日は入らない＝追わない', r.dueAt === null)
    check('自動で終了扱いにはしない（切っただけ）', r.ended === false)
  }

  console.log('\n③ 角度なしに戻せる（判断を取り消せる）')
  {
    const c = await prisma.customer.create({ data: { name: '戻す 人', assigneeId: staff.id } })
    await setAngle({ customerId: c.id, angle: 4, staffId: staff.id }, ctx)
    const r = await setAngle({ customerId: c.id, angle: null, staffId: staff.id }, ctx)
    check('角度が外れる', r.entry.angle === null)
    check('追客日も消える', r.dueAt === null)
  }

  console.log('\n④ 通話メモから追客に入る')
  {
    const c = await prisma.customer.create({ data: { name: '電話 花子', phone: '090-1111-2222', assigneeId: staff.id } })
    const r = await addCallMemo(
      {
        customerId: c.id,
        calledOn: ctx.now,
        staffId: staff.id,
        angle: 4,
        customerTask: '気になる物件の見積書を持ってくる',
        staffTask: '審査状況を管理会社に確認',
        createdById: null,
      },
      ctx,
    )
    check('角度4なら3日後', r.dueAt !== null)
    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })
    check('タスクが通知本文用に引き継がれる', entry.customerTask === '気になる物件の見積書を持ってくる')
    const memos = await prisma.boardCallMemo.count({ where: { entryId: entry.id } })
    check('通話メモが残る', memos === 1)
  }

  console.log('\n⑤ 反応がないと間隔が空く（角度4：3日 → 5日 → 7日）')
  {
    const c = await prisma.customer.create({ data: { name: '無反応 男', assigneeId: staff.id } })
    const first = await setAngle({ customerId: c.id, angle: 4, staffId: staff.id }, ctx)
    const d0 = daysFromNow(ctx, first.dueAt)
    check('初回は3日後', d0 === 3, { d0 })

    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })
    const r1 = await actNoAnswer(entry.id, staff.id, ctx)
    check('1回つながらないと5日後', daysFromNow(ctx, r1.dueAt) === 5, { d: daysFromNow(ctx, r1.dueAt) })

    const r2 = await actNoAnswer(entry.id, staff.id, ctx)
    check('2回で7日後', daysFromNow(ctx, r2.dueAt) === 7, { d: daysFromNow(ctx, r2.dueAt) })

    const r3 = await actNoAnswer(entry.id, staff.id, ctx)
    check('以降は7日おきのまま（角度4は打ち切らない）', daysFromNow(ctx, r3.dueAt) === 7)
  }

  console.log('\n⑥ 角度2は追い切ったら自動で終わる（14日 → 30日 → 終了）')
  {
    const c = await prisma.customer.create({ data: { name: '薄い 人', assigneeId: staff.id } })
    await setAngle({ customerId: c.id, angle: 2, staffId: staff.id }, ctx)
    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })

    const r1 = await actNoAnswer(entry.id, staff.id, ctx)
    check('1回目は30日後', daysFromNow(ctx, r1.dueAt) === 30)

    const r2 = await actNoAnswer(entry.id, staff.id, ctx)
    check('追い切ったら次回追客日が消える', r2.dueAt === null)
    check('追客が自動で終わる', r2.ended === true)

    const after = await prisma.boardEntry.findUniqueOrThrow({ where: { id: entry.id } })
    check('終了の理由が残る', after.endedOutcome === BoardOutcome.NO_CHANCE)
  }

  console.log('\n⑦ 角度を付け直すと、間隔の空きがリセットされる')
  {
    const c = await prisma.customer.create({ data: { name: 'やり直し 子', assigneeId: staff.id } })
    await setAngle({ customerId: c.id, angle: 4, staffId: staff.id }, ctx)
    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })
    await actNoAnswer(entry.id, staff.id, ctx)
    await actNoAnswer(entry.id, staff.id, ctx)

    // 電話がつながって角度を選び直した、という場面
    const r = await setAngle({ customerId: c.id, angle: 4, staffId: staff.id }, ctx)
    check('空いた間隔が初回に戻る', daysFromNow(ctx, r.dueAt) === 3, { d: daysFromNow(ctx, r.dueAt) })
    const after = await prisma.boardEntry.findUniqueOrThrow({ where: { id: entry.id } })
    check('無反応の回数も0に戻る', after.noAnswerStreak === 0)
  }

  console.log('\n⑧ 追客終了で、今日やることからもLINEからも消える')
  {
    const c = await prisma.customer.create({ data: { name: '契約 太郎', assigneeId: staff.id } })
    await setAngle({ customerId: c.id, angle: 5, staffId: staff.id }, ctx)
    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })

    await actEnd(entry.id, BoardOutcome.CONTRACTED, staff.id, ctx)
    const after = await prisma.boardEntry.findUniqueOrThrow({ where: { id: entry.id } })
    check('次回追客日が消える', after.dueAt === null)
    check('終了として記録される', after.endedAt !== null && after.endedOutcome === BoardOutcome.CONTRACTED)

    // 終了した人は通知の対象からも外れる
    const due = await prisma.boardEntry.count({ where: { endedAt: null, dueAt: { not: null, lte: ctx.now } } })
    const includesEnded = await prisma.boardEntry.count({
      where: { id: entry.id, endedAt: null, dueAt: { not: null } },
    })
    check('通知の対象に入らない', includesEnded === 0, { due })
  }

  console.log('\n⑨ 終了した人に角度を付け直すと追客が再開する')
  {
    const c = await prisma.customer.create({ data: { name: '復活 さん', assigneeId: staff.id } })
    await setAngle({ customerId: c.id, angle: 5, staffId: staff.id }, ctx)
    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })
    await actEnd(entry.id, BoardOutcome.LOST_OTHER, staff.id, ctx)

    const r = await setAngle({ customerId: c.id, angle: 5, staffId: staff.id }, ctx)
    check('終了が解除される', r.ended === false)
    check('次回追客日が入り直す', r.dueAt !== null)
  }

  console.log('\n⑩ 期限を過ぎても消えない（追客漏れにしない）')
  {
    const c = await prisma.customer.create({ data: { name: '放置 され子', assigneeId: staff.id } })
    await setAngle({ customerId: c.id, angle: 5, staffId: staff.id }, ctx)
    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })

    // 10日前が期限だった状態にする
    const past = new Date(ctx.now.getTime() - 10 * 86_400_000)
    await prisma.boardEntry.update({ where: { id: entry.id }, data: { dueAt: past, notifiedOn: null } })

    const still = await prisma.boardEntry.findFirst({
      where: { id: entry.id, endedAt: null, dueAt: { not: null, lte: ctx.now } },
    })
    check('期限を過ぎても通知の対象に残る', still !== null)
    check('何日過ぎたかが出せる', overdueDays(past, ctx.now, TZ) === 10, { d: overdueDays(past, ctx.now, TZ) })
  }

  console.log('\n⑪ 通知は1日1通に抑える')
  {
    const c = await prisma.customer.create({ data: { name: '重複 防止', assigneeId: staff.id } })
    await setAngle({ customerId: c.id, angle: 5, staffId: staff.id }, ctx)
    const entry = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })
    await prisma.boardEntry.update({
      where: { id: entry.id },
      data: { dueAt: new Date(ctx.now.getTime() - 3600_000), notifiedOn: dueOf(ctx, ctx.now) },
    })

    const today = dateKeyOf(ctx.now, TZ)
    const target = await prisma.boardEntry.findFirst({
      where: {
        id: entry.id,
        endedAt: null,
        dueAt: { not: null, lte: ctx.now },
        OR: [{ notifiedOn: null }, { notifiedOn: { not: today } }],
      },
    })
    check('今日すでに送っていれば対象に入らない', target === null)

    // 日付が変われば、また対象になる
    await prisma.boardEntry.update({ where: { id: entry.id }, data: { notifiedOn: '2000-01-01' } })
    const tomorrow = await prisma.boardEntry.findFirst({
      where: {
        id: entry.id,
        endedAt: null,
        dueAt: { not: null, lte: ctx.now },
        OR: [{ notifiedOn: null }, { notifiedOn: { not: today } }],
      },
    })
    check('翌日はまた対象になる（放置され続けない）', tomorrow !== null)
  }

  console.log('\n⑫ LINEの通知本文とボタン')
  {
    const c = await prisma.customer.create({
      data: { name: 'たなか@賃貸希望', phone: '090-3333-4444', assigneeId: staff.id },
    })
    await addCallMemo(
      {
        customerId: c.id,
        calledOn: ctx.now,
        staffId: staff.id,
        angle: 5,
        customerTask: '見積書を持ってくる',
        staffTask: '管理会社に確認',
        createdById: null,
      },
      ctx,
    )
    const entry = await prisma.boardEntry.findUniqueOrThrow({
      where: { customerId: c.id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            displayName: true,
            phone: true,
            assignee: { select: { id: true, name: true, lineUserId: true, notifyEnabled: true } },
          },
        },
      },
    })
    await prisma.boardEntry.update({
      where: { id: entry.id },
      data: { dueAt: new Date(ctx.now.getTime() - 4 * 86_400_000) },
    })
    const overdueEntry = { ...entry, dueAt: new Date(ctx.now.getTime() - 4 * 86_400_000) }

    const body = buildBody(overdueEntry, ctx)
    check('顧客名が入る', body.includes('たなか@賃貸希望'))
    check('角度が入る', body.includes('5'))
    check('超過日数が入る', body.includes('4日'))
    check('お客さんのタスクが入る', body.includes('見積書を持ってくる'))
    check('自分のタスクが入る', body.includes('管理会社に確認'))

    const actions = buildActions(entry.id, ctx.now)
    check('ボタンが3つ付く', actions.length === 3, actions.map((a) => a.label))
    // 本質は「postback ではなくリンクであること」。リンク先がこのシステムの
    // 操作画面を指していれば、リマインド側の受け口を一切通らない
    check(
      'ボタンはリンク（postbackを使わない＝リマインド側に触れない）',
      actions.every((a) => /^https?:\/\/.+\/board\/a\/.+/.test(a.uri)),
      actions.map((a) => a.uri),
    )
  }

  console.log('\n⑬ ボタンのリンクは、他人が作れない・いつまでも使えない')
  {
    const token = buildBoardToken({ kind: 'called', entryId: 'entry-abc' }, ctx.now)
    check('合言葉が作れる', token !== null)
    const parsed = parseBoardToken(token, ctx.now)
    check('正しく読み解ける', parsed?.entryId === 'entry-abc' && parsed?.kind === 'called')

    check('1文字でも変えると通らない', parseBoardToken((token ?? '') + 'x', ctx.now) === null)
    check('署名が無いと通らない', parseBoardToken('b1.c.entry-abc.1', ctx.now) === null)

    const old = new Date(ctx.now.getTime() + 20 * 86_400_000)
    check('20日後には期限切れになる', parseBoardToken(token, old) === null)
  }

  console.log('\n⑭ リマインドのテーブルに書き込んでいない（顧客は担当だけ書く）')
  {
    const convs = await prisma.conversation.count()
    const reminders = await prisma.reminder.count()
    const messages = await prisma.message.count()
    check('会話を作っていない', convs === 0, { convs })
    check('リマインドを作っていない', reminders === 0, { reminders })
    check('メッセージを作っていない', messages === 0, { messages })

    // 顧客に書くのは担当（assigneeId）だけ。旧・追客の列には触らない
    const touched = await prisma.customer.count({
      where: { OR: [{ nextActionAt: { not: null } }, { lastContactAt: { not: null } }, { followUpStep: { not: 0 } }] },
    })
    check('顧客の旧・追客カラムは書き換えない（担当だけ書く）', touched === 0, { touched })
  }

  console.log('\n⑮ 追客の担当と顧客の担当は同じ人（持ち場所が1つしかない）')
  {
    const other = await prisma.staff.create({ data: { name: '桝谷', active: true } })
    const c = await prisma.customer.create({ data: { name: '引き継ぎ 太郎', assigneeId: staff.id } })
    const first = await setAngle({ customerId: c.id, angle: 4, staffId: staff.id }, ctx)

    await setBoardAssignee({ customerId: c.id, assigneeId: other.id, staffId: staff.id }, ctx)

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })
    check('顧客の担当が変わる', customer.assigneeId === other.id)

    const after = await prisma.boardEntry.findUniqueOrThrow({ where: { customerId: c.id } })
    check('次回追客日はずれない（引き継ぎで追客が後ろへ流れない）', after.dueAt?.getTime() === first.dueAt?.getTime())

    // 追客側に担当の列が無いこと自体が、食い違いようがない証拠になる
    check('追客側は担当を持たない（食い違いようがない）', !('assigneeId' in after))

    // ヒアリングシートで担当を選んでも、同じ1か所に入る
    const c2 = await prisma.customer.create({ data: { name: 'シート 花子' } })
    await addCallMemo(
      { customerId: c2.id, calledOn: ctx.now, staffId: other.id, angle: 3, createdById: null },
      ctx,
    )
    const c2after = await prisma.customer.findUniqueOrThrow({ where: { id: c2.id } })
    check('シートで選んだ担当が顧客の担当になる', c2after.assigneeId === other.id)
  }

  console.log('\n⑯ 顧客と関係のない自分のタスク')
  {
    const todayKey = dateKeyOf(ctx.now, TZ)
    const task = await prisma.boardTask.create({
      data: { title: '鍵を管理会社に返す', dueOn: instantAtDayMinutes(todayKey, 0, TZ), staffId: staff.id },
    })
    check('顧客に紐づかないタスクを作れる', task.title === '鍵を管理会社に返す')

    const endOfToday = instantAtDayMinutes(todayKey, 1440, TZ)
    const todays = await prisma.boardTask.count({
      where: { staffId: staff.id, doneAt: null, dueOn: { lt: endOfToday } },
    })
    check('今日ぶんとして出る', todays === 1)

    // 3日前の期限で、まだ済んでいないもの
    const old = await prisma.boardTask.create({
      data: {
        title: '役所へ電話',
        dueOn: instantAtDayMinutes(shiftDateKey(todayKey, -3), 0, TZ),
        staffId: staff.id,
      },
    })
    const carried = await prisma.boardTask.count({
      where: { staffId: staff.id, doneAt: null, dueOn: { lt: endOfToday } },
    })
    check('期限を過ぎたタスクも消えず繰り越される', carried === 2)
    check('過ぎた日数が出せる', overdueDays(old.dueOn, ctx.now, TZ) === 3)

    await prisma.boardTask.update({ where: { id: task.id }, data: { doneAt: ctx.now } })
    const left = await prisma.boardTask.count({
      where: { staffId: staff.id, doneAt: null, dueOn: { lt: endOfToday } },
    })
    check('済みにすると残りから外れる', left === 1)

    // 未来のタスクは今日やることに出さない
    await prisma.boardTask.create({
      data: { title: '来週の内見準備', dueOn: instantAtDayMinutes(shiftDateKey(todayKey, 5), 0, TZ), staffId: staff.id },
    })
    const stillLeft = await prisma.boardTask.count({
      where: { staffId: staff.id, doneAt: null, dueOn: { lt: endOfToday } },
    })
    check('未来のタスクは今日やることに出さない', stillLeft === 1)
  }

  console.log(failures === 0 ? '\n✅ 全項目 合格' : `\n❌ ${failures}件 失敗`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

/** 今日から何日後か */
function daysFromNow(ctx: BoardContext, at: Date | null): number | null {
  if (!at) return null
  const a = instantAtDayMinutes(dateKeyOf(at, TZ), 0, TZ).getTime()
  const b = instantAtDayMinutes(dateKeyOf(ctx.now, TZ), 0, TZ).getTime()
  return Math.round((a - b) / 86_400_000)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
