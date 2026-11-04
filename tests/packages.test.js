import assert from "node:assert/strict";
import test from "node:test";
import {
  courseLessons,
  isLessonOpen,
  lessonsInPackage,
  nextOpenLesson,
  packageById,
  packages,
} from "../js/packages.js";

test("varje träff har en kort mening och två svar", () => {
  const ids = new Set();
  courseLessons.forEach((lesson) => {
    assert.equal(ids.has(lesson.id), false, lesson.id);
    ids.add(lesson.id);
    assert.ok(lesson.rule.length > 8 && lesson.rule.length < 120, lesson.id);
    assert.equal(lesson.checks.length, 2, lesson.id);
    lesson.checks.forEach((check) => {
      assert.equal(check.choices.length, 2);
      assert.ok(check.answer === 0 || check.answer === 1);
      assert.notEqual(check.choices[0], check.choices[1]);
    });
    assert.ok(packageById(lesson.packageId), lesson.packageId);
    assert.ok(lesson.teacher.length >= 2);
  });
});

test("paketen innehåller riktiga träffar och ett pris", () => {
  packages.forEach((pack) => {
    const list = lessonsInPackage(pack);
    assert.ok(list.length >= 5, pack.id);
    assert.equal(list.includes(undefined), false, pack.id);
    assert.ok(pack.price >= 1000, pack.id);
  });
  assert.equal(lessonsInPackage(packageById("hela")).length, courseLessons.length);
  const parts = packages.filter((pack) => pack.id !== "hela").reduce((sum, pack) => sum + pack.price, 0);
  assert.ok(packageById("hela").price < parts);
});

test("första träffen går att öppna utan beställning", () => {
  assert.equal(isLessonOpen(courseLessons.find((lesson) => lesson.id === "balte"), []), true);
  assert.equal(isLessonOpen(courseLessons.find((lesson) => lesson.id === "barn"), []), false);
  assert.equal(nextOpenLesson([], {}).id, "balte");
  assert.equal(nextOpenLesson([], { balte: true }), null);
  assert.equal(nextOpenLesson([{ packageId: "start" }], { balte: true }).id, "barn");
});
