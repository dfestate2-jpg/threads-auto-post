/**
 * 議事録の自動仕分け。
 *
 * 会議のあと、決定事項・タスク・課題・未決事項を別々の画面に手で写すのは続かない。
 * 議事録を貼り付けたら、行の書き出しと見出しから種類を判定して振り分ける。
 *
 * Phase1 はルールで動かす（言語モデルを使わないので、鍵も通信も不要で確実に動く）。
 * Phase3 で言語モデルに置き換えるときも、出力の形（ExtractResult）は変えない。
 * 抽出結果は必ず人が確認してから登録する前提にしてある。誤読を黙って保存しないため。
 */
export type ExtractedKind = 'decision' | 'task' | 'issue' | 'question'

export interface ExtractedItem {
  kind: ExtractedKind
  text: string
  /** 「担当:○○」から拾った名前 */
  assignee: string | null
  /** 「期限:2026-10-01」「期限:10/1」から拾った日付（YYYY-MM-DD） */
  due: string | null
}

export interface ExtractResult {
  items: ExtractedItem[]
  /** どの種類にも当てはまらなかった行数。取りこぼしの目安として画面に出す */
  skipped: number
}

/** 見出し（## 決定事項 など）で以降の行の種類を切り替える */
const SECTION_RULES: { kind: ExtractedKind; patterns: RegExp[] }[] = [
  { kind: 'decision', patterns: [/決定事項/, /決めたこと/, /決議/] },
  { kind: 'task', patterns: [/タスク/, /やること/, /todo/i, /アクション/, /next\s*action/i] },
  { kind: 'issue', patterns: [/課題/, /問題点/, /リスク/] },
  { kind: 'question', patterns: [/未決/, /保留事項/, /検討事項/, /持ち帰り/] },
]

/** 行の書き出し（決定: など）。見出しより優先する */
const INLINE_RULES: { kind: ExtractedKind; patterns: RegExp[] }[] = [
  { kind: 'decision', patterns: [/^決定/, /^決まった/, /^\[決定\]/] },
  { kind: 'task', patterns: [/^タスク/, /^todo/i, /^やること/, /^アクション/, /^\[タスク\]/] },
  { kind: 'issue', patterns: [/^課題/, /^問題/, /^\[課題\]/] },
  { kind: 'question', patterns: [/^未決/, /^保留/, /^要検討/, /^\[未決\]/] },
]

const BULLET = /^[-*・●○◯•]\s*/
const NUMBERED = /^\d+[.)]\s*/
const HEADING = /^#{1,6}\s*(.+)$/
const HEADING_JA = /^【(.+)】$/

/** 「担当:山田」「@山田」 */
const ASSIGNEE = /(?:担当者?|assignee|@)\s*[:：]?\s*([^\s、,／/]{1,20})/i
/** 「期限:2026-10-01」「期限:10/1」「〜まで」 */
const DUE_ISO = /(?:期限|締切|deadline)\s*[:：]?\s*(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/i
const DUE_SHORT = /(?:期限|締切|deadline)\s*[:：]?\s*(\d{1,2})[-/月](\d{1,2})/i

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function detectSection(line: string): ExtractedKind | null {
  const heading = line.match(HEADING)?.[1] ?? line.match(HEADING_JA)?.[1] ?? null
  const target = heading ?? line
  // 見出し記号が無い場合は「決定事項」だけの行のような短い見出しに限る
  if (!heading && (target.length > 12 || !/[:：]?$/.test(target))) return null
  for (const rule of SECTION_RULES) {
    if (rule.patterns.some((p) => p.test(target))) return rule.kind
  }
  return null
}

function detectInline(line: string): { kind: ExtractedKind; rest: string } | null {
  for (const rule of INLINE_RULES) {
    if (rule.patterns.some((p) => p.test(line))) {
      const rest = line
        .replace(/^\[?(決定事項|決定|決まった|タスク|todo|やること|アクション|課題|問題点|問題|未決事項|未決|保留|要検討)\]?/i, '')
        .replace(/^\s*[:：\-—]\s*/, '')
        .trim()
      return { kind: rule.kind, rest: rest.length > 0 ? rest : line }
    }
  }
  return null
}

function extractMeta(text: string, baseYear: number): { text: string; assignee: string | null; due: string | null } {
  let assignee: string | null = null
  let due: string | null = null
  let rest = text

  const isoMatch = rest.match(DUE_ISO)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    due = `${y}-${pad(Number(m))}-${pad(Number(d))}`
    rest = rest.replace(isoMatch[0], '')
  } else {
    const shortMatch = rest.match(DUE_SHORT)
    if (shortMatch) {
      const [, m, d] = shortMatch
      due = `${baseYear}-${pad(Number(m))}-${pad(Number(d))}`
      rest = rest.replace(shortMatch[0], '')
    }
  }

  const assigneeMatch = rest.match(ASSIGNEE)
  if (assigneeMatch?.[1]) {
    assignee = assigneeMatch[1]
    rest = rest.replace(assigneeMatch[0], '')
  }

  return { text: rest.replace(/[（(]\s*[)）]/g, '').replace(/\s{2,}/g, ' ').trim(), assignee, due }
}

/**
 * 議事録を仕分ける。
 * heldAt は「10/1」のような年の無い期限を解釈するために使う。
 */
export function extractFromMinutes(minutes: string, heldAt: Date = new Date()): ExtractResult {
  const items: ExtractedItem[] = []
  let skipped = 0
  let section: ExtractedKind | null = null
  const baseYear = heldAt.getUTCFullYear()

  for (const rawLine of minutes.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    const nextSection = detectSection(line)
    if (nextSection) {
      section = nextSection
      continue
    }

    const body = line.replace(BULLET, '').replace(NUMBERED, '').trim()
    if (body.length === 0) continue

    const inline = detectInline(body)
    const kind = inline?.kind ?? section
    if (!kind) {
      skipped += 1
      continue
    }

    const meta = extractMeta(inline?.rest ?? body, baseYear)
    if (meta.text.length === 0) {
      skipped += 1
      continue
    }
    items.push({ kind, text: meta.text.slice(0, 200), assignee: meta.assignee, due: meta.due })
  }

  return { items, skipped }
}

export const EXTRACT_KIND_LABEL: Record<ExtractedKind, string> = {
  decision: '決定事項',
  task: 'タスク',
  issue: '課題',
  question: '未決事項',
}

/** 画面に出す例文。何を書けば拾えるかが分かれば、書き方は自然にそろう */
export const MINUTES_SAMPLE = `## 決定事項
・当面は2人で会社を立ち上げる
・最初のターゲットは不動産業界にする

## タスク
・営業資料のドラフトを作る 担当:山田 期限:10/15
・法人口座の申込書をそろえる 担当:佐藤

## 課題
・100社に増えたときのサポート体制が未定

## 未決事項
・料金プランを月額にするか従量にするか`
