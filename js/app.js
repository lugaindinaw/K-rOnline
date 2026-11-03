import { lessons, steps, glossary } from "./course.js";
import {
  AREA_LABELS,
  EXAM_AREAS,
  EXAM_SECONDS,
  PASS_SCORE,
  READY_SCORE,
  areaStats,
  buildExam,
  grade,
  latestWrongIds,
  presentQuestion,
  questionsForTopics,
  shuffle,
  stepProgress,
  validateBank,
} from "./logic.js";
import { questions } from "./questions.js";
import { signSvg } from "./signs.js";

const STORAGE_KEY = "kronline-teori-v1";
const EXAM_KEY = "kronline-exam-v1";

const state = {
  view: "home",
  stepId: null,
  practice: null,
  exam: null,
  result: null,
  reviewFilter: "fel",
  repeatMode: "fel",
};

let progress = loadProgress();
let clock = null;

const main = document.querySelector("#innehall");
const dialog = document.querySelector("#dialog");

document.body.addEventListener("click", onClick);
document.addEventListener("keydown", onKey);

const bankErrors = validateBank(questions);
if (bankErrors.length) {
  main.innerHTML = `<section class="panel"><h1>Frågebanken behöver rättas</h1><ul>${bankErrors
    .map((error) => `<li>${esc(error)}</li>`)
    .join("")}</ul></section>`;
} else {
  restoreExam();
  render();
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return { attempts: {}, saved: [], done: {}, exams: [] };
    return {
      attempts: saved.attempts || {},
      saved: saved.saved || [],
      done: saved.done || {},
      exams: saved.exams || [],
    };
  } catch {
    return { attempts: {}, saved: [], done: {}, exams: [] };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function restoreExam() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(EXAM_KEY) || "null");
    if (!saved) return;
    const examQuestions = saved.ids
      .map((id) => questions.find((question) => question.id === id))
      .filter(Boolean);
    if (examQuestions.length !== saved.ids.length) return;
    state.exam = {
      questions: examQuestions,
      index: saved.index || 0,
      answers: saved.answers || {},
      startedAt: saved.startedAt,
    };
    state.view = "exam";
  } catch {
    sessionStorage.removeItem(EXAM_KEY);
  }
}

function persistExam() {
  if (!state.exam) {
    sessionStorage.removeItem(EXAM_KEY);
    return;
  }
  sessionStorage.setItem(
    EXAM_KEY,
    JSON.stringify({
      ids: state.exam.questions.map((question) => question.id),
      index: state.exam.index,
      answers: state.exam.answers,
      startedAt: state.exam.startedAt,
    }),
  );
}

function recordAnswer(id, correct) {
  const previous = progress.attempts[id] || { correct: 0, wrong: 0, lastCorrect: false };
  progress.attempts[id] = {
    correct: previous.correct + (correct ? 1 : 0),
    wrong: previous.wrong + (correct ? 0 : 1),
    lastCorrect: correct,
  };
  saveProgress();
}

function toggleSaved(id) {
  if (progress.saved.includes(id)) {
    progress.saved = progress.saved.filter((savedId) => savedId !== id);
  } else {
    progress.saved = [...progress.saved, id];
  }
  saveProgress();
}

function remainingMs() {
  if (!state.exam) return 0;
  return state.exam.startedAt + EXAM_SECONDS * 1000 - Date.now();
}

function startClock() {
  clearInterval(clock);
  clock = setInterval(() => {
    if (state.view !== "exam" || !state.exam) return;
    if (remainingMs() <= 0) {
      finishExam(true);
      return;
    }
    const node = document.querySelector("[data-clock]");
    if (node) node.textContent = formatTime(remainingMs());
    document.querySelector(".timer")?.classList.toggle("timer-low", remainingMs() < 5 * 60 * 1000);
  }, 250);
}

function render() {
  if (state.view === "exam" && state.exam && remainingMs() <= 0) {
    finishExam(true);
    return;
  }
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.setAttribute("aria-current", button.dataset.nav === navKey() ? "page" : "false");
  });
  if (state.view === "home") renderHome();
  else if (state.view === "course") renderCourse();
  else if (state.view === "lesson") renderLesson();
  else if (state.view === "practice") renderPractice();
  else if (state.view === "exam") renderExam();
  else if (state.view === "result") renderResult();
  else if (state.view === "repeat") renderRepeat();
  if (state.view === "exam") startClock();
  else clearInterval(clock);
  const place = [
    state.view,
    state.stepId,
    state.practice?.index ?? "",
    state.exam?.index ?? "",
    state.repeatMode,
  ].join(":");
  if (place !== state.place) {
    state.place = place;
    window.scrollTo(0, 0);
  }
}

function navKey() {
  if (state.view === "lesson" || state.view === "course") return "course";
  if (state.view === "practice") return "practice";
  if (state.view === "exam" || state.view === "result") return "exam";
  if (state.view === "repeat") return "repeat";
  return "home";
}

function renderHome() {
  const stats = areaStats(questions, progress.attempts);
  const next = steps.find((step) => !progress.done[step.id]) || steps[0];
  const lastExam = progress.exams[0];
  main.innerHTML = `
    <section class="hero">
      <p class="kicker">Teorikurs för behörighet B</p>
      <h1>Lär dig regeln, så klarar du en ny fråga.</h1>
      <p class="lead">En rak plan genom de fem områdena på kunskapsprovet. Egna frågor, korta förklaringar och prov med samma fördelning som hos Trafikverket.</p>
      <div class="facts">
        <div><strong>65</strong><span>frågor som räknas</span></div>
        <div><strong>52</strong><span>rätt för godkänt</span></div>
        <div><strong>50</strong><span>minuter</span></div>
      </div>
      <div class="row">
        <button class="primary" data-action="open-step" data-step="${esc(next.id)}">Fortsätt: ${esc(next.title)}</button>
        <button data-action="start-exam">Starta övningsprov</button>
      </div>
      ${
        state.exam
          ? `<p class="note">Du har ett påbörjat prov. Tiden tickar från start, även om du lämnar sidan.</p>`
          : ""
      }
    </section>
    <section class="panel">
      <h2>Veckoplan</h2>
      <ol class="plan">
        <li><strong>Dag 1.</strong> Så funkar provet, sedan alkohol, trötthet och grupptryck.</li>
        <li><strong>Dag 2.</strong> Väjningsregler tills du kan säga vilken regel som gäller före högerregeln.</li>
        <li><strong>Dag 3.</strong> Hastighet, stoppsträcka, avstånd och omkörning.</li>
        <li><strong>Dag 4.</strong> Parkering, märken, signaler, gående och cyklister.</li>
        <li><strong>Dag 5.</strong> Landsväg, motorväg och mörker.</li>
        <li><strong>Dag 6.</strong> Halka, olycka, vilt, bilen, släpet och vikterna.</li>
        <li><strong>Dag 7.</strong> Miljö, sedan ditt första hela prov.</li>
        <li><strong>Därefter.</strong> Bara frågorna du hade fel på. Ett prov om dagen tills tre prov i rad ger minst ${READY_SCORE} rätt.</li>
      </ol>
    </section>
    <section class="panel">
      <div class="section-head">
        <h2>Stegen</h2>
        <button data-action="show-course">Visa hela kursplanen</button>
      </div>
      <div class="steps">${steps.map((step) => stepCard(step)).join("")}</div>
    </section>
    <section class="panel">
      <h2>Dina områden</h2>
      <div class="areas">${EXAM_AREAS.map((area) => areaCard(area, stats[area])).join("")}</div>
      ${
        lastExam
          ? `<p class="note">Senaste provet: ${lastExam.score} av ${lastExam.total}, ${lastExam.passed ? "godkänt" : "underkänt"}.</p>`
          : `<p class="note">Inget övningsprov ännu. Gör det när du har gått igenom stegen en första gång.</p>`
      }
    </section>
    <section class="panel quiet">
      <h2>Vad det här är</h2>
      <p>Frågorna är skrivna för K-rOnline. De följer trafikförordningen, Transportstyrelsens kursplan och Trafikverkets provform. De är inte kopierade från Trafiko, Abojihad eller från provbanken.</p>
      <p>Det riktiga provet har fotografier och en del film. Här övar du regeln bakom bilden. När den sitter kan du använda skolans material, till exempel Trafiko eller Abojihad, som extra bildträning.</p>
    </section>
  `;
}

function stepCard(step) {
  const status = stepStatus(step);
  return `
    <article class="step">
      <p class="kicker">${esc(step.day)}</p>
      <h3>${esc(step.title)}</h3>
      <p>${esc(step.summary)}</p>
      <p class="status status-${status.key}">${esc(status.label)}</p>
      <button data-action="open-step" data-step="${esc(step.id)}">Öppna</button>
    </article>
  `;
}

function stepStatus(step) {
  if (step.id === "provtraning") {
    const ready = progress.exams.filter((exam) => exam.score >= READY_SCORE).length;
    return ready
      ? { key: "good", label: `${ready} prov med minst ${READY_SCORE} rätt` }
      : { key: "wait", label: "Sikta på tre prov med minst 58 rätt" };
  }
  const info = stepProgress(step, questions, progress.attempts);
  if (progress.done[step.id] && (info.total === 0 || info.latestCorrect >= Math.min(4, info.total))) {
    return { key: "good", label: "Genomgånget" };
  }
  if (info.total === 0) return { key: "wait", label: "Läs igenom" };
  return {
    key: info.tried ? "mid" : "wait",
    label: `${info.latestCorrect} av ${info.total} rätt senast du svarade`,
  };
}

function areaCard(area, stat) {
  const percent = stat.rate == null ? "–" : `${Math.round(stat.rate * 100)} %`;
  return `
    <article class="area area-${area}">
      <h3>${esc(AREA_LABELS[area])}</h3>
      <p class="big">${percent}</p>
      <p>${stat.tried} av ${stat.total} frågor prövade</p>
      <button data-action="practice-area" data-area="${area}">Öva området</button>
    </article>
  `;
}

function renderCourse() {
  main.innerHTML = `
    <section class="panel">
      <p class="kicker">Kursplan</p>
      <h1>Fem områden, en ordning.</h1>
      <p class="lead">Gå uppifrån och ner. Du kan hoppa till ett svagt område, men hoppa inte över väjningsreglerna för att bara nöta skyltar.</p>
      <div class="glossary">
        ${glossary
          .map(([word, text]) => `<p><strong>${esc(word)}.</strong> ${esc(text)}</p>`)
          .join("")}
      </div>
      <div class="steps">${steps.map((step) => stepCard(step)).join("")}</div>
    </section>
  `;
}

function renderLesson() {
  const step = steps.find((item) => item.id === state.stepId) || steps[0];
  const lesson = lessons[step.id];
  const info = stepProgress(step, questions, progress.attempts);
  const index = steps.findIndex((item) => item.id === step.id);
  const next = steps[index + 1];
  main.innerHTML = `
    <section class="panel lesson">
      <button class="textish" data-action="show-course">Alla steg</button>
      <p class="kicker">${esc(step.day)}</p>
      <h1>${esc(step.title)}</h1>
      ${renderBlocks(lesson.blocks)}
      ${step.id === "provet" ? `<div class="glossary">${glossary.map(([word, text]) => `<p><strong>${esc(word)}.</strong> ${esc(text)}</p>`).join("")}</div>` : ""}
      <div class="row">
        ${
          info.total
            ? `<button class="primary" data-action="practice-step" data-step="${esc(step.id)}">Öva ${info.total} frågor</button>`
            : `<button class="primary" data-action="start-exam">Starta övningsprov</button>`
        }
        <button data-action="toggle-done" data-step="${esc(step.id)}">${progress.done[step.id] ? "Markerad som klar" : "Markera som genomgången"}</button>
        ${next ? `<button data-action="open-step" data-step="${esc(next.id)}">Nästa steg</button>` : ""}
      </div>
      ${info.total ? `<p class="note">${info.latestCorrect} av ${info.total} hade rätt svar senast du försökte.</p>` : ""}
    </section>
  `;
}

function renderBlocks(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "h") return `<h2>${esc(block.text)}</h2>`;
      if (block.type === "ul") return `<ul>${block.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
      return `<p>${esc(block.text)}</p>`;
    })
    .join("");
}

function renderPractice() {
  const session = state.practice;
  const question = session.questions[session.index];
  if (!question) {
    const percent = session.answered ? Math.round((session.correctCount / session.answered) * 100) : 0;
    main.innerHTML = `
      <section class="panel">
        <p class="kicker">Klart</p>
        <h1>${session.correctCount} rätt av ${session.answered}</h1>
        <p class="lead">${percent} procent i det här passet. ${esc(session.title)}</p>
        <div class="row">
          <button class="primary" data-action="repeat-misses">Repetera fel</button>
          <button data-action="show-home">Till starten</button>
        </div>
      </section>
    `;
    return;
  }
  const saved = progress.saved.includes(question.id);
  main.innerHTML = `
    <section class="panel">
      <div class="section-head">
        <p class="kicker">${esc(session.title)} · ${session.index + 1} av ${session.questions.length}</p>
        <button class="textish" data-action="save" data-id="${esc(question.id)}">${saved ? "Sparad" : "Spara"}</button>
      </div>
      <div class="bar"><span style="width:${((session.index + (session.revealed ? 1 : 0)) / session.questions.length) * 100}%"></span></div>
      ${questionBody(question, session.selected, session.revealed)}
      <div class="row">
        ${
          session.revealed
            ? `<button class="primary" data-action="next-practice">${session.index + 1 === session.questions.length ? "Se resultat" : "Nästa fråga"}</button>`
            : `<button class="primary" data-action="answer-practice" ${session.selected == null ? "disabled" : ""}>Svara</button>`
        }
        <button data-action="show-home">Avsluta passet</button>
      </div>
    </section>
  `;
}

function questionBody(question, selected, revealed) {
  const sign = question.sign ? signSvg(question.sign) : "";
  return `
    <p class="pill pill-${question.area}">${esc(AREA_LABELS[question.area])}</p>
    ${sign ? `<div class="sign-wrap">${sign}</div>` : ""}
    <h1 class="prompt">${esc(question.prompt)}</h1>
    <div class="choices" role="group" aria-label="Svarsalternativ">
      ${question.choices
        .map((choice, index) => {
          const classes = ["choice"];
          if (selected === index) classes.push("selected");
          if (revealed && index === question.answer) classes.push("right");
          if (revealed && selected === index && index !== question.answer) classes.push("wrong");
          return `<button class="${classes.join(" ")}" data-action="choose" data-index="${index}" ${revealed ? "disabled" : ""}>
            <span class="letter">${"ABCD"[index]}</span>
            <span>${esc(choice)}</span>
          </button>`;
        })
        .join("")}
    </div>
    ${
      revealed
        ? `<div class="explain ${selected === question.answer ? "explain-right" : "explain-wrong"}">
            <strong>${selected === question.answer ? "Rätt." : "Fel."}</strong>
            <p>${esc(question.explain)}</p>
          </div>`
        : ""
    }
  `;
}

function renderExam() {
  const exam = state.exam;
  const question = exam.questions[exam.index];
  const selected = exam.answers[question.id];
  const answered = exam.questions.filter((item) => Number.isInteger(exam.answers[item.id])).length;
  main.innerHTML = `
    <section class="exam-layout">
      <div class="panel">
        <div class="section-head">
          <p class="kicker">Övningsprov · fråga ${exam.index + 1} av ${exam.questions.length}</p>
          <p class="timer ${remainingMs() < 5 * 60 * 1000 ? "timer-low" : ""}" data-clock>${formatTime(remainingMs())}</p>
        </div>
        <div class="bar"><span style="width:${(answered / exam.questions.length) * 100}%"></span></div>
        ${questionBody(question, Number.isInteger(selected) ? selected : null, false)}
        <div class="row">
          <button data-action="exam-prev" ${exam.index === 0 ? "disabled" : ""}>Föregående</button>
          <button class="primary" data-action="exam-next">${exam.index === exam.questions.length - 1 ? "Till sista översikten" : "Nästa"}</button>
          <button data-action="submit-exam">Lämna in</button>
        </div>
      </div>
      <aside class="panel navigator">
        <h2>${answered} av ${exam.questions.length} besvarade</h2>
        <div class="grid">
          ${exam.questions
            .map((item, index) => {
              const classes = ["dot"];
              if (index === exam.index) classes.push("current");
              if (Number.isInteger(exam.answers[item.id])) classes.push("done");
              return `<button class="${classes.join(" ")}" data-action="exam-jump" data-index="${index}" aria-label="Fråga ${index + 1}">${index + 1}</button>`;
            })
            .join("")}
        </div>
      </aside>
    </section>
  `;
}

function renderResult() {
  const result = state.result;
  const verdict = result.grade.passed ? "Godkänt" : "Underkänt";
  const advice = result.grade.ready
    ? "Det här är över 58. Gör om det två gånger till innan du bokar det riktiga provet."
    : result.grade.passed
      ? "Du är över gränsen, men marginalen är liten. Sikta på 58 rätt innan du bokar."
      : `Du behöver ${PASS_SCORE}. Repetera förklaringarna och gör om provet i morgon.`;
  main.innerHTML = `
    <section class="panel">
      <p class="kicker">${result.timedOut ? "Tiden tog slut" : "Provet är inlämnat"}</p>
      <h1 class="${result.grade.passed ? "pass" : "fail"}">${verdict}</h1>
      <p class="score">${result.grade.score} <span>av ${result.grade.total}</span></p>
      <p class="lead">${advice}</p>
      ${result.grade.unanswered ? `<p class="note">${result.grade.unanswered} frågor var obesvarade och gav inget poäng.</p>` : ""}
      <div class="areas">
        ${EXAM_AREAS.map((area) => {
          const item = result.grade.byArea[area];
          return `<article class="area area-${area}"><h3>${esc(AREA_LABELS[area])}</h3><p class="big">${item.correct}/${item.total}</p></article>`;
        }).join("")}
      </div>
      <div class="row">
        <button class="${result.reviewFilter === "fel" ? "primary" : ""}" data-action="filter-review" data-filter="fel">Bara fel</button>
        <button class="${result.reviewFilter === "alla" ? "primary" : ""}" data-action="filter-review" data-filter="alla">Alla frågor</button>
        <button data-action="start-exam">Nytt prov</button>
      </div>
      <div class="review">
        ${result.exam
          .filter((question) => result.reviewFilter === "alla" || result.answers[question.id] !== question.answer)
          .map((question) => reviewCard(question, result.answers[question.id]))
          .join("") || "<p>Inga fel i det här provet.</p>"}
      </div>
    </section>
  `;
}

function reviewCard(question, selected) {
  const ok = selected === question.answer;
  return `
    <article class="review-card">
      <p class="pill pill-${question.area}">${esc(AREA_LABELS[question.area])}</p>
      <h2>${esc(question.prompt)}</h2>
      <p>${ok ? "Ditt svar var rätt." : `Ditt svar: ${esc(Number.isInteger(selected) ? question.choices[selected] : "inget svar")}`}</p>
      <p><strong>Rätt svar:</strong> ${esc(question.choices[question.answer])}</p>
      <p>${esc(question.explain)}</p>
    </article>
  `;
}

function renderRepeat() {
  const wrongIds = latestWrongIds(progress.attempts);
  const ids = state.repeatMode === "sparade" ? progress.saved : wrongIds;
  const list = ids.map((id) => questions.find((question) => question.id === id)).filter(Boolean);
  main.innerHTML = `
    <section class="panel">
      <p class="kicker">Repetition</p>
      <h1>${state.repeatMode === "sparade" ? "Sparade frågor" : "Frågor du hade fel på"}</h1>
      <div class="row">
        <button class="${state.repeatMode === "fel" ? "primary" : ""}" data-action="repeat-tab" data-mode="fel">Fel (${wrongIds.length})</button>
        <button class="${state.repeatMode === "sparade" ? "primary" : ""}" data-action="repeat-tab" data-mode="sparade">Sparade (${progress.saved.length})</button>
        ${list.length ? `<button data-action="practice-ids">Öva de här ${list.length}</button>` : ""}
      </div>
      ${
        list.length
          ? `<div class="review">${list
              .map(
                (question) => `
                  <article class="review-card">
                    <p class="pill pill-${question.area}">${esc(AREA_LABELS[question.area])}</p>
                    <h2>${esc(question.prompt)}</h2>
                    <p>${esc(question.explain)}</p>
                    <button data-action="save" data-id="${esc(question.id)}">${progress.saved.includes(question.id) ? "Sparad" : "Spara"}</button>
                  </article>`,
              )
              .join("")}</div>`
          : `<p class="lead">${state.repeatMode === "sparade" ? "Tryck på Spara inne i en fråga om du vill ha den här." : "Inget fel sparat. Gör en övning, så hamnar senaste felsvaret här tills du svarar rätt."}</p>`
      }
    </section>
  `;
}

async function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === "choose") {
    choose(Number(target.dataset.index));
    return;
  }
  if (action === "show-home") return go("home");
  if (action === "show-course") return go("course");
  if (action === "show-repeat") {
    state.view = "repeat";
    return render();
  }
  if (action === "open-step") {
    state.stepId = target.dataset.step;
    state.view = "lesson";
    return render();
  }
  if (action === "toggle-done") {
    progress.done[target.dataset.step] = !progress.done[target.dataset.step];
    saveProgress();
    return render();
  }
  if (action === "practice-step") return startStepPractice(target.dataset.step);
  if (action === "practice-area") return startAreaPractice(target.dataset.area);
  if (action === "answer-practice") return revealPractice();
  if (action === "next-practice") {
    state.practice.index += 1;
    state.practice.selected = null;
    state.practice.revealed = false;
    return render();
  }
  if (action === "save") {
    toggleSaved(target.dataset.id);
    return render();
  }
  if (action === "start-exam") return startExam();
  if (action === "exam-next") return moveExam(1);
  if (action === "exam-prev") return moveExam(-1);
  if (action === "exam-jump") {
    state.exam.index = Number(target.dataset.index);
    persistExam();
    return render();
  }
  if (action === "submit-exam") return askSubmit();
  if (action === "filter-review") {
    state.result.reviewFilter = target.dataset.filter;
    return render();
  }
  if (action === "repeat-tab") {
    state.repeatMode = target.dataset.mode;
    state.view = "repeat";
    return render();
  }
  if (action === "repeat-misses") return openWrongPractice();
  if (action === "practice-ids") return practiceCurrentRepeat();
}

function onKey(event) {
  if (event.target.closest("input, textarea") || dialog.open) return;
  const number = Number(event.key);
  if (number >= 1 && number <= 4) {
    choose(number - 1);
    return;
  }
  if (event.key === "Enter" && state.view === "practice" && state.practice) {
    if (!state.practice.revealed && state.practice.selected != null) revealPractice();
    else if (state.practice.revealed) {
      state.practice.index += 1;
      state.practice.selected = null;
      state.practice.revealed = false;
      render();
    }
  }
  if (event.key === "Enter" && state.view === "exam") moveExam(1);
}

function choose(index) {
  if (state.view === "practice" && state.practice && !state.practice.revealed) {
    const question = state.practice.questions[state.practice.index];
    if (!question || index >= question.choices.length) return;
    state.practice.selected = index;
    render();
  } else if (state.view === "exam" && state.exam) {
    const question = state.exam.questions[state.exam.index];
    if (index >= question.choices.length) return;
    state.exam.answers[question.id] = index;
    persistExam();
    render();
  }
}

async function go(view) {
  if (state.view === "exam" && view !== "exam" && state.exam) {
    const leave = await ask(
      "Lämna provet?",
      "Provet ligger kvar och tiden fortsätter att gå. Du kan komma tillbaka från starten.",
    );
    if (!leave) return;
  }
  state.view = view;
  render();
}

function startStepPractice(stepId) {
  const step = steps.find((item) => item.id === stepId);
  startPractice(step.title, questionsForTopics(questions, step.topics));
}

function startAreaPractice(area) {
  startPractice(AREA_LABELS[area], questions.filter((question) => question.area === area));
}

function startPractice(title, pool) {
  const unique = pool.filter((question, index, list) => list.findIndex((item) => item.id === question.id) === index);
  if (!unique.length) return;
  state.practice = {
    title,
    questions: shuffle(unique).map((question) => presentQuestion(question)),
    index: 0,
    selected: null,
    revealed: false,
    correctCount: 0,
    answered: 0,
  };
  state.view = "practice";
  render();
}

function revealPractice() {
  const session = state.practice;
  const question = session.questions[session.index];
  if (session.selected == null || session.revealed) return;
  const correct = session.selected === question.answer;
  session.revealed = true;
  session.answered += 1;
  if (correct) session.correctCount += 1;
  recordAnswer(question.id, correct);
  render();
}

function openWrongPractice() {
  const pool = latestWrongIds(progress.attempts)
    .map((id) => questions.find((question) => question.id === id))
    .filter(Boolean);
  if (!pool.length) {
    state.view = "repeat";
    state.repeatMode = "fel";
    render();
    return;
  }
  startPractice("Repetition av fel", pool);
}

function practiceCurrentRepeat() {
  const ids = state.repeatMode === "sparade" ? progress.saved : latestWrongIds(progress.attempts);
  const pool = ids.map((id) => questions.find((question) => question.id === id)).filter(Boolean);
  if (pool.length) startPractice(state.repeatMode === "sparade" ? "Sparade frågor" : "Repetition av fel", pool);
}

async function startExam() {
  if (state.exam && !(await ask("Starta ett nytt prov?", "Det påbörjade provet kastas bort."))) return;
  state.exam = {
    questions: buildExam(questions),
    index: 0,
    answers: {},
    startedAt: Date.now(),
  };
  state.view = "exam";
  persistExam();
  render();
}

function moveExam(delta) {
  const next = state.exam.index + delta;
  if (next < 0 || next >= state.exam.questions.length) return;
  state.exam.index = next;
  persistExam();
  render();
}

async function askSubmit() {
  const unanswered = state.exam.questions.filter((question) => !Number.isInteger(state.exam.answers[question.id])).length;
  const text = unanswered
    ? `${unanswered} frågor är obesvarade. De ger inget poäng.`
    : "Du har svarat på alla frågor.";
  if (await ask("Lämna in provet?", text)) finishExam(false);
}

function finishExam(timedOut) {
  if (!state.exam) return;
  const exam = state.exam.questions;
  const answers = { ...state.exam.answers };
  const resultGrade = grade(exam, answers);
  progress.exams = [
    {
      score: resultGrade.score,
      total: resultGrade.total,
      passed: resultGrade.passed,
      at: new Date().toISOString(),
    },
    ...progress.exams,
  ].slice(0, 12);
  exam.forEach((question) => {
    recordAnswer(question.id, answers[question.id] === question.answer);
  });
  saveProgress();
  state.result = { exam, answers, grade: resultGrade, timedOut, reviewFilter: "fel" };
  state.exam = null;
  state.view = "result";
  persistExam();
  render();
}

function ask(title, text) {
  dialog.innerHTML = `
    <form method="dialog" class="dialog-card">
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      <div class="row">
        <button value="no">Tillbaka</button>
        <button class="primary" value="yes">Fortsätt</button>
      </div>
    </form>
  `;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "yes"),
      { once: true },
    );
  });
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.nav;
    if (target === "home") go("home");
    if (target === "course") go("course");
    if (target === "practice") {
      if (state.practice) go("practice");
      else go("course");
    }
    if (target === "exam") {
      if (state.exam) {
        state.view = "exam";
        render();
      } else {
        startExam();
      }
    }
    if (target === "repeat") {
      state.view = "repeat";
      render();
    }
  });
});
