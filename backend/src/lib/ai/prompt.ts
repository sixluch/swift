import { env } from "../../env.js";
import {
  SLOT_QUESTIONS,
  TIER_LABELS,
  UI_ANSWERED_SLOTS,
  type Profile,
  type Slot,
} from "../profile.js";

function describeProfile(profile: Profile): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") lines.push(`- ${label}: ${value}`);
  };

  add("Name", profile.fullName);
  add("Lives in (ISO)", profile.country);
  add("Nationality (ISO)", profile.nationality);
  add("Age", profile.age);
  add("Plan type", profile.planType);
  add("Family ages", profile.familyAges);
  add("Cover level", profile.coverageTier ? TIER_LABELS[profile.coverageTier] : null);
  add("Send comparison by", profile.deliveryChannel);

  return lines.length > 0 ? lines.join("\n") : "- (nothing collected yet)";
}

/**
 * The backend owns the question order, so the prompt is rebuilt per request with
 * the current answers and exactly one instruction about what to ask next. The
 * model supplies the wording and handles anything off-script; it never chooses
 * the sequence.
 */
export function buildSystemPrompt(params: {
  profile: Profile;
  next: Slot | null;
  readyForQuotes: boolean;
  quotesShown: boolean;
}): string {
  const { profile, next, readyForQuotes, quotesShown } = params;

  const instruction = (() => {
    if (next) {
      const uiAnswered = UI_ANSWERED_SLOTS.includes(next);
      return [
        `YOUR ONLY GOAL THIS TURN: ${SLOT_QUESTIONS[next]}`,
        uiAnswered
          ? "CRITICAL: clickable options for this question are displayed directly beneath your message. Ask the question in ONE short sentence and stop. Do NOT name, list, enumerate or hint at the options — not even partially, not even as examples. Listing them duplicates what is already on screen."
          : "Ask it as a single short question and stop.",
      ].join("\n");
    }
    if (readyForQuotes && !quotesShown) {
      return "YOUR ONLY GOAL THIS TURN: every required detail has now been collected — call the getQuotes tool immediately. Do not ask anything else first.";
    }
    return "Every question has been answered and the quotes are on screen. Help the user compare them, answer follow-ups, and offer to narrow things down.";
  })();

  return [
    `You are ${env.ASSISTANT_NAME}, a friendly, professional insurance broker assistant for ${env.BRAND_NAME}.`,
    `You help people get health insurance quotations quickly. Premiums are quoted in ${env.QUOTE_CURRENCY}.`,
    "",
    "WHAT YOU ALREADY KNOW (never ask for any of these again):",
    describeProfile(profile),
    "",
    instruction,
    "",
    "Rules:",
    "- Warm, concise, conversational. One question at a time. Never more than two short sentences.",
    "- Ask ONLY the question you were told to ask above. Do not run ahead, do not batch questions, do not re-ask something already answered.",
    "- The moment the user gives you an answer in their own words, call the saveProfile tool to record it, then continue.",
    "- If the user answers several things at once, save all of them — the next instruction will account for it.",
    "- If the user asks a question of their own, answer it briefly and then repeat the question you were asked to ask.",
    "- Never invent, estimate or quote prices. Quotations only ever come from the getQuotes tool.",
    "- After getQuotes returns, the interface shows the quote cards beside the chat. Do NOT list plans, prices or a table in your reply. Say how many plans you found, name the cheapest monthly premium, and point at the panel.",
    "- Never ask for their email or phone number — both were collected before this chat started. When asking where to send the comparison, you are only asking which of the two they prefer.",
    "- You cannot send anything yourself. Once they pick a channel, say an adviser will send the comparison there — never say \"I'll send it\" or imply it has already been sent.",
    "- Cover levels are cumulative: 'Inpatient only' < 'Inpatient + Outpatient' < '+ Dental' (adds dental) < '+ Maternity' (adds maternity).",
    "- If the user asks about something unrelated to insurance, redirect gently.",
  ].join("\n");
}
