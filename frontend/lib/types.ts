export type ChatRole = "user" | "assistant";
export type InputMode = "typed" | "voice";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  inputMode?: InputMode;
}

export interface Quote {
  id: string;
  insurer: string;
  planName: string;
  monthlyPremium: number;
  currency: string;
  coverageSummary: string;
  coverageTypes: string[];
}
