"use client";

import { useEffect } from "react";
import type { Casino } from "@/data/casinos";
import { buildAffiliateUrl, buildSubid } from "@/lib/affiliate";
import { SITE } from "@/lib/site";

/** Builds the final URL with the placement-specific sub-ID, fires the optional click beacon, redirects. */
export default function Redirector({ casino }: { casino: Pick<Casino, "slug" | "affiliateUrl" | "subidParam"> }) {
  useEffect(() => {
    const placement = new URLSearchParams(window.location.search).get("p");
    const subid = buildSubid(placement);
    const target = buildAffiliateUrl(casino, subid);

    if (SITE.clickApi) {
      try {
        const payload = JSON.stringify({
          slug: casino.slug,
          placement: placement || null,
          subid,
          referrer: document.referrer || null,
          ts: new Date().toISOString(),
        });
        // text/plain keeps it a "simple" request (no CORS preflight).
        navigator.sendBeacon?.(SITE.clickApi, new Blob([payload], { type: "text/plain" }));
      } catch {
        /* never block the redirect on analytics */
      }
    }
    window.location.replace(target);
  }, [casino]);

  return null;
}
