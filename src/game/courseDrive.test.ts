import { describe, expect, it } from "vitest";
import { EMPTY_COURSE, courseComplete, noteCourseFrame, reviewCourse, type CourseFacts, type CourseFrame } from "./courseDrive";

const here = { lat: 59.39, lng: 17.67 };

function frame(overrides: Partial<CourseFrame> = {}): CourseFrame {
  return {
    speedMps: 0,
    headingDegrees: 0,
    offsetMeters: 0,
    highway: "secondary",
    cars: [],
    ...overrides,
  };
}

function drive(frames: CourseFrame[]): CourseFacts {
  return frames.reduce((facts, item) => noteCourseFrame(facts, item, here), EMPTY_COURSE);
}

describe("rural and motorway scoring", () => {
  it("passes a rural drive that keeps right, meets a car and waits to overtake", () => {
    const facts = drive([
      frame({ speedMps: 18, offsetMeters: -1.4, headingDegrees: 10 }),
      frame({ speedMps: 19.5, offsetMeters: -1.2, headingDegrees: 28 }),
      frame({
        speedMps: 19,
        offsetMeters: -1.1,
        headingDegrees: 28,
        cars: [{ id: "mote", position: { lat: 59.39012, lng: 17.67 }, headingDegrees: 200 }],
      }),
      frame({
        speedMps: 18,
        offsetMeters: -1.3,
        headingDegrees: 30,
        cars: [
          { id: "mote", position: { lat: 59.3892, lng: 17.6704 }, headingDegrees: 200 },
          { id: "framfor", position: { lat: 59.3902, lng: 17.67 }, headingDegrees: 30 },
        ],
      }),
    ]);
    const review = reviewCourse("rural", facts);
    expect(review.points.find((item) => item.title === "Fart")?.mark).toBe("bra");
    expect(review.points.find((item) => item.title === "Placering")?.mark).toBe("bra");
    expect(review.points.find((item) => item.title === "Kurva")?.mark).toBe("bra");
    expect(facts.hitOncoming).toBe(false);
  });

  it("marks an overtake as unsafe while an oncoming car is close", () => {
    const lead = { id: "framfor", position: { lat: 59.39015, lng: 17.67 }, headingDegrees: 0 };
    const before = noteCourseFrame(
      EMPTY_COURSE,
      frame({
        speedMps: 19,
        offsetMeters: -1,
        cars: [lead, { id: "mote", position: { lat: 59.3904, lng: 17.671 }, headingDegrees: 180 }],
      }),
      here,
    );
    const after = noteCourseFrame(
      before,
      frame({
        speedMps: 20,
        offsetMeters: 1.4,
        cars: [
          { ...lead, position: { lat: 59.3897, lng: 17.67 } },
          { id: "mote", position: { lat: 59.39005, lng: 17.6702 }, headingDegrees: 180 },
        ],
      }),
      here,
    );
    expect(after.unsafeOvertake).toBe(true);
    expect(reviewCourse("rural", after).points.find((item) => item.title === "Omkörning")?.mark).toBe("träna");
  });

  it("passes motorway speed, a lane change, a gap and the exit", () => {
    let facts = EMPTY_COURSE;
    facts = noteCourseFrame(facts, frame({ speedMps: 22, highway: "motorway_link", offsetMeters: -0.4 }), here);
    facts = noteCourseFrame(facts, frame({ speedMps: 27, highway: "motorway", offsetMeters: -1.4 }), here);
    facts = noteCourseFrame(
      facts,
      frame({
        speedMps: 28,
        highway: "motorway",
        offsetMeters: 1.2,
        cars: [{ id: "framfor", position: { lat: 59.39025, lng: 17.67 }, headingDegrees: 0 }],
      }),
      here,
    );
    facts = noteCourseFrame(facts, frame({ speedMps: 20, highway: "motorway_link", offsetMeters: -0.2 }), here);
    expect(courseComplete("motorway", facts)).toBe(true);
    expect(reviewCourse("motorway", facts).score).toBe(100);
  });

  it("reports the ramp speed before the car has joined the motorway", () => {
    const facts = noteCourseFrame(EMPTY_COURSE, frame({ speedMps: 20, highway: "motorway_link" }), here);
    const live = reviewCourse("motorway", facts).live;
    expect(live).toContain("72");
    expect(live).not.toContain("0 km/h");
  });

  it("does not pass a motorway drive that never leaves city speed", () => {
    const facts = noteCourseFrame(EMPTY_COURSE, frame({ speedMps: 10, highway: "motorway" }), here);
    expect(courseComplete("motorway", facts)).toBe(false);
  });
});
