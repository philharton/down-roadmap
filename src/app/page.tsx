import { ExperimentItem, getRoadmapData, ReleaseItem } from "@/lib/notion";
import {
  addUtcDays,
  clampText,
  compactReleaseLabel,
  DAY_WIDTH,
  diffDays,
  EXPERIMENT_BAR_HEIGHT,
  EXPERIMENT_ROW_HEIGHT,
  formatHumanDate,
  formatMonth,
  getBandLayout,
  HEADER_HEIGHT,
  layoutTimeline,
  platformTone,
  RELEASE_LANE_HEIGHT,
  stageTone,
  startOfUtcDay,
} from "@/lib/timeline";

export const dynamic = "force-dynamic";

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

  const { experimentBandTop, releaseBandTop, bodyHeight } = getBandLayout(timeline);

  const days = Array.from({ length: timeline.totalDays }, (_, idx) => addUtcDays(timeline.startDate, idx));

  const monthMarkers = days
    .map((day, idx) => ({ day, idx }))
    .filter(({ day, idx }) => idx === 0 || day.getUTCDate() === 1);

  return (
    <main className="roadmapPage">
      <header className="roadmapHeader">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <h1>Down Roadmap</h1>
          <a
            href="/api/timeline-svg?download=1"
            style={{
              textDecoration: "none",
              color: "#e7ebf6",
              background: "rgba(61, 124, 224, 0.24)",
              border: "1px solid rgba(61, 124, 224, 0.5)",
              borderRadius: "999px",
              padding: "7px 14px",
              fontSize: "13px",
              fontWeight: 620,
            }}
          >
            Export SVG
          </a>
        </div>
        <div className="summary" style={{ marginTop: "8px" }}>
          <span>{experiments.length} experiments</span>
          <span>{releases.length} releases</span>
          <span>
            {formatHumanDate(timeline.startDate)} - {formatHumanDate(timeline.endDate)}
          </span>
        </div>
      </header>

      <section className="timelineViewport" aria-label="Roadmap timeline">
        <div className="timelineCanvas" style={{ width: `${timeline.canvasWidth}px` }}>
          <div className="timelineHeader" style={{ height: `${HEADER_HEIGHT}px` }}>
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

          <div className="timelineBody" style={{ top: `${HEADER_HEIGHT}px`, height: `${bodyHeight}px` }}>
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
