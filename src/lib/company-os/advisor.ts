/**
 * AI経営アシスタントの「頭」の部分。
 *
 * Phase1 ではルールで動かす。会社のデータ（タスク・課題・決定・プロジェクト・
 * 会議・数値）を1つのスナップショットにまとめ、そこから
 *   「今一番まずいのは何か」「今日やるべきことは何か」
 * を導く。
 *
 * Phase3 で言語モデルに置き換えるときも、渡すのはこの CompanySnapshot のままにする。
 * つまりここは「AIに何を見せるか」の定義でもある。ルールの結論は
 * 必ず根拠（該当件数・該当ID）とセットで返し、鵜呑みにしなくてよい形にしている。
 */
import type { CoSeverity, CoStage } from '@prisma/client'

import { daysUntilDue } from './date'
import type { ProjectHealth } from './progress'

export interface SnapshotTask {
  id: string
  title: string
  status: string
  dueOn: Date | null
  assigneeName: string | null
  assigned: boolean
  overdueDays: number
  score: number
  blocked: boolean
  area: string
  reasons: string[]
}

export interface SnapshotProject {
  id: string
  name: string
  health: ProjectHealth
  percent: number
  daysLeft: number | null
  openTaskCount: number
  overdueTaskCount: number
}

export interface SnapshotIssue {
  id: string
  title: string
  severity: CoSeverity
  status: string
  hasOwner: boolean
  hasCountermeasure: boolean
  dueOn: Date | null
}

export interface SnapshotQuestion {
  id: string
  title: string
  status: string
  dueOn: Date | null
  severity: CoSeverity
}

export interface CompanySnapshot {
  now: Date
  timezone?: string
  companyName: string
  stage: CoStage
  tasks: SnapshotTask[]
  projects: SnapshotProject[]
  issues: SnapshotIssue[]
  questions: SnapshotQuestion[]
  decisionCount: number
  lastDecisionAt: Date | null
  lastMeetingAt: Date | null
  meetingCount: number
  expiringDocuments: { id: string; name: string; expiresOn: Date | null }[]
  metrics: { key: string; label: string; unit: string; value: number | null; target: number | null }[]
  foundingPercent: number
}

export type FindingLevel = 'CRITICAL' | 'WARN' | 'INFO' | 'GOOD'

export interface Finding {
  level: FindingLevel
  title: string
  detail: string
  /** 対処するための画面 */
  href?: string
  /** 並べ替え用。大きいほど先に出す */
  weight: number
}

const ROOT = '/company-os'

/**
 * 会社の状態を診断する。
 * 「問題が無い」ときも必ず1件は返す（真っ白な結果は、壊れているのか順調なのか分からない）。
 */
export function analyze(snapshot: CompanySnapshot): Finding[] {
  const findings: Finding[] = []
  const { now, timezone } = snapshot

  const overdue = snapshot.tasks.filter((t) => t.overdueDays > 0)
  if (overdue.length > 0) {
    const worst = overdue.reduce((a, b) => (a.overdueDays >= b.overdueDays ? a : b))
    findings.push({
      level: overdue.length >= 5 || worst.overdueDays >= 7 ? 'CRITICAL' : 'WARN',
      title: `期限を過ぎたタスクが${overdue.length}件あります`,
      detail: `最も遅れているのは「${worst.title}」で${worst.overdueDays}日超過しています。期限を引き直すか、担当を替えるか、やらないと決めてください。`,
      href: `${ROOT}/tasks?view=overdue`,
      weight: 100 + overdue.length,
    })
  }

  const criticalIssues = snapshot.issues.filter((i) => i.severity === 'CRITICAL' && i.status !== 'RESOLVED')
  if (criticalIssues.length > 0) {
    findings.push({
      level: 'CRITICAL',
      title: `重大な経営課題が${criticalIssues.length}件、未解決です`,
      detail: criticalIssues
        .slice(0, 3)
        .map((i) => `「${i.title}」`)
        .join('、'),
      href: `${ROOT}/issues`,
      weight: 95,
    })
  }

  const ownerless = snapshot.issues.filter((i) => !i.hasOwner && i.status !== 'RESOLVED')
  if (ownerless.length > 0) {
    findings.push({
      level: 'WARN',
      title: `担当者のいない課題が${ownerless.length}件あります`,
      detail: '誰の課題でもない問題は、誰も解きません。まず担当を決めてください。',
      href: `${ROOT}/issues`,
      weight: 70,
    })
  }

  const noPlan = snapshot.issues.filter((i) => !i.hasCountermeasure && i.status !== 'RESOLVED')
  if (noPlan.length > 0) {
    findings.push({
      level: 'INFO',
      title: `対策が書かれていない課題が${noPlan.length}件あります`,
      detail: '原因と対策を1行でも書くと、次のタスクに落とせます。',
      href: `${ROOT}/issues`,
      weight: 40,
    })
  }

  const delayed = snapshot.projects.filter((p) => p.health === 'DELAYED')
  if (delayed.length > 0) {
    findings.push({
      level: 'CRITICAL',
      title: `遅延しているプロジェクトが${delayed.length}件あります`,
      detail: delayed
        .slice(0, 3)
        .map((p) => `「${p.name}」（進捗${p.percent}%${p.daysLeft !== null ? `・${-p.daysLeft}日超過` : ''}）`)
        .join('、'),
      href: `${ROOT}/projects`,
      weight: 90,
    })
  }

  const atRisk = snapshot.projects.filter((p) => p.health === 'AT_RISK')
  if (atRisk.length > 0) {
    findings.push({
      level: 'WARN',
      title: `予定より遅れ気味のプロジェクトが${atRisk.length}件あります`,
      detail: atRisk.map((p) => `「${p.name}」（進捗${p.percent}%）`).join('、'),
      href: `${ROOT}/projects?view=progress`,
      weight: 65,
    })
  }

  const unassigned = snapshot.tasks.filter((t) => !t.assigned)
  if (unassigned.length > 0) {
    findings.push({
      level: unassigned.length >= 10 ? 'WARN' : 'INFO',
      title: `担当者が決まっていないタスクが${unassigned.length}件あります`,
      detail: '担当が空のタスクは、期限が来ても誰も動きません。',
      href: `${ROOT}/tasks?group=assignee`,
      weight: 55,
    })
  }

  const overdueQuestions = snapshot.questions.filter((q) => {
    const days = daysUntilDue(q.dueOn, now, timezone)
    return days !== null && days < 0
  })
  if (overdueQuestions.length > 0) {
    findings.push({
      level: 'WARN',
      title: `決める期限を過ぎた未決事項が${overdueQuestions.length}件あります`,
      detail: overdueQuestions
        .slice(0, 3)
        .map((q) => `「${q.title}」`)
        .join('、') + ' — 決めないことも、決めるまでは損失です。',
      href: `${ROOT}/questions`,
      weight: 85,
    })
  } else if (snapshot.questions.length >= 5) {
    findings.push({
      level: 'INFO',
      title: `未決事項が${snapshot.questions.length}件たまっています`,
      detail: '重要度の高いものから期限を切ってください。',
      href: `${ROOT}/questions`,
      weight: 35,
    })
  }

  const blocked = snapshot.tasks.filter((t) => t.blocked)
  if (blocked.length >= 3) {
    findings.push({
      level: 'INFO',
      title: `先行タスク待ちで着手できないタスクが${blocked.length}件あります`,
      detail: '前工程を先に片付けると、まとめて動き出します。',
      href: `${ROOT}/tasks`,
      weight: 45,
    })
  }

  if (snapshot.expiringDocuments.length > 0) {
    findings.push({
      level: 'WARN',
      title: `30日以内に期限が来る書類が${snapshot.expiringDocuments.length}件あります`,
      detail: snapshot.expiringDocuments
        .slice(0, 3)
        .map((d) => `「${d.name}」`)
        .join('、'),
      href: `${ROOT}/legal/deadlines`,
      weight: 75,
    })
  }

  // 決定が記録されていない = 後から「なぜそうしたか」を誰も説明できなくなる
  if (snapshot.decisionCount === 0) {
    findings.push({
      level: 'INFO',
      title: '意思決定がまだ1件も記録されていません',
      detail: '「当面は2人で立ち上げる」「最初は○○業界を狙う」など、決めたことを残しておくと後から迷いません。',
      href: `${ROOT}/decisions`,
      weight: 30,
    })
  } else if (snapshot.lastDecisionAt) {
    const days = daysUntilDue(snapshot.lastDecisionAt, now, timezone)
    if (days !== null && -days >= 60) {
      findings.push({
        level: 'INFO',
        title: `${-days}日間、新しい意思決定が記録されていません`,
        detail: '決めているのに記録していないだけなら、後で必ず食い違います。',
        href: `${ROOT}/decisions`,
        weight: 25,
      })
    }
  }

  if ((snapshot.stage === 'IDEA' || snapshot.stage === 'PREPARING') && snapshot.foundingPercent < 100) {
    findings.push({
      level: 'INFO',
      title: `会社設立の進捗は${snapshot.foundingPercent}%です`,
      detail: '登記・法人口座・会計の3つが通ると、営業と請求が動き始めます。',
      href: `${ROOT}/company/setup`,
      weight: 50,
    })
  }

  const cash = snapshot.metrics.find((m) => m.key === 'cash_balance')
  const expense = snapshot.metrics.find((m) => m.key === 'expense_month')
  if (cash?.value !== null && cash?.value !== undefined && expense?.value) {
    const months = expense.value > 0 ? cash.value / expense.value : null
    if (months !== null && months < 6) {
      findings.push({
        level: months < 3 ? 'CRITICAL' : 'WARN',
        title: `現在のキャッシュは約${months.toFixed(1)}か月分です`,
        detail: '資金が尽きる時期から逆算して、売上・調達・コスト削減のどれで埋めるかを決めてください。',
        href: `${ROOT}/management/kpi`,
        weight: 98,
      })
    }
  }

  if (findings.length === 0) {
    findings.push({
      level: 'GOOD',
      title: '止まっているものはありません',
      detail: '期限超過・遅延プロジェクト・重大な課題はいずれもありません。次の一手に時間を使えます。',
      weight: 0,
    })
  }

  return findings.sort((a, b) => b.weight - a.weight)
}

// ---------------------------------------------------------------------------
// 質問への応答
// ---------------------------------------------------------------------------

export interface AdvisorAnswer {
  /** 経営者向けの回答本文 */
  text: string
  /** 根拠として並べるタスク */
  tasks: SnapshotTask[]
  findings: Finding[]
}

const INTENTS: { keys: string[]; intent: string }[] = [
  { keys: ['今日', 'きょう', '何をやる', '何をすべき', 'やるべき', 'todo'], intent: 'today' },
  { keys: ['課題', '問題', 'まずい', 'リスク'], intent: 'issue' },
  // 「プロジェクトは遅れている？」は期限ではなくプロジェクトの質問なので、先に判定する
  { keys: ['プロジェクト', '進捗'], intent: 'project' },
  { keys: ['期限', '危ない', '遅れ', '遅延', '超過'], intent: 'deadline' },
  { keys: ['決定', '決めた', '決まって'], intent: 'decision' },
  { keys: ['未決', '決めるべき', '決められて'], intent: 'question' },
  { keys: ['まとめ', '状況', '状態', '分析', 'サマリ', '報告'], intent: 'summary' },
  { keys: ['数字', '売上', 'キャッシュ', '資金', '経費'], intent: 'metric' },
]

export function detectIntent(question: string): string {
  const q = question.toLowerCase()
  for (const rule of INTENTS) {
    if (rule.keys.some((k) => q.includes(k))) return rule.intent
  }
  return 'summary'
}

/** 質問に答える。答えは必ず「根拠 → 結論 → 次の一手」の順で書く */
export function answer(question: string, snapshot: CompanySnapshot): AdvisorAnswer {
  const findings = analyze(snapshot)
  const intent = detectIntent(question)
  const actionable = snapshot.tasks.filter((t) => !t.blocked && t.status !== 'DONE' && t.status !== 'CANCELED')
  const top = [...actionable].sort((a, b) => b.score - a.score).slice(0, 5)

  switch (intent) {
    case 'today': {
      if (top.length === 0) {
        return { text: '今日やるべきタスクはありません。未決事項か、次の四半期の計画に時間を使えます。', tasks: [], findings }
      }
      const lines = top.map((t, i) => `${i + 1}. ${t.title}${t.reasons.length > 0 ? `（${t.reasons.join('・')}）` : ''}`)
      return {
        text: `今日はこの${top.length}件から手を付けてください。\n\n${lines.join('\n')}`,
        tasks: top,
        findings,
      }
    }
    case 'deadline': {
      const overdue = snapshot.tasks.filter((t) => t.overdueDays > 0)
      const soon = snapshot.tasks.filter((t) => {
        const days = daysUntilDue(t.dueOn, snapshot.now, snapshot.timezone)
        return days !== null && days >= 0 && days <= 3
      })
      return {
        text:
          overdue.length === 0 && soon.length === 0
            ? '期限が危ないタスクはありません。'
            : `期限超過が${overdue.length}件、3日以内の期限が${soon.length}件あります。まず超過分を片付けてください。`,
        tasks: [...overdue, ...soon].slice(0, 8),
        findings,
      }
    }
    case 'issue': {
      const critical = findings.filter((f) => f.level === 'CRITICAL')
      return {
        text:
          critical.length === 0
            ? `今すぐ手を打つべき重大な問題はありません。未解決の課題は${snapshot.issues.length}件です。`
            : `いま一番重要なのは「${critical[0]?.title}」です。\n${critical[0]?.detail ?? ''}`,
        tasks: [],
        findings,
      }
    }
    case 'project': {
      const lines = snapshot.projects.map(
        (p) => `・${p.name}：進捗${p.percent}%／未完了${p.openTaskCount}件${p.health === 'DELAYED' ? '（遅延）' : p.health === 'AT_RISK' ? '（注意）' : ''}`,
      )
      return {
        text: lines.length === 0 ? 'プロジェクトがまだ登録されていません。' : `進行中のプロジェクトは${snapshot.projects.length}件です。\n\n${lines.join('\n')}`,
        tasks: [],
        findings,
      }
    }
    case 'decision':
      return {
        text: `記録されている意思決定は${snapshot.decisionCount}件です。${snapshot.lastDecisionAt ? `直近は${snapshot.lastDecisionAt.toLocaleDateString('ja-JP')}。` : ''}決めたことは、決めた直後に残すのが一番早く、一番正確です。`,
        tasks: [],
        findings,
      }
    case 'question': {
      const lines = snapshot.questions.slice(0, 5).map((q) => `・${q.title}`)
      return {
        text:
          snapshot.questions.length === 0
            ? '未決事項はありません。'
            : `決まっていないことが${snapshot.questions.length}件あります。\n\n${lines.join('\n')}`,
        tasks: [],
        findings,
      }
    }
    case 'metric': {
      const lines = snapshot.metrics.map((m) => `・${m.label}：${m.value === null ? '未入力' : `${m.value.toLocaleString('ja-JP')}${m.unit}`}`)
      return { text: `いまの経営数値です。\n\n${lines.join('\n')}`, tasks: [], findings }
    }
    default: {
      const head = findings.slice(0, 3).map((f) => `・${f.title}`)
      return {
        text: `${snapshot.companyName}の状況です。\n\n未完了タスク${snapshot.tasks.length}件（うち期限超過${snapshot.tasks.filter((t) => t.overdueDays > 0).length}件）、未解決の課題${snapshot.issues.length}件、未決事項${snapshot.questions.length}件、記録済みの決定${snapshot.decisionCount}件。\n\n注目すべき点：\n${head.join('\n')}`,
        tasks: top,
        findings,
      }
    }
  }
}
