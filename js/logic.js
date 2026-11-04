export const EXAM_AREAS = [
  "fordon",
  "miljo",
  "trafiksakerhet",
  "trafikregler",
  "personliga",
];

export const AREA_LABELS = {
  fordon: "Fordonskännedom och manövrering",
  miljo: "Miljö",
  trafiksakerhet: "Trafiksäkerhet",
  trafikregler: "Trafikregler",
  personliga: "Personliga förutsättningar",
  meta: "Om provet och utbildningen",
};

export const EXAM_COUNTS = {
  fordon: 7,
  miljo: 5,
  trafiksakerhet: 16,
  trafikregler: 32,
  personliga: 5,
};

export const PASS_SCORE = 52;
export const EXAM_SECONDS = 50 * 60;
export const READY_SCORE = 58;

export function mulberry32(seed) {
  let value = seed >>> 0;
  return function rng() {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng = Math.random) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function validateBank(questions) {
  const errors = [];
  const ids = new Set();
  const prompts = new Set();
  if (!Array.isArray(questions) || questions.length === 0) {
    return ["Frågebanken är tom."];
  }
  questions.forEach((question, index) => {
    const where = question?.id || `rad ${index + 1}`;
    if (!question || typeof question.prompt !== "string" || question.prompt.length < 20) {
      errors.push(`${where}: frågan är för kort eller saknas.`);
    }
    if (typeof question.id !== "string" || !question.id) {
      errors.push(`${where}: id saknas.`);
    } else if (ids.has(question.id)) {
      errors.push(`${question.id}: id används mer än en gång.`);
    } else {
      ids.add(question.id);
    }
    if (prompts.has(question.prompt)) {
      errors.push(`${where}: samma frågetext finns redan.`);
    } else if (question.prompt) {
      prompts.add(question.prompt);
    }
    const allowed = new Set([...EXAM_AREAS, "meta"]);
    if (!allowed.has(question.area)) {
      errors.push(`${where}: okänt område ${question.area}.`);
    }
    if (typeof question.topic !== "string" || !question.topic) {
      errors.push(`${where}: ämne saknas.`);
    }
    if (!Array.isArray(question.choices) || question.choices.length < 3 || question.choices.length > 4) {
      errors.push(`${where}: det ska finnas tre eller fyra svar.`);
    } else if (new Set(question.choices).size !== question.choices.length) {
      errors.push(`${where}: två svar är likadana.`);
    }
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= (question.choices?.length || 0)) {
      errors.push(`${where}: rätt svar pekar utanför alternativen.`);
    }
    if (typeof question.explain !== "string" || question.explain.length < 20) {
      errors.push(`${where}: förklaringen är för kort.`);
    }
  });
  EXAM_AREAS.forEach((area) => {
    const count = questions.filter((question) => question.area === area).length;
    if (count < EXAM_COUNTS[area]) {
      errors.push(`${area}: behöver minst ${EXAM_COUNTS[area]} frågor, har ${count}.`);
    }
  });
  return errors;
}

export function presentQuestion(question, rng = Math.random) {
  const order = shuffle(question.choices.map((_, index) => index), rng);
  return {
    ...question,
    choices: order.map((index) => question.choices[index]),
    answer: order.indexOf(question.answer),
  };
}

export function buildExam(questions, rng = Math.random) {
  const picked = [];
  EXAM_AREAS.forEach((area) => {
    const pool = questions.filter((question) => question.area === area);
    const need = EXAM_COUNTS[area];
    if (pool.length < need) {
      throw new Error(`För få frågor i ${area}.`);
    }
    picked.push(...shuffle(pool, rng).slice(0, need));
  });
  return shuffle(picked, rng).map((question) => presentQuestion(question, rng));
}

export function grade(exam, answersById) {
  const byArea = {};
  EXAM_AREAS.forEach((area) => {
    byArea[area] = { correct: 0, total: 0 };
  });
  let score = 0;
  exam.forEach((question) => {
    const correct = answersById[question.id] === question.answer;
    if (correct) score += 1;
    byArea[question.area].total += 1;
    if (correct) byArea[question.area].correct += 1;
  });
  return {
    score,
    total: exam.length,
    passed: score >= PASS_SCORE,
    ready: score >= READY_SCORE,
    unanswered: exam.filter((question) => !Number.isInteger(answersById[question.id])).length,
    byArea,
  };
}

export function areaStats(questions, attempts) {
  const stats = {};
  EXAM_AREAS.forEach((area) => {
    const inArea = questions.filter((question) => question.area === area);
    let correct = 0;
    let wrong = 0;
    let tried = 0;
    inArea.forEach((question) => {
      const attempt = attempts[question.id];
      if (!attempt) return;
      tried += 1;
      correct += attempt.correct;
      wrong += attempt.wrong;
    });
    const trials = correct + wrong;
    stats[area] = {
      total: inArea.length,
      tried,
      rate: trials ? correct / trials : null,
    };
  });
  return stats;
}

export function stepProgress(step, questions, attempts) {
  const inStep = questions.filter((question) => step.topics.includes(question.topic));
  const tried = inStep.filter((question) => attempts[question.id]);
  const latestCorrect = tried.filter((question) => attempts[question.id].lastCorrect).length;
  return {
    total: inStep.length,
    tried: tried.length,
    latestCorrect,
  };
}

export function latestWrongIds(attempts) {
  return Object.entries(attempts)
    .filter(([, attempt]) => attempt.lastCorrect === false)
    .map(([id]) => id);
}

export function questionsForTopics(questions, topics) {
  return questions.filter((question) => topics.includes(question.topic));
}
