/* ==================================================================
   マイ工賃メーター - script.js
   ------------------------------------------------------------------
   目次
   1. 状態管理（localStorage）
   2. スクロール出現アニメーション
   3. 初期設定フォーム（オンボーディング）
   4. メイン画面の表示切り替え・レンダリング
   5. 記録フォーム（追加・編集）の操作
   6. 記録一覧の表示・編集・削除
   7. 集計処理（今月の達成率／人生累計／記録日数）
   8. 支給日カウントダウン（障害年金：偶数月15日・土日前倒しのみ考慮）
   9. 応援メッセージ
   10. リセット機能（テスト用）
   11. 初期化
================================================================== */

(function () {
  "use strict";

  /* ----------------------------------------------------------------
     1. 状態管理（localStorage）
     すべてのデータはこの端末のブラウザ内にのみ保存する。
     サーバーへの送信は一切行わない。

     entries は「記録の配列」として保持する（1日1件の上書きではなく、
     記録するたびに1件ずつ追加され、あとから編集・削除もできる）。
     例：
     [
       { id: "e_xxxx", date: "2026-07-12", amount: 4000,
         mood: "good", memo: "午前中がんばれた", hours: 4,
         createdAt: 1752000000000 }
     ]
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
    entries: []
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var merged = Object.assign({}, defaultState, parsed);
      // 万が一、以前の形式（日付をキーにしたオブジェクト）が残っていた場合は
      // 壊れたデータとして扱わず、空の配列として扱う（記録し直していただく）。
      if (!Array.isArray(merged.entries)) {
        merged.entries = [];
      }
      return merged;
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

  function generateId() {
    return "e_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var state = loadState() || Object.assign({}, defaultState);


  /* ----------------------------------------------------------------
     2. スクロール出現アニメーション
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
      toggleOnboardingVisibility();
      renderDashboard();
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
  var selectedDailyChoice = null; // "worked" | "rest" | null
  var editingEntryId = null;      // 編集中の記録ID（nullなら新規追加モード）

  function todayKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function renderDashboard() {
    if (!state.setupDone) return;
    if (!document.getElementById("dashboard")) return; // コラムページ等、dashboard要素がないページでは何もしない

    // 働き方に応じた入力欄の出し分け
    var inputs = {
      hourly: document.getElementById("today-input-hourly"),
      daily: document.getElementById("today-input-daily"),
      piece: document.getElementById("today-input-piece")
    };
    Object.keys(inputs).forEach(function (key) {
      if (inputs[key]) inputs[key].hidden = (key !== state.payType);
    });

    renderCheerMessage();
    renderRecordList();
    renderGoalProgress();
    renderLifetimeStats();
    renderPensionCountdown();
  }


  /* ----------------------------------------------------------------
     5. 記録フォーム（追加・編集）の操作
  ---------------------------------------------------------------- */
  function resetRecordForm() {
    var hoursInput = document.getElementById("input-hours");
    var pieceInput = document.getElementById("input-piece-amount");
    var memoInput = document.getElementById("input-memo");

    if (hoursInput) hoursInput.value = "";
    if (pieceInput) pieceInput.value = "";
    if (memoInput) memoInput.value = "";

    selectedMood = null;
    selectedDailyChoice = null;
    updateMoodButtons();
    updateDailyChoiceButtons();
  }

  function enterEditMode(entry) {
    editingEntryId = entry.id;

    if (state.payType === "hourly") {
      var hoursInput = document.getElementById("input-hours");
      if (hoursInput) hoursInput.value = entry.hours != null ? entry.hours : "";
    } else if (state.payType === "piece") {
      var pieceInput = document.getElementById("input-piece-amount");
      if (pieceInput) pieceInput.value = entry.amount;
    } else if (state.payType === "daily") {
      selectedDailyChoice = entry.amount > 0 ? "worked" : "rest";
      updateDailyChoiceButtons();
    }

    selectedMood = entry.mood || null;
    updateMoodButtons();

    var memoInput = document.getElementById("input-memo");
    if (memoInput) memoInput.value = entry.memo || "";

    var title = document.getElementById("record-form-title");
    var saveButton = document.getElementById("save-record-button");
    var cancelButton = document.getElementById("cancel-edit-button");
    if (title) title.textContent = "✎ 記録を編集";
    if (saveButton) saveButton.textContent = "記録を更新";
    if (cancelButton) cancelButton.hidden = false;

    var formWidget = title ? title.closest(".widget") : null;
    if (formWidget && formWidget.scrollIntoView) {
      formWidget.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function exitEditMode() {
    editingEntryId = null;
    resetRecordForm();

    var title = document.getElementById("record-form-title");
    var saveButton = document.getElementById("save-record-button");
    var cancelButton = document.getElementById("cancel-edit-button");
    if (title) title.textContent = "📅 今日の記録を追加";
    if (saveButton) saveButton.textContent = "記録を追加";
    if (cancelButton) cancelButton.hidden = true;
  }

  function updateMoodButtons() {
    var buttons = document.querySelectorAll(".mood-button");
    buttons.forEach(function (btn) {
      btn.classList.toggle("is-selected", btn.dataset.mood === selectedMood);
    });
  }

  function updateDailyChoiceButtons() {
    var buttons = document.querySelectorAll("[data-daily-choice]");
    buttons.forEach(function (btn) {
      var isSelected = btn.dataset.dailyChoice === selectedDailyChoice;
      btn.classList.toggle("is-selected", isSelected);
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  function initTodayRecordForm() {
    // 気分ボタン
    var moodButtons = document.querySelectorAll(".mood-button");
    moodButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedMood = (selectedMood === btn.dataset.mood) ? null : btn.dataset.mood;
        updateMoodButtons();
      });
    });

    // 日給制：出勤／お休み（選択するだけで、まだ保存はしない）
    var dailyButtons = document.querySelectorAll("[data-daily-choice]");
    dailyButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedDailyChoice = (selectedDailyChoice === btn.dataset.dailyChoice) ? null : btn.dataset.dailyChoice;
        updateDailyChoiceButtons();
      });
    });

    // 記録を追加／更新
    var saveButton = document.getElementById("save-record-button");
    if (saveButton) {
      saveButton.addEventListener("click", function () {
        var amount = 0;
        var extra = {};

        if (state.payType === "hourly") {
          var hours = Number(document.getElementById("input-hours").value) || 0;
          amount = hours * state.hourlyWage;
          extra.hours = hours;
        } else if (state.payType === "piece") {
          amount = Number(document.getElementById("input-piece-amount").value) || 0;
        } else if (state.payType === "daily") {
          if (!selectedDailyChoice) {
            window.alert("「出勤した」か「お休み」を選んでください。");
            return;
          }
          amount = (selectedDailyChoice === "worked") ? state.dailyWage : 0;
        }

        var memo = document.getElementById("input-memo").value.trim();

        if (editingEntryId) {
          var target = state.entries.find(function (e) { return e.id === editingEntryId; });
          if (target) {
            target.amount = amount;
            target.mood = selectedMood;
            target.memo = memo;
            Object.assign(target, extra);
          }
        } else {
          var newEntry = Object.assign({
            id: generateId(),
            date: todayKey(),
            amount: amount,
            mood: selectedMood,
            memo: memo,
            createdAt: Date.now()
          }, extra);
          state.entries.push(newEntry);
        }

        saveState(state);

        var status = document.getElementById("save-status");
        if (status) {
          status.textContent = (editingEntryId ? "記録を更新しました！（" : "記録しました！（") + amount.toLocaleString() + "円）";
          window.setTimeout(function () { status.textContent = ""; }, 4000);
        }

        exitEditMode();
        renderRecordList();
        renderGoalProgress();
        renderLifetimeStats();
      });
    }

    // 編集をやめる
    var cancelButton = document.getElementById("cancel-edit-button");
    if (cancelButton) {
      cancelButton.addEventListener("click", function () {
        exitEditMode();
      });
    }
  }


  /* ----------------------------------------------------------------
     6. 記録一覧の表示・編集・削除
  ---------------------------------------------------------------- */
  var moodEmoji = { good: "😊", normal: "😐", hard: "😢" };

  function renderRecordList() {
    var listEl = document.getElementById("record-list");
    var emptyEl = document.getElementById("record-list-empty");
    if (!listEl) return;

    var prefix = getThisMonthPrefix();
    var monthEntries = state.entries
      .filter(function (e) { return e.date.indexOf(prefix) === 0; })
      .slice()
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

    listEl.innerHTML = "";

    if (monthEntries.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    monthEntries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "record-list__item";
      li.dataset.entryId = entry.id;

      var dateLabel = entry.date === todayKey() ? "本日" : entry.date.slice(5).replace("-", "/") + "日";
      var moodLabel = entry.mood ? moodEmoji[entry.mood] : "";
      var memoLabel = entry.memo ? entry.memo : "";

      li.innerHTML =
        '<div class="record-list__main">' +
          '<span class="record-list__date">' + dateLabel + '</span>' +
          '<span class="record-list__amount">' + entry.amount.toLocaleString() + '円</span>' +
          '<span class="record-list__mood">' + moodLabel + '</span>' +
        '</div>' +
        (memoLabel ? '<p class="record-list__memo"></p>' : '') +
        '<div class="record-list__actions">' +
          '<button type="button" class="record-list__action" data-action="edit">編集</button>' +
          '<button type="button" class="record-list__action record-list__action--danger" data-action="delete">削除</button>' +
        '</div>';

      if (memoLabel) {
        li.querySelector(".record-list__memo").textContent = memoLabel;
      }

      listEl.appendChild(li);
    });
  }

  function initRecordListActions() {
    var listEl = document.getElementById("record-list");
    if (!listEl) return;

    listEl.addEventListener("click", function (event) {
      var actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      var li = actionButton.closest("[data-entry-id]");
      if (!li) return;

      var entryId = li.dataset.entryId;
      var entry = state.entries.find(function (e) { return e.id === entryId; });
      if (!entry) return;

      if (actionButton.dataset.action === "edit") {
        enterEditMode(entry);
      } else if (actionButton.dataset.action === "delete") {
        var confirmed = window.confirm("この記録を削除します。よろしいですか？");
        if (!confirmed) return;

        state.entries = state.entries.filter(function (e) { return e.id !== entryId; });
        if (editingEntryId === entryId) {
          exitEditMode();
        }
        saveState(state);
        renderRecordList();
        renderGoalProgress();
        renderLifetimeStats();
      }
    });
  }


  /* ----------------------------------------------------------------
     7. 集計処理（今月の達成率／人生累計／記録日数）
  ---------------------------------------------------------------- */
  function getThisMonthPrefix() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function renderGoalProgress() {
    var prefix = getThisMonthPrefix();
    var monthTotal = 0;

    state.entries.forEach(function (entry) {
      if (entry.date.indexOf(prefix) === 0) {
        monthTotal += entry.amount || 0;
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
    var dateSet = {};

    state.entries.forEach(function (entry) {
      total += entry.amount || 0;
      dateSet[entry.date] = true;
    });

    var days = Object.keys(dateSet).length;

    var totalEl = document.getElementById("lifetime-total");
    var daysEl = document.getElementById("lifetime-days");
    if (totalEl) totalEl.textContent = total.toLocaleString() + "円";
    if (daysEl) daysEl.textContent = days.toLocaleString() + "日";
  }


  /* ----------------------------------------------------------------
     8. 支給日カウントダウン
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
     9. 応援メッセージ（日替わり・ランダム表示）
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
     10. リセット機能（テスト用）
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
     11. 初期化
  ---------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initRevealAnimation();
    initOnboarding();
    initTodayRecordForm();
    initRecordListActions();
    initResetButton();
    toggleOnboardingVisibility();
    if (state.setupDone) {
      renderDashboard();
    }
  });

})();
