/**
 * 自動追客ルールとLINEテンプレートの初期値。
 *
 * 指示書 10（自動追客ルール）・9（LINE文章）・13（休眠顧客）をそのまま表にしたもの。
 * 運用開始後は管理画面から編集できるため、ここは「最初の1回だけ」入る既定値。
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { ActionType, CustomerStatus } from '@prisma/client'

const HOUR = 60
const DAY = 1440

interface RuleSeed {
  status: CustomerStatus
  step: number
  offsetMinutes: number
  actionType: ActionType
  label: string
  templateKey?: string
  notifyStaff?: boolean
  transitionTo?: CustomerStatus
}

/**
 * 追客リズム。offsetMinutes は「そのステータスになった時刻」からの経過。
 *
 * 各ステータスの最終段は SYSTEM（＝営業マンには出ない自動処理）にしてあり、
 * 反応が無いまま放置された顧客を必ず次のステータスへ送る。
 * これにより「どのステータスからも追客が途切れない」ことを保証している。
 */
export const DEFAULT_FOLLOW_UP_RULES: RuleSeed[] = [
  // --- 新規反響：初動が成約率を最も左右するため、当日中に3手を打つ ---
  { status: CustomerStatus.NEW_INQUIRY, step: 0, offsetMinutes: 0, actionType: ActionType.CALL, label: '初回電話（反響直後）' },
  { status: CustomerStatus.NEW_INQUIRY, step: 1, offsetMinutes: 2 * HOUR, actionType: ActionType.LINE, label: '初回LINE（2時間以内）', templateKey: 'first_contact' },
  { status: CustomerStatus.NEW_INQUIRY, step: 2, offsetMinutes: 1 * DAY, actionType: ActionType.CALL, label: '再架電（翌日）' },
  { status: CustomerStatus.NEW_INQUIRY, step: 3, offsetMinutes: 3 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 初回対応済：ヒアリングまで進める ---
  { status: CustomerStatus.FIRST_CONTACTED, step: 0, offsetMinutes: 1 * DAY, actionType: ActionType.LINE, label: '希望条件のヒアリング', templateKey: 'hearing' },
  { status: CustomerStatus.FIRST_CONTACTED, step: 1, offsetMinutes: 3 * DAY, actionType: ActionType.LINE, label: 'LINEで再アプローチ', templateKey: 'no_reply' },
  { status: CustomerStatus.FIRST_CONTACTED, step: 2, offsetMinutes: 7 * DAY, actionType: ActionType.CALL, label: '電話でヒアリング' },
  { status: CustomerStatus.FIRST_CONTACTED, step: 3, offsetMinutes: 14 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- ヒアリング済：物件提案へ ---
  { status: CustomerStatus.HEARING_DONE, step: 0, offsetMinutes: 1 * DAY, actionType: ActionType.PROPOSE, label: '物件を提案する' },
  { status: CustomerStatus.HEARING_DONE, step: 1, offsetMinutes: 3 * DAY, actionType: ActionType.LINE, label: '提案の催促LINE', templateKey: 'hearing' },
  { status: CustomerStatus.HEARING_DONE, step: 2, offsetMinutes: 7 * DAY, actionType: ActionType.CALL, label: '電話で状況確認' },
  { status: CustomerStatus.HEARING_DONE, step: 3, offsetMinutes: 14 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 物件提案後：2日 → 5日 → 10日【指示書 10】 ---
  { status: CustomerStatus.PROPOSING, step: 0, offsetMinutes: 2 * DAY, actionType: ActionType.LINE, label: '提案の反応確認', templateKey: 'proposal_follow' },
  { status: CustomerStatus.PROPOSING, step: 1, offsetMinutes: 5 * DAY, actionType: ActionType.LINE, label: '追加提案のLINE', templateKey: 'proposal_follow' },
  { status: CustomerStatus.PROPOSING, step: 2, offsetMinutes: 10 * DAY, actionType: ActionType.CALL, label: '電話で状況確認' },
  { status: CustomerStatus.PROPOSING, step: 3, offsetMinutes: 20 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 見積書待ち：24時間 → 48時間 → 72時間で営業マンへ通知【指示書 10】 ---
  { status: CustomerStatus.AWAITING_QUOTE, step: 0, offsetMinutes: 1 * DAY, actionType: ActionType.LINE, label: '見積書の進捗連絡', templateKey: 'quote_wait' },
  { status: CustomerStatus.AWAITING_QUOTE, step: 1, offsetMinutes: 2 * DAY, actionType: ActionType.LINE, label: '見積書の再連絡', templateKey: 'quote_wait' },
  { status: CustomerStatus.AWAITING_QUOTE, step: 2, offsetMinutes: 3 * DAY, actionType: ActionType.CALL, label: '見積書が72時間止まっています', notifyStaff: true },
  { status: CustomerStatus.AWAITING_QUOTE, step: 3, offsetMinutes: 7 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 内見調整中 ---
  { status: CustomerStatus.VIEWING_ARRANGING, step: 0, offsetMinutes: 1 * DAY, actionType: ActionType.LINE, label: '内見日程の確認', templateKey: 'viewing_arrange' },
  { status: CustomerStatus.VIEWING_ARRANGING, step: 1, offsetMinutes: 3 * DAY, actionType: ActionType.CALL, label: '電話で日程調整' },
  { status: CustomerStatus.VIEWING_ARRANGING, step: 2, offsetMinutes: 7 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 内見後：当日 → 2日 → 5日【指示書 10】 ---
  { status: CustomerStatus.VIEWED, step: 0, offsetMinutes: 4 * HOUR, actionType: ActionType.LINE, label: '内見の感想を確認', templateKey: 'after_viewing' },
  { status: CustomerStatus.VIEWED, step: 1, offsetMinutes: 2 * DAY, actionType: ActionType.LINE, label: '検討状況の確認', templateKey: 'after_viewing' },
  { status: CustomerStatus.VIEWED, step: 2, offsetMinutes: 5 * DAY, actionType: ActionType.CALL, label: '電話でクロージング' },
  { status: CustomerStatus.VIEWED, step: 3, offsetMinutes: 10 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 申込検討 ---
  { status: CustomerStatus.APPLICATION_REVIEW, step: 0, offsetMinutes: 1 * DAY, actionType: ActionType.LINE, label: '申込の意思確認', templateKey: 'application' },
  { status: CustomerStatus.APPLICATION_REVIEW, step: 1, offsetMinutes: 2 * DAY, actionType: ActionType.CALL, label: '電話で申込を後押し' },
  { status: CustomerStatus.APPLICATION_REVIEW, step: 2, offsetMinutes: 5 * DAY, actionType: ActionType.LINE, label: '再度の意思確認', templateKey: 'application' },
  { status: CustomerStatus.APPLICATION_REVIEW, step: 3, offsetMinutes: 10 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 申込済：成約まで落とさない ---
  { status: CustomerStatus.APPLIED, step: 0, offsetMinutes: 1 * DAY, actionType: ActionType.LINE, label: '審査の進捗連絡', templateKey: 'application' },
  { status: CustomerStatus.APPLIED, step: 1, offsetMinutes: 3 * DAY, actionType: ActionType.CALL, label: '審査状況の確認' },
  { status: CustomerStatus.APPLIED, step: 2, offsetMinutes: 7 * DAY, actionType: ActionType.CALL, label: '契約日程の確認' },

  // --- 保留 ---
  { status: CustomerStatus.ON_HOLD, step: 0, offsetMinutes: 7 * DAY, actionType: ActionType.LINE, label: '状況確認のLINE', templateKey: 'no_reply' },
  { status: CustomerStatus.ON_HOLD, step: 1, offsetMinutes: 14 * DAY, actionType: ActionType.LINE, label: '再度の状況確認', templateKey: 'no_reply' },
  { status: CustomerStatus.ON_HOLD, step: 2, offsetMinutes: 30 * DAY, actionType: ActionType.SYSTEM, label: '返信なしへ移行', transitionTo: CustomerStatus.NO_REPLY },

  // --- 返信なし：1日 → 3日 → 7日（電話）→ 14日 → 30日で休眠【指示書 10・13】 ---
  { status: CustomerStatus.NO_REPLY, step: 0, offsetMinutes: 1 * DAY, actionType: ActionType.LINE, label: 'LINEで再アプローチ', templateKey: 'no_reply' },
  { status: CustomerStatus.NO_REPLY, step: 1, offsetMinutes: 3 * DAY, actionType: ActionType.LINE, label: 'LINEで再アプローチ', templateKey: 'no_reply' },
  { status: CustomerStatus.NO_REPLY, step: 2, offsetMinutes: 7 * DAY, actionType: ActionType.CALL, label: '電話でアプローチ' },
  { status: CustomerStatus.NO_REPLY, step: 3, offsetMinutes: 14 * DAY, actionType: ActionType.LINE, label: '最終LINE', templateKey: 'no_reply' },
  { status: CustomerStatus.NO_REPLY, step: 4, offsetMinutes: 30 * DAY, actionType: ActionType.SYSTEM, label: '休眠へ移行', transitionTo: CustomerStatus.DORMANT },

  // --- 休眠：失注にせず掘り起こす。通算60日・90日で再アプローチ【指示書 13】 ---
  { status: CustomerStatus.DORMANT, step: 0, offsetMinutes: 30 * DAY, actionType: ActionType.LINE, label: '休眠顧客の掘り起こし（通算60日）', templateKey: 'dormant' },
  { status: CustomerStatus.DORMANT, step: 1, offsetMinutes: 60 * DAY, actionType: ActionType.LINE, label: '休眠顧客の掘り起こし（通算90日）', templateKey: 'dormant' },
]

interface TemplateSeed {
  key: string
  title: string
  body: string
  status?: CustomerStatus
  sortOrder: number
}

/** LINE文章のテンプレート【指示書 9】。{{name}} などは送信時に差し込まれる */
export const DEFAULT_MESSAGE_TEMPLATES: TemplateSeed[] = [
  {
    key: 'first_contact',
    title: '新規反響：初回あいさつ',
    status: CustomerStatus.NEW_INQUIRY,
    sortOrder: 10,
    body: '{{name}}様\nお問い合わせありがとうございます。{{company}}の{{assignee}}と申します。\n{{area}}でのお部屋探しですね。ご希望に合うお部屋をお探ししますので、\n・ご入居のご希望時期\n・お住まいの人数\n・とくに譲れない条件\nを教えていただけますか？',
  },
  {
    key: 'hearing',
    title: 'ヒアリング：条件確認',
    status: CustomerStatus.FIRST_CONTACTED,
    sortOrder: 20,
    body: '{{name}}様\n{{assignee}}です。お部屋探しの件、その後いかがでしょうか。\n{{area}}・{{rent}}前後で条件に合うお部屋をご案内できます。\nご希望の間取りや設備があれば教えてください。',
  },
  {
    key: 'proposal_follow',
    title: '物件提案後：反応確認',
    status: CustomerStatus.PROPOSING,
    sortOrder: 30,
    body: '{{name}}様\n{{assignee}}です。先日ご提案したお部屋はいかがでしたか？\nピンとこなければ条件を変えて再度お探しします。\n気になるお部屋があれば内見のご案内も可能です。',
  },
  {
    key: 'quote_wait',
    title: '見積書待ち：進捗連絡',
    status: CustomerStatus.AWAITING_QUOTE,
    sortOrder: 40,
    body: '{{name}}様\n{{assignee}}です。お見積りの件、確認を進めております。\n本日中にご連絡できるよう手配していますので、少々お待ちください。\nお急ぎでしたらお電話でも対応いたします。',
  },
  {
    key: 'viewing_arrange',
    title: '内見調整：日程確認',
    status: CustomerStatus.VIEWING_ARRANGING,
    sortOrder: 50,
    body: '{{name}}様\n{{assignee}}です。内見の日程についてご連絡しました。\n今週末（土日）または平日の夕方以降でご都合はいかがでしょうか。\n第2希望までいただけるとスムーズにご案内できます。',
  },
  {
    key: 'after_viewing',
    title: '内見後：感想確認',
    status: CustomerStatus.VIEWED,
    sortOrder: 60,
    body: '{{name}}様\n本日はご内見ありがとうございました。{{assignee}}です。\n実際にご覧になっていかがでしたか？\n気になる点があれば遠慮なくお知らせください。\n他の候補もお探しできますので、率直なご感想をお聞かせください。',
  },
  {
    key: 'application',
    title: '申込後：進捗連絡',
    status: CustomerStatus.APPLIED,
    sortOrder: 70,
    body: '{{name}}様\n{{assignee}}です。お申込みいただいた物件の審査状況をご連絡します。\n現在、管理会社にて確認中です。結果が分かり次第すぐにご連絡いたします。\nご不明な点があればいつでもご連絡ください。',
  },
  {
    key: 'no_reply',
    title: '返信なし：再アプローチ',
    status: CustomerStatus.NO_REPLY,
    sortOrder: 80,
    body: '{{name}}様\n{{assignee}}です。その後お部屋探しの状況はいかがでしょうか。\nもしまだお探し中でしたら、{{area}}の新着物件をお送りします。\n他社で決まった場合もお気軽にお知らせください。',
  },
  {
    key: 'dormant',
    title: '休眠顧客：掘り起こし',
    status: CustomerStatus.DORMANT,
    sortOrder: 90,
    body: '{{name}}様\nご無沙汰しております。{{company}}の{{assignee}}です。\n{{area}}で条件の良いお部屋が出てきましたのでご連絡しました。\nお部屋探しを再開される際は、ぜひお声がけください。',
  },
  {
    key: 'general',
    title: '汎用：状況確認',
    sortOrder: 100,
    body: '{{name}}様\n{{assignee}}です。その後いかがでしょうか。\nご不明な点やご要望があればお気軽にご連絡ください。',
  },
]

type Db = PrismaClient | Prisma.TransactionClient

/**
 * 追客ルール・テンプレートの初期値を入れる。
 * 既に登録されているものは上書きしない（運用中の調整を消さないため）。
 */
export async function ensureFollowUpDefaults(db: Db): Promise<void> {
  for (const rule of DEFAULT_FOLLOW_UP_RULES) {
    await db.followUpRule.upsert({
      where: { status_step: { status: rule.status, step: rule.step } },
      create: {
        status: rule.status,
        step: rule.step,
        offsetMinutes: rule.offsetMinutes,
        actionType: rule.actionType,
        label: rule.label,
        templateKey: rule.templateKey ?? null,
        notifyStaff: rule.notifyStaff ?? false,
        transitionTo: rule.transitionTo ?? null,
      },
      update: {},
    })
  }

  for (const template of DEFAULT_MESSAGE_TEMPLATES) {
    await db.messageTemplate.upsert({
      where: { key: template.key },
      create: {
        key: template.key,
        title: template.title,
        body: template.body,
        status: template.status ?? null,
        sortOrder: template.sortOrder,
      },
      update: {},
    })
  }
}
