---
name: pr-watch
description: Watch a pull request until it is merged or closed — re-check CI, review comments, and mergeability on a schedule, act on anything red, and stay silent when nothing changed. Use this whenever the user asks to watch / monitor / babysit / keep an eye on a PR, asks to be told when CI goes green, says 「PRを見張って」「監視して」「マージされるまで見ておいて」「CIが通ったら教えて」, or right after you open a PR yourself and need to follow it to a mergeable state. Also use it when a scheduled check-in for a PR fires and you need to remember the loop's rules.
---

# PR を見張る（定期チェック）

PR を開いたら、マージ／クローズされるまで面倒を見るのが仕事です。webhook は取りこぼす（CI 成功・push・コンフリクト解消は届かないことがある）ので、**自分でスケジュールした check-in が主な監視手段**になります。

このスキルは「1時間ごとに起きて、状態を見て、必要なら直して、静かに次を予約する」ループを再現します。

## 見張る対象を決める

`owner` / `repo` / `pullNumber` を確定させてから始めます。自分で開いた PR ならその番号。ユーザーが URL を貼ったならそこから。分からなければ聞くより先に `list_pull_requests` で候補を出したほうが速いことが多いです。

初回だけ：

1. `subscribe_pr_activity` を呼ぶ（webhook が来る分は即座に起きられる）
2. 下の check-in を予約する（webhook が来なかった分の保険）

両方やります。片方だけだと必ず取りこぼします。

## check-in の予約

`send_later`（claude-code-remote MCP）で自分宛に予約します。**毎回、同じ文面**を使い回してください。ループの意図がそのまま次の自分への指示になるからです。

```
message: PR #<N>（<owner>/<repo>）の定期チェックです。CI・レビューコメント・マージ可否を確認してください。何も変わっていなければ黙って次の check-in を入れ直してください。PRがマージまたはクローズされていたら check-in を終了してください。
delay_minutes: 60
name: PR #<N> 定期チェック
initiation: own_followup
```

60分が既定です。CI が走っている最中など、次の状態変化が数分先だと分かっているときだけ短くします。`sleep` で待つのは禁止（コンテナ時間を捨てるだけです）。

## 起きたときの手順

通知が溜まっているという system reminder が来たら、**まず `ReadNotifications`**。0 remaining になるまで呼びます。これをやらないと同じトリガーが積み上がります。

そのうえで、**安い順に**叩きます。ここが効率の肝です：

1. `pull_request_read` の `get_check_runs` — CI の状態。数百トークン。**毎回これだけで済むことがほとんど**
2. 変化の兆候があるか、数回に一度は `get_review_comments` — レビュースレッド
3. `get` はマージ可否（`mergeable_state`）や `merged` を確かめたいときだけ

`get` は PR 本文を丸ごと返すので、長い説明文の PR だと 1回で数千トークン飛びます。毎回呼ぶ必要はありません。head SHA が変わっていない・CI が緑のままなら、状態は変わっていないと判断してよいです。

MCP サーバーは頻繁に切断・再接続します。`mcp__github__*` が見当たらないときは `ToolSearch` で `select:mcp__github__pull_request_read` を読み込み直してください。これは異常ではなく通常運転です。

## 何もなかったとき

**黙って次の check-in を入れ直す。** ユーザーに報告しません。1行だけ「変化なし。次回チェックを入れ直しました。」程度に留めます。

これは重要で、1時間ごとに数十回起きるループなので、毎回まとまった報告を書くとユーザーの画面がノイズで埋まります。静かなことが正常な状態です。

## 何かあったとき

優先順位はこの順です。上から潰します。

### ① マージコンフリクト

base ブランチを PR ブランチにマージして解消します。ロックファイルや生成物はリポジトリのツールで再生成（手で書かない）。他人のブランチでは rebase / amend / force-push を絶対にしない — マージコミットなら相手の手元が壊れません。

両側が同じロジックを触っていて、どちらを取っても挙動が失われるときだけ聞きます。

### ② CI が赤

まず**この PR のせいかどうか**を切り分けます。

- diff が触っていないサービスのエラーで、再実行しても同じ → この PR のせいではない可能性
- base ブランチでも同じチェックが赤 → この PR のせいではない

この PR のせいでないと判断できて、直す変更が既にどこかにある（別 PR、revert、自分で出した fix PR）なら、**その変更をこの PR に取り込んで push します**。base に入れば no-op になるので、相手の PR のマージを待つ必要はありません。取り込んだにせよ無かったにせよ、PR に1回コメントして「どのチェックが、なぜこの PR のせいでなく、何を取り込んだか」を残します。黙って放置しない。

それ以外は全部この PR の責任です。原因を突き止めて直して push。

「flaky だと思う」は原因ではありません。ジョブの再実行は、上の切り分け確認・スタンドダウンのコメント後の1回・テスト本体が走る前に落ちた場合（checkout / install / runner 消失）・同じ commit で以前は通っていた場合、のいずれかに限り、**合計1回まで**。2回目の失敗は本物です。

テストを skip / disable / quarantine して緑にするのは禁止。空コミットや close→reopen で CI を蹴るのも禁止。

### ③ レビューコメント

小さくてローカルな指摘（nit、リネーム、lint bot、テスト追加、1関数のリファクタ）は実装して push。

人間のレビュアーからの大きな依頼（複数ファイルの refactor、API/スキーマ変更、設計の議論）は、自分が開いた PR でなければ**提案を返すだけ**で、push も resolve もしません。判断は author のものです。

レビュー bot の指摘は「設計レベルだから」で流さない — バグ報告として検証します。ただし bot の指摘が収束しない（直すたびに新しい指摘が出る）ときは、push を止めて一度まとめて相談します。

### push する前に

赤い CI を1回踏むと、サイクルとレビュアーの信頼を1つ失います。push 前に：

- リポジトリの速いチェックを自分で回す（lint / typecheck / 変更パッケージの unit test）
- CI 修正なら、まず元の失敗を再現してから、同じチェックが通ることを見せる
- 自分の diff を意地悪に読み返す。CI に落とされる要素がないか

検証済みの push 1回は、当てずっぽうの push 3回に勝ちます。

## 終わり方

`merged` または `closed` になったら：

1. check-in を予約し直さない（これで自然に止まります）
2. `unsubscribe_pr_activity`
3. ユーザーに1行報告

ユーザーが「もう見なくていい」と言ったら、その時点で即座に同じことをします。

## つまずきやすいところ

**自分のコメントが event で返ってくる。** 自分が投稿したステータスコメントや truth table が webhook で戻ってきます。これは依頼ではないので無視。処理済みの event の重複も同じ。

**通知が複数まとめて来る。** system reminder が3つ並ぶことがありますが、中身は同じ1件のことが多いです。`ReadNotifications` の "Exactly N notification" の数字だけが正しい。

**赤いまま放置しない。** 自分が開いた PR が赤いのに「レビュー待ち」と言うのは間違いです。緑でマージ可能な PR だけがレビュー待ちの状態になれます。起きたのに何もせず終わる、が許されるのは「既に報告済みのブロッカーがまだ続いている」ときだけです。
