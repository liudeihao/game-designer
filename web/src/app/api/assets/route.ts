import { NextResponse, type NextRequest } from "next/server";
import { createAsset, listPrivateAssets, listPublicAssets } from "@/server/mock-store";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const scope = searchParams.get("scope");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(
    48,
    Math.max(1, Number.parseInt(searchParams.get("limit") || "24", 10) || 24)
  );
  if (scope !== "public" && scope !== "private") {
    return NextResponse.json({ error: "Invalid scope", code: "bad_request" }, { status: 400 });
  }
  const data =
    scope === "public"
      ? listPublicAssets(cursor, limit)
      : listPrivateAssets(cursor, limit);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name: string;
    description: string;
    annotation?: string | null;
    forkedFromId?: string | null;
  };
  if (!body?.name || body.description === undefined) {
    return NextResponse.json({ error: "name and description required", code: "bad_request" }, { status: 400 });
  }
  const row = createAsset({
    name: body.name,
    description: body.description,
    annotation: body.annotation,
    forkedFromId: body.forkedFromId,
  });
  return NextResponse.json(row, { status: 201 });
}
