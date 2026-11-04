export const PRACTICE_DISCLAIMER =
  "Det här är körkortsträning i spelet. Det ersätter inte Trafikverkets körprov.";

export const CITY_MISSION =
  "Kör genom korsningen. Använd blinkers om du svänger, håll dig på körbanan och stanna vid väjningsplikt. Andra bilar märkta Trafik kör, saktar in och svänger på samma vägar.";

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
}): PracticeReview {
  const speed = Number.parseInt(lineValue(input.lines, "Högsta fart:") ?? "", 10);
  const brake = lineValue(input.lines, "Broms använd:");
  const steer = lineValue(input.lines, "Styrning:") ?? "";
  const offsetText = lineValue(input.lines, "Största avstånd från mittlinjen:");
  const blink = lineValue(input.lines, "Blinkers före sväng:");
  const yields = input.lines.filter((line) => line.startsWith("Väjningsplikt nod"));
  const offset = offsetText && offsetText !== "inte uppmätt" ? Number.parseFloat(offsetText) : null;
  const points: PracticePoint[] = [];

  if (!Number.isFinite(speed) || speed <= 0) {
    points.push({ title: "Komma iväg", mark: "pågår", detail: "Gasa med W eller Gas och kör framåt." });
  } else if (speed > 50) {
    points.push({
      title: "Fart i stan",
      mark: "träna",
      detail: `Högsta fart var ${speed} km/h. Sänk farten före korsningen.`,
    });
  } else {
    points.push({ title: "Fart i stan", mark: "bra", detail: `Högsta fart ${speed} km/h.` });
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
      detail: steer.includes("vänster") || steer.includes("höger")
        ? "Du styr. Tänd blinkers innan kursen ändras."
        : "Tänd blinkers före en sväng, eller kör rakt genom korsningen.",
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
    points.push({ title: "Genom korsningen", mark: "bra", detail: `Du kör på ${input.roadName}.` });
  } else {
    points.push({
      title: "Genom korsningen",
      mark: "pågår",
      detail: "Fortsätt tills du kommer in på nästa gata.",
    });
  }

  if (input.trafficCount > 0) {
    points.push({
      title: "Andra trafikanter",
      mark: "bra",
      detail: `${input.trafficCount} andra bilar är ute och kör.`,
    });
  } else {
    points.push({
      title: "Andra trafikanter",
      mark: "pågår",
      detail: "Trafikbilarna startar när vägnätet är laddat.",
    });
  }

  const live =
    points.find((point) => point.mark === "träna")?.detail ??
    points.find((point) => point.mark === "pågår")?.detail ??
    "Uppdraget ser bra ut. Avsluta när du vill se sammanfattningen.";
  return { score: scoreOf(points), points, live };
}

/** Turns unfinished checks into practice notes for the end screen. */
export function finishCityReview(review: PracticeReview): PracticeReview {
  const points = review.points.map((point) =>
    point.mark === "pågår" ? { ...point, mark: "träna" as const } : point,
  );
  return { score: scoreOf(points), points, live: "Övningen är avslutad." };
}
