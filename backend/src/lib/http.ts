import type { ZodError } from "zod";

/**
 * Flattens Zod issues into the `{ field: message }` shape every route returns.
 *
 * An issue at a nested path is reported under every key a consumer might look
 * up: the top-level field (`dependants` — what the web form's top-level
 * inputs read), the row (`dependants.0` — what the form's family rows read)
 * and the exact path (`dependants.0.age`, `contact.phone` — what a machine
 * caller of `/api/*` needs to know which value to fix). First message wins
 * per key, so a field with two problems reports the first rather than the
 * last.
 */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, message: string) => {
    if (!(key in out)) out[key] = message;
  };

  for (const issue of error.issues) {
    const path = issue.path.map(String);
    if (path.length === 0) {
      put("form", issue.message);
      continue;
    }
    put(path[0], issue.message);
    if (path.length >= 2 && /^\d+$/.test(path[1])) put(`${path[0]}.${path[1]}`, issue.message);
    if (path.length >= 2) put(path.join("."), issue.message);
  }
  return out;
}
