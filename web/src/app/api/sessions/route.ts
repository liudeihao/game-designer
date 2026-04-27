import { NextResponse, type NextRequest } from "next/server";
import { createSession, listSessions } from "@/server/mock-store";

export function GET() {
  return NextResponse.json(listSessions());
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const s = createSession(body.title);
  return NextResponse.json(s, { status: 201 });
}
