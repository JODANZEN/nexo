import { NextResponse } from "next/server";
import { leadPlans, leadTypes, leadUnits, validateLead, type Lead } from "@/lib/lead";

const planNames: Record<Lead["plan"], string> = { basico: "Básico", pro: "Pro", premium: "Premium", nose: "No sabe aún" };
const typeNames: Record<Lead["type"], string> = {
  conjunto: "Administración de conjunto",
  consejo: "Consejo de administración",
  operador: "Operador / administradora",
  otro: "Otro",
};

function clip(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // Honeypot: pretend success so bots don't retry.
  if (clip(body.website)) return NextResponse.json({ ok: true });

  const lead: Lead = {
    name: clip(body.name, 120),
    email: clip(body.email, 200),
    phone: clip(body.phone, 40),
    org: clip(body.org, 160),
    type: (leadTypes as readonly string[]).includes(body.type as string) ? (body.type as Lead["type"]) : "otro",
    units: (leadUnits as readonly string[]).includes(body.units as string) ? (body.units as Lead["units"]) : "51-150",
    plan: (leadPlans as readonly string[]).includes(body.plan as string) ? (body.plan as Lead["plan"]) : "nose",
    message: clip(body.message, 3000),
    consent: body.consent === true,
    lang: body.lang === "en" ? "en" : "es",
  };

  const errors = validateLead(lead);
  if (Object.keys(errors).length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  const rows: [string, string][] = [
    ["Nombre", lead.name],
    ["Correo", lead.email],
    ["WhatsApp / celular", lead.phone],
    ["Conjunto o empresa", lead.org],
    ["Tipo", typeNames[lead.type]],
    ["Unidades", lead.units],
    ["Plan", planNames[lead.plan]],
    ["Idioma del sitio", lead.lang.toUpperCase()],
    ["Autorizó tratamiento de datos", lead.consent ? "Sí" : "No"],
    ["Mensaje", lead.message || "—"],
  ];
  const subject = `Nueva solicitud de demo: ${lead.org} (${lead.units} unidades, ${planNames[lead.plan]})`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html = `<h2 style="font-family:sans-serif">${esc(subject)}</h2><table style="font-family:sans-serif;border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#4A5B6C;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("")}</table>`;

  const key = process.env.RESEND_API_KEY;
  const to = (process.env.CONTACT_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.CONTACT_FROM ?? "Nexo <onboarding@resend.dev>";

  if (!key || to.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[contact] RESEND_API_KEY/CONTACT_TO not set — lead not emailed:\n" + text);
      return NextResponse.json({ ok: true, dev: true });
    }
    console.error("[contact] RESEND_API_KEY or CONTACT_TO missing in production");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 500 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, reply_to: lead.email, subject, text, html }),
  });

  if (!res.ok) {
    console.error("[contact] Resend error", res.status, await res.text().catch(() => ""));
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
