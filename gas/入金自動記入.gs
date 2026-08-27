/** ============================================================
 *  入金自動記入
 *  freee → スプレッドシート［入金日・入金者・入金額］のみ
 *
 *  DFエステートが「受け取った」記録を自動で追記します。
 *  B列（契約者名）・E列（契約締結日）・F列（備考）には一切触れません。
 *
 *  ※「振込自動記入（出金版）」の姉妹スクリプトです。
 *    作りは意図的にそろえてありますが、**別のApps Scriptプロジェクト**に
 *    入れてください。理由は末尾の「セットアップ」を参照。
 *  ============================================================ */

const 設定 = {
  見出し行: 2,
  データ開始行: 3,

  // 書き込む列は、見出し行の文字から**毎回自動で探す**。
  // 列を挿入しても、見出しの位置が変わっても、書き込み先がずれない。
  // 見つからないときは黙って別の列に書かず、エラーで止める。
  見出し: {
    入金日: '入金日',
    入金者: '入金者',
    入金額: '入金額'
  },

  // 月次シートの名前の形式。**既存シートの付け方に合わせること**（例: 2026/08）
  シート名の形式: 'yyyy/MM',

  // 月次シートが無いときの複製元。既存ブックの「コピー」シート
  テンプレシート: 'コピー',

  遡る日数: 30,                // 毎回この日数分を見直して取りこぼしを防ぐ
  管理シート: '_sync_入金',     // 処理済みIDを保存する隠しシート

  // ★これより前の入金は取り込まない（yyyy-MM-dd）
  //   手入力済みの行と重複させないための設定。
  //   「手で入れた最後の日の翌日」を入れること。
  取り込み開始日: '2026-08-23',

  最低金額: 1,                 // これ未満は記載しない（利息の数円など）

  // 記入したくない入金の除外設定。
  // 半角カナ・全角の違いは自動で吸収するので、どちらか片方を書けば足ります。

  // 摘要の「先頭」に来たら除外（会社名に同じ言葉が入っていても巻き込まない）
  除外_先頭: [],

  // 摘要の「どこかに含まれていたら」除外
  除外_含む: ['利息', 'リソク', 'ポイント', 'POINT'],

  // 同じ入金日が続くとき、2行目以降のA列を空欄にする（既存の手入力の書き方）
  同じ日付は空欄にする: true,

  // 入金明細がこの日数届かなかったらメールで知らせる
  // （freee側の口座連携が切れると「エラーは出ないのに明細が来ない」状態になるため）
  無音アラート日数: 5
};


/** ===== メイン処理 ===== */
function 入金を取り込む() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  const 状態 = {};      // シート名 → { sh, 行, 前回日付 }
  let 済み = null;
  let 件数 = 0;

  try {
    const 今日 = new Date();
    const 開始 = new Date(今日.getTime() - 設定.遡る日数 * 86400000);

    const 明細 = freeeから入金を取得_(開始, 今日);
    済み = 処理済みID取得_();

    明細.forEach(m => {
      if (済み.has(m.id)) return;
      月シートに追記_(m, 状態);
      済み.add(m.id);
      件数++;
    });

  } catch (e) {
    Logger.log('エラー: ' + e.message);
    メール通知_('[入金自動記入] エラー', e.message + '\n' + (e.stack || ''));
    throw e;

  } finally {
    // ★ここが finally である理由（重要）
    //   途中の1件で失敗しても、**それまでに書けた行のIDは必ず保存する**。
    //   保存しないまま終わると、次回の実行で同じ行をもう一度書いてしまい
    //   スプレッドシートに重複が残る。
    if (件数 > 0 && 済み) 処理済みID保存_(済み);
    Logger.log(件数 + '件を追記しました');
    lock.releaseLock();
  }
}


/** ===== 除外判定 ===== */

/** 半角カナ・全角英数・大小文字の違いを消して比べられる形にする */
function 照合用_(s) {
  return String(s || '').normalize('NFKC').toUpperCase();
}

function 除外対象か_(摘要) {
  const 生 = 照合用_(摘要);
  const 相手 = 照合用_(入金者名を整形_(摘要));

  // 先頭一致：摘要そのものと、整形後の名前のどちらかが該当すれば除外
  const 先頭 = 設定.除外_先頭 || [];
  if (先頭.some(k => 生.indexOf(照合用_(k)) === 0 || 相手.indexOf(照合用_(k)) === 0)) return true;

  // 部分一致
  return (設定.除外_含む || []).some(k => 生.indexOf(照合用_(k)) >= 0);
}


/** ===== 摘要 → 入金者名 ===== */

/** 全銀システムで使われる法人格の略号（長いものから順に見る） */
const 法人格略号 = [
  'トクヒ', 'シユウ', 'シュウ', 'ザイ', 'シヤ', 'シャ', 'ガク', 'ノウ', 'ギヨ',
  'カ', 'ユ', 'ド', 'シ', 'メ', 'イ'
];

/**
 * "カ)タマホーム"（前株）/ "タマホーム(カ"（後株）の略号を落とす。
 * 既存シートの入金者欄が「タマホーム」「ダイキョウアナブキ」のように
 * 法人格を書かない運用なので、展開せず削除する。
 * 略号に一致しないときは何もしない（誤変換しないことを優先）。
 */
function 法人格略号を外す_(s) {
  for (let i = 0; i < 法人格略号.length; i++) {
    const k = 法人格略号[i];

    const 前株 = new RegExp('^' + k + '\\)\\s*(.+)$').exec(s);
    if (前株) return 前株[1].trim();

    const 後株 = new RegExp('^(.+?)\\s*\\(' + k + '\\)?$').exec(s);
    if (後株) return 後株[1].trim();
  }
  return s;
}

/**
 * 摘要から入金者名を取り出す。
 *   "ﾌﾘｺﾐ ｶ)ﾀﾏﾎｰﾑ"   → "タマホーム"
 *   "振込 ｸﾗﾊｼ ｼﾞﾕﾝﾔ" → "クラハシ ジユンヤ"
 * 削り切って空になったときは、**元の摘要をそのまま返す**（入金者欄を空にしない）。
 */
function 入金者名を整形_(摘要) {
  const 元 = String(摘要 || '');
  if (!元.trim()) return '';

  // 半角カナ→全角カナ、全角英数→半角（既存シートの表記に合わせる）
  let s = 元.normalize('NFKC');
  s = s.replace(/[－−‐]/gu, 'ー');
  s = s.replace(/[　\s]+/gu, ' ').trim();

  // 先頭の取引種別を落とす
  s = s.replace(/^(振込入金|振替入金|他行振込|総合振込|口座振替|振込|フリコミ|振替|入金|カード|ATM)[＊*\s:：\-ー・]*/u, '');
  // 決済代行の識別子（振込版と同じ扱い）
  s = s.replace(/^(NSS|DF)[\s]+/u, '');

  s = s.replace(/[　\s]+/gu, ' ').trim();
  if (!s) return 元.normalize('NFKC').replace(/[　\s]+/gu, ' ').trim();

  s = 法人格略号を外す_(s);
  s = s.replace(/[　\s]+/gu, ' ').trim();

  return s || 元.normalize('NFKC').replace(/[　\s]+/gu, ' ').trim();
}


/** ===== 書き込み先スプレッドシート ===== */

/**
 * スクリプトプロパティ SS_ID があればそのブック、
 * なければこのスクリプトが紐づいているブックを使う。
 */
function ブック_() {
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}


/** ===== シートへの追記 ===== */

/** 見出しの文字を比べられる形にそろえる（全角半角・空白の違いを無視） */
function 見出し比較用_(v) {
  return String(v == null ? '' : v).normalize('NFKC').replace(/[　\s]+/g, '');
}

/**
 * 見出し行の文字から、書き込む列の番号を探す。
 *
 * 列番号を決め打ちにしていると、シートの左に1列足されただけで
 * **静かに隣の列へ書いてしまう**。それを避けるために毎回探す。
 * 見つからないときは書かずにエラーで止める。
 */
function 列位置_(sh) {
  const 幅 = Math.max(sh.getLastColumn(), 10);
  const 行 = sh.getRange(設定.見出し行, 1, 1, 幅).getValues()[0].map(見出し比較用_);

  function 探す(名前) {
    const i = 行.indexOf(見出し比較用_(名前));
    if (i < 0) {
      throw new Error(
        'シート「' + sh.getName() + '」の' + 設定.見出し行 + '行目に見出し「' + 名前 + '」が見つかりません。'
        + ' 見出しの文字が変わっていないか確認してください。'
        + '（' + 設定.見出し行 + '行目: ' + 行.filter(String).join(' / ') + '）');
    }
    return i + 1;
  }

  return {
    入金日: 探す(設定.見出し.入金日),
    入金者: 探す(設定.見出し.入金者),
    入金額: 探す(設定.見出し.入金額)
  };
}

/** 入金日が属する月次シートの名前（例 2026/08） */
function 月シート名_(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 設定.シート名の形式);
}

/** 月次シートを取得。無ければ「コピー」シートを複製して作る */
function 月シート取得_(d) {
  const ss = ブック_();
  const 名前 = 月シート名_(d);

  let sh = ss.getSheetByName(名前);
  if (sh) return sh;

  const テンプレ = ss.getSheetByName(設定.テンプレシート);
  if (!テンプレ) {
    // 見出しの並びを勝手に作ると既存シートと形が変わるので、作らずに止める
    throw new Error(
      'シート「' + 名前 + '」が無く、複製元の「' + 設定.テンプレシート + '」シートも見つかりません。'
      + ' テンプレートのシート名を 設定.テンプレシート に合わせてください。');
  }

  // 見出し・列幅・書式ごと引き継ぐ
  sh = テンプレ.copyTo(ss).setName(名前);
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(ss.getNumSheets());   // 既存の並びに合わせて右端へ
  return sh;
}

/**
 * 実データの最終行を返す。
 * ※getLastRow() だけに頼らない。書式や入力規則が下まで入っていると
 *   空行なのに1000行目などを返すため、C列（入金者）の中身で判定する。
 */
function 最終データ行_(sh, 列) {
  const 最大 = sh.getLastRow();
  if (最大 < 設定.データ開始行) return 設定.データ開始行 - 1;

  const 値 = sh.getRange(設定.データ開始行, 列.入金者, 最大 - 設定.データ開始行 + 1, 1).getValues();
  for (let i = 値.length - 1; i >= 0; i--) {
    if (String(値[i][0]).trim() !== '') return 設定.データ開始行 + i;
  }
  return 設定.データ開始行 - 1;
}

/**
 * 既存の最終行が属する入金日を返す（yyyy-MM-dd）。
 * A列は「同じ日付なら空欄」の運用なので、上の行へさかのぼって探す。
 */
function 直近の入金日_(sh, 列, 最終行) {
  if (最終行 < 設定.データ開始行) return '';

  const 値 = sh.getRange(設定.データ開始行, 列.入金日, 最終行 - 設定.データ開始行 + 1, 1).getValues();
  for (let i = 値.length - 1; i >= 0; i--) {
    const v = 値[i][0];
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    if (String(v).trim() !== '') {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
  }
  return '';
}

/** 該当月のシートに1行追記する。既存行は絶対に触らない */
function 月シートに追記_(m, 状態) {
  const 名前 = 月シート名_(m.date);

  let s = 状態[名前];
  if (!s) {
    const sh = 月シート取得_(m.date);
    const 列 = 列位置_(sh);
    const 最終 = 最終データ行_(sh, 列);
    s = 状態[名前] = { sh: sh, 列: 列, 行: 最終, 前回日付: 直近の入金日_(sh, 列, 最終) };
  }

  const 行 = ++s.行;
  const 日付キー = Utilities.formatDate(m.date, 'Asia/Tokyo', 'yyyy-MM-dd');

  // 同じ日付が続く行は日付を書かない（既存の手入力の書き方に合わせる）
  if (!設定.同じ日付は空欄にする || 日付キー !== s.前回日付) {
    s.sh.getRange(行, s.列.入金日).setValue(m.date).setNumberFormat('yyyy/mm/dd');
  }
  s.sh.getRange(行, s.列.入金者).setValue(m.name);
  s.sh.getRange(行, s.列.入金額).setValue(m.amount).setNumberFormat('#,##0');

  s.前回日付 = 日付キー;
}


/** ===== 重複防止（隠しシートで処理済みIDを管理） ===== */

function 管理シート_() {
  const ss = ブック_();
  let sh = ss.getSheetByName(設定.管理シート);
  if (!sh) {
    sh = ss.insertSheet(設定.管理シート);
    sh.getRange('A1').setValue('処理済み明細ID（削除しないでください）');
    sh.hideSheet();
  }
  return sh;
}

function 処理済みID取得_() {
  const sh = 管理シート_();
  const 最大 = sh.getLastRow();
  const s = new Set();
  if (最大 >= 2) {
    sh.getRange(2, 1, 最大 - 1, 1).getValues()
      .forEach(r => { if (r[0]) s.add(String(r[0])); });
  }
  return s;
}

function 処理済みID保存_(s) {
  const sh = 管理シート_();
  let ids = Array.from(s);
  if (ids.length > 5000) ids = ids.slice(-5000);

  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).clearContent();
  if (ids.length) {
    sh.getRange(2, 1, ids.length, 1).setValues(ids.map(v => [v]));
  }
}


/** ===== freee API ===== */

const FREEE = {
  AUTH:     'https://accounts.secure.freee.co.jp/public_api/authorize',
  TOKEN:    'https://accounts.secure.freee.co.jp/public_api/token',
  BASE:     'https://api.freee.co.jp',
  REDIRECT: 'urn:ietf:wg:oauth:2.0:oob'
};

function freeeから入金を取得_(開始, 終了) {
  const 結果 = [];
  const 開始日 = 遅いほうの日付_(日付文字列_(開始), 設定.取り込み開始日);
  let offset = 0;
  let 最新明細日 = '';

  while (true) {
    const json = freeeGet_('/api/1/wallet_txns', {
      company_id:      prop_('FREEE_COMPANY_ID'),
      walletable_type: 'bank_account',
      walletable_id:   prop_('FREEE_WALLETABLE_ID'),
      entry_side:      'income',           // ★入金のみ
      start_date:      開始日,
      end_date:        日付文字列_(終了),
      limit:  100,
      offset: offset
    });

    const list = json.wallet_txns || [];
    list.forEach(w => {
      // 除外する明細も「明細が届いているか」の判断には使う
      if (String(w.date) > 最新明細日) 最新明細日 = String(w.date);

      if (String(w.date) < 設定.取り込み開始日) return;   // 手入力済みの期間は触らない

      const 摘要 = String(w.description || '');
      if (除外対象か_(摘要)) return;

      const 金額 = Number(w.amount);
      if (!金額 || 金額 < 設定.最低金額) return;

      結果.push({
        id:     String(w.id),
        date:   日付変換_(w.date),
        name:   入金者名を整形_(摘要),
        amount: 金額
      });
    });

    if (list.length < 100) break;
    offset += 100;
    if (offset > 3000) break;
  }

  if (最新明細日) {
    PropertiesService.getScriptProperties().setProperty('最終明細日', 最新明細日);
  }

  結果.sort((a, b) => a.date - b.date);   // 古い順に追記
  return 結果;
}

function freeeGet_(path, params) {
  const qs = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');

  for (let i = 0; i < 3; i++) {
    const res = UrlFetchApp.fetch(FREEE.BASE + path + '?' + qs, {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + トークン取得_(),
        'X-Api-Version': '2020-06-15'
      },
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code === 200) return JSON.parse(res.getContentText());
    if (code === 429 || code === 403) { Utilities.sleep(20000 * (i + 1)); continue; }
    throw new Error('freee API失敗 (' + code + '): ' + res.getContentText());
  }
  throw new Error('freee API リトライ上限: ' + path);
}

/**
 * アクセストークン取得。
 * ★freeeのリフレッシュトークンは使い捨て。
 *   新しい値を必ず即保存すること（ここを変えると次回から動かなくなります）
 */
function トークン取得_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('FREEE_TOKEN');
  if (c) return c;

  const res = UrlFetchApp.fetch(FREEE.TOKEN, {
    method: 'post',
    payload: {
      grant_type:    'refresh_token',
      client_id:     prop_('FREEE_CLIENT_ID'),
      client_secret: prop_('FREEE_CLIENT_SECRET'),
      refresh_token: prop_('FREEE_REFRESH_TOKEN')
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('トークン更新失敗: ' + res.getContentText()
      + '\n※ step1_認可URL表示 から再認可してください');
  }

  const j = JSON.parse(res.getContentText());
  PropertiesService.getScriptProperties()
    .setProperty('FREEE_REFRESH_TOKEN', j.refresh_token);   // ★必須
  cache.put('FREEE_TOKEN', j.access_token,
            Math.max(60, Number(j.expires_in || 3600) - 300));
  return j.access_token;
}


/** ===== 見張り：明細が届かなくなったことに気づく ===== */

/**
 * freee側で銀行口座の連携が切れると、**エラーは出ないのに明細が来ない**状態になる。
 * この関数を1日1回動かしておけば、その状態をメールで知らせる。
 * （振込版で「目視確認だけは残ります」と言っていた部分をここで潰している）
 */
function 入金が途絶えていないか見張る() {
  const p = PropertiesService.getScriptProperties();
  const 最終 = p.getProperty('最終明細日');
  if (!最終) return;                       // まだ一度も取得していない

  const 経過 = Math.floor((new Date().getTime() - 日付変換_(最終).getTime()) / 86400000);
  if (経過 < 設定.無音アラート日数) return;

  const 今日 = 日付文字列_(new Date());
  if (p.getProperty('無音通知済み日') === 今日) return;   // 1日1通まで
  p.setProperty('無音通知済み日', 今日);

  メール通知_(
    '[入金自動記入] 入金明細が' + 経過 + '日間届いていません',
    'freee側で銀行口座の連携が切れている可能性があります。\n' +
    'freeeの［口座］画面を開いて同期の状態を確認し、必要なら再連携してください。\n\n' +
    '最後に確認できた明細の日付: ' + 最終
  );
}


/** ===== 確認用 ===== */

/** 摘要の一覧を出す（除外設定や名前の整形を決めるときに使う） */
function 摘要を確認する() {
  const 今日 = new Date();
  const 開始 = new Date(今日.getTime() - 30 * 86400000);
  const 一覧 = {};

  let offset = 0;
  while (true) {
    const json = freeeGet_('/api/1/wallet_txns', {
      company_id:      prop_('FREEE_COMPANY_ID'),
      walletable_type: 'bank_account',
      walletable_id:   prop_('FREEE_WALLETABLE_ID'),
      entry_side:      'income',
      start_date:      日付文字列_(開始),
      end_date:        日付文字列_(今日),
      limit: 100, offset: offset
    });
    const list = json.wallet_txns || [];
    list.forEach(w => {
      const d = String(w.description || '(空)');
      一覧[d] = (一覧[d] || 0) + 1;
    });
    if (list.length < 100) break;
    offset += 100;
    if (offset > 3000) break;
  }

  Logger.log('=== 直近30日の摘要（除外前・全件） ===');
  Object.keys(一覧).sort().forEach(d => {
    Logger.log((除外対象か_(d) ? '［除外］' : '　記載　')
      + ' ' + 一覧[d] + '件  ' + d + '　→　' + 入金者名を整形_(d));
  });
}

/** 今どうなっているかを一括で確認する（書き込みはしない） */
function 状況を確認する() {
  const 今日 = new Date();
  const 開始 = new Date(今日.getTime() - 設定.遡る日数 * 86400000);

  const ss = ブック_();
  Logger.log('■ 書き込み先: ' + ss.getName());
  Logger.log('   URL: ' + ss.getUrl());
  Logger.log('   シート: ' + ss.getSheets().map(s => s.getName()).join(' / '));
  Logger.log('■ 取り込み開始日: ' + 設定.取り込み開始日 + ' 以降のみ記載します');

  const 済み = 処理済みID取得_();
  Logger.log('■ ' + 設定.管理シート + ' に登録済みのID: ' + 済み.size + '件');

  const 明細 = freeeから入金を取得_(開始, 今日);
  const 新規 = 明細.filter(m => !済み.has(m.id));
  Logger.log('■ 直近' + 設定.遡る日数 + '日の入金（除外後）: ' + 明細.length + '件');
  Logger.log('■ うち未登録の新規: ' + 新規.length + '件');

  Logger.log('--- 対象明細（先頭20件） ---');
  明細.slice(0, 20).forEach(m => {
    Logger.log((済み.has(m.id) ? '［登録済］' : '［新規　］')
      + ' ' + 日付文字列_(m.date) + '  ' + m.name + '  ' + m.amount);
  });
}

/** どの口座に入金明細が入っているか調べる */
function どの口座か調べる() {
  const 今日 = new Date();
  const 開始 = new Date(今日.getTime() - 30 * 86400000);
  const cid = prop_('FREEE_COMPANY_ID');

  (freeeGet_('/api/1/walletables', { company_id: cid }).walletables || [])
    .filter(w => w.type === 'bank_account')
    .forEach(w => {
      const j = freeeGet_('/api/1/wallet_txns', {
        company_id: cid,
        walletable_type: 'bank_account',
        walletable_id: w.id,
        entry_side: 'income',
        start_date: 日付文字列_(開始),
        end_date:   日付文字列_(今日),
        limit: 100
      });
      const list = j.wallet_txns || [];
      const 例 = list.length ? '　例: ' + list[0].date + ' ' + (list[0].description || '') : '';
      Logger.log('ID=' + w.id + '  ' + w.name + '　入金' + list.length + '件' + 例);
    });
}

/** _sync_入金 をリセットして、取り込み開始日以降をもう一度書き込む */
function 記入をやり直す() {
  const ss = ブック_();
  Logger.log('■ 書き込み先: ' + ss.getName());
  Logger.log('   ' + ss.getUrl());
  Logger.log('※ シートに既に書かれている行は消えません。');
  Logger.log('   やり直す前に、自動で入った行を手で消しておいてください。');

  const sh = 管理シート_();
  const 最大 = sh.getLastRow();
  if (最大 >= 2) sh.getRange(2, 1, 最大 - 1, 1).clearContent();
  Logger.log('■ ' + 設定.管理シート + ' をリセットしました');

  入金を取り込む();
}


/** ===== 初回セットアップ用（完了済みなら触らなくてOK） ===== */

function step1_認可URL表示() {
  Logger.log('▼このURLを開いて許可し、表示された認可コードを控えてください\n'
    + FREEE.AUTH
    + '?client_id='    + encodeURIComponent(prop_('FREEE_CLIENT_ID'))
    + '&redirect_uri=' + encodeURIComponent(FREEE.REDIRECT)
    + '&response_type=code');
}

function step2_認可コード登録() {
  // ↓ 認可コードは、この行の ' と ' の【あいだ】に貼り付けてください。
  //   「//」から右はプログラムとして読まれないので、そちらに貼っても動きません。
  const code = '';
  if (!code) throw new Error('認可コードを貼り付けてください');

  const res = UrlFetchApp.fetch(FREEE.TOKEN, {
    method: 'post',
    payload: {
      grant_type:    'authorization_code',
      client_id:     prop_('FREEE_CLIENT_ID'),
      client_secret: prop_('FREEE_CLIENT_SECRET'),
      code:          code,
      redirect_uri:  FREEE.REDIRECT
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('認可失敗: ' + res.getContentText());

  const j = JSON.parse(res.getContentText());
  PropertiesService.getScriptProperties().setProperty('FREEE_REFRESH_TOKEN', j.refresh_token);
  Logger.log('認可完了');
}

function step3_口座一覧表示() {
  (freeeGet_('/api/1/companies', {}).companies || []).forEach(c => {
    Logger.log('■ 事業所: ' + c.display_name + '　FREEE_COMPANY_ID = ' + c.id);
    (freeeGet_('/api/1/walletables', { company_id: c.id }).walletables || [])
      .filter(w => w.type === 'bank_account')
      .forEach(w => Logger.log('　　口座: ' + w.name + '　FREEE_WALLETABLE_ID = ' + w.id));
  });
}

/**
 * トリガーを登録する。
 * ★このプロジェクトのトリガーを全部消してから作り直すため、
 *   振込（出金）用スクリプトとは**別のプロジェクト**に入れること。
 */
function トリガー登録() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('入金を取り込む').timeBased().everyHours(4).create();
  ScriptApp.newTrigger('入金が途絶えていないか見張る').timeBased().everyDays(1).atHour(10).create();
  Logger.log('トリガーを登録しました（取り込み: 4時間ごと / 見張り: 毎日10時台）');
}


/** ===== 小道具 ===== */

function prop_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('スクリプトプロパティ未設定: ' + k);
  return v;
}

function 日付文字列_(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function 日付変換_(s) {
  const p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** yyyy-MM-dd の文字列同士を比べて遅いほうを返す */
function 遅いほうの日付_(a, b) {
  if (!b) return a;
  if (!a) return b;
  return a > b ? a : b;
}

function メール通知_(件名, 本文) {
  const to = PropertiesService.getScriptProperties().getProperty('ALERT_MAIL');
  if (!to) return;
  try {
    MailApp.sendEmail(to, 件名, 本文 + '\n\n' + ブック_().getUrl());
  } catch (e) { Logger.log('メール失敗: ' + e.message); }
}
