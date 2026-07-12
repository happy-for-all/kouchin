/* ==================================================================
   マイ工賃メーター - script.js
   ------------------------------------------------------------------
   目次
   1. 状態管理（localStorage）
   2. スクロール出現アニメーション
   3. 初期設定フォーム（オンボーディング）
   4. メイン画面の表示切り替え・レンダリング
   5. 今日の記録（工賃・気分・メモ）の保存
   6. 集計処理（今月の達成率／人生累計／記録日数）
   7. 支給日カウントダウン（障害年金：偶数月15日・土日前倒しのみ考慮）
   8. 応援メッセージ
   9. リセット機能（テスト用）
   10. 初期化
================================================================== */

(function () {
  "use strict";

  /* ----------------------------------------------------------------
     1. 状態管理（localStorage）
     すべてのデータはこの端末のブラウザ内にのみ保存する。
     サーバーへの送信は一切行わない。
  ---------------------------------------------------------------- */
  var STORAGE_KEY = "kouchinState";

  var defaultState = {
    setupDone: false,
    payType: null,        // "hourly" | "daily" | "piece"
    hourlyWage: 0,
    dailyWage: 0,
    monthlyGoal: 0,
    reward: "",
    benefitPension: false,
    entries: {}            // { "2026-07-12": { amount: 1500, mood: "good", memo: "..." } }
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Object.assign({}, defaultState, parsed);
    } catch (e) {
      console.error("状態の読み込みに失敗しました", e);
      return null;
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error("状態の保存に失敗しました", e);
      return false;
    }
  }

  var state = loadState() || Object.assign({}, defaultState);


  /* ----------------------------------------------------------------
     2. スクロール出現アニメーション
     .reveal を持つセクションが画面内に入ったら is-visible を付与する。
  ---------------------------------------------------------------- */
  function initRevealAnimation() {
    var targets = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var observer = new IntersectionObserver(function (entriesList) {
      entriesList.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (el) { observer.observe(el); });
  }


  /* ----------------------------------------------------------------
     3. 初期設定フォーム（オンボーディング）
  ---------------------------------------------------------------- */
  function initOnboarding() {
    var form = document.getElementById("onboarding-form");
    if (!form) return;

    var payTypeRadios = form.querySelectorAll('input[name="payType"]');
    var wageSections = {
      hourly: document.getElementById("step-wage-hourly"),
      daily: document.getElementById("step-wage-daily"),
      piece: document.getElementById("step-wage-piece")
    };

    payTypeRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        Object.keys(wageSections).forEach(function (key) {
          wageSections[key].hidden = (key !== radio.value);
        });
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var formData = new FormData(form);
      var payType = formData.get("payType");

      if (!payType) {
        window.alert("働き方を選択してください。");
        return;
      }

      state.payType = payType;
      state.hourlyWage = Number(formData.get("hourlyWage")) || 0;
      state.dailyWage = Number(formData.get("dailyWage")) || 0;
      state.monthlyGoal = Number(formData.get("monthlyGoal")) || 0;
      state.reward = (formData.get("reward") || "").toString().trim();
      state.benefitPension = formData.get("benefitPension") === "on";
      state.setupDone = true;

      saveState(state);
      renderDashboard();
      toggleOnboardingVisibility();
    });
  }

  function toggleOnboardingVisibility() {
    var onboarding = document.getElementById("onboarding");
    var dashboard = document.getElementById("dashboard");
    if (!onboarding || !dashboard) return;

    if (state.setupDone) {
      onboarding.hidden = true;
      dashboard.hidden = false;
    } else {
      onboarding.hidden = false;
      dashboard.hidden = true;
    }
  }


  /* ----------------------------------------------------------------
     4. メイン画面の表示切り替え・レンダリング
  ---------------------------------------------------------------- */
  var selectedMood = null;

  function todayKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function renderDashboard() {
    if (!state.setupDone) return;

    // 働き方に応じた入力欄の出し分け
    var inputs = {
      hourly: document.getElementById("today-input-hourly"),
      daily: document.getElementById("today-input-daily"),
      piece: document.getElementById("today-input-piece")
    };
    Object.keys(inputs).forEach(function (key) {
      if (inputs[key]) inputs[key].hidden = (key !== state.payType);
    });

    // 既に今日の記録がある場合は、フォームに反映する
    var existing = state.entries[todayKey()];
    if (existing) {
      if (state.payType === "hourly" && existing.hours != null) {
        document.getElementById("input-hours").value = existing.hours;
      }
      if (state.payType === "piece") {
        document.getElementById("input-piece-amount").value = existing.amount;
      }
      document.getElementById("input-memo").value = existing.memo || "";
      selectedMood = existing.mood || null;
    }
    updateMoodButtons();

    renderCheerMessage();
    renderGoalProgress();
    renderLifetimeStats();
    renderPensionCountdown();
  }

  function updateMoodButtons() {
    var buttons = document.querySelectorAll(".mood-button");
    buttons.forEach(function (btn) {
      btn.classList.toggle("is-selected", btn.dataset.mood === selectedMood);
    });
  }


  /* ----------------------------------------------------------------
     5. 今日の記録（工賃・気分・メモ）の保存
  ---------------------------------------------------------------- */
  function initTodayRecordForm() {
    // 気分ボタン
    var moodButtons = document.querySelectorAll(".mood-button");
    moodButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedMood = btn.dataset.mood;
        updateMoodButtons();
      });
    });

    // 日給制：出勤／お休みボタン
    var dailyButtons = document.querySelectorAll("[data-daily-choice]");
    dailyButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var amount = (btn.dataset.dailyChoice === "worked") ? state.dailyWage : 0;
        saveTodayEntry(amount);
      });
    });

    // 保存ボタン（時給制・出来高制はこちらから保存）
    var saveButton = document.getElementById("save-record-button");
    if (saveButton) {
      saveButton.addEventListener("click", function () {
        var amount = 0;

        if (state.payType === "hourly") {
          var hours = Number(document.getElementById("input-hours").value) || 0;
          amount = hours * state.hourlyWage;
          saveTodayEntry(amount, { hours: hours });
        } else if (state.payType === "piece") {
          amount = Number(document.getElementById("input-piece-amount").value) || 0;
          saveTodayEntry(amount);
        } else {
          // 日給制はボタンで既に保存済みのケースが多いが、
          // メモ・気分だけ更新したい場合にも対応する。
          var existing = state.entries[todayKey()];
          amount = existing ? existing.amount : 0;
          saveTodayEntry(amount);
        }
      });
    }
  }

  function saveTodayEntry(amount, extra) {
    var memo = document.getElementById("input-memo").value.trim();
    var entry = Object.assign({
      amount: amount,
      mood: selectedMood,
      memo: memo
    }, extra || {});

    state.entries[todayKey()] = entry;
    saveState(state);

    renderGoalProgress();
    renderLifetimeStats();

    var status = document.getElementById("save-status");
    if (status) {
      status.textContent = "記録しました！（" + amount.toLocaleString() + "円）";
      window.setTimeout(function () { status.textContent = ""; }, 4000);
    }
  }


  /* ----------------------------------------------------------------
     6. 集計処理（今月の達成率／人生累計／記録日数）
  ---------------------------------------------------------------- */
  function getThisMonthPrefix() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function renderGoalProgress() {
    var prefix = getThisMonthPrefix();
    var monthTotal = 0;

    Object.keys(state.entries).forEach(function (dateKey) {
      if (dateKey.indexOf(prefix) === 0) {
        monthTotal += state.entries[dateKey].amount || 0;
      }
    });

    var goal = state.monthlyGoal || 0;
    var percent = goal > 0 ? Math.min(100, Math.round((monthTotal / goal) * 100)) : 0;

    var fill = document.getElementById("progress-fill");
    var text = document.getElementById("progress-text");
    var rewardText = document.getElementById("reward-text");
    var shareArea = document.getElementById("share-area");
    var shareLink = document.getElementById("share-link");

    if (fill) fill.style.width = percent + "%";
    if (text) {
      text.textContent = percent + "%（" + monthTotal.toLocaleString() + "円 / " + goal.toLocaleString() + "円）";
    }

    if (rewardText) {
      if (state.reward) {
        var remaining = Math.max(0, goal - monthTotal);
        rewardText.textContent = remaining > 0
          ? "ご褒美「" + state.reward + "」まで、あと " + remaining.toLocaleString() + "円"
          : "ご褒美「" + state.reward + "」、達成おめでとうございます！";
      } else {
        rewardText.textContent = "";
      }
    }

    // 達成時のみSNSシェアボタンを表示
    if (shareArea && shareLink) {
      if (percent >= 100) {
        var shareText = "今月の目標を達成しました！" + (state.reward ? "ご褒美は「" + state.reward + "」です。" : "") + " #マイ工賃メーター";
        shareLink.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText);
        shareArea.hidden = false;
      } else {
        shareArea.hidden = true;
      }
    }
  }

  function renderLifetimeStats() {
    var total = 0;
    var days = 0;

    Object.keys(state.entries).forEach(function (dateKey) {
      total += state.entries[dateKey].amount || 0;
      days += 1;
    });

    var totalEl = document.getElementById("lifetime-total");
    var daysEl = document.getElementById("lifetime-days");
    if (totalEl) totalEl.textContent = total.toLocaleString() + "円";
    if (daysEl) daysEl.textContent = days.toLocaleString() + "日";
  }


  /* ----------------------------------------------------------------
     7. 支給日カウントダウン
     障害年金は「偶数月の15日」に支給される（土日の場合は直前の平日に前倒し）。
     ※祝日による前倒しは、正確な祝日データを持たないため対象外とする。
       この点はUI側にも注記している。
  ---------------------------------------------------------------- */
  function adjustForWeekend(date) {
    var day = date.getDay(); // 0:日 6:土
    var adjusted = new Date(date);
    if (day === 6) {
      adjusted.setDate(adjusted.getDate() - 1); // 土→金
    } else if (day === 0) {
      adjusted.setDate(adjusted.getDate() - 2); // 日→金
    }
    return adjusted;
  }

  function nextPensionPaymentDate(from) {
    var evenMonths = [2, 4, 6, 8, 10, 12];
    var year = from.getFullYear();

    for (var yOffset = 0; yOffset <= 1; yOffset++) {
      for (var i = 0; i < evenMonths.length; i++) {
        var candidate = new Date(year + yOffset, evenMonths[i] - 1, 15);
        var adjusted = adjustForWeekend(candidate);
        if (adjusted >= stripTime(from)) {
          return adjusted;
        }
      }
    }
    return null;
  }

  function stripTime(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function renderPensionCountdown() {
    var widget = document.getElementById("pension-widget");
    var countdownEl = document.getElementById("pension-countdown");
    if (!widget || !countdownEl) return;

    if (!state.benefitPension) {
      widget.hidden = true;
      return;
    }

    widget.hidden = false;
    var today = stripTime(new Date());
    var nextDate = nextPensionPaymentDate(today);

    if (!nextDate) {
      countdownEl.textContent = "-";
      return;
    }

    var diffDays = Math.round((nextDate - today) / (1000 * 60 * 60 * 24));
    countdownEl.textContent = diffDays === 0 ? "本日です！" : "あと " + diffDays + "日";
  }


  /* ----------------------------------------------------------------
     8. 応援メッセージ（日替わり・ランダム表示）
  ---------------------------------------------------------------- */
  var cheerMessages = [
    "今日も一日お疲れ様でした。",
    "焦らず、自分のペースが一番だよ。",
    "小さな一歩も、積み重ねれば大きな力に。",
    "よくがんばってるね。",
    "今日のあなたに、拍手を。",
    "無理せず、できる範囲でいいからね。",
    "続けているだけで、もう十分すごいこと。"
  ];

  function renderCheerMessage() {
    var el = document.getElementById("cheer-message");
    if (!el) return;
    var index = Math.floor(Math.random() * cheerMessages.length);
    el.textContent = cheerMessages[index];
  }


  /* ----------------------------------------------------------------
     9. リセット機能（テスト用）
     公開前の動作確認用に、いつでも初期設定をやり直せるようにする。
  ---------------------------------------------------------------- */
  function initResetButton() {
    var resetButton = document.getElementById("reset-button");
    if (!resetButton) return;

    resetButton.addEventListener("click", function () {
      var confirmed = window.confirm("これまでの記録・設定をすべて削除して、最初からやり直します。よろしいですか？");
      if (!confirmed) return;

      localStorage.removeItem(STORAGE_KEY);
      state = Object.assign({}, defaultState);
      window.location.reload();
    });
  }


  /* ----------------------------------------------------------------
     10. 初期化
  ---------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initRevealAnimation();
    initOnboarding();
    initTodayRecordForm();
    initResetButton();
    toggleOnboardingVisibility();
    if (state.setupDone) {
      renderDashboard();
    }
  });

})();
