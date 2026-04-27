import { NextResponse, type NextRequest } from "next/server";
import { publish } from "@/server/mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const row = publish(id);
  if (!row) {
    return NextResponse.json({ error: "Forbidden or not found", code: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(row);
}
