/* Recallio — a tiny spaced-repetition flashcard app (vanilla JS) */
(function () {
  "use strict";

  var DECKS = [
    {
      id: "es",
      name: "Spanish Basics",
      tag: "Language",
      accent: "violet",
      cards: [
        { q: "la casa", a: "the house" },
        { q: "el libro", a: "the book" },
        { q: "agua", a: "water" },
        { q: "aprender", a: "to learn" },
        { q: "siempre", a: "always" },
        { q: "la ciudad", a: "the city" }
      ]
    },
    {
      id: "js",
      name: "JavaScript Fundamentals",
      tag: "Engineering",
      accent: "cyan",
      cards: [
        { q: "What does === check?", a: "Strict equality — value and type." },
        { q: "What is a closure?", a: "A function that remembers the scope it was created in." },
        { q: "What does Array.map return?", a: "A new array of the same length." },
        { q: "What is hoisting?", a: "Declarations lifted to the top of their scope." },
        { q: "let vs var?", a: "let is block-scoped; var is function-scoped." },
        { q: "What is the event loop?", a: "It runs async callbacks once the call stack is free." }
      ]
    },
    {
      id: "geo",
      name: "World Capitals",
      tag: "Geography",
      accent: "pink",
      cards: [
        { q: "Japan", a: "Tokyo" },
        { q: "Peru", a: "Lima" },
        { q: "Kenya", a: "Nairobi" },
        { q: "Norway", a: "Oslo" },
        { q: "Turkey", a: "Ankara" },
        { q: "Vietnam", a: "Hanoi" }
      ]
    },
    {
      id: "bio",
      name: "Biology 101",
      tag: "Science",
      accent: "lime",
      cards: [
        { q: "Powerhouse of the cell?", a: "The mitochondrion." },
        { q: "What does DNA stand for?", a: "Deoxyribonucleic acid." },
        { q: "What is osmosis?", a: "Water crossing a semi-permeable membrane." },
        { q: "Basic unit of life?", a: "The cell." },
        { q: "What is photosynthesis?", a: "Plants turning light into chemical energy." },
        { q: "Where is chlorophyll found?", a: "In the chloroplasts." }
      ]
    }
  ];

  var STORE = "recallio.state.v1";
  var RING_LEN = 326.7;

  var els = {
    deckGrid: document.getElementById("deckGrid"),
    studyPanel: document.getElementById("studyPanel"),
    studyHint: document.getElementById("studyHint"),
    doneMsg: document.getElementById("doneMsg"),
    flashcard: document.getElementById("flashcard"),
    cardFront: document.getElementById("cardFront"),
    cardBack: document.getElementById("cardBack"),
    cardCounter: document.getElementById("cardCounter"),
    deckName: document.getElementById("deckName"),
    progressBar: document.getElementById("progressBar"),
    progressFill: document.getElementById("progressFill"),
    rating: document.getElementById("rating"),
    statReviewed: document.getElementById("statReviewed"),
    statAccuracy: document.getElementById("statAccuracy"),
    statBest: document.getElementById("statBest"),
    statDue: document.getElementById("statDue"),
    ringFg: document.getElementById("ringFg"),
    ringValue: document.getElementById("ringValue"),
    bars: document.getElementById("bars"),
    streakCount: document.getElementById("streakCount")
  };

  var state = load();
  var current = null;   // active deck id
  var flipped = false;

  function blank() {
    var d = {};
    DECKS.forEach(function (deck) { d[deck.id] = { idx: 0, correct: 0, total: 0 }; });
    return { reviewed: 0, correct: 0, best: 0, streak: 0, lastDay: null, decks: d };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return blank();
      var parsed = JSON.parse(raw);
      var base = blank();
      Object.keys(base).forEach(function (k) {
        if (parsed[k] === undefined) parsed[k] = base[k];
      });
      DECKS.forEach(function (deck) {
        if (!parsed.decks[deck.id]) parsed.decks[deck.id] = { idx: 0, correct: 0, total: 0 };
      });
      return parsed;
    } catch (e) {
      return blank();
    }
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  function deckById(id) {
    for (var i = 0; i < DECKS.length; i++) if (DECKS[i].id === id) return DECKS[i];
    return null;
  }

  function renderDecks() {
    els.deckGrid.innerHTML = "";
    DECKS.forEach(function (deck, i) {
      var st = state.decks[deck.id];
      var progress = pct(st.idx, deck.cards.length);
      var card = document.createElement("button");
      card.className = "deck" + (deck.id === current ? " active" : "");
      card.setAttribute("aria-label", "Study " + deck.name);
      card.style.animation = "none";
      card.innerHTML =
        '<span class="deck-top">' +
          '<span class="deck-dot dot-' + deck.accent + '"></span>' +
          '<span class="deck-tag">' + deck.tag + "</span>" +
        "</span>" +
        "<h3>" + deck.name + "</h3>" +
        '<span class="deck-count">' + deck.cards.length + " cards · " +
          (st.idx >= deck.cards.length ? "complete" : (deck.cards.length - st.idx) + " due") + "</span>" +
        '<span class="deck-progress"><span style="width:' + progress + '%"></span></span>';
      card.addEventListener("click", function () { startDeck(deck.id); });
      els.deckGrid.appendChild(card);
    });
  }

  function startDeck(id) {
    current = id;
    var st = state.decks[id];
    if (st.idx >= deckById(id).cards.length) st.idx = 0;
    st.total += 1;
    flipped = false;
    renderDecks();
    renderStudy();
    save();
  }

  function renderStudy() {
    var deck = deckById(current);
    if (!deck) {
      els.studyPanel.hidden = true;
      els.doneMsg.hidden = true;
      return;
    }
    var st = state.decks[deck.id];
    var total = deck.cards.length;

    if (st.idx >= total) {
      els.studyPanel.hidden = true;
      els.doneMsg.hidden = false;
      els.studyHint.textContent = "Deck complete — nicely done.";
      return;
    }

    els.studyPanel.hidden = false;
    els.doneMsg.hidden = true;
    els.studyHint.textContent = "Rate each card honestly so the schedule can adapt.";
    els.deckName.textContent = deck.name;
    els.cardCounter.textContent = (st.idx + 1) + " / " + total;

    var progress = pct(st.idx, total);
    els.progressFill.style.width = progress + "%";
    els.progressBar.setAttribute("aria-valuenow", String(progress));

    var card = deck.cards[st.idx];
    els.cardFront.textContent = card.q;
    els.cardBack.textContent = card.a;

    els.flashcard.classList.toggle("is-flipped", flipped);
  }

  function flip() {
    if (!current || els.studyPanel.hidden) return;
    flipped = !flipped;
    els.flashcard.classList.toggle("is-flipped", flipped);
  }

  function rate(quality) {
    if (!current || els.studyPanel.hidden) return;
    if (!flipped) { flip(); return; }
    var deck = deckById(current);
    var st = state.decks[deck.id];
    var good = quality >= 2;

    state.reviewed += 1;
    if (good) state.correct += 1;
    st.correct += good ? 1 : 0;
    st.idx += 1;

    markStudyDay();

    if (st.idx >= deck.cards.length) {
      els.doneMsg.hidden = false;
    }
    flipped = false;
    renderDecks();
    renderStats();
    renderInsights();
    renderStudy();
    save();
  }

  function markStudyDay() {
    var day = today();
    if (state.lastDay === day) return;
    state.lastDay = day;
    state.streak += 1;
    if (state.streak > state.best) state.best = state.streak;
  }

  function restart() {
    if (!current) return;
    state.decks[current].idx = 0;
    flipped = false;
    renderDecks();
    renderStudy();
    save();
  }

  function renderStats() {
    els.statReviewed.textContent = state.reviewed;
    els.statAccuracy.textContent = pct(state.correct, state.reviewed) + "%";
    els.statBest.textContent = state.best;
    els.streakCount.textContent = state.streak;
    var due = 0;
    DECKS.forEach(function (deck) {
      var left = deck.cards.length - state.decks[deck.id].idx;
      if (left > 0) due += left;
    });
    els.statDue.textContent = due;
  }

  function renderInsights() {
    var back = pct(state.correct, state.reviewed);
    els.ringValue.textContent = back + "%";
    els.ringFg.style.strokeDashoffset = String(RING_LEN - (RING_LEN * back) / 100);

    els.bars.innerHTML = "";
    DECKS.forEach(function (deck) {
      var st = state.decks[deck.id];
      var value = pct(st.correct, st.total) || pct(st.idx, deck.cards.length);
      var row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML =
        '<span class="bar-label">' + deck.name + "</span>" +
        '<span class="bar-track"><span class="bar-fill" style="width:' + value + '%"></span></span>' +
        '<span class="bar-val">' + value + "%</span>";
      els.bars.appendChild(row);
    });
  }

  els.flashcard.addEventListener("click", flip);
  els.flashcard.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
  });
  Array.prototype.forEach.call(els.rating.querySelectorAll(".rate"), function (btn) {
    btn.addEventListener("click", function () { rate(parseInt(btn.dataset.quality, 10)); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === " ") { e.preventDefault(); flip(); }
    else if (e.key >= "1" && e.key <= "4") rate(parseInt(e.key, 10) - 1);
    else if (e.key === "r" || e.key === "R") restart();
  });

  renderDecks();
  renderStudy();
  renderStats();
  renderInsights();
})();
