/**
 * MSW handlers mirror /api/* routes; use the same base URL in tests.
 * Runtime mock is implemented via Next.js route handlers (src/app/api) + src/server/mock-store.
 */
import { http, HttpResponse } from "msw";

const origin = (path: string) => path;

export const handlers = [
  http.get(origin("/api/me"), () => {
    return HttpResponse.json({ id: "user-1", username: "indiedev", displayName: "Indie" });
  }),
];
