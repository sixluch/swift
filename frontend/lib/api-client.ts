import { config } from "./config";

/** Every backend call in the app goes through this module — nothing else may fetch the API directly. */

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.backendUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : null) ?? "Something went wrong. Please try again.";
    const fields =
      payload && typeof payload === "object" && "fields" in payload
        ? ((payload as { fields: Record<string, string> }).fields)
        : undefined;
    throw new ApiError(message, res.status, fields);
  }

  return payload as T;
}

export interface CreateLeadInput {
  email: string;
  phone: string;
  source?: string;
}

export interface CreateLeadResult {
  leadId: string;
  createdAt: string;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/health"),

  createLead: (input: CreateLeadInput) =>
    request<CreateLeadResult>("/leads", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
