// ==================================================================
// マイ工賃メーター - 動作検証スクリプト（jsdom）
// 記録の「追加・一覧表示・編集・削除」と、それに連動する集計処理
// （今月の達成率／人生累計／記録日数／支給日カウントダウン）を検証する。
// ==================================================================

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log("  OK: " + message);
  } else {
    failCount++;
    console.error("  NG: " + message);
  }
}

function freshWindow() {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://kouchin.pray-power-is-god-and-cocoro.com/"
  });
  const window = dom.window;
  delete window.IntersectionObserver;
  return window;
}

function boot(window, js) {
  window.eval(js);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
}

async function run() {
  let window = freshWindow();
  let document = window.document;
  boot(window, js);

  console.log("\n[1] 初期表示の確認");
  assert(document.getElementById("onboarding").hidden === false, "初回はオンボーディングが表示されている");
  assert(document.getElementById("dashboard").hidden === true, "初回はメイン画面が非表示になっている");

  console.log("\n[2] オンボーディング完了（時給制）→ 応援メッセージが表示される");
  document.querySelector('input[name="payType"][value="hourly"]').checked = true;
  document.querySelector('input[name="payType"][value="hourly"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="hourlyWage"]').value = "1000";
  document.querySelector('input[name="monthlyGoal"]').value = "10000";
  document.querySelector('input[name="reward"]').value = "焼肉";
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  assert(document.getElementById("dashboard").hidden === false, "送信後はメイン画面が表示される");
  const cheerText = document.getElementById("cheer-message").textContent;
  assert(cheerText.length > 0, "応援メッセージが空でなく表示されている（表示: " + cheerText + "）");
  assert(document.getElementById("record-list-empty").hidden === false, "記録がまだない状態では「まだ記録がありません」が表示される");

  console.log("\n[3] 記録を1件追加（時給制・4時間）");
  document.getElementById("input-hours").value = "4";
  document.querySelector('.mood-button[data-mood="good"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  document.getElementById("input-memo").value = "午前中がんばれた";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));

  assert(document.getElementById("record-list-empty").hidden === true, "記録追加後は「まだ記録がありません」が消える");
  assert(document.querySelectorAll(".record-list__item").length === 1, "記録一覧に1件表示される");
  assert(document.getElementById("progress-text").textContent.indexOf("4,000円") !== -1, "達成率表示に4,000円が反映されている");
  assert(document.getElementById("input-hours").value === "", "追加後、入力欄がクリアされる");

  console.log("\n[4] さらに同じ日に2件目を追加（加算されることを確認）");
  document.getElementById("input-hours").value = "2";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));

  assert(document.querySelectorAll(".record-list__item").length === 2, "記録一覧に2件表示される（上書きされず追加される）");
  const progressAfterTwo = document.getElementById("progress-text").textContent;
  assert(progressAfterTwo.indexOf("6,000円") !== -1, "4,000円+2,000円=6,000円が正しく合算されている（表示: " + progressAfterTwo + "）");

  console.log("\n[5] 2件目を編集して金額を変更する");
  const secondItem = document.querySelectorAll(".record-list__item")[0];
  secondItem.querySelector('[data-action="edit"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert(document.getElementById("save-record-button").textContent === "記録を更新", "編集モードでボタンの文言が変わる");
  assert(document.getElementById("input-hours").value === "2", "編集モードで既存の値がフォームに読み込まれる");

  document.getElementById("input-hours").value = "5";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));

  assert(document.querySelectorAll(".record-list__item").length === 2, "編集後も件数は2件のまま（新規追加されない）");
  const progressAfterEdit = document.getElementById("progress-text").textContent;
  assert(progressAfterEdit.indexOf("9,000円") !== -1, "4,000円+5,000円=9,000円に正しく更新されている（表示: " + progressAfterEdit + "）");
  assert(document.getElementById("save-record-button").textContent === "記録を追加", "更新後は「記録を追加」モードに戻る");

  console.log("\n[6] 1件削除する");
  window.confirm = () => true;
  const itemToDelete = document.querySelectorAll(".record-list__item")[0];
  itemToDelete.querySelector('[data-action="delete"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  assert(document.querySelectorAll(".record-list__item").length === 1, "削除後は1件になる");

  console.log("\n[7] 日給制：出勤／お休みの選択と保存の確認（当時の不具合の再現テスト）");
  window = freshWindow();
  document = window.document;
  boot(window, js);

  document.querySelector('input[name="payType"][value="daily"]').checked = true;
  document.querySelector('input[name="payType"][value="daily"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="dailyWage"]').value = "5000";
  document.querySelector('input[name="monthlyGoal"]').value = "20000";
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  document.querySelector('[data-daily-choice="worked"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert(document.querySelectorAll(".record-list__item").length === 0, "選ぶだけではまだ記録一覧に追加されない");

  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert(document.querySelectorAll(".record-list__item").length === 1, "「記録を追加」を押すと1件保存される");
  assert(document.getElementById("progress-text").textContent.indexOf("5,000円") !== -1, "出勤した分の5,000円が反映される");

  document.querySelector('[data-daily-choice="rest"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert(document.querySelectorAll(".record-list__item").length === 2, "「お休み」の記録は、以前の出勤記録を消さずに別記録として追加される");
  assert(document.getElementById("progress-text").textContent.indexOf("5,000円") !== -1, "お休み（0円）を追加しても、既存の5,000円の記録は消えない");

  console.log("\n[8] 出来高制の確認");
  window = freshWindow();
  document = window.document;
  boot(window, js);

  document.querySelector('input[name="payType"][value="piece"]').checked = true;
  document.querySelector('input[name="payType"][value="piece"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="monthlyGoal"]').value = "8000";
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  document.getElementById("input-piece-amount").value = "3500";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert(document.getElementById("progress-fill").style.width === "44%", "3,500÷8,000=43.75%が四捨五入で44%になる");

  console.log("\n[9] 月をまたいだ集計の確認（日付の偽装のみで検証、スクリプトの再実行はしない）");
  window = freshWindow();
  document = window.document;
  const RealDateForMonthTest = window.Date;

  function makeMockDate(fixedDate) {
    function MockDate(...args) {
      if (args.length === 0) return new RealDateForMonthTest(fixedDate.getTime());
      return new RealDateForMonthTest(...args);
    }
    MockDate.prototype = RealDateForMonthTest.prototype;
    MockDate.now = function () { return fixedDate.getTime(); };
    return MockDate;
  }

  const realNow = new RealDateForMonthTest();
  const lastMonthFixed = new RealDateForMonthTest(realNow.getFullYear(), realNow.getMonth() - 1, 10);
  window.Date = makeMockDate(lastMonthFixed); // 「先月」に見せかける

  boot(window, js);
  document.querySelector('input[name="payType"][value="piece"]').checked = true;
  document.querySelector('input[name="payType"][value="piece"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="monthlyGoal"]').value = "8000";
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  document.getElementById("input-piece-amount").value = "10000";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  // ここまでで「先月」の日付で10,000円の記録が1件登録されている

  window.Date = RealDateForMonthTest; // 日付を「今月（実際の現在時刻）」に戻す（スクリプトの再実行はしない）

  document.getElementById("input-piece-amount").value = "3500";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  // ここで「今月」の日付で3,500円の記録が追加される

  const monthProgress = document.getElementById("progress-text").textContent;
  assert(monthProgress.indexOf("3,500円 / 8,000円") !== -1, "先月分10,000円が今月の達成率に混入していない（表示: " + monthProgress + "）");
  const lifetimeTotal = document.getElementById("lifetime-total").textContent;
  assert(lifetimeTotal === "13,500円", "人生累計には先月分＋今月分の両方が含まれる（表示: " + lifetimeTotal + "）");
  const lifetimeDays = document.getElementById("lifetime-days").textContent;
  assert(lifetimeDays === "2日", "記録した日数は「日単位」でカウントされる（表示: " + lifetimeDays + "）");

  console.log("\n[10] 目標達成時のシェアボタン表示確認");
  document.getElementById("input-piece-amount").value = "4500"; // 3,500+4,500=8,000で100%
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert(document.getElementById("progress-fill").style.width === "100%", "100%達成時に進捗バーが100%になる");
  assert(document.getElementById("share-area").hidden === false, "100%達成時にシェアボタンが表示される");

  console.log("\n[11] 支給日カウントダウンの正確性チェック（日付を差し替えての直接比較）");
  function referenceNextPaymentDate(fromDate) {
    const evenMonthsIndex = [1, 3, 5, 7, 9, 11];
    const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    for (let yOffset = 0; yOffset <= 1; yOffset++) {
      for (let i = 0; i < evenMonthsIndex.length; i++) {
        const candidate = new Date(from.getFullYear() + yOffset, evenMonthsIndex[i], 15);
        const day = candidate.getDay();
        if (day === 6) candidate.setDate(candidate.getDate() - 1);
        if (day === 0) candidate.setDate(candidate.getDate() - 2);
        if (candidate >= from) return candidate;
      }
    }
    return null;
  }

  window = freshWindow();
  document = window.document;
  boot(window, js);
  document.querySelector('input[name="payType"][value="piece"]').checked = true;
  document.querySelector('input[name="payType"][value="piece"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="monthlyGoal"]').value = "5000";
  document.querySelector('input[name="benefitPension"]').checked = true;
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  const testDates = [
    new Date(2026, 0, 1),
    new Date(2026, 6, 12),
    new Date(2026, 7, 1),
    new Date(2026, 11, 31),
    new Date(2026, 1, 15)
  ];
  const OriginalDate = window.Date;

  testDates.forEach(function (testDate) {
    function MockDate(...args) {
      if (args.length === 0) return new OriginalDate(testDate.getTime());
      return new OriginalDate(...args);
    }
    MockDate.prototype = OriginalDate.prototype;
    MockDate.now = function () { return testDate.getTime(); };
    window.Date = MockDate;

    boot(window, js);

    const expected = referenceNextPaymentDate(testDate);
    const expectedDiff = Math.round((expected - testDate) / (1000 * 60 * 60 * 24));
    const expectedText = expectedDiff === 0 ? "本日です！" : "あと " + expectedDiff + "日";
    const actualText = document.getElementById("pension-countdown").textContent;
    const label = testDate.getFullYear() + "-" + String(testDate.getMonth() + 1).padStart(2, "0") + "-" + String(testDate.getDate()).padStart(2, "0");

    assert(actualText === expectedText, "基準日 " + label + "：期待値[" + expectedText + "] 実際[" + actualText + "]");
    window.Date = OriginalDate;
  });

  console.log("\n[12] リセット機能の確認");
  window.confirm = () => true;
  try {
    document.getElementById("reset-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  } catch (e) {
    // jsdomはページ遷移（location.reload）を実装していないため許容する。
  }
  assert(window.localStorage.getItem("kouchinState") === null, "リセットでlocalStorageが空になる");

  console.log("\n[13] CSSの基本チェック");
  assert(css.indexOf("--gutter") !== -1, "--gutter 変数が定義されている");
  assert(css.indexOf("--content-max-width") !== -1, "--content-max-width 変数が定義されている");
  assert(css.indexOf("prefers-reduced-motion") !== -1, "prefers-reduced-motion への配慮がある");
  assert(css.indexOf("main > article") !== -1, "コラムページ（article内）のセクション間余白に対応している");
  assert(css.indexOf(".record-list__item") !== -1, "記録一覧のスタイルが定義されている");

  console.log("\n[14] HTMLの必須要件チェック");
  assert(html.indexOf('name="robots" content="noindex"') !== -1, "noindexが設定されている");
  assert(html.indexOf('rel="canonical" href="https://kouchin.pray-power-is-god-and-cocoro.com/"') !== -1, "canonicalタグが正しいURLで設定されている");
  assert(html.indexOf("ca-pub-2908004621823900") !== -1, "AdSenseクライアントIDが記載されている（コメントアウト状態）");
  assert(html.indexOf("data-ad-slot=\"5820083954\"") !== -1, "AdSenseの広告スロットIDが記載されている");
  assert(html.indexOf("record-list") !== -1, "記録一覧の要素がHTMLに存在する");

  console.log("\n==================================================");
  console.log("結果： " + passCount + "件 成功 / " + failCount + "件 失敗");
  console.log("==================================================");

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("テスト実行中にエラーが発生しました:", err);
  process.exitCode = 1;
});
