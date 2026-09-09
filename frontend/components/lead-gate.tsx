"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { track } from "@/lib/analytics";
import { ApiError, api } from "@/lib/api-client";
import { config } from "@/lib/config";
import { COUNTRY_CODES, guessCountryIso, toE164 } from "@/lib/country-codes";
import { useLead } from "@/lib/lead-context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Same rule the backend applies to the assembled number. */
const E164_RE = /^\+[0-9]{7,15}$/;

type FieldErrors = { email?: string; phone?: string };

/** Client-side mirror of the backend rules — the backend stays the source of truth. */
function validate(email: string, countryIso: string, localNumber: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = "Enter a valid email address.";

  if (!countryIso) errors.phone = "Select your country code.";
  else if (!E164_RE.test(toE164(countryIso, localNumber)))
    errors.phone = "Enter a valid phone number.";

  return errors;
}

export function LeadGate() {
  const { setLeadId, source } = useLead();
  const [email, setEmail] = useState("");
  const [countryIso, setCountryIso] = useState("");
  const [localNumber, setLocalNumber] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Preselect from the browser locale after mount — doing it during render
  // would make the server and client markup disagree. Stays empty if we can't
  // tell, so nobody is silently assigned the wrong country.
  useEffect(() => {
    setCountryIso((current) => current || guessCountryIso());
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const found = validate(email, countryIso, localNumber);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const { leadId } = await api.createLead({
        email,
        phone: toE164(countryIso, localNumber),
        source,
      });
      track({ name: "lead_captured", source });
      setLeadId(leadId);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        else setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0B142E]/85 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#14224A] p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-white">
          Before we start
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Leave your details and {config.assistantName} will find your best plans.
        </p>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-slate-300">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
              className="border-white/10 bg-[#1E2C55] text-white placeholder:text-slate-500"
            />
            {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-slate-300">
              Phone
            </Label>
            {/* A native select, not a custom dropdown: on mobile it opens the
                OS picker, which beats scrolling 200 rows in a styled listbox. */}
            <div className="flex gap-2">
              <select
                id="country-code"
                aria-label="Country code"
                value={countryIso}
                onChange={(e) => setCountryIso(e.target.value)}
                aria-invalid={Boolean(errors.phone) && !countryIso}
                className="w-[7.5rem] shrink-0 rounded-md border border-white/10 bg-[#1E2C55] px-2 py-2 text-sm text-white outline-none focus-visible:border-brand"
              >
                <option value="" disabled>
                  Code
                </option>
                {COUNTRY_CODES.map((country) => (
                  <option key={country.iso} value={country.iso}>
                    {country.dial} {country.name}
                  </option>
                ))}
              </select>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="3 123 456"
                value={localNumber}
                onChange={(e) => setLocalNumber(e.target.value)}
                aria-invalid={Boolean(errors.phone)}
                className="min-w-0 flex-1 border-white/10 bg-[#1E2C55] text-white placeholder:text-slate-500"
              />
            </div>
            {errors.phone && <p className="text-xs text-red-400">{errors.phone}</p>}
          </div>
        </div>

        {formError && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{formError}</p>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full bg-[#4A9FE8] text-[#0B142E] hover:bg-[#69b1ee]"
        >
          {submitting ? "Saving…" : "Start my quote"}
        </Button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
          We only use these to send your quotations.
        </p>
      </form>
    </div>
  );
}
