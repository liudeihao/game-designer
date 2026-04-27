import { NextResponse, type NextRequest } from "next/server";
import { getForks } from "@/server/mock-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const { searchParams } = request.nextUrl;
  const direction = searchParams.get("direction");
  if (direction !== "upstream" && direction !== "downstream") {
    return NextResponse.json({ error: "direction required", code: "bad_request" }, { status: 400 });
  }
  const { id } = await context.params;
  const { nodes } = getForks(id, direction);
  return NextResponse.json({ direction, nodes });
}
