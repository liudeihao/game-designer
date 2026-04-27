import { NextResponse, type NextRequest } from "next/server";
import { getProject, patchProject } from "@/server/mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const p = getProject(id);
  if (!p) {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  return NextResponse.json(p);
}

export async function PATCH(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string; canvasDocument?: Record<string, unknown> | null };
  const p = patchProject(id, body.name, body.canvasDocument);
  if (!p) {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  return NextResponse.json(p);
}
