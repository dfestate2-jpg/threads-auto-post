import { redirect } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { BoardSettingsForm } from '@/components/board/BoardSettingsForm'
import { hasRole, requirePageSession } from '@/lib/auth/guard'
import { getBoardSettings } from '@/lib/board/settings'

export const dynamic = 'force-dynamic'

/**
 * 追客の設定。
 *
 * 触れるのは管理者だけにしてある。全員が変えられると、なぜ間隔が変わったのか
 * 誰にも分からなくなる。
 */
export default async function BoardSettingsPage() {
  const session = await requirePageSession()
  if (!hasRole(session, 'ADMIN')) redirect('/board/today')

  const s = await getBoardSettings()

  return (
    <AppShell>
      <h1 className="mb-1 text-xl font-bold">追客の設定</h1>
      <p className="mb-5 text-sm text-slate-600">
        ここの数字を変えれば、追客の動きがその場で変わります。まず使ってみて、営業感覚とズレたら直してください。
      </p>

      <div className="mx-auto max-w-2xl">
        <BoardSettingsForm
          initial={{
            angle5Ladder: s.angle5Ladder,
            angle4Ladder: s.angle4Ladder,
            angle3Ladder: s.angle3Ladder,
            angle2Ladder: s.angle2Ladder,
            angle1Ladder: s.angle1Ladder,
            notifyHour: s.notifyHour,
            notifyMinute: s.notifyMinute,
            notifyToStaff: s.notifyToStaff,
            notifyToGroup: s.notifyToGroup,
            dailyLimit: s.dailyLimit,
            askAngleAfterCall: s.askAngleAfterCall,
            messageTemplate: s.messageTemplate ?? '',
          }}
        />
      </div>
    </AppShell>
  )
}
