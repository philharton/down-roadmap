import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function mapVariant(raw: string | null): string {
  const value = (raw ?? "small").trim().toLowerCase();
  if (value === "tiny" || value === "figma-xs" || value === "figma-tiny") {
    return "figma-tiny";
  }
  return "figma-small";
}

export function GET(request: NextRequest): NextResponse {
  const variant = mapVariant(request.nextUrl.searchParams.get("variant"));
  const target = new URL("/api/timeline-svg", request.url);
  target.searchParams.set("variant", variant);

  if (request.nextUrl.searchParams.get("download") === "1") {
    target.searchParams.set("download", "1");
  }

  return NextResponse.redirect(target, 307);
}
