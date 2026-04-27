import { NextResponse, type NextRequest } from "next/server";
import { createProject, listProjects } from "@/server/mock-store";

export function GET() {
  return NextResponse.json(listProjects());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string };
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name required", code: "bad_request" }, { status: 400 });
  }
  const p = createProject(body.name.trim());
  return NextResponse.json(p, { status: 201 });
}
