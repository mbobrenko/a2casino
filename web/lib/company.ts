// Company details and other undecided values used by the legal pages (/legal/*).
// Everything in [square brackets] is a placeholder: fill it in here once and every page picks it up.
// The legal texts are templates and must be reviewed by legal counsel before launch.

export const LEGAL_UPDATED = "2026-10-05";
export const LEGAL_UPDATED_TEXT = "5 October 2026";
export const LEGAL_NOTICE = "Template — to be reviewed by legal counsel before launch.";

export const COMPANY = {
  brand: "A2Casino",
  name: "[Company Name]",
  regNumber: "[Registration Number]",
  address: "[Registered Address]",
  website: "[Website Domain]",
  /** "Curaçao" or "Anjouan (Union of the Comoros)", once the licence is granted. */
  jurisdiction: "[Licensing Jurisdiction]",
  regulator: "[Licensing Authority]",
  licenceNumber: "[Licence Number]",
  supportEmail: "[support email]",
  privacyEmail: "[privacy email]",
  complaintsEmail: "[complaints email]",
  /** Independent alternative dispute resolution service, if the licence requires or allows one. */
  adrBody: "[ADR Body]",
  /** Courts that hear disputes not resolved through the complaints procedure. */
  courts: "[Competent Courts]",
  hostingProvider: "[Hosting Provider]",
  kycProvider: "[KYC Provider]",
  testingLab: "[Testing Laboratory]",
  /** Financial intelligence unit that receives suspicious activity reports in the licensing jurisdiction. */
  fiu: "[Financial Intelligence Unit]",
  complianceOfficer: "[Compliance Officer / MLRO]",
};

/** Restricted countries. The final list must be confirmed by legal counsel. */
export const RESTRICTED = {
  list: "[Restricted Countries]",
  note:
    "To be confirmed by legal counsel. Typically restricted: the United States, the United Kingdom, France, " +
    "the Netherlands, Spain, Curaçao itself and countries on the FATF list of high-risk jurisdictions subject " +
    "to a call for action (\"blacklist\").",
  /** What the platform blocks at registration today (BLOCKED_COUNTRIES default in backend/internal/config). */
  currentlyBlocked:
    "United States, United Kingdom, France, Spain, Italy, the Netherlands, Brazil, Colombia, Peru, Argentina, " +
    "South Africa, China, India, Indonesia, Vietnam, Thailand, Malaysia, South Korea, Japan and the Philippines",
};

/** Commercial and operational decisions not made yet. */
export const PENDING = {
  maxWin: "[Maximum Win]",
  maxDiceBet: "[Maximum Dice Bet]",
  maxWithdrawal: "[Maximum Withdrawal Limits]",
  withdrawalReviewTime: "[Withdrawal Review Time]",
  dormancyPeriod: "[Dormancy Period]",
  dormantFee: "[Dormant Account Fee]",
  retentionPeriod: "[Retention Period]",
  /** Cumulative deposits or withdrawals that trigger source-of-funds checks. */
  sofThreshold: "[Source of Funds Threshold]",
  /** Internal complaint timelines (operational commitments, confirm with the support team). */
  complaintAck: "2 business days",
  complaintAnswer: "14 days",
  complaintExtended: "30 days",
};

/** Rules the backend enforces today. Keep in sync with the backend when they change. */
export const RULES = {
  minAge: 18,
  currency: "USD",
  minWithdrawal: "$10.00",
  minDiceBet: "$0.10",
  minRewardClaim: "$1.00",
  cryptoConfirmations: 3,
  sessionHours: 24,
  /** Responsible gaming (backend/internal/rg). */
  coolingOffHours: 24,
  reopenDelayHours: 24,
  timeouts: "24 hours, 7 days, 30 days or 6 weeks",
  selfExclusions: "6 months, 1 year, 5 years or permanently",
  /** KYC uploads (backend/internal/kyc). */
  kycFormats: "JPG, PNG or PDF",
  kycMaxFile: "5 MB",
};

export type LegalPageInfo = { slug: string; title: string; summary: string };

export const LEGAL_PAGES: LegalPageInfo[] = [
  { slug: "terms", title: "Terms & Conditions", summary: "The agreement between you and us: accounts, eligibility, play, payments, closure and liability." },
  { slug: "bonus-terms", title: "Bonus Terms", summary: "How bonuses, free spins, wagering, expiry and promo codes work." },
  { slug: "game-rules", title: "Game Rules & RTP", summary: "General game rules, return-to-player figures and how our provably fair Dice works." },
  { slug: "privacy", title: "Privacy Policy", summary: "What personal data we collect, why, who we share it with and your rights." },
  { slug: "cookies", title: "Cookie Policy", summary: "Cookies and browser storage used on the website." },
  { slug: "responsible-gaming", title: "Responsible Gaming", summary: "Staying in control, warning signs, self-exclusion and where to get help." },
  { slug: "kyc-aml", title: "KYC & AML Policy", summary: "Identity verification, anti-money laundering checks and sanctions screening." },
  { slug: "payments", title: "Payments & Withdrawals", summary: "Deposit methods, minimums, crediting, withdrawal checks and processing." },
  { slug: "complaints", title: "Complaints & Dispute Resolution", summary: "How to complain, our timelines and how to escalate." },
  { slug: "vip", title: "VIP & Loyalty Terms", summary: "VIP points, levels, cashback and rakeback." },
];

export const legalPage = (slug: string) => LEGAL_PAGES.find((p) => p.slug === slug)!;
