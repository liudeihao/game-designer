/**
 * MSW handlers for unit tests. Production uses Next rewrites → Go, or RSC with API_URL to Go.
 */
import { http, HttpResponse } from "msw";

const origin = (path: string) => path;

export const handlers = [
  http.get(origin("/api/me"), () => {
    return HttpResponse.json({ id: "user-1", username: "indiedev", displayName: "Indie" });
  }),
];
