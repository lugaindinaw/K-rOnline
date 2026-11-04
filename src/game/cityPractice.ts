export const PRACTICE_DISCLAIMER =
  "Det här är körkortsträning i spelet. Det ersätter inte Trafikverkets körprov.";

export function cityMission(goal: "left" | "right" | null): string {
  if (goal === "left") {
    return "Mål: kör fram till korsningen och sväng vänster. Tänd vänster blinkers med Q innan du svänger.";
  }
  if (goal === "right") {
    return "Mål: kör fram till korsningen och sväng höger. Tänd höger blinkers med E innan du svänger.";
  }
  return "Välj vänster eller höger. Kör sedan fram till korsningen och sväng dit.";
}

export type PracticeMark = "bra" | "träna" | "pågår";

export type PracticePoint = {
  title: string;
  mark: PracticeMark;
  detail: string;
};

export type PracticeReview = {
  score: number;
  points: PracticePoint[];
  live: string;
};

function lineValue(lines: readonly string[], prefix: string): string | null {
  const found = lines.find((line) => line.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : null;
}

function scoreOf(points: readonly PracticePoint[]): number {
  if (points.length === 0) {
    return 0;
  }
  const good = points.filter((point) => point.mark === "bra").length;
  return Math.round((good / points.length) * 100);
}

export function reviewCityDrive(input: {
  lines: readonly string[];
  roadName: string | null;
  startRoad: string | null;
  trafficCount: number;
  nearestCarMeters?: number | null;
  speedNearCarKmh?: number | null;
  goal?: "left" | "right" | null;
  indicator?: "off" | "left" | "right";
}): PracticeReview {
  const speed = Number.parseInt(lineValue(input.lines, "Högsta fart:") ?? "", 10);
  const brake = lineValue(input.lines, "Broms använd:");
  const offsetText = lineValue(input.lines, "Största avstånd från mittlinjen:");
  const blink = lineValue(input.lines, "Blinkers före sväng:");
  const yields = input.lines.filter((line) => line.startsWith("Väjningsplikt nod"));
  const offset = offsetText && offsetText !== "inte uppmätt" ? Number.parseFloat(offsetText) : null;
  const goal = input.goal ?? null;
  const indicator = input.indicator ?? "off";
  const nearest = input.nearestCarMeters ?? null;
  const nearSpeed = input.speedNearCarKmh ?? null;
  const side = goal === "right" ? "höger" : "vänster";
  const key = goal === "right" ? "E" : "Q";
  const steerKey = goal === "right" ? "D" : "A";
  const points: PracticePoint[] = [];

  if (!Number.isFinite(speed) || speed <= 0) {
    points.push({ title: "Hastighet", mark: "pågår", detail: "Gasa med W eller Gas och kör framåt." });
  } else if (speed > 30) {
    points.push({
      title: "Hastighet",
      mark: "träna",
      detail: `Högsta fart var ${speed} km/h. Bromsa och håll under 30 km/h genom korsningen.`,
    });
  } else {
    points.push({ title: "Hastighet", mark: "bra", detail: `Högsta fart ${speed} km/h, lugnt nog för svängen.` });
  }

  if (offset == null || !Number.isFinite(offset)) {
    points.push({ title: "Placering", mark: "pågår", detail: "Sidoläget mäts när bilen rullar." });
  } else if (offset <= 4) {
    points.push({ title: "Placering", mark: "bra", detail: `${offset.toFixed(1)} m från mittlinjen.` });
  } else {
    points.push({
      title: "Placering",
      mark: "träna",
      detail: `${offset.toFixed(1)} m från mittlinjen. Håll närmare körbanan.`,
    });
  }

  if (blink === "använd") {
    points.push({ title: "Blinkers", mark: "bra", detail: "Blinkersen var tänd före svängen." });
  } else if (blink === "inte använd") {
    points.push({
      title: "Blinkers",
      mark: "träna",
      detail: "Svängen gjordes utan blinkers. Tänd den med Q eller E före svängen.",
    });
  } else {
    points.push({
      title: "Blinkers",
      mark: "pågår",
      detail: goal
        ? `Tänd ${side} blinkers med ${key} innan du svänger.`
        : "Välj sväng. Tänd blinkers åt samma håll före korsningen.",
    });
  }

  const stopped = yields.some((line) => line.includes("bilen stannade"));
  const passed = yields.some((line) => line.includes("passerade utan stopp"));
  const ahead = yields.some((line) => line.includes("framför"));
  if (stopped || (ahead && brake === "ja")) {
    points.push({
      title: "Väjningsplikt",
      mark: "bra",
      detail: stopped
        ? "Bilen stannade vid en give_way-nod."
        : "Du bromsade medan väjningsplikten låg framför bilen.",
    });
  } else if (passed) {
    points.push({
      title: "Väjningsplikt",
      mark: "träna",
      detail: "En väjningsplikt passerades utan stopp.",
    });
  } else if (ahead) {
    points.push({
      title: "Väjningsplikt",
      mark: "pågår",
      detail: "Väjningsplikt framför. Stanna innan du kör vidare.",
    });
  } else {
    points.push({ title: "Väjningsplikt", mark: "pågår", detail: "Ingen give_way-nod är nådd ännu." });
  }

  const changed = Boolean(input.startRoad && input.roadName && input.roadName !== input.startRoad);
  if (changed) {
    points.push({
      title: "Svängen",
      mark: "bra",
      detail: `Du lämnade ${input.startRoad} och kör på ${input.roadName}.`,
    });
  } else {
    points.push({
      title: "Svängen",
      mark: "pågår",
      detail: goal ? `Sväng ${side} med ${steerKey} tills gatan byter namn.` : "Välj vänster eller höger och sväng dit.",
    });
  }

  const close = nearest != null && nearest <= 22;
  const eased = brake === "ja" || (nearSpeed != null && nearSpeed <= 25);
  if (close && eased) {
    points.push({
      title: "Samspel",
      mark: "bra",
      detail: `Närmaste bil var ${Math.round(nearest)} m. Du bromsade eller höll låg fart.`,
    });
  } else if (close) {
    points.push({
      title: "Samspel",
      mark: "träna",
      detail: `En bil var ${Math.round(nearest)} m bort och farten var hög. Släpp gasen och bromsa när någon är nära.`,
    });
  } else if (input.trafficCount > 0) {
    points.push({
      title: "Samspel",
      mark: "pågår",
      detail: `${input.trafficCount} bilar kör runt dig. Bromsa om en kommer inom 20 m.`,
    });
  } else {
    points.push({
      title: "Samspel",
      mark: "pågår",
      detail: "Trafikbilarna startar när vägnätet är laddat.",
    });
  }

  const moved = Number.isFinite(speed) && speed > 0;
  const indicatorReady = goal != null && indicator === goal;
  let live = "Välj vänster eller höger sväng.";
  if (!goal) {
    live = "Välj vänster eller höger sväng.";
  } else if (!moved) {
    live = `Gasa med W och kör fram mot korsningen. Tänd blinkers med ${key} före svängen.`;
  } else if (!changed && !indicatorReady) {
    live = `Tänd ${side} blinkers nu, tangenten ${key}. Sväng sedan med ${steerKey}.`;
  } else if (ahead && brake !== "ja" && speed > 8) {
    live = "Väjningsplikt framför. Bromsa och stanna innan du svänger.";
  } else if (close && !eased) {
    live = `En bil är ${Math.round(nearest ?? 0)} m bort. Släpp gasen.`;
  } else if (!changed && indicatorReady) {
    live = `Blinkers är tänd. Håll ${steerKey} och styr genom korsningen.`;
  } else if (changed) {
    live = `Du svängde in på ${input.roadName}.`;
  }
  return { score: scoreOf(points), points, live };
}

/** Turns unfinished checks into practice notes for the end screen. */
export function finishCityReview(review: PracticeReview): PracticeReview {
  const points = review.points.map((point) =>
    point.mark === "pågår" ? { ...point, mark: "träna" as const } : point,
  );
  return { score: scoreOf(points), points, live: "Övningen är avslutad." };
}
