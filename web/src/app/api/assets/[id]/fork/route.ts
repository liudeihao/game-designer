import { NextResponse, type NextRequest } from "next/server";
import { forkFrom } from "@/server/mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const row = forkFrom(id);
  if (!row) {
    return NextResponse.json({ error: "Cannot fork", code: "cannot_fork" }, { status: 404 });
  }
  return NextResponse.json(row, { status: 201 });
}
