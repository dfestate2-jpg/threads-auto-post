# 04. システム仕様

依頼事項④の実装仕様。**[03. 法務](03-legal-compliance.md) を読んだ前提で書いています。**

---

## 1. システム構成

既存の「LINE未返信リマインドシステム」と同じ技術スタックに載せられます
（Next.js 15 / TypeScript / Prisma / PostgreSQL）。**新規インフラは不要です。**

```
┌────────────────────────────────────────────────────────┐
│ ブラウザ（営業担当 または お客様のスマホ）                    │
│                                                        │
│  ① 同意画面                                              │
│  ② お客様情報入力（属性・支払能力）                          │
│  ③ 保証会社利用歴の入力                                    │
│  ④ 信用状況ヒアリング（選択式・すべて任意）                   │
│  ⑤ 判定結果表示（8社 × 判定 × 理由 × 追加ヒアリング項目）      │
│                                                        │
│  ⚠ ファイルアップロード機能は実装しない                       │
└────────────────────────────────────────────────────────┘
                        │ HTTPS（JSONのみ）
                        ▼
┌────────────────────────────────────────────────────────┐
│ Next.js API Routes                                     │
│  POST /api/guarantee/assess       判定（保存なし・純粋関数）  │
│  POST /api/guarantee/assessments  判定結果を保存           │
│  PATCH /api/guarantee/assessments/:id/outcome  実結果記録  │
│  GET  /api/guarantee/companies    会社定義（調査結果）を返す  │
│  GET  /api/guarantee/stats        ルール別の実測承認率       │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ 判定エンジン  src/lib/guarantee/                          │
│   types.ts      入力・出力の型                             │
│   companies.ts  会社ごとの参照チャネル定義（＝調査結果）        │
│   engine.ts     ルール適用・スコアリング・理由生成             │
│                                                        │
│  ※ 純粋関数。DBにもネットワークにも依存しない → テスト容易      │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ PostgreSQL（機微フラグはアプリ層で暗号化）                    │
│   GuaranteeAssessment      判定1回分                      │
│   GuaranteeApplication     実際の申込と結果                 │
│   GuaranteeConsent         同意の記録                      │
│   GuaranteeAuditLog        閲覧・出力の監査ログ              │
└────────────────────────────────────────────────────────┘
```

### AIの使いどころ

依頼文では「AIが信用情報を解析」でしたが、**判定そのものにLLMは使いません。**
理由は3つ。

1. **説明責任**：なぜ×なのかを常に一意に説明できる必要がある
2. **再現性**：同じ入力に同じ判定が出ないと営業が信用しない
3. **監査**：どのルールが効いたかを記録する必要がある

**LLMは以下の補助にのみ使います（任意）。**

| 用途 | 内容 |
|---|---|
| ヒアリング文の生成 | `missingInfo` を、お客様に聞きやすい会話文に変換 |
| 説明文の平易化 | 判定理由をお客様向けのやわらかい表現に書き換え |
| 申込メモの要約 | 営業が書いた自由記述メモから構造化フィールドを提案（**確定はしない**） |

---

## 2. 必要な入力項目

`src/lib/guarantee/types.ts` に型として定義済み。

### 2-1. お客様属性（`ApplicantInput`）— 必須

| 項目 | 型 | 必須 | 備考 |
|---|---|:---:|---|
| 年代 | 選択 | ● | under20 / 20s / 30s / 40s / 50s / 60s / 70plus |
| 国籍 | 選択 | ● | 日本 / 外国籍 |
| 在留期限までの残月数 | 数値 | △ | 外国籍のみ |
| 雇用形態 | 選択 | ● | 正社員／役員／契約／派遣／パート／自営／年金／学生／無職／生活保護 |
| 勤続月数 | 数値 | ○ | |
| 年収（万円） | 数値 | ● | **未入力なら全社「？」になる** |
| 月額家賃（円） | 数値 | ● | 共益費込み |
| 連帯保証人 | 真偽 | ● | 立てられるか |
| 緊急連絡先 | 選択 | ● | 親族／その他親戚／友人／なし |
| 本人名義の携帯 | 真偽 | ● | |
| 預貯金（家賃何ヶ月分） | 数値 | ○ | 申告ベース |

### 2-2. 保証会社利用歴（`GuaranteeHistoryEntry[]`）— 必須

対象8社 ＋ `other_licc`（LICC加盟の他社）／`other_cgo`／`other` を選べるようにします。

| 項目 | 型 | 備考 |
|---|---|---|
| 保証会社 | 選択 | |
| 状況 | 選択 | 利用なし／滞納なし／短期の遅れ／2ヶ月以上の滞納／代位弁済／訴訟・明渡し |
| 何年前か | 数値 | 不明可 |
| 滞納分を完済したか | 3値 | はい／いいえ／わからない |

**`guaranteeHistoryAsked` フラグを必ず送ってください。**
`false`（未ヒアリング）と「利用歴なし」を区別するためです。
未ヒアリングなら判定は「？」になります。

### 2-3. 信用状況ヒアリング（`CreditSelfReport`）— すべて任意

**開示報告書は使いません。以下はすべて「お客様への質問」です。**
画面にはこの日本語をそのまま出してください。

| 質問文（画面表示そのまま） | 回答 | フィールド |
|---|---|---|
| 現在、支払いが遅れているものはありますか？ | はい／いいえ／わからない | `currentDelinquency` |
| 過去5年以内に、支払いを **61日以上または3ヶ月以上** 遅れたことはありますか？ | はい／いいえ／わからない | `seriousDelinquency` |
| （はいの場合）それは何年前ですか？ | 数値 | `seriousDelinquencyYearsAgo` |
| （はいの場合）その分はお支払い済みですか？ | はい／いいえ／わからない | `seriousDelinquencyResolved` |
| 債務整理・個人再生・自己破産をされたことはありますか？ | なし／任意整理／個人再生／自己破産／わからない | `debtRestructuring` |
| （ありの場合）それは何年前ですか？ | 数値 | `debtRestructuringYearsAgo` |
| **携帯・スマホの「本体代金の分割払い」を2ヶ月以上遅れたことはありますか？（通信料金だけの遅れは含みません）** | はい／いいえ／わからない | `mobileInstallmentDelinquency` |
| 携帯の通信料金だけを遅れたことはありますか？ | はい／いいえ／わからない | `utilityOnlyDelinquency` |
| 現在の借入件数は？（住宅ローン・自動車ローンを除く） | なし／1〜2件／3件／4件以上／わからない | `borrowingCount` |
| クレジットカード・ローンを一度も使ったことがない | はい／いいえ／わからない | `noCreditHistory` |
| （任意）CICクレジット・ガイダンスのスコア帯をご自身で確認された場合 | 高／中／低／未確認 | `cicGuidanceBand` |

> **太字の質問が最も重要です。**
> 本人が「携帯代を数回遅れた」程度にしか認識していないケースが多く、
> 実際にはCICに割賦契約の延滞として登録されているためです（→ [03 §4](03-legal-compliance.md)）。

### 2-4. 保存してはいけない項目（スキーマに存在させない）

```
❌ 開示報告書のファイル（PDF・画像・テキスト）
❌ 借入先の会社名
❌ 借入残高・契約番号・カード番号
❌ CICクレジット・ガイダンスの生スコア（帯域のみ保存）
❌ 信用情報機関の照会履歴
```

---

## 3. データモデル（Prisma）

```prisma
model GuaranteeConsent {
  id            String   @id @default(cuid())
  customerRef   String                   // 顧客識別子（氏名は別テーブル）
  consentedAt   DateTime @default(now())
  policyVersion String                   // 同意文のバージョン
  ipAddress     String?
  revokedAt     DateTime?
  assessments   GuaranteeAssessment[]
  @@index([customerRef])
}

model GuaranteeAssessment {
  id           String   @id @default(cuid())
  consentId    String
  consent      GuaranteeConsent @relation(fields: [consentId], references: [id])
  staffId      String                     // 実施した営業担当
  createdAt    DateTime @default(now())

  /// AssessmentInput をそのまま格納（アプリ層で暗号化）
  inputJson    String
  /// AssessmentResult をそのまま格納。判定理由の記録＝説明責任の担保
  resultJson   String
  /// companies.ts のバージョン。後から「当時どの前提で判定したか」を再現するため
  rulesVersion String

  /// 自動削除の基準日
  expiresAt    DateTime
  applications GuaranteeApplication[]
  @@index([consentId])
  @@index([expiresAt])
}

model GuaranteeApplication {
  id            String   @id @default(cuid())
  assessmentId  String
  assessment    GuaranteeAssessment @relation(fields: [assessmentId], references: [id])
  companyKey    String                    // 実際に申し込んだ保証会社
  predictedGrade String                   // 申込時点の判定
  predictedScore Int
  appliedAt     DateTime @default(now())

  /// ★ここが Phase 2 の生命線
  outcome       GuaranteeOutcome?         // approved / conditional / rejected / withdrawn
  outcomeAt     DateTime?
  /// 保証会社から聞けた否認理由（自由記述）
  outcomeNote   String?
  /// 条件付き承認の内容（連帯保証人追加・前家賃 等）
  conditions    String?

  @@index([companyKey, outcome])
  @@index([assessmentId])
}

enum GuaranteeOutcome {
  approved
  conditional
  rejected
  withdrawn
}

model GuaranteeAuditLog {
  id           String   @id @default(cuid())
  staffId      String
  action       String                     // view / create / export / delete
  assessmentId String?
  createdAt    DateTime @default(now())
  @@index([assessmentId])
  @@index([staffId, createdAt])
}
```

> **`GuaranteeApplication.outcome` を Phase 1 から必ず実装してください。**
> ここが空だと Phase 2/3（実績によるチューニング）が一切できません。
> 判定を出すだけのシステムは半年で「当たらない」と言われて使われなくなります。
> **判定 → 申込 → 結果 のループを閉じることが、このシステムの本体です。**

### 保持期間と削除

| データ | 保持 | 削除方法 |
|---|---|---|
| `GuaranteeAssessment` | 相談終了後6ヶ月（`expiresAt`） | 日次バッチで物理削除 |
| `GuaranteeApplication` | 3年（統計用。**個人特定情報を除いた形に落として保持**） | 6ヶ月後に匿名化バッチ |
| `GuaranteeConsent` | 撤回後速やかに削除 | 撤回APIから即時 |
| `GuaranteeAuditLog` | 3年 | ― |

**匿名化バッチが重要です。**
6ヶ月後に `assessmentId` との紐付けを切り、
「属性レンジ＋該当ルール＋会社＋結果」だけを残せば、
**個人情報を保持せずに統計精度を上げ続けられます。**

---

## 4. API仕様

### `POST /api/guarantee/assess` — 判定（保存なし）

入力途中でもリアルタイムに再判定できるよう、**保存を伴わない純粋な判定API**を分けています。

```jsonc
// Request
{
  "applicant": { "ageBand": "30s", "nationality": "jp", "employment": "fulltime",
                 "tenureMonths": 48, "annualIncomeManYen": 480, "monthlyRentYen": 90000,
                 "hasGuarantor": false, "emergencyContact": "family",
                 "ownMobilePhone": true, "savingsMonths": null },
  "guaranteeHistory": [
    { "companyKey": "casa", "status": "late_serious", "yearsAgo": 3, "resolved": "yes" }
  ],
  "guaranteeHistoryAsked": true,
  "credit": { "currentDelinquency": "no", "seriousDelinquency": "no",
              "seriousDelinquencyResolved": "no", "debtRestructuring": "none",
              "mobileInstallmentDelinquency": "unknown", "utilityOnlyDelinquency": "no",
              "borrowingCount": "1-2", "noCreditHistory": "no" }
}
```

```jsonc
// Response 200
{
  "assessments": [
    { "companyKey": "nihonsafety", "companyName": "日本セーフティー",
      "category": "independent", "grade": "○", "score": 78,
      "reasons": [
        { "ruleId": "rent_ratio_good", "text": "家賃が月収の約23%に収まっており…",
          "points": 8, "channel": null, "unverified": false }
      ],
      "missingInfo": [], "hasUnverifiedBasis": false, "note": "..." }
    // …8社ぶん。判定の良い順にソート済み
  ],
  "globalMissingInfo": ["携帯・スマホ本体代金の分割払いに2ヶ月以上の遅れがあったか"],
  "recommendation": "日本セーフティー・全保連を優先してお申込みください。…"
}
```

**バリデーション**：`zod`（既存依存）でスキーマ検証。
**認証**：既存の `src/lib/auth/guard.ts` を流用（営業担当のみ）。
**レート制限**：不要（内部利用）。

### `POST /api/guarantee/assessments` — 判定結果を保存

`consentId` 必須。**同意記録のないリクエストは 403 で拒否します。**

### `PATCH /api/guarantee/assessments/:id/outcome` — 実結果を記録

```jsonc
{ "companyKey": "nihonsafety", "outcome": "approved",
  "conditions": null, "outcomeNote": null }
```

**申込から3営業日後に、担当者へLINEでリマインドを送る**運用にしてください。
既存のリマインド基盤（`src/lib/services/reminderRunner.ts`）がそのまま使えます。
**結果の記録漏れがシステムの価値を殺します。**

### `GET /api/guarantee/stats` — 実測承認率

```jsonc
{
  "byCompany": [
    { "companyKey": "nihonsafety", "applied": 42, "approved": 39, "rate": 0.93 }
  ],
  "byRule": [
    { "ruleId": "credit_serious_unresolved", "companyKey": "casa",
      "applied": 20, "approved": 18, "rate": 0.90,
      "predictedGradeMode": "△",
      "suggestion": "casa.jicc.weight を 0.5 → 0.2 へ引き下げる候補" }
  ]
}
```

---

## 5. 画面仕様

### 画面1：同意

- [03 §5](03-legal-compliance.md) の同意文を全文表示
- **「開示報告書のご提出は不要です」を目立たせる**（お客様の不安を先に潰す）
- チェック → `GuaranteeConsent` を作成

### 画面2：お客様情報入力

- 2-1 の項目。1画面に収める
- 年収・家賃を入れた時点で**家賃負担率をリアルタイム表示**（`23% ✓ 良好` / `48% ⚠ 目安超過`）

### 画面3：保証会社利用歴

- 8社＋その他を横並びのカードで表示し、各カードで状況を選択
- 「利用したことがない」を初期値にせず、**未選択状態を明示**する
  （`guaranteeHistoryAsked` を正しく立てるため）

### 画面4：信用状況ヒアリング

- 2-3 の質問を1問ずつ。**すべて「わからない」を選べる**
- 各問の下に補足を出す：
  - 「61日以上」→「※クレジットカードの支払日から2ヶ月以上遅れた場合です」
  - 「本体代金の分割払い」→「※機種代を月々に分けて払っている場合です。通信料だけの遅れは含みません」
- **「わからない」を選んでも先に進める。** 進めないUIにしてはいけません（任意性の担保）

### 画面5：判定結果

```
┌──────────────────────────────────────────────────────────┐
│ 推奨：日本セーフティーを優先してお申込みください。             │
│ 　　　エポス・オリコ・セゾンへの申込は避けてください。          │
├──────────────────────────────────────────────────────────┤
│ 保証会社          判定   理由                              │
│ ─────────────────────────────────────────────────────── │
│ 日本セーフティー    ○    個人信用情報機関を参照しないため…    │
│ Casa             △ ※   規程上はJICC加盟。実務は自社DB優先… │
│ 全保連            △ ※   JICC加盟が未確認のため…            │
│ エポス            ×    61日以上の延滞があり完済未確認…       │
├──────────────────────────────────────────────────────────┤
│ ⚠ 追加でヒアリングが必要な項目（1件）                        │
│   ・携帯・スマホ本体代金の分割払いに2ヶ月以上の遅れがあったか   │
│     [ はい ] [ いいえ ] [ わからない ]   ← その場で答えられる │
├──────────────────────────────────────────────────────────┤
│ ※ の判定は、一次確認できていない前提に基づきます              │
│ この判定は保証会社の審査結果を保証するものではありません        │
└──────────────────────────────────────────────────────────┘
        [ この内容で申し込む → 保証会社を選択 ]
```

**必須の実装ポイント**

| ポイント | 理由 |
|---|---|
| 判定と理由を必ずセットで出す | 判定だけだと営業が誤った説明をする |
| `hasUnverifiedBasis` に「※」を付ける | 確定情報と推定を混ぜない |
| `missingInfo` をその場で回答できるUIにする | 「？」を減らすのが最短の精度向上 |
| 「保証するものではありません」を常時表示 | 期待値のコントロール |
| **お客様に画面をそのまま見せない設計にする** | ×表示はお客様を傷つける。営業用の内部画面とする |

### 画面6：申込結果の記録

- 申込した会社と、その結果（承認／条件付き／否認）を1タップで記録
- 否認だった場合、**判定が当たっていたか（`predictedGrade` との一致）を自動で集計**

---

## 6. どこまで自動化できるか（依頼事項④への直接回答）

| 工程 | 自動化 | 補足 |
|---|:---:|---|
| お客様情報の入力 | **半自動** | 既存の申込データから初期値を引ける |
| **信用情報の取得** | **自動化してはいけない** | 規約違反。本人ヒアリングに置き換える（→[03](03-legal-compliance.md)） |
| 信用情報の構造化 | **100%自動** | 選択式なので、そもそも構造化済み |
| 保証会社利用歴の入力 | **半自動** | 自社の過去申込データから自動補完できる |
| **保証会社ごとの判定** | **100%自動** | 実装済み（`engine.ts`） |
| **判定理由の生成** | **100%自動** | 実装済み |
| **追加ヒアリング項目の提示** | **100%自動** | 実装済み |
| **申込先の推奨** | **100%自動** | 実装済み |
| 申込書の作成・送信 | **半自動** | 各社の様式が異なるため、PDF自動生成までが現実的 |
| 結果の記録 | **手動＋リマインド** | 保証会社からの通知形式が統一されていないため |
| ルールの精度改善 | **半自動** | 統計は自動、weight変更は人の判断 |

**「信用情報の取得」だけが自動化できず、そこは自動化してはいけない部分です。**
それ以外は全て自動化できます。

---

## 7. 開発計画

| Phase | 内容 | 目安 | 完了条件 |
|---|---|---|---|
| **0** | 各社の同意条項を入手し `companies.ts` の `verified` を更新 | 1週 | 8社中6社以上が `verified: true` |
| **1** | 判定エンジン（済）＋ 入力画面 ＋ 結果画面 ＋ 申込結果記録 | 3〜4週 | 営業が実案件で使える |
| **2** | 結果記録のリマインド ＋ 統計ダッシュボード | 2週 | 100件の実績が溜まる |
| **3** | weight の実測補正 ＋ 精度レポート | 3週 | 判定と実結果の一致率80%以上 |
| **4（任意）** | ブラウザ内完結の開示書読取（**弁護士確認必須**） | 3週 | ― |

**Phase 0 を飛ばさないでください。**
現在の `companies.ts` には `verified: false` が複数あり、
その状態で運用すると「※要確認」だらけの画面になります。
**同意条項は営業担当が普段使っている申込書の裏面にあります。8社ぶん集めるだけです。**

---

## 8. 実装済みのもの

```
src/lib/guarantee/types.ts       入力・出力の型定義
src/lib/guarantee/companies.ts   8社の参照チャネル定義（＝調査結果のコード化）
src/lib/guarantee/engine.ts      判定エンジン（純粋関数）
tests/guarantee.test.ts          28ケース（全パス）
scripts/guarantee-demo.ts        コンソールで判定を試すデモ
```

```bash
npm test                          # 156テスト（うち保証判定28）
npx tsx scripts/guarantee-demo.ts # 5つのケースで判定結果を表示
```
