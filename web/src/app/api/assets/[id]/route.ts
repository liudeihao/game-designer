import { NextResponse, type NextRequest } from "next/server";
import { getAsset, patchAsset } from "@/server/mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const a = getAsset(id);
  if (!a) {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  return NextResponse.json(a);
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    annotation?: string | null;
    coverImageId?: string | null;
  };
  const row = patchAsset(id, body);
  if (!row) {
    return NextResponse.json({ error: "Forbidden or not found", code: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(row);
}
