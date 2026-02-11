import { NextRequest, NextResponse } from "next/server";

import { getRoadmapData } from "@/lib/notion";
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

type ExportVariant = "default" | "figma-small" | "figma-tiny";

type VariantSettings = {
  id: ExportVariant;
  fontScale: number;
  filenameTag: string;
};

function resolveVariant(raw: string | null): VariantSettings {
  const value = (raw ?? "default").trim().toLowerCase();

  if (value === "small" || value === "figma" || value === "figma-small") {
    return { id: "figma-small", fontScale: 0.74, filenameTag: "figma-small" };
  }

  if (value === "tiny" || value === "figma-xs" || value === "figma-tiny") {
    return { id: "figma-tiny", fontScale: 0.6, filenameTag: "figma-tiny" };
  }

  return { id: "default", fontScale: 1, filenameTag: "" };
}

function scaleFont(base: number, settings: VariantSettings, min = 1): number {
  const scaled = Math.round(base * settings.fontScale * 100) / 100;
  return Math.max(min, scaled);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tonePalette(tone: ReturnType<typeof stageTone>): { fill: string; stroke: string; text: string } {
  switch (tone) {
    case "running":
      return { fill: "rgba(69, 167, 100, 0.36)", stroke: "rgba(87, 188, 117, 0.55)", text: "#ebf9ee" };
    case "winner":
      return { fill: "rgba(51, 130, 224, 0.36)", stroke: "rgba(72, 153, 245, 0.55)", text: "#e8f2fe" };
    case "ended":
      return { fill: "rgba(114, 118, 129, 0.36)", stroke: "rgba(152, 158, 174, 0.44)", text: "#f0f1f5" };
    default:
      return { fill: "rgba(181, 143, 58, 0.36)", stroke: "rgba(201, 166, 88, 0.55)", text: "#fbf5e8" };
  }
}

function platformPalette(platform: ReturnType<typeof platformTone>): string {
  switch (platform) {
    case "ios":
      return "#3d7ce0";
    case "android":
      return "#2d9f66";
    case "backend":
      return "#8d70cf";
    default:
      return "#6c7484";
  }
}

function errorSvg(message: string): string {
  const safe = escapeXml(message);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="260" viewBox="0 0 1200 260">\n  <rect width="1200" height="260" fill="#0d0f14"/>\n  <text x="24" y="56" fill="#e6e9ef" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="30" font-weight="700">Down Roadmap</text>\n  <rect x="24" y="86" width="1152" height="150" rx="10" fill="#1a1f2a" stroke="#2c3445"/>\n  <text x="42" y="126" fill="#d8dcea" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="20" font-weight="600">SVG export unavailable</text>\n  <text x="42" y="162" fill="#b8c0d4" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="15">${safe}</text>\n</svg>`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const settings = resolveVariant(request.nextUrl.searchParams.get("variant"));

    const data = await getRoadmapData();
    const timeline = layoutTimeline(data.experiments, data.releases, data.windowStart);
    const { experimentBandTop, releaseBandTop, bodyHeight } = getBandLayout(timeline);

    const monthFontSize = scaleFont(19, settings, 9);
    const dayFontSize = scaleFont(18, settings, 8);
    const bandFontSize = scaleFont(12, settings, 6);
    const experimentFontSize = scaleFont(15, settings, 7);
    const releaseFontSize = scaleFont(12, settings, 6);
    const summaryFontSize = scaleFont(12, settings, 6);

    const totalWidth = timeline.canvasWidth;
    const totalHeight = HEADER_HEIGHT + bodyHeight;
    const today = startOfUtcDay(new Date());
    const todayIndex = diffDays(timeline.startDate, today);
    const hasToday = todayIndex >= 0 && todayIndex < timeline.totalDays;

    const days = Array.from({ length: timeline.totalDays }, (_, idx) => addUtcDays(timeline.startDate, idx));
    const monthMarkers = days
      .map((day, idx) => ({ day, idx }))
      .filter(({ day, idx }) => idx === 0 || day.getUTCDate() === 1);

    const gridColumns = days
      .map((day, idx) => {
        const x = idx * DAY_WIDTH;
        const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
        const isMonthStart = day.getUTCDate() === 1;
        const fill = isWeekend ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.02)";
        const monthLine = isMonthStart
          ? `<line x1="${x}" y1="${HEADER_HEIGHT}" x2="${x}" y2="${totalHeight}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`
          : "";
        return `
          <rect x="${x}" y="${HEADER_HEIGHT}" width="${DAY_WIDTH}" height="${bodyHeight}" fill="${fill}"/>
          <line x1="${x + DAY_WIDTH}" y1="${HEADER_HEIGHT}" x2="${x + DAY_WIDTH}" y2="${totalHeight}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
          ${monthLine}`;
      })
      .join("\n");

    const dayLabelY = 34 + 8 + dayFontSize * 0.9;
    const dayCharWidth = 8 * settings.fontScale;

    const dayLabels = days
      .map((day, idx) => {
        const x = idx * DAY_WIDTH + DAY_WIDTH / 2;
        const color = day.getUTCDay() === 0 || day.getUTCDay() === 6 ? "#7c8392" : "#a0a7b7";
        return `<text x="${x}" y="${dayLabelY}" fill="${color}" font-size="${dayFontSize}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif">${day.getUTCDate()}</text>`;
      })
      .join("\n");

    const monthLabelY = 8 + monthFontSize * 0.9;
    const monthLabels = monthMarkers
      .map(({ day, idx }) => {
        const x = idx * DAY_WIDTH + 6;
        return `<text x="${x}" y="${monthLabelY}" fill="#f3f4f8" font-size="${monthFontSize}" font-weight="640" font-family="Inter, Segoe UI, Arial, sans-serif">${escapeXml(
          formatMonth(day),
        )}</text>`;
      })
      .join("\n");

    const experimentBars = timeline.positionedExperiments
      .map((exp) => {
        const x = exp.startIndex * DAY_WIDTH + 2;
        const y = HEADER_HEIGHT + experimentBandTop + exp.row * EXPERIMENT_ROW_HEIGHT;
        const width = Math.max(DAY_WIDTH, (exp.endIndex - exp.startIndex + 1) * DAY_WIDTH - 4);
        const tone = stageTone(exp.stage);
        const palette = tonePalette(tone);
        const label = exp.stage ? `${exp.name} · ${exp.stage}` : exp.name;
        const text = clampText(label, Math.max(20, Math.floor(width / Math.max(dayCharWidth, 4.25))));
        const textY = y + 7 + experimentFontSize * 0.84;

        return `
          <a href="${escapeXml(exp.url)}" target="_blank" rel="noopener noreferrer">
            <g>
              <rect x="${x}" y="${y}" width="${width}" height="${EXPERIMENT_BAR_HEIGHT}" rx="10" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="1"/>
              <text x="${x + 10}" y="${textY}" fill="${palette.text}" font-size="${experimentFontSize}" font-weight="530" font-family="Inter, Segoe UI, Arial, sans-serif">${escapeXml(
                text,
              )}</text>
            </g>
          </a>`;
      })
      .join("\n");

    const releaseItems = timeline.positionedReleases
      .map((release) => {
        const x = release.dayIndex * DAY_WIDTH + Math.floor(DAY_WIDTH / 2);
        const y = HEADER_HEIGHT + releaseBandTop + release.lane * RELEASE_LANE_HEIGHT;
        const platform = platformTone(release.platform);
        const label = compactReleaseLabel(release.name);
        const tag = release.platform ? ` ${release.platform}` : "";
        const fullLabel = `${label}${tag}`;
        const labelWidth = Math.max(88, Math.min(280, fullLabel.length * Math.max(4.25, 7 * settings.fontScale) + 24));
        const color = platformPalette(platform);
        const labelHeight = settings.id === "default" ? 20 : Math.max(14, Math.round(20 * settings.fontScale));
        const labelY = y - Math.round((labelHeight - 10) / 2);
        const textY = labelY + labelHeight / 2 + releaseFontSize * 0.36;

        return `
          <a href="${escapeXml(release.url)}" target="_blank" rel="noopener noreferrer">
            <g>
              <circle cx="${x}" cy="${y + 5}" r="5" fill="${color}" stroke="rgba(255,255,255,0.55)" stroke-width="1.5"/>
              <rect x="${x + 10}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="10" fill="rgba(20, 24, 32, 0.9)" stroke="rgba(255,255,255,0.16)"/>
              <text x="${x + 20}" y="${textY}" fill="#dae0ec" font-size="${releaseFontSize}" font-family="Inter, Segoe UI, Arial, sans-serif">${escapeXml(
                fullLabel,
              )}</text>
            </g>
          </a>`;
      })
      .join("\n");

    const todayLine = hasToday
      ? `<line x1="${todayIndex * DAY_WIDTH + Math.floor(DAY_WIDTH / 2)}" y1="${HEADER_HEIGHT}" x2="${
          todayIndex * DAY_WIDTH + Math.floor(DAY_WIDTH / 2)
        }" y2="${totalHeight}" stroke="#ff6464" stroke-width="2"/>`
      : "";

    const summary = `${data.experiments.length} experiments • ${data.releases.length} releases • ${formatHumanDate(
      timeline.startDate,
    )} - ${formatHumanDate(timeline.endDate)}`;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <defs>
    <linearGradient id="headerGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0e13" />
      <stop offset="100%" stop-color="#0e1218" />
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#11141b"/>
  <rect x="0" y="0" width="${totalWidth}" height="${HEADER_HEIGHT}" fill="url(#headerGradient)"/>
  <line x1="0" y1="34" x2="${totalWidth}" y2="34" stroke="rgba(255,255,255,0.1)"/>
  <line x1="0" y1="${HEADER_HEIGHT}" x2="${totalWidth}" y2="${HEADER_HEIGHT}" stroke="rgba(255,255,255,0.12)"/>

  ${gridColumns}

  ${todayLine}

  <text x="8" y="${HEADER_HEIGHT + experimentBandTop - 8}" fill="#8d93a3" font-size="${bandFontSize}" letter-spacing="1" font-family="Inter, Segoe UI, Arial, sans-serif">EXPERIMENTS</text>
  <line x1="0" y1="${HEADER_HEIGHT + releaseBandTop - 14}" x2="${totalWidth}" y2="${HEADER_HEIGHT + releaseBandTop - 14}" stroke="rgba(255,255,255,0.12)"/>
  <text x="8" y="${HEADER_HEIGHT + releaseBandTop - 2}" fill="#8d93a3" font-size="${bandFontSize}" letter-spacing="1" font-family="Inter, Segoe UI, Arial, sans-serif">RELEASES</text>

  ${experimentBars}
  ${releaseItems}

  ${monthLabels}
  ${dayLabels}

  <text x="12" y="${totalHeight - 10}" fill="#8a8f9e" font-size="${summaryFontSize}" font-family="Inter, Segoe UI, Arial, sans-serif">${escapeXml(
    summary,
  )}</text>
</svg>`;

    const shouldDownload = request.nextUrl.searchParams.get("download") === "1";
    const filenameDate = startOfUtcDay(new Date()).toISOString().slice(0, 10);
    const variantSuffix = settings.filenameTag ? `-${settings.filenameTag}` : "";

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Down-Roadmap-Svg-Variant": settings.id,
        ...(shouldDownload
          ? { "Content-Disposition": `attachment; filename=down-roadmap${variantSuffix}-${filenameDate}.svg` }
          : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const svg = errorSvg(message);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
      status: 500,
    });
  }
}
