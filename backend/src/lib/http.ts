import type { ZodError } from "zod";

/** Flattens Zod issues into the { field: message } shape the frontend renders inline. */
export function fieldErrors(error: ZodError): Record<string, string> {
  return error.issues.reduce<Record<string, string>>((acc, issue) => {
    acc[String(issue.path[0] ?? "form")] = issue.message;
    return acc;
  }, {});
}
