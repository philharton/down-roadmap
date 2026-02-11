import { ExperimentItem, ReleaseItem } from "@/lib/notion";

export const DAY_WIDTH = 34;
export const EXPERIMENT_ROW_HEIGHT = 40;
export const EXPERIMENT_BAR_HEIGHT = 30;
export const RELEASE_LANE_HEIGHT = 28;
export const HEADER_HEIGHT = 74;

const EXPERIMENT_BAND_TOP = 18;
const RELEASE_BAND_GAP = 44;
const RELEASE_BAND_EXTRA_HEIGHT = 50;
const BODY_BOTTOM_PADDING = 24;

export type StageTone = "running" | "winner" | "ended" | "neutral";
export type PlatformTone = "ios" | "android" | "backend" | "other";

export type PositionedExperiment = ExperimentItem & {
  row: number;
  startIndex: number;
  endIndex: number;
};

export type PositionedRelease = ReleaseItem & {
  lane: number;
  dayIndex: number;
  labelEnd: number;
};

export type TimelineLayout = {
  startDate: Date;
  endDate: Date;
  totalDays: number;
  positionedExperiments: PositionedExperiment[];
  positionedReleases: PositionedRelease[];
  experimentRows: number;
  releaseLanes: number;
  canvasWidth: number;
};

export type BandLayout = {
  experimentBandTop: number;
  experimentBandHeight: number;
  releaseBandTop: number;
  releaseBandHeight: number;
  bodyHeight: number;
};

export function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function diffDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function clampText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars - 1)}…`;
}

export function compactReleaseLabel(label: string): string {
  const match = /^(.+?)(\s+)([\d.]+)([^\d.].*)?$/.exec(label);
  const short = match ? `${match[1]}${match[2]}${match[3]}` : label;
  return short.replace("Backend", "BE");
}

export function stageTone(stage: string): StageTone {
  const lower = stage.toLowerCase();
  if (lower.includes("running") || lower.includes("active") || lower.includes("exploring")) {
    return "running";
  }
  if (lower.includes("winner") || lower.includes("rollout") || lower.includes("shipped")) {
    return "winner";
  }
  if (lower.includes("ended") || lower.includes("stop") || lower.includes("backlog")) {
    return "ended";
  }
  return "neutral";
}

export function platformTone(platform: string): PlatformTone {
  const lower = platform.toLowerCase();
  if (lower.includes("ios")) {
    return "ios";
  }
  if (lower.includes("android")) {
    return "android";
  }
  if (lower.includes("backend") || lower.includes("server")) {
    return "backend";
  }
  return "other";
}

export function layoutTimeline(
  experiments: ExperimentItem[],
  releases: ReleaseItem[],
  windowStartIso: string,
): TimelineLayout {
  const startDate = utcDate(windowStartIso);
  const today = startOfUtcDay(new Date());

  const allEndDates = [
    today,
    ...experiments.map((exp) => utcDate(exp.endDate)),
    ...releases.map((rel) => utcDate(rel.date)),
  ];
  const endDate = allEndDates.reduce((latest, candidate) => {
    return candidate > latest ? candidate : latest;
  }, today);

  const totalDays = Math.max(1, diffDays(startDate, endDate) + 1);

  const sortedExperiments = [...experiments].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const experimentRowEnds: number[] = [];
  const positionedExperiments: PositionedExperiment[] = sortedExperiments.map((item) => {
    const startIndex = Math.max(0, diffDays(startDate, utcDate(item.startDate)));
    const endIndex = Math.max(startIndex, diffDays(startDate, utcDate(item.endDate)));

    let row = experimentRowEnds.findIndex((rowEnd) => startIndex > rowEnd);
    if (row < 0) {
      row = experimentRowEnds.length;
      experimentRowEnds.push(endIndex);
    } else {
      experimentRowEnds[row] = endIndex;
    }

    return { ...item, row, startIndex, endIndex };
  });

  const sortedReleases = [...releases].sort((a, b) => a.date.localeCompare(b.date));
  const laneOccupancy: number[] = [];
  let maxReleaseLabelEnd = totalDays * DAY_WIDTH;
  const positionedReleases: PositionedRelease[] = sortedReleases.map((item) => {
    const dayIndex = Math.max(0, diffDays(startDate, utcDate(item.date)));
    const x = dayIndex * DAY_WIDTH + Math.floor(DAY_WIDTH / 2);
    const label = compactReleaseLabel(item.name);
    const labelWidth = Math.max(92, Math.min(240, label.length * 7 + 44));

    let lane = laneOccupancy.findIndex((occupiedUntil) => x > occupiedUntil + 12);
    if (lane < 0) {
      lane = laneOccupancy.length;
      laneOccupancy.push(x + labelWidth);
    } else {
      laneOccupancy[lane] = x + labelWidth;
    }

    maxReleaseLabelEnd = Math.max(maxReleaseLabelEnd, x + labelWidth + 20);
    return { ...item, lane, dayIndex, labelEnd: x + labelWidth };
  });

  return {
    startDate,
    endDate,
    totalDays,
    positionedExperiments,
    positionedReleases,
    experimentRows: Math.max(1, experimentRowEnds.length),
    releaseLanes: Math.max(1, laneOccupancy.length),
    canvasWidth: Math.max(totalDays * DAY_WIDTH, maxReleaseLabelEnd),
  };
}

export function getBandLayout(timeline: TimelineLayout): BandLayout {
  const experimentBandHeight = timeline.experimentRows * EXPERIMENT_ROW_HEIGHT + 10;
  const releaseBandTop = EXPERIMENT_BAND_TOP + experimentBandHeight + RELEASE_BAND_GAP;
  const releaseBandHeight = timeline.releaseLanes * RELEASE_LANE_HEIGHT + RELEASE_BAND_EXTRA_HEIGHT;
  const bodyHeight = releaseBandTop + releaseBandHeight + BODY_BOTTOM_PADDING;

  return {
    experimentBandTop: EXPERIMENT_BAND_TOP,
    experimentBandHeight,
    releaseBandTop,
    releaseBandHeight,
    bodyHeight,
  };
}

export function formatMonth(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

export function formatHumanDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
