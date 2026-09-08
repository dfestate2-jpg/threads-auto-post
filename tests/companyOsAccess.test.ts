import { describe, expect, it } from 'vitest'

import { atLeast, canEdit, canManageCompany, canSee, fallbackRole, visibilityFilter } from '@/lib/company-os/access'

describe('atLeast', () => {
  it('経営者はすべての権限を満たす', () => {
    expect(atLeast('OWNER', 'ADMIN')).toBe(true)
    expect(atLeast('OWNER', 'VIEWER')).toBe(true)
  })

  it('閲覧のみは何も満たさない', () => {
    expect(atLeast('VIEWER', 'MEMBER')).toBe(false)
    expect(atLeast('VIEWER', 'VIEWER')).toBe(true)
  })
})

describe('fallbackRole', () => {
  it('ログインアカウントの役割から引き継ぐ', () => {
    expect(fallbackRole('ADMIN')).toBe('ADMIN')
    expect(fallbackRole('MANAGER')).toBe('MANAGER')
    expect(fallbackRole('STAFF')).toBe('MEMBER')
  })
})

describe('canEdit / canManageCompany', () => {
  it('閲覧のみは編集できない', () => {
    expect(canEdit('VIEWER')).toBe(false)
    expect(canEdit('MEMBER')).toBe(true)
  })

  it('会社の骨格を触れるのは管理者以上だけ', () => {
    expect(canManageCompany('MANAGER')).toBe(false)
    expect(canManageCompany('ADMIN')).toBe(true)
    expect(canManageCompany('OWNER')).toBe(true)
  })
})

describe('canSee', () => {
  it('全員公開は誰でも見える', () => {
    expect(canSee('VIEWER', 'ALL')).toBe(true)
  })

  it('責任者以上の情報はメンバーには見せない', () => {
    expect(canSee('MEMBER', 'MANAGERS')).toBe(false)
    expect(canSee('MANAGER', 'MANAGERS')).toBe(true)
  })

  it('経営者のみの情報は責任者にも見せない', () => {
    expect(canSee('MANAGER', 'OWNERS')).toBe(false)
    expect(canSee('ADMIN', 'OWNERS')).toBe(true)
    expect(canSee('OWNER', 'OWNERS')).toBe(true)
  })
})

describe('visibilityFilter', () => {
  it('見てよい公開範囲だけを条件にする', () => {
    expect(visibilityFilter('MEMBER')).toEqual({ visibility: { in: ['ALL'] } })
    expect(visibilityFilter('MANAGER')).toEqual({ visibility: { in: ['ALL', 'MANAGERS'] } })
    expect(visibilityFilter('OWNER')).toEqual({ visibility: { in: ['ALL', 'MANAGERS', 'OWNERS'] } })
  })
})
