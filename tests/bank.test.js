import assert from "node:assert/strict";
import test from "node:test";
import { steps } from "../js/course.js";
import {
  EXAM_AREAS,
  EXAM_COUNTS,
  PASS_SCORE,
  buildExam,
  grade,
  mulberry32,
  presentQuestion,
  validateBank,
} from "../js/logic.js";
import { questions } from "../js/questions.js";
import { SIGN_NAMES } from "../js/signs.js";

test("frågebanken är komplett och entydig", () => {
  const errors = validateBank(questions);
  assert.deepEqual(errors, []);
});

test("varje kurssteg med övning har frågor", () => {
  steps.forEach((step) => {
    if (!step.topics.length) return;
    const count = questions.filter((question) => step.topics.includes(question.topic)).length;
    assert.ok(count >= 4, `${step.id} har bara ${count} frågor`);
  });
});

test("skyltar som frågorna pekar på finns", () => {
  questions.forEach((question) => {
    if (!question.sign) return;
    assert.ok(SIGN_NAMES.includes(question.sign), question.id);
  });
});

test("blandningen behåller texten som är rätt", () => {
  const original = questions[10];
  const snapshot = original.choices.slice();
  const shown = presentQuestion(original, mulberry32(1));
  assert.equal(shown.choices[shown.answer], snapshot[original.answer]);
  assert.deepEqual(original.choices, snapshot);
});

test("svarens plats blandas i övningsprovet", () => {
  const exam = buildExam(questions, mulberry32(11));
  const counts = [0, 0, 0, 0];
  exam.forEach((question) => {
    counts[question.answer] += 1;
  });
  assert.ok(counts[3] > 0, `fördelning ${counts.join(",")}`);
  assert.ok(Math.max(...counts) <= 28, `fördelning ${counts.join(",")}`);
});

test("övningsprovet följer Trafikverkets fördelning", () => {
  const exam = buildExam(questions, mulberry32(20261103));
  assert.equal(exam.length, 65);
  EXAM_AREAS.forEach((area) => {
    assert.equal(exam.filter((question) => question.area === area).length, EXAM_COUNTS[area]);
  });
  assert.equal(exam.filter((question) => question.area === "meta").length, 0);
  assert.equal(new Set(exam.map((question) => question.id)).size, 65);
});

test("52 rätt är godkänt och 51 är underkänt", () => {
  const exam = buildExam(questions, mulberry32(52));
  const answers = {};
  exam.forEach((question, index) => {
    answers[question.id] = index < PASS_SCORE ? question.answer : (question.answer + 1) % question.choices.length;
  });
  const passed = grade(exam, answers);
  assert.equal(passed.score, PASS_SCORE);
  assert.equal(passed.passed, true);
  assert.equal(passed.unanswered, 0);

  answers[exam[0].id] = (exam[0].answer + 1) % exam[0].choices.length;
  const failed = grade(exam, answers);
  assert.equal(failed.score, PASS_SCORE - 1);
  assert.equal(failed.passed, false);
});

test("obesvarad fråga ger inget poäng", () => {
  const exam = buildExam(questions, mulberry32(7));
  const result = grade(exam, {});
  assert.equal(result.score, 0);
  assert.equal(result.unanswered, 65);
  assert.equal(result.passed, false);
});
