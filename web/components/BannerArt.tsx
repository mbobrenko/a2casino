// Hero illustrations for the lobby banners, drawn from SVG shapes. Banners are edited in the back
// office with an emoji; the common ones get a drawing, any other emoji sits in a glossy orb.

const Sparkles = () => (
  <g className="twinkle" fill="#fff">
    <path d="M30 40q0 10 10 10q-10 0-10 10q0-10-10-10q10 0 10-10z" />
    <path d="M206 30q0 7 7 7q-7 0-7 7q0-7-7-7q7 0 7-7z" />
    <path d="M214 150q0 8 8 8q-8 0-8 8q0-8-8-8q8 0 8-8z" />
    <circle cx="48" cy="160" r="3" /><circle cx="190" cy="80" r="2.5" />
  </g>
);

const Defs = () => (
  <defs>
    <linearGradient id="ba-gold" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stopColor="#fff4b0" /><stop offset=".45" stopColor="#ffd23f" /><stop offset="1" stopColor="#d48a00" /></linearGradient>
    <linearGradient id="ba-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5a6e" /><stop offset="1" stopColor="#a3001b" /></linearGradient>
    <linearGradient id="ba-violet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#5b21b6" /></linearGradient>
    <radialGradient id="ba-glow"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
  </defs>
);

function Gift() {
  return (
    <>
      <circle cx="120" cy="104" r="96" fill="url(#ba-glow)" />
      <g className="coin c1"><circle cx="40" cy="80" r="14" fill="#a87400" /><circle cx="40" cy="78" r="12" fill="url(#ba-gold)" /></g>
      <g className="coin c2"><circle cx="206" cy="104" r="11" fill="#a87400" /><circle cx="206" cy="102" r="9.5" fill="url(#ba-gold)" /></g>
      <g className="float">
        <rect x="62" y="96" width="116" height="92" rx="10" fill="url(#ba-violet)" />
        <rect x="62" y="96" width="116" height="20" fill="#000" opacity=".18" />
        <rect x="54" y="74" width="132" height="30" rx="8" fill="url(#ba-violet)" />
        <rect x="54" y="74" width="132" height="10" rx="5" fill="#fff" opacity=".18" />
        <rect x="110" y="74" width="20" height="114" fill="url(#ba-gold)" />
        <path d="M120 74c-14-30-50-36-52-14-1 14 24 18 52 14zM120 74c14-30 50-36 52-14 1 14-24 18-52 14z" fill="url(#ba-gold)" stroke="#a87400" strokeWidth="2" />
        <circle cx="120" cy="72" r="9" fill="#ffd23f" stroke="#a87400" strokeWidth="2" />
        <path d="M74 120h20M74 132h12" stroke="#fff" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
      </g>
    </>
  );
}

function Reels() {
  const seven = (x: number) => <text x={x} y="121" fontFamily="Arial Black,Arial,sans-serif" fontWeight="900" fontSize="40" fill="#e0102e" textAnchor="middle">7</text>;
  return (
    <>
      <circle cx="120" cy="104" r="96" fill="url(#ba-glow)" />
      <g className="float">
        <rect x="40" y="46" width="152" height="130" rx="18" fill="url(#ba-red)" stroke="#ffd23f" strokeWidth="4" />
        <rect x="56" y="30" width="120" height="26" rx="13" fill="url(#ba-gold)" />
        <text x="116" y="49" fontFamily="Arial Black,Arial,sans-serif" fontWeight="900" fontSize="15" fill="#7a1010" textAnchor="middle">FREE SPINS</text>
        {[54, 98, 142].map((x) => <rect key={x} x={x} y="72" width="40" height="66" rx="8" fill="#fff" stroke="#7a1010" strokeWidth="3" />)}
        {seven(74)}{seven(118)}{seven(162)}
        <rect x="54" y="98" width="128" height="4" fill="#ffd23f" opacity=".6" />
        <rect x="62" y="150" width="108" height="14" rx="7" fill="#7a1010" />
        <path d="M196 70v58" stroke="#c0c6d4" strokeWidth="6" strokeLinecap="round" />
        <circle cx="196" cy="64" r="11" fill="url(#ba-red)" stroke="#7a1010" strokeWidth="2" />
      </g>
    </>
  );
}

function Crown() {
  return (
    <>
      <circle cx="120" cy="104" r="96" fill="url(#ba-glow)" />
      <g className="float">
        <path d="M44 150 34 66l46 40 40-60 40 60 46-40-10 84z" fill="url(#ba-gold)" stroke="#a87400" strokeWidth="4" strokeLinejoin="round" />
        <rect x="42" y="146" width="156" height="24" rx="6" fill="url(#ba-gold)" stroke="#a87400" strokeWidth="4" />
        <circle cx="34" cy="62" r="9" fill="#38bdf8" stroke="#a87400" strokeWidth="3" />
        <circle cx="120" cy="42" r="11" fill="#ef4444" stroke="#a87400" strokeWidth="3" />
        <circle cx="206" cy="62" r="9" fill="#38bdf8" stroke="#a87400" strokeWidth="3" />
        <circle cx="120" cy="124" r="13" fill="#22c55e" stroke="#a87400" strokeWidth="3" />
        <circle cx="80" cy="132" r="7" fill="#ef4444" /><circle cx="160" cy="132" r="7" fill="#ef4444" />
        <path d="M60 154h120" stroke="#fff" strokeOpacity=".45" strokeWidth="4" strokeLinecap="round" />
      </g>
    </>
  );
}

const drawings: Record<string, () => React.ReactElement> = { "🎁": Gift, "🎰": Reels, "👑": Crown };

export default function BannerArt({ emoji }: { emoji: string }) {
  const Drawing = drawings[emoji];
  if (!Drawing) return <div className="slide-orb"><span>{emoji}</span></div>;
  return (
    <svg className="banner-art" viewBox="0 0 240 200" aria-hidden="true">
      <Defs /><Drawing /><Sparkles />
    </svg>
  );
}
