import type { Dict } from "./es";

const en: Dict = {
  meta: {
    title: "Nexo — Property management for Colombian residential communities",
    description:
      "Fees, PSE and Nequi payments, resident requests, gatehouse access and assemblies in one platform built for Colombian Propiedad Horizontal.",
  },
  nav: {
    product: "Product",
    pricing: "Pricing",
    operators: "Operators",
    faq: "FAQ",
    signIn: "Sign in",
    demo: "Book a demo",
    menu: "Menu",
    close: "Close menu",
    switchTo: "Español",
    switchLabel: "View the site in Spanish",
  },
  hero: {
    title: "Paying the HOA fee should be the easiest part of the month.",
    lead:
      "Nexo brings billing, PSE and Nequi payments, resident requests, gatehouse access and assemblies into one platform, built for residential communities under Colombia's Law 675.",
    primary: "Book a demo",
    secondary: "See pricing",
    note: "For communities of 50 to 600 units, and larger operators.",
  },
  phone: {
    unit: "Tower 2, apt 502",
    greeting: "Hi, Laura",
    feeLabel: "November HOA fee",
    fullRate: "Full rate",
    fullAmount: "$ 350.000",
    earlyLabel: "Early payment",
    earlyAmount: "$ 332.500",
    earlyUntil: "until November 10",
    saving: "You save $ 17.500",
    payPse: "Pay with PSE",
    payNequi: "Nequi",
    pqrTitle: "Leak in the parking garage",
    pqrStatus: "In progress",
    visitTitle: "Visitor approved",
    visitWho: "Andrés Gómez, Saturday 3:00 p.m.",
    visitHint: "Show this code at the gate",
  },
  personas: {
    title: "Built for the people who manage, live in, and keep the books",
    lead:
      "Residents feel the pain of spreadsheets and WhatsApp groups the most, so Nexo starts with them, and management gets the order it needs.",
    items: [
      {
        name: "Management",
        points: [
          "Fees billed automatically, with early-payment discounts and late fees",
          "Receivables up to date without spreadsheets",
          "Resident requests with owners, statuses and photos",
          "Announcements for the whole community",
        ],
      },
      {
        name: "Residents and owners",
        points: [
          "See their balance and pay from their phone",
          "Sign in with an SMS code, no email needed",
          "File requests and follow their progress",
          "Approve visitors with a QR code",
        ],
      },
      {
        name: "Accountant",
        points: [
          "Accounts receivable exports",
          "Clearance certificates as PDF",
          "Bank reconciliation by CSV",
          "Data ready for DIAN tax reporting",
        ],
      },
    ],
  },
  modules: {
    title: "Everything that happens in the community, in one place",
    items: [
      {
        name: "Billing and payments",
        body:
          "Fees with an early-payment discount from the 1st to the 10th, a full rate after that, and late fees calculated on the base amount. PSE and Nequi payments are applied to each unit automatically.",
      },
      {
        name: "Resident requests",
        body:
          "Requests and complaints with statuses, comments and photos. Residents know where their case stands without having to ask.",
      },
      {
        name: "Gatehouse",
        body:
          "Pre-approved visitors with QR codes, entry logs and package tracking. ID numbers are stored encrypted and visitor logs are deleted after 30 days.",
      },
      {
        name: "Assemblies",
        body:
          "Voting weighted by each unit's ownership share, with every vote sealed so no one can change it later. The minutes are generated as a PDF when the session closes.",
      },
      {
        name: "Documents",
        body:
          "Bylaws, minutes and financial statements with role-based access. Everyone sees only what's theirs to see.",
      },
      {
        name: "Iris, AI assistant",
        body:
          "Answers residents' and management's questions about their account and the community, any time of day.",
      },
    ],
  },
  pricing: {
    title: "One fixed price based on community size",
    lead:
      "You pay a monthly amount by unit range, not per apartment. Pay annually and save 15%.",
    unitsLabel: "Units in your community",
    billingLabel: "Billing",
    monthly: "Monthly",
    annual: "Annual (−15%)",
    perMonth: "/mo",
    billedAnnually: "per month, billed annually",
    billedMonthly: "billed monthly",
    custom: "Custom",
    customNote: "Quoted for your towers and units",
    popular: "Most chosen",
    choose: "Request",
    includesPrev: "Everything in {plan}, plus:",
    plans: {
      basico: {
        name: "Básico",
        summary: "The essentials to leave spreadsheets behind.",
        features: [
          "Billing and online payments",
          "Resident requests",
          "Documents",
          "Resident portal",
          "Gatehouse with QR",
          "Announcements",
          "Basic accounting",
        ],
      },
      pro: {
        name: "Pro",
        summary: "For communities with shared amenities and digital assemblies.",
        features: [
          "Assemblies and voting",
          "Amenity bookings",
          "Parking",
          "Inspections",
          "Reports",
          "Recurring payments",
          "Iris with limited use",
          "Full accounting",
        ],
      },
      premium: {
        name: "Premium",
        summary: "For communities with commercial units or several towers.",
        features: [
          "DIAN electronic invoicing",
          "Exógena tax reporting",
          "Unlimited Iris",
          "Multiple towers",
          "API access",
          "Push notifications",
          "HubSpot and Siigo integrations",
        ],
      },
    },
    fine:
      "Prices in Colombian pesos (COP). Online payment fees are paid by the resident at checkout.",
  },
  operators: {
    kicker: "For operators",
    title: "A case's clock shouldn't run while you're waiting on the resident.",
    lead:
      "When you run hundreds or thousands of units, the problem is rarely your team: it's getting residents to respond. In Nexo every request has a priority and a target time, escalates on its own as it nears the limit, and pauses the clock while it waits on the resident.",
    points: [
      { name: "Priorities P1 to P4", body: "With target times and automatic escalation at 70, 90 and 100%." },
      { name: "24-hour reminder", body: "If the resident doesn't reply, Nexo follows up by WhatsApp, SMS or email." },
      { name: "History per unit", body: "Every entry, case and change for a unit or resident, on one timeline." },
      { name: "Works with what you have", body: "We connect to your CRM and accounting instead of replacing them." },
    ],
    cta: "Talk to us",
    ticket: {
      id: "Case #2381, P2",
      title: "No hot water, room 1204",
      target: "Target time: 8 h",
      stages: {
        open: "Opened",
        paused: "Waiting on resident",
        resumed: "Technician assigned",
      },
      paused: "Clock paused",
      nudge: "Reminder sent by WhatsApp",
      elapsed: "4 h 10 min of 8 h",
    },
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        q: "Do residents need an email address?",
        a: "No. They sign in with a code sent by SMS. Many owners don't check email, so the phone is the way in.",
      },
      {
        q: "Is pricing per apartment?",
        a: "No. You pay a fixed monthly amount based on your community's unit range, so management can budget for it without surprises.",
      },
      {
        q: "How do residents pay?",
        a: "With PSE or Nequi from the portal. The payment is applied to their unit without anyone checking bank statements.",
      },
      {
        q: "What about personal data?",
        a: "Visitor ID numbers are stored encrypted, visitor logs are deleted after 30 days, and each community's data is isolated from every other's. Nexo is designed around Colombia's data protection law (Law 1581 of 2012).",
      },
      {
        q: "We keep everything in spreadsheets today. How do we start?",
        a: "Book a demo. We'll look at how your information is organized and how to load units, owners and balances into Nexo.",
      },
    ],
  },
  contact: {
    title: "Book a demo",
    lead:
      "Tell us about your community or operation and we'll reach out to show you Nexo with your own cases.",
    direct: "Rather email us directly?",
    fields: {
      name: "Name",
      email: "Email",
      phone: "WhatsApp or mobile",
      org: "Community or company",
      type: "You are",
      typeOptions: {
        conjunto: "Managing a community",
        consejo: "On the community board",
        operador: "An operator or management firm",
        otro: "Other",
      },
      units: "Number of units",
      plan: "Plan you're interested in",
      planUnsure: "Not sure yet",
      message: "Message (optional)",
      messagePlaceholder: "What would you like to solve first?",
      consent: "I authorize Nexo to use this information to contact me about this request.",
    },
    submit: "Send request",
    sending: "Sending…",
    success: {
      title: "We got your request",
      body: "We'll reach out by email or WhatsApp to schedule the demo.",
    },
    errors: {
      required: "Fill in this field.",
      email: "Check the email; it looks incomplete.",
      consent: "We need your permission to contact you.",
      server: "The request couldn't be sent. Try again in a moment.",
    },
  },
  footer: {
    tagline: "Property management for residential communities in Colombia.",
    rights: "All rights reserved.",
    privacy: "Data policy",
  },
};

export default en;
