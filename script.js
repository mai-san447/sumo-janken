/* ============================================================
   相撲じゃんけん — script.js
   ============================================================ */

/*
  ゲームの流れ（やりたいこと）
  １．3つのボタン（グー・チョキ・パー）のどれかが押されるのを待つ
  ２．押されたボタンから「自分の手」を受け取り、コンピューターの手を決める
  ３．「はっけよい…のこった」のカウントダウン演出を流す
     （拍子木「かんかん」→ 行司の声 の順に鳴らす）
  ４．じゃんけんの勝敗を判定する
     ・勝ち → 相撲さんを土俵際へ1歩押す（相撲さんが右へ動く）
     ・負け → 相撲さんに1歩押し返される（相撲さんが左へ動く）
     ・あいこ → 「のこった」で仕切り直し（位置は変わらない）
  ５．どちらかが土俵（PUSH_LIMIT 歩）を割ったら、その取組は終了
  ６．取組の勝ち・負けの回数、勝率、連勝記録を更新する
  ７．少し待ってから位置を中央に戻し、次の取組へ
*/

// 手の一覧。番号（0・1・2）と、画面に出す絵文字・名前をセットで持っておく
const hands = [
  { name: "グー", emoji: "✊" },
  { name: "チョキ", emoji: "✌️" },
  { name: "パー", emoji: "🖐️" },
];

// 何歩押すと「押し出し」になるか
const PUSH_LIMIT = 2;

// ゲームの状態を覚えておく変数
let position = 0; // 土俵での押し合いの位置（+であなた優勢、−でコンピューター優勢）
let matchWins = 0; // 勝った取組の数
let matchLoses = 0; // 負けた取組の数
let streak = 0; // いまの連勝数
let bestStreak = 0; // これまでの最高連勝数

// カウントダウンや取組終了の演出中かどうか。true の間はボタンを受け付けない
let isPlaying = false;

/* ------------------------------------------------------------
   効果音（相撲の音）
   index.html に置いた <audio> タグを鳴らす。
   音のファイルは sounds フォルダーに入れる（README 参照）。
   ------------------------------------------------------------ */

// 指定した id の <audio> を、最初から再生する
function playSound(id) {
  const audio = document.getElementById(id);
  if (!audio) {
    return;
  }
  audio.currentTime = 0; // 連続で鳴らしても毎回はじめから流れるように

  // play() は「再生の約束（Promise）」を返す。
  // 音ファイルがまだない場合などはここで失敗するので、catch で受け止めて
  // ゲーム自体は止まらないようにする
  const promise = audio.play();
  if (promise !== undefined) {
    promise.catch(function () {
      // 音が鳴らせなくても、何もしない（ゲームは続行）
    });
  }
}

// <audio> の音量（0〜1）を整える
function setVolume(id, volume) {
  const audio = document.getElementById(id);
  if (audio) {
    audio.volume = volume;
  }
}

/* ------------------------------------------------------------
   画面表示を更新する小さな関数たち
   ------------------------------------------------------------ */

// 相撲さんを、いまの position に合わせた横位置へ動かす
function updateRikishiPosition() {
  // position が 0 なら left は 50%（中央）。1歩ごとに 8% ずつずらす
  const leftPercent = 50 + position * 8;
  $("#rikishi-spot").css("left", leftPercent + "%");
}

// 土俵の状況メッセージを、いまの position に合わせて出す
function updateDohyoStatus() {
  const statusByPosition = {
    "2": "押し出し成功！",
    "1": "あと1歩で押し出し！",
    "0": "土俵中央。互角の仕切り！",
    "-1": "土俵際、あと1歩で負け…！",
    "-2": "土俵の外へ…",
  };
  $("#dohyo-status").text(statusByPosition[String(position)]);
}

// スコア（取組の勝ち・負け・勝率・連勝）を画面に表示する
function updateScore() {
  $("#win-count").text(matchWins);
  $("#lose-count").text(matchLoses);
  $("#streak-count").text(streak);
  $("#best-streak").text(bestStreak);

  // 勝率を計算する（勝率 ＝ 勝った取組 ÷ 取組数 × 100）
  const totalMatches = matchWins + matchLoses;
  const winRate =
    totalMatches === 0 ? 0 : Math.round((matchWins / totalMatches) * 100);
  $("#win-rate").text(winRate);
}

// 出した手をピョコッと跳ねさせる（pop を外してから付け直すと再生される）
function popHands() {
  $("#my-hand, #cpu-hand").removeClass("pop");
  setTimeout(function () {
    $("#my-hand, #cpu-hand").addClass("pop");
  }, 20);
}

// 力士を「ふみこみ」アニメーションさせる
function lungeRikishi(id) {
  const target = $("#" + id);
  target.addClass("lunge");
  setTimeout(function () {
    target.removeClass("lunge");
  }, 400);
}

// ボタンをまた押せる状態に戻す
function endTurn() {
  isPlaying = false;
  $(".hand-button").prop("disabled", false);
}

// ページの読み込みが終わったときの初期設定
$(function () {
  // 効果音の音量をちょうどよく設定する
  setVolume("se-hyoshigi", 0.6); // 拍子木「かんかん」は鋭い音なので控えめに
  setVolume("se-gyoji", 0.85); // 行司「のこった のこった」
  setVolume("se-kachi", 0.85);
  setVolume("se-make", 0.7);

  updateRikishiPosition();
  updateDohyoStatus();
});

/* ------------------------------------------------------------
   メインの処理：手のボタンが押されたとき
   ------------------------------------------------------------ */

// １．ボタン（.hand-button）のどれかが押されたとき
$(".hand-button").on("click", function () {
  // 演出の途中なら、何も受け付けずに終わる
  if (isPlaying) {
    return;
  }
  isPlaying = true;
  $(".hand-button").prop("disabled", true); // 演出中はボタンを押せなくする

  // ２．自分の手とコンピューターの手を決める
  const myIndex = Number($(this).attr("data-hand"));
  const cpuIndex = Math.floor(Math.random() * 3);

  // ３．カウントダウン演出スタート
  //    取組の始まりは「拍子木『かんかん』→ 行司『のこった のこった』」の順。
  playSound("se-hyoshigi"); // まず拍子木「かんかん」
  $("#result").html("はっけよい…").attr("class", "result");
  $("#my-hand, #cpu-hand").addClass("shaking"); // 手をブルブル震わせる

  // 拍子木が鳴り終わるころ（約0.8秒後）に、行司の「のこった のこった」を続ける
  setTimeout(function () {
    playSound("se-gyoji");
    $("#result").html("のこった、のこった！").attr("class", "result");
  }, 800);

  // 震えている間、手の絵文字をパラパラ切り替えて「迷っている」感じを出す
  const flicker = setInterval(function () {
    $("#my-hand").html(hands[Math.floor(Math.random() * 3)].emoji);
    $("#cpu-hand").html(hands[Math.floor(Math.random() * 3)].emoji);
  }, 90);

  // ４．拍子木→行司の流れを聞かせてから、手を確定して勝敗を判定する
  setTimeout(function () {
    clearInterval(flicker);
    $("#my-hand, #cpu-hand").removeClass("shaking");
    resolveRound(myIndex, cpuIndex);
  }, 1900);
});

/* ------------------------------------------------------------
   じゃんけん1回分の判定（押す・押される・仕切り直し）
   ------------------------------------------------------------ */

function resolveRound(myIndex, cpuIndex) {
  const myHand = hands[myIndex];
  const cpuHand = hands[cpuIndex];

  // 出した手を画面に表示する
  $("#my-hand").html(myHand.emoji);
  $("#cpu-hand").html(cpuHand.emoji);
  popHands();

  // あいこ（同じ手）なら、仕切り直し。位置は変わらない
  // （あいこの効果音はなし。メッセージで「のこった」を伝える）
  if (myIndex === cpuIndex) {
    $("#result")
      .html("のこった、のこった！（仕切り直し）")
      .attr("class", "result draw");
    endTurn();
    return;
  }

  // 自分が勝つのは、次の3パターンのどれかのとき
  const youWin =
    (myHand.name === "グー" && cpuHand.name === "チョキ") ||
    (myHand.name === "チョキ" && cpuHand.name === "パー") ||
    (myHand.name === "パー" && cpuHand.name === "グー");

  // （1歩押す／押される効果音はなし。力士の動きとメッセージで伝える）
  if (youWin) {
    position = position + 1; // 相手の力士を土俵際へ1歩押す
    lungeRikishi("rikishi-you");
  } else {
    position = position - 1; // 自分の力士が1歩押し返される
    lungeRikishi("rikishi-cpu");
  }
  updateRikishiPosition(); // 力士のかたまりを土俵の上でスライドさせる

  // ５．土俵（PUSH_LIMIT 歩）を割ったかどうかを調べる
  if (position >= PUSH_LIMIT) {
    finishMatch(true); // あなたが押し出した
  } else if (position <= -PUSH_LIMIT) {
    finishMatch(false); // あなたが押し出された
  } else {
    // まだ取組は続く
    if (youWin) {
      $("#result").html("よし、一歩押した！").attr("class", "result win");
    } else {
      $("#result").html("むむ、押し返された…").attr("class", "result lose");
    }
    updateDohyoStatus();
    endTurn();
  }
}

/* ------------------------------------------------------------
   取組（1番）が決まったときの処理
   ------------------------------------------------------------ */

function finishMatch(youWon) {
  updateDohyoStatus();

  // 押すアニメーションを少し見せてから、取組の結果を出す
  setTimeout(function () {
    if (youWon) {
      // ６．取組に勝った
      matchWins = matchWins + 1;
      streak = streak + 1;
      if (streak > bestStreak) {
        bestStreak = streak;
      }
      // 2連勝以上なら、連勝数を強調したメッセージにする
      let message = "決まり手・押し出し！ あなたの勝ち！🎉";
      if (streak >= 2) {
        message = streak + "連勝！ 破竹の勢い！🔥";
      }
      $("#result").html(message).attr("class", "result win");
      playSound("se-kachi");
      $("#rikishi-cpu").addClass("fall-right"); // 相手の力士が土俵の外へ倒れる
      showConfetti(); // 座布団が舞う
    } else {
      // 取組に負けた
      matchLoses = matchLoses + 1;
      streak = 0; // 負けたら連勝はふりだしに戻る
      $("#result")
        .html("土俵を割った… あなたの負け。")
        .attr("class", "result lose");
      playSound("se-make");
      $("#rikishi-you").addClass("fall-left"); // 自分の力士が土俵の外へ倒れる
    }
    updateScore();

    // ７．少し待ってから、仕切り直して次の取組へ
    setTimeout(function () {
      position = 0;
      $("#rikishi-you").removeClass("fall-left lunge");
      $("#rikishi-cpu").removeClass("fall-right lunge");
      updateRikishiPosition();
      updateDohyoStatus();
      $("#my-hand, #cpu-hand").html("❓").removeClass("pop");
      $("#result")
        .html("仕切り直し！ 手を選んで「はっけよい」")
        .attr("class", "result");
      endTurn();
    }, 1900);
  }, 700);
}

/* ------------------------------------------------------------
   座布団の演出（勝ったときに画面の上から舞う）
   ------------------------------------------------------------ */

function showConfetti() {
  // 座布団の色のバリエーション
  const colors = ["#d83a2e", "#f5a623", "#2a4d8f", "#5aab3f", "#d6336c"];

  // 30枚の座布団を作って、画面の上のあちこちから舞わせる
  for (let i = 0; i < 30; i++) {
    const piece = $("<div class='confetti'></div>");
    piece.css({
      left: Math.random() * 100 + "%", // 横位置をランダムに
      backgroundColor: colors[Math.floor(Math.random() * colors.length)],
      animationDelay: Math.random() * 0.3 + "s", // 落ち始めを少しずらす
    });
    $("#confetti-layer").append(piece);

    // アニメーションが終わったら取り除く（座布団が増えっぱなしになるのを防ぐ）
    setTimeout(function () {
      piece.remove();
    }, 2300);
  }
}

/* ------------------------------------------------------------
   スコアのリセット
   ------------------------------------------------------------ */

// 「スコアをリセット」ボタンが押されたとき、成績と土俵を最初の状態に戻す
$("#reset").on("click", function () {
  // 演出の途中はリセットさせない
  if (isPlaying) {
    return;
  }
  position = 0;
  matchWins = 0;
  matchLoses = 0;
  streak = 0;
  bestStreak = 0;

  updateScore();
  updateRikishiPosition();
  updateDohyoStatus();
  $("#rikishi-you").removeClass("fall-left lunge");
  $("#rikishi-cpu").removeClass("fall-right lunge");
  $("#my-hand, #cpu-hand").html("❓").removeClass("pop");
  $("#result").html("手を選んで「はっけよい！」").attr("class", "result");
});
