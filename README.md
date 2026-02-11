# Down Roadmap

Timeline web app for DOWN experiments and releases, powered by Notion.

## Setup

1. Copy envs:

```bash
cp .env.example .env.local
```

2. Fill:
- `NOTION_API_TOKEN`
- `NOTION_DATASOURCE_EXPERIMENTS`
- `NOTION_DATASOURCE_RELEASES`

3. Run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What It Shows

- Experiments that started in the last 3 months as timeline bars.
- Releases in the last 3 months (all platforms) as timeline points.
- Sticky top date header (day granularity).
- Horizontal + vertical scroll for dense timelines.
- Click any item to open the matching Notion page in a new tab.
- `Export SVG` button for a shareable static timeline snapshot.
