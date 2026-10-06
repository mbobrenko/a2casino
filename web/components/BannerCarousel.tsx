"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import BannerArt from "@/components/BannerArt";
import Icon from "@/components/Icons";

export type Banner = { id: number; title: string; subtitle: string; cta_text: string; cta_link: string; color: string; emoji: string };

export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = banners.length;

  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n, paused]);

  if (n === 0) return null;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  return (
    <section className="carousel" aria-roledescription="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="slides" style={{ transform: `translateX(-${(i % n) * 100}%)` }}>
        {banners.map((b, k) => (
          <div key={b.id} className={"slide" + (k === i ? " current" : "")} style={{ "--bc": b.color || "#7c5cff" } as CSSProperties}
            aria-hidden={k !== i}>
            <div className="slide-bg" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /><span className="slide-grid" /></div>
            <div className="slide-text">
              <span className="eyebrow">Promotion</span>
              <h2>{b.title}</h2>
              <p>{b.subtitle}</p>
              {b.cta_text && <Link href={b.cta_link || "/"} className="btn gold cta" tabIndex={k === i ? 0 : -1}>{b.cta_text}</Link>}
            </div>
            <div className="slide-art"><BannerArt emoji={b.emoji} /></div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button className="car-arrow prev" aria-label="Previous banner" onClick={() => go(-1)}><Icon name="left" size={20} /></button>
          <button className="car-arrow next" aria-label="Next banner" onClick={() => go(1)}><Icon name="right" size={20} /></button>
          <div className="dots">
            {banners.map((b, k) => (
              <button key={b.id} aria-label={`Banner ${k + 1}`} className={"dot" + (k === i ? " active" : "")} onClick={() => setI(k)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
