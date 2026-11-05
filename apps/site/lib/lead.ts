// Shared shape + validation for demo requests (client and server).
export const leadTypes = ["conjunto", "consejo", "operador", "otro"] as const;
export const leadPlans = ["basico", "pro", "premium", "nose"] as const;
export const leadUnits = ["1-50", "51-150", "151-300", "301-600", "601+"] as const;

export type Lead = {
  name: string;
  email: string;
  phone: string;
  org: string;
  type: (typeof leadTypes)[number];
  units: (typeof leadUnits)[number];
  plan: (typeof leadPlans)[number];
  message: string;
  consent: boolean;
  lang: "es" | "en";
  website?: string; // honeypot — real people leave it empty
};

export type LeadErrors = Partial<Record<"name" | "email" | "phone" | "org" | "consent", "required" | "email" | "consent">>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLead(l: Partial<Lead>): LeadErrors {
  const e: LeadErrors = {};
  if (!l.name?.trim()) e.name = "required";
  if (!l.email?.trim()) e.email = "required";
  else if (!EMAIL.test(l.email.trim())) e.email = "email";
  if (!l.phone?.trim()) e.phone = "required";
  if (!l.org?.trim()) e.org = "required";
  if (!l.consent) e.consent = "consent";
  return e;
}
