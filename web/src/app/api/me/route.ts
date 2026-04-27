import { NextResponse } from "next/server";
import { getMe } from "@/server/mock-store";

export function GET() {
  return NextResponse.json(getMe());
}
