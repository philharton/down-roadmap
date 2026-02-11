type NotionQueryPayload = {
  filter?: Record<string, unknown>;
  sorts?: Array<Record<string, unknown>>;
  start_cursor?: string;
  page_size?: number;
};

type NotionProperty = Record<string, unknown>;

type NotionPage = {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
};

export type ExperimentItem = {
  id: string;
  name: string;
  url: string;
  startDate: string;
  endDate: string;
  stage: string;
};

export type ReleaseItem = {
  id: string;
  name: string;
  url: string;
  date: string;
  platform: string;
  status: string;
};

export type RoadmapData = {
  experiments: ExperimentItem[];
  releases: ReleaseItem[];
  windowStart: string;
  windowEnd: string;
};

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

function getNotionToken(): string {
  const token = process.env.NOTION_API_TOKEN ?? process.env.NOTION_INTEGRATION_SECRET;
  if (!token) {
    throw new Error(
      "Missing Notion token. Set NOTION_API_TOKEN or NOTION_INTEGRATION_SECRET.",
    );
  }
  return token;
}

function getSourceId(envName: string): string {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`Missing required env var: ${envName}`);
  }
  return value;
}

function parseDateString(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getTitle(properties: Record<string, NotionProperty>, key = "Name"): string {
  const property = properties[key] as { title?: Array<{ plain_text?: string }> } | undefined;
  const title = property?.title ?? [];
  const value = title.map((part) => part.plain_text ?? "").join("").trim();
  return value || "Untitled";
}

function getDateRange(
  properties: Record<string, NotionProperty>,
  key = "Dates",
): { start: Date | null; end: Date | null } {
  const property = properties[key] as { date?: { start?: string; end?: string | null } } | undefined;
  const start = parseDateString(property?.date?.start);
  const end = parseDateString(property?.date?.end) ?? start;
  return { start, end };
}

function getStatus(
  properties: Record<string, NotionProperty>,
  key: string,
): string {
  const property = properties[key] as { status?: { name?: string } } | undefined;
  return property?.status?.name?.trim() || "";
}

function getSelect(
  properties: Record<string, NotionProperty>,
  key: string,
): string {
  const property = properties[key] as { select?: { name?: string } } | undefined;
  return property?.select?.name?.trim() || "";
}

async function querySourcePaginated(
  sourceId: string,
  payload: NotionQueryPayload,
): Promise<NotionPage[]> {
  const token = getNotionToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  const endpoints = [
    `${NOTION_API_BASE}/data_sources/${sourceId}/query`,
    `${NOTION_API_BASE}/databases/${sourceId}/query`,
  ];

  const results: NotionPage[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  let endpointIndex = 0;
  let selectedEndpoint = endpoints[0];

  while (hasMore) {
    let response: Response | null = null;
    let responseJson: Record<string, unknown> | null = null;

    for (let i = endpointIndex; i < endpoints.length; i += 1) {
      const endpoint = endpoints[i];
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
        cache: "no-store",
      });

      if (response.ok) {
        selectedEndpoint = endpoint;
        endpointIndex = i;
        break;
      }

      if (response.status !== 404 && response.status !== 400) {
        const text = await response.text();
        throw new Error(`Notion query failed (${response.status}): ${text}`);
      }
    }

    if (!response || !response.ok) {
      throw new Error(
        `Unable to query Notion source ${sourceId}. Tried: ${endpoints.join(", ")}`,
      );
    }

    responseJson = (await response.json()) as Record<string, unknown>;
    const pageResults = (responseJson.results as NotionPage[] | undefined) ?? [];
    results.push(...pageResults);

    hasMore = Boolean(responseJson.has_more);
    cursor = (responseJson.next_cursor as string | undefined) ?? undefined;

    if (!hasMore) {
      break;
    }

    endpointIndex = endpoints.indexOf(selectedEndpoint);
  }

  return results;
}

function threeMonthsAgo(now: Date): Date {
  const copy = new Date(now);
  copy.setUTCMonth(copy.getUTCMonth() - 3);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export async function getRoadmapData(): Promise<RoadmapData> {
  const experimentsSource = getSourceId("NOTION_DATASOURCE_EXPERIMENTS");
  const releasesSource = getSourceId("NOTION_DATASOURCE_RELEASES");

  const now = new Date();
  const windowStartDate = threeMonthsAgo(now);
  const windowStart = toIsoDate(windowStartDate);
  const windowEnd = toIsoDate(now);

  const [experimentPages, releasePages] = await Promise.all([
    querySourcePaginated(experimentsSource, {
      filter: {
        and: [
          { property: "Dates", date: { on_or_after: windowStart } },
          { property: "Dates", date: { is_not_empty: true } },
        ],
      },
      sorts: [{ property: "Dates", direction: "ascending" }],
    }),
    querySourcePaginated(releasesSource, {
      filter: {
        and: [
          { property: "Dates", date: { on_or_after: windowStart } },
          { property: "Dates", date: { is_not_empty: true } },
          { property: "Status", status: { equals: "Released" } },
        ],
      },
      sorts: [{ property: "Dates", direction: "ascending" }],
    }),
  ]);

  const experiments = experimentPages
    .map((page): ExperimentItem | null => {
      const { start, end } = getDateRange(page.properties, "Dates");
      if (!start || !end) {
        return null;
      }
      return {
        id: page.id,
        name: getTitle(page.properties, "Name"),
        url: page.url,
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        stage: getStatus(page.properties, "Stage"),
      };
    })
    .filter((item): item is ExperimentItem => item !== null);

  const releases = releasePages
    .map((page): ReleaseItem | null => {
      const { start } = getDateRange(page.properties, "Dates");
      if (!start) {
        return null;
      }
      return {
        id: page.id,
        name: getTitle(page.properties, "Name"),
        url: page.url,
        date: toIsoDate(start),
        platform: getSelect(page.properties, "Platform"),
        status: getStatus(page.properties, "Status"),
      };
    })
    .filter((item): item is ReleaseItem => item !== null);

  return {
    experiments,
    releases,
    windowStart,
    windowEnd,
  };
}
