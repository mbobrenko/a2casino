import type { Casino } from "@/data/casinos";
import { SITE } from "./site";

/** Placement IDs: where on our site the click came from. Appended to the sub-ID ("a2mb-home"). */
export type Placement = "home" | "review" | "bonos" | "pais" | "guia";

/** Sub-ID sent to the affiliate programme: the site default plus the optional placement. */
export function buildSubid(placement?: string | null): string {
  const clean = (placement || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  return clean ? `${SITE.subid}-${clean}` : SITE.subid;
}

/** Final outgoing URL with the sub-ID inserted ("{subid}" placeholder) or appended as a query param. */
export function buildAffiliateUrl(c: Pick<Casino, "affiliateUrl" | "subidParam">, subid: string): string {
  if (c.affiliateUrl.includes("{subid}")) {
    return c.affiliateUrl.split("{subid}").join(encodeURIComponent(subid));
  }
  try {
    const u = new URL(c.affiliateUrl);
    u.searchParams.set(c.subidParam || "subid", subid);
    return u.toString();
  } catch {
    return c.affiliateUrl;
  }
}

/** Internal path of the redirect page for a casino, with the placement as ?p=. */
export function goPath(slug: string, placement?: Placement): string {
  return `/ir/${slug}/${placement ? `?p=${placement}` : ""}`;
}
