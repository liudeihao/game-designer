import { NextResponse, type NextRequest } from "next/server";
import { requestImage } from "@/server/mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { extraPrompt?: string | null };
  const { image, error } = requestImage(id, body.extraPrompt ?? null);
  if (error === "not_found") {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json({ error: "Cannot generate on public asset; fork first", code: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(image, { status: 202 });
}
