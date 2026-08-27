/**
 * 担当者と LINEユーザーID の紐づけ。
 *
 * 発行は管理画面から、消費は社内通知Botへの送信から。
 * 平文コードは発行時に一度だけ返し、DBにはハッシュしか残さない。
 */
import { addMinutes } from '@/lib/domain/time'
import {
  LINK_CODE_TTL_MINUTES,
  extractLinkCode,
  generateLinkCode,
  hashLinkCode,
} from '@/lib/domain/linkCode'
import { prisma } from '@/lib/prisma'

export interface IssuedLinkCode {
  code: string
  expiresAt: Date
}

/**
 * 担当者に新しい連携コードを発行する。
 * 同じ担当者の未使用コードは無効化し、常に「最後に発行した1本」だけが有効になるようにする。
 */
export async function issueLinkCode(staffId: string, now = new Date()): Promise<IssuedLinkCode> {
  const code = generateLinkCode()
  const expiresAt = addMinutes(now, LINK_CODE_TTL_MINUTES)

  await prisma.$transaction([
    prisma.staffLinkCode.deleteMany({ where: { staffId, usedAt: null } }),
    prisma.staffLinkCode.create({ data: { staffId, codeHash: hashLinkCode(code), expiresAt } }),
  ])

  return { code, expiresAt }
}

export type LinkResult =
  /** コードらしき文字列が本文に無い（＝ただの雑談。何も返さない） */
  | { status: 'NO_CODE' }
  | { status: 'NOT_FOUND' }
  | { status: 'EXPIRED' }
  | { status: 'ALREADY_USED' }
  /** 別の担当者に既に使われているLINEアカウント */
  | { status: 'ALREADY_LINKED_TO_OTHER'; staffName: string }
  | { status: 'LINKED'; staffName: string }

/**
 * 社内通知Botに届いた本文からコードを取り出し、送信者のLINEユーザーIDを担当者に紐づける。
 * 成功・失敗いずれもコードは使い捨てにする（総当たりの足がかりを残さない）。
 */
export async function consumeLinkCode(
  text: string | null | undefined,
  lineUserId: string,
  now = new Date(),
): Promise<LinkResult> {
  const code = extractLinkCode(text)
  if (!code) return { status: 'NO_CODE' }

  const record = await prisma.staffLinkCode.findUnique({
    where: { codeHash: hashLinkCode(code) },
    include: { staff: { select: { id: true, name: true } } },
  })
  if (!record) return { status: 'NOT_FOUND' }
  if (record.usedAt) return { status: 'ALREADY_USED' }
  if (record.expiresAt.getTime() <= now.getTime()) return { status: 'EXPIRED' }

  const occupied = await prisma.staff.findUnique({ where: { lineUserId }, select: { id: true, name: true } })
  if (occupied && occupied.id !== record.staffId) {
    return { status: 'ALREADY_LINKED_TO_OTHER', staffName: occupied.name }
  }

  await prisma.$transaction([
    prisma.staff.update({ where: { id: record.staffId }, data: { lineUserId } }),
    prisma.staffLinkCode.update({ where: { id: record.id }, data: { usedAt: now, usedByLineUserId: lineUserId } }),
  ])

  return { status: 'LINKED', staffName: record.staff.name }
}

/** 紐づけ結果を本人へ返す文言。reply は無料なのでメッセージ通数を消費しない */
export function linkResultMessage(result: LinkResult): string | null {
  switch (result.status) {
    case 'NO_CODE':
      return null
    case 'NOT_FOUND':
      return 'コードが見つかりませんでした。管理画面で発行し直してください。'
    case 'EXPIRED':
      return 'このコードは有効期限が切れています。管理画面で発行し直してください。'
    case 'ALREADY_USED':
      return 'このコードは既に使用済みです。管理画面で発行し直してください。'
    case 'ALREADY_LINKED_TO_OTHER':
      return `このLINEアカウントは既に「${result.staffName}」として登録されています。管理画面で確認してください。`
    case 'LINKED':
      return `「${result.staffName}」として登録しました。これから未返信のリマインドがこちらに届きます。`
  }
}
