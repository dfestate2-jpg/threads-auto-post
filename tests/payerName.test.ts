import { describe, expect, it } from 'vitest'

import { extractPayerName, payerNameKey } from '@/lib/domain/payerName'

describe('extractPayerName', () => {
  it('半角カナを全角に直し、先頭の取引種別を落とす', () => {
    expect(extractPayerName('ﾌﾘｺﾐ ｸﾗﾊｼ ｼﾞﾕﾝﾔ')).toBe('クラハシ ジユンヤ')
    expect(extractPayerName('振込 ﾔﾏﾀﾞ ﾀﾛｳ')).toBe('ヤマダ タロウ')
    expect(extractPayerName('振込入金　ｲｼﾞﾏ ﾂｶｻ')).toBe('イジマ ツカサ')
  })

  it('取引種別が無い摘要はそのまま整形するだけ', () => {
    expect(extractPayerName('ﾀﾞｲｷｮｳｱﾅﾌﾞｷ')).toBe('ダイキョウアナブキ')
    expect(extractPayerName('ウベハウスヒガシニホン')).toBe('ウベハウスヒガシニホン')
  })

  it('既定では法人格の略号を落とす（既存シートの入金者欄に合わせる）', () => {
    expect(extractPayerName('ﾌﾘｺﾐ ｶ)ﾀﾏﾎｰﾑ')).toBe('タマホーム')
    expect(extractPayerName('ﾔﾏﾀﾞｼｮｳｼﾞ(ｶ')).toBe('ヤマダショウジ')
    expect(extractPayerName('ﾕ)ｻｸﾗﾘﾋﾞﾝｸﾞ')).toBe('サクラリビング')
  })

  it('expand を指定すると正式名称へ展開する', () => {
    expect(extractPayerName('ｶ)ﾀﾏﾎｰﾑ', { corporate: 'expand' })).toBe('株式会社タマホーム')
    expect(extractPayerName('ﾔﾏﾀﾞｼｮｳｼﾞ(ｶ', { corporate: 'expand' })).toBe('ヤマダショウジ株式会社')
  })

  it('keep を指定すると略号に触らない', () => {
    expect(extractPayerName('ｶ)ﾀﾏﾎｰﾑ', { corporate: 'keep' })).toBe('カ)タマホーム')
  })

  it('削り切って空になる摘要は、元の摘要を残す（入金者欄を空にしない）', () => {
    expect(extractPayerName('ﾌﾘｺﾐ')).toBe('フリコミ')
    expect(extractPayerName('振込')).toBe('振込')
  })

  it('空文字は空文字のまま', () => {
    expect(extractPayerName('')).toBe('')
    expect(extractPayerName('   ')).toBe('')
  })

  it('末尾の取扱情報を落とす', () => {
    expect(extractPayerName('ﾔﾏﾀﾞ ﾀﾛｳ ATM')).toBe('ヤマダ タロウ')
  })
})

describe('payerNameKey', () => {
  it('空白と大小文字の差を無視する（人がシートを編集していても突合できる）', () => {
    expect(payerNameKey('クラハシ　ジユンヤ')).toBe(payerNameKey('クラハシ ジユンヤ'))
    expect(payerNameKey('ABC商事')).toBe(payerNameKey('ａｂｃ商事'))
  })

  it('異なる名義は異なるキーになる', () => {
    expect(payerNameKey('タマホーム')).not.toBe(payerNameKey('タマホームズ'))
  })
})
