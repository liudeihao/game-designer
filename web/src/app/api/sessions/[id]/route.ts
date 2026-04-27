import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const s = getSession(id);
  if (!s) {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  return NextResponse.json(s);
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const s = getSession(id);
  if (!s) {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
