import { DeleteButton, RecordDialog } from '@/components/company-os/RecordDialog'
import { Badge, EmptyState, PageHeader, SectionCard, TableWrap, Td, Th } from '@/components/company-os/ui'
import { canManageCompany } from '@/lib/company-os/access'
import { memberFields } from '@/lib/company-os/formSpecs'
import { ROLE_LABEL } from '@/lib/company-os/labels'
import { listMembers } from '@/lib/services/companyOs/company'
import { requireCompanyPage } from '@/lib/services/companyOs/page'

export const dynamic = 'force-dynamic'

/**
 * 組織（メンバー）。
 * ログインアカウントが無い共同創業者や外部の担当も登録できる。
 * 「担当者を選べないからタスクを割り振れない」を作らないため。
 */
export default async function MembersPage() {
  const ctx = await requireCompanyPage()
  const members = await listMembers(ctx.company.id, { includeInactive: true })
  const canManage = canManageCompany(ctx.role)

  const addButton = canManage ? (
    <RecordDialog
      label="＋ メンバーを追加"
      title="メンバーを追加"
      resource="members"
      fields={memberFields()}
      record={{ role: 'MEMBER', active: true, isOfficer: false }}
    />
  ) : null

  return (
    <>
      <PageHeader
        title="組織"
        description="この会社に関わる人と、その権限をまとめます。ログインアカウントが無い人も登録できます。"
        action={addButton}
      />

      {members.length === 0 ? (
        <EmptyState icon="👥" title="メンバーがいません" action={addButton} />
      ) : (
        <SectionCard title={`${members.length}名`}>
          <TableWrap>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>名前</Th>
                  <Th>役職</Th>
                  <Th>部署・担当</Th>
                  <Th>権限</Th>
                  <Th>状態</Th>
                  {canManage ? <Th /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium text-slate-900">{member.name}</span>
                      {member.isOfficer ? (
                        <Badge className="ml-2 border-slate-200 bg-slate-100 text-slate-600">役員</Badge>
                      ) : null}
                      {member.email ? <div className="text-xs text-slate-400">{member.email}</div> : null}
                    </Td>
                    <Td className="whitespace-nowrap">{member.title ?? '—'}</Td>
                    <Td className="whitespace-nowrap">{member.department ?? '—'}</Td>
                    <Td className="whitespace-nowrap">{ROLE_LABEL[member.role]}</Td>
                    <Td className="whitespace-nowrap">
                      {member.active ? (
                        <span className="text-xs text-emerald-700">在籍中</span>
                      ) : (
                        <span className="text-xs text-slate-400">退任</span>
                      )}
                    </Td>
                    {canManage ? (
                      <Td className="whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-3">
                          <RecordDialog
                            label="編集"
                            title="メンバーを編集"
                            resource="members"
                            variant="link"
                            fields={memberFields()}
                            record={{
                              id: member.id,
                              name: member.name,
                              email: member.email,
                              role: member.role,
                              title: member.title,
                              department: member.department,
                              isOfficer: member.isOfficer,
                              note: member.note,
                              active: member.active,
                            }}
                          />
                          <DeleteButton
                            resource="members"
                            id={member.id}
                            confirmText={`${member.name}さんを削除します。担当していたタスクは残り、担当者だけが外れます。よろしいですか？`}
                          />
                        </span>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>
      )}
    </>
  )
}
