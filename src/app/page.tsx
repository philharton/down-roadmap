import { ExperimentItem, getRoadmapData, ReleaseItem } from "@/lib/notion";

export const dynamic = "force-dynamic";

const DAY_WIDTH = 34;
const EXPERIMENT_ROW_HEIGHT = 40;
const EXPERIMENT_BAR_HEIGHT = 30;
const RELEASE_LANE_HEIGHT = 28;

type PositionedExperiment = ExperimentItem & {
  row: number;
  startIndex: number;
  endIndex: number;
};

type PositionedRelease = ReleaseItem & {
  lane: number;
  dayIndex: number;
  labelEnd: number;
};

function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function diffDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function clampText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars - 1)}…`;
}

function compactReleaseLabel(label: string): string {
  const match = /^(.+?)(\s+)([\d.]+)([^\d.].*)?$/.exec(label);
  const short = match ? `${match[1]}${match[2]}${match[3]}` : label;
  return short.replace("Backend", "BE");
}

function stageTone(stage: string): "running" | "winner" | "ended" | "neutral" {
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

function platformTone(platform: string): "ios" | "android" | "backend" | "other" {
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

function layoutTimeline(
  experiments: ExperimentItem[],
  releases: ReleaseItem[],
  windowStartIso: string,
): {
  startDate: Date;
  endDate: Date;
  totalDays: number;
  positionedExperiments: PositionedExperiment[];
  positionedReleases: PositionedRelease[];
  experimentRows: number;
  releaseLanes: number;
  canvasWidth: number;
} {
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

function formatMonth(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

function formatHumanDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function Home() {
  let error = "";
  let experiments: ExperimentItem[] = [];
  let releases: ReleaseItem[] = [];
  let windowStart = "";

  try {
    const data = await getRoadmapData();
    experiments = data.experiments;
    releases = data.releases;
    windowStart = data.windowStart;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error loading Notion data.";
  }

  if (error) {
    return (
      <main className="roadmapPage">
        <section className="errorCard">
          <h1>Down Roadmap</h1>
          <p>{error}</p>
          <p>Set `NOTION_API_TOKEN`, `NOTION_DATASOURCE_EXPERIMENTS`, and `NOTION_DATASOURCE_RELEASES`.</p>
        </section>
      </main>
    );
  }

  const timeline = layoutTimeline(experiments, releases, windowStart);
  const today = startOfUtcDay(new Date());
  const todayIndex = diffDays(timeline.startDate, today);
  const hasToday = todayIndex >= 0 && todayIndex < timeline.totalDays;

  const headerHeight = 74;
  const experimentBandTop = 18;
  const experimentBandHeight = timeline.experimentRows * EXPERIMENT_ROW_HEIGHT + 10;
  const releaseBandTop = experimentBandTop + experimentBandHeight + 44;
  const releaseBandHeight = timeline.releaseLanes * RELEASE_LANE_HEIGHT + 50;
  const bodyHeight = releaseBandTop + releaseBandHeight + 24;

  const days = Array.from({ length: timeline.totalDays }, (_, idx) => addUtcDays(timeline.startDate, idx));

  const monthMarkers = days
    .map((day, idx) => ({ day, idx }))
    .filter(({ day, idx }) => idx === 0 || day.getUTCDate() === 1);

  return (
    <main className="roadmapPage">
      <header className="roadmapHeader">
        <h1>Down Roadmap</h1>
        <div className="summary">
          <span>{experiments.length} experiments</span>
          <span>{releases.length} releases</span>
          <span>{formatHumanDate(timeline.startDate)} - {formatHumanDate(timeline.endDate)}</span>
        </div>
      </header>

      <section className="timelineViewport" aria-label="Roadmap timeline">
        <div className="timelineCanvas" style={{ width: `${timeline.canvasWidth}px` }}>
          <div className="timelineHeader" style={{ height: `${headerHeight}px` }}>
            <div className="monthRow">
              {monthMarkers.map(({ day, idx }) => (
                <span key={`month-${idx}`} className="monthLabel" style={{ left: `${idx * DAY_WIDTH + 6}px` }}>
                  {formatMonth(day)}
                </span>
              ))}
            </div>
            <div className="dayRow">
              {days.map((day, idx) => {
                const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
                return (
                  <span
                    key={`day-${idx}`}
                    className={`dayLabel${isWeekend ? " weekend" : ""}`}
                    style={{ left: `${idx * DAY_WIDTH}px`, width: `${DAY_WIDTH}px` }}
                  >
                    {day.getUTCDate()}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="timelineBody" style={{ top: `${headerHeight}px`, height: `${bodyHeight}px` }}>
            <div className="gridLayer">
              {days.map((day, idx) => {
                const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
                const isMonthStart = day.getUTCDate() === 1;
                return (
                  <span
                    key={`grid-${idx}`}
                    className={`gridColumn${isWeekend ? " weekend" : ""}${isMonthStart ? " monthStart" : ""}`}
                    style={{ left: `${idx * DAY_WIDTH}px`, width: `${DAY_WIDTH}px` }}
                  />
                );
              })}
            </div>

            {hasToday && (
              <span
                className="todayLine"
                style={{ left: `${todayIndex * DAY_WIDTH + Math.floor(DAY_WIDTH / 2)}px`, height: `${bodyHeight}px` }}
              />
            )}

            <div className="bandLabel" style={{ top: `${experimentBandTop - 16}px` }}>
              Experiments
            </div>

            {timeline.positionedExperiments.map((exp) => {
              const left = exp.startIndex * DAY_WIDTH + 2;
              const width = Math.max(DAY_WIDTH, (exp.endIndex - exp.startIndex + 1) * DAY_WIDTH - 4);
              const top = experimentBandTop + exp.row * EXPERIMENT_ROW_HEIGHT;
              const tone = stageTone(exp.stage);
              return (
                <a
                  key={exp.id}
                  href={exp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`experimentBar tone-${tone}`}
                  style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${EXPERIMENT_BAR_HEIGHT}px` }}
                  title={`${exp.name}${exp.stage ? ` (${exp.stage})` : ""}`}
                >
                  <span className="experimentName">{clampText(exp.name, Math.max(20, Math.floor(width / 8)))}</span>
                  {exp.stage && <span className={`stageBadge tone-${tone}`}>{exp.stage}</span>}
                </a>
              );
            })}

            <div className="releaseDivider" style={{ top: `${releaseBandTop - 14}px` }}>
              Releases
            </div>

            {timeline.positionedReleases.map((release) => {
              const x = release.dayIndex * DAY_WIDTH + Math.floor(DAY_WIDTH / 2);
              const y = releaseBandTop + release.lane * RELEASE_LANE_HEIGHT;
              const platform = platformTone(release.platform);
              return (
                <a
                  key={release.id}
                  href={release.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="releaseItem"
                  style={{ left: `${x}px`, top: `${y}px` }}
                  title={`${release.name}${release.platform ? ` (${release.platform})` : ""}`}
                >
                  <span className={`releasePoint platform-${platform}`} />
                  <span className="releaseLabel">
                    {compactReleaseLabel(release.name)}
                    {release.platform && <em className={`platformTag platform-${platform}`}>{release.platform}</em>}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
