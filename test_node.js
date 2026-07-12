// ==================================================================
// マイ工賃メーター - 動作検証スクリプト（jsdom）
// オンボーディング完了 → 今日の記録保存 → 集計表示までを
// 実際にブラウザ相当の環境で動かして確認する。
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

async function run() {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://kouchin.pray-power-is-god-and-cocoro.com/"
  });
  const window = dom.window;
  const document = window.document;

  // localStorage の簡易モック（jsdomにも存在するが念のため確認）
  assert(typeof window.localStorage !== "undefined", "localStorageが利用可能である");

  // IntersectionObserver がない環境向けの分岐も通るようにする
  delete window.IntersectionObserver;

  // script.js を実行
  window.eval(js);

  // DOMContentLoaded を発火させて初期化処理を走らせる
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

  console.log("\n[1] 初期表示の確認");
  assert(document.getElementById("onboarding").hidden === false, "初回はオンボーディングが表示されている");
  assert(document.getElementById("dashboard").hidden === true, "初回はメイン画面が非表示になっている");

  console.log("\n[2] オンボーディング入力（時給制）");
  const payTypeRadio = document.querySelector('input[name="payType"][value="hourly"]');
  payTypeRadio.checked = true;
  payTypeRadio.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(document.getElementById("step-wage-hourly").hidden === false, "時給制を選ぶと時給入力欄が表示される");

  document.querySelector('input[name="hourlyWage"]').value = "1000";
  document.querySelector('input[name="monthlyGoal"]').value = "10000";
  document.querySelector('input[name="reward"]').value = "焼肉";
  document.querySelector('input[name="benefitPension"]').checked = true;

  const form = document.getElementById("onboarding-form");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  assert(document.getElementById("onboarding").hidden === true, "送信後はオンボーディングが非表示になる");
  assert(document.getElementById("dashboard").hidden === false, "送信後はメイン画面が表示される");

  const savedRaw = window.localStorage.getItem("kouchinState");
  assert(!!savedRaw, "localStorageに状態が保存されている");
  const saved = JSON.parse(savedRaw);
  assert(saved.setupDone === true, "setupDoneがtrueになっている");
  assert(saved.hourlyWage === 1000, "時給が正しく保存されている");
  assert(saved.monthlyGoal === 10000, "目標額が正しく保存されている");
  assert(saved.benefitPension === true, "障害年金の受給フラグが保存されている");

  console.log("\n[3] 今日の記録を保存（時給制・4時間勤務）");
  document.getElementById("input-hours").value = "4";
  const moodGoodButton = document.querySelector('.mood-button[data-mood="good"]');
  moodGoodButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  document.getElementById("input-memo").value = "午前中がんばれた";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));

  const progressText = document.getElementById("progress-text").textContent;
  assert(progressText.indexOf("4,000円") !== -1, "1000円×4時間=4,000円が達成率表示に反映されている（表示: " + progressText + "）");
  assert(document.getElementById("progress-fill").style.width === "40%", "進捗バーが40%になっている");

  const rewardText = document.getElementById("reward-text").textContent;
  assert(rewardText.indexOf("6,000円") !== -1, "ご褒美までの残額が正しい（表示: " + rewardText + "）");

  const lifetimeTotal = document.getElementById("lifetime-total").textContent;
  assert(lifetimeTotal === "4,000円", "人生累計が正しい（表示: " + lifetimeTotal + "）");
  const lifetimeDays = document.getElementById("lifetime-days").textContent;
  assert(lifetimeDays === "1日", "記録日数が正しい（表示: " + lifetimeDays + "）");

  console.log("\n[4] 目標達成時のシェアボタン表示確認");
  // 同じ日の記録は「加算」ではなく「上書き」される仕様（1日1レコード）のため、
  // 1回の保存で合計10,000円（=目標100%）になるよう入力し直す。
  document.getElementById("input-hours").value = "10";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert(document.getElementById("progress-fill").style.width === "100%", "100%達成時に進捗バーが100%になる");
  assert(document.getElementById("share-area").hidden === false, "100%達成時にシェアボタンが表示される");

  console.log("\n[5] 支給日カウントダウンの表示確認");
  const pensionWidgetHidden = document.getElementById("pension-widget").hidden;
  assert(pensionWidgetHidden === false, "障害年金を選択している場合、支給日ウィジェットが表示される");
  const countdownText = document.getElementById("pension-countdown").textContent;
  assert(/あと \d+日|本日です！/.test(countdownText), "支給日カウントダウンが数値として表示されている（表示: " + countdownText + "）");

  console.log("\n[6] 日給制での動作確認（別セッション相当）");
  window.localStorage.clear();
  window.eval(js); // 状態を読み直すため再実行
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

  document.querySelector('input[name="payType"][value="daily"]').checked = true;
  document.querySelector('input[name="payType"][value="daily"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="dailyWage"]').value = "5000";
  document.querySelector('input[name="monthlyGoal"]').value = "20000";
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  const workedButton = document.querySelector('[data-daily-choice="worked"]');
  workedButton.dispatchEvent(new window.Event("click", { bubbles: true }));
  const dailyProgress = document.getElementById("progress-text").textContent;
  assert(dailyProgress.indexOf("5,000円") !== -1, "日給制：出勤ボタンで5,000円が加算される（表示: " + dailyProgress + "）");

  console.log("\n[7] リセット機能の確認");
  window.confirm = () => true; // confirmダイアログを自動でOKにする
  try {
    document.getElementById("reset-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  } catch (e) {
    // jsdomはページ遷移（location.reload）を実装していないため、
    // ここでの例外はテスト環境特有のものとして許容する。
  }
  assert(window.localStorage.getItem("kouchinState") === null, "リセットでlocalStorageが空になる");

  console.log("\n[7b] 出来高制での動作確認");
  window.localStorage.clear();
  window.eval(js);
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

  document.querySelector('input[name="payType"][value="piece"]').checked = true;
  document.querySelector('input[name="payType"][value="piece"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="monthlyGoal"]').value = "8000";
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  document.getElementById("input-piece-amount").value = "3500";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));
  const pieceProgress = document.getElementById("progress-text").textContent;
  assert(pieceProgress.indexOf("3,500円") !== -1, "出来高制：直接入力した金額が反映される（表示: " + pieceProgress + "）");
  assert(document.getElementById("progress-fill").style.width === "44%", "3,500÷8,000=43.75%が四捨五入で44%になる（表示: " + document.getElementById("progress-fill").style.width + "）");

  console.log("\n[7c] 月をまたいだ集計の確認（今月分だけが達成率に反映され、人生累計には両方含まれる）");
  window.localStorage.clear();
  window.eval(js);
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

  document.querySelector('input[name="payType"][value="piece"]').checked = true;
  document.querySelector('input[name="payType"][value="piece"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="monthlyGoal"]').value = "5000";
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  // 先月分のダミーデータをlocalStorageへ直接書き込む（先月10,000円）
  const stateForMonthTest = JSON.parse(window.localStorage.getItem("kouchinState"));
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 10);
  const lastMonthKey = lastMonthDate.getFullYear() + "-" + String(lastMonthDate.getMonth() + 1).padStart(2, "0") + "-10";
  stateForMonthTest.entries[lastMonthKey] = { amount: 10000, mood: "good", memo: "先月分" };
  window.localStorage.setItem("kouchinState", JSON.stringify(stateForMonthTest));
  window.eval(js);
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

  document.getElementById("input-piece-amount").value = "2000";
  document.getElementById("save-record-button").dispatchEvent(new window.Event("click", { bubbles: true }));

  const monthCrossProgress = document.getElementById("progress-text").textContent;
  assert(monthCrossProgress.indexOf("2,000円 / 5,000円") !== -1, "今月分の集計に先月分10,000円が混入していない（表示: " + monthCrossProgress + "）");
  const monthCrossLifetime = document.getElementById("lifetime-total").textContent;
  assert(monthCrossLifetime === "12,000円", "人生累計には先月分＋今月分の両方が含まれる（表示: " + monthCrossLifetime + "）");

  console.log("\n[7d] 支給日カウントダウンの正確性チェック（日付を差し替えての直接比較）");
  // 障害年金の「偶数月15日・土日は直前平日に前倒し」ルールを、
  // script.js とは別に、このテストファイル内で改めて実装し、
  // 「今日の日付」を複数パターンに差し替えながら、
  // アプリの表示結果と期待値が一致するかを直接比較する。
  function referenceNextPaymentDate(fromDate) {
    const evenMonthsIndex = [1, 3, 5, 7, 9, 11]; // 2,4,6,8,10,12月（0始まり）
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

  // 障害年金ONの状態を用意
  window.localStorage.clear();
  window.eval(js);
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
  document.querySelector('input[name="payType"][value="piece"]').checked = true;
  document.querySelector('input[name="payType"][value="piece"]').dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector('input[name="monthlyGoal"]').value = "5000";
  document.querySelector('input[name="benefitPension"]').checked = true;
  document.getElementById("onboarding-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  const testDates = [
    new Date(2026, 0, 1),    // 2026-01-01（元日）
    new Date(2026, 6, 12),   // 2026-07-12（今回の作業日）
    new Date(2026, 7, 1),    // 2026-08-01
    new Date(2026, 11, 31),  // 2026-12-31（年またぎ）
    new Date(2026, 1, 15)    // 2026-02-15（ちょうど支給日当日のケース）
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

    window.eval(js); // 日付だけ差し替えて再初期化（benefitPension等の状態はlocalStorageに残ったまま）
    document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

    const expected = referenceNextPaymentDate(testDate);
    const expectedDiff = Math.round((expected - testDate) / (1000 * 60 * 60 * 24));
    const expectedText = expectedDiff === 0 ? "本日です！" : "あと " + expectedDiff + "日";
    const actualText = document.getElementById("pension-countdown").textContent;
    const label = testDate.getFullYear() + "-" + String(testDate.getMonth() + 1).padStart(2, "0") + "-" + String(testDate.getDate()).padStart(2, "0");

    assert(actualText === expectedText, "基準日 " + label + "：期待値[" + expectedText + "] 実際[" + actualText + "]");

    window.Date = OriginalDate; // 後片付け
  });

  console.log("\n[8] CSSの基本チェック（左右余白の変数が定義されているか）");
  assert(css.indexOf("--gutter") !== -1, "--gutter 変数が定義されている");
  assert(css.indexOf("--content-max-width") !== -1, "--content-max-width 変数が定義されている");
  assert(css.indexOf("prefers-reduced-motion") !== -1, "prefers-reduced-motion への配慮がある");

  console.log("\n[9] HTMLの必須要件チェック");
  assert(html.indexOf('name="robots" content="noindex"') !== -1, "noindexが設定されている");
  assert(html.indexOf('rel="canonical" href="https://kouchin.pray-power-is-god-and-cocoro.com/"') !== -1, "canonicalタグが正しいURLで設定されている");
  assert(html.indexOf("ca-pub-2908004621823900") !== -1, "AdSenseクライアントIDが記載されている（コメントアウト状態）");
  assert(html.indexOf("data-ad-slot=\"5820083954\"") !== -1, "AdSenseの広告スロットIDが記載されている");
  assert(html.indexOf("<!--\n  <section class=\"section reveal ad-section\">") !== -1, "AdSense本体がコメントアウトされている");

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
