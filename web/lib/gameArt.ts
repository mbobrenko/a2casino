// Cover art for lobby tiles: hand-drawn SVGs in public/games/<slug>.svg (see scripts/game-art.mjs).
// The title is laid over the art in HTML; each cover picks a title fill and outline that suit it.
// A game added in the back office later has no entry here and falls back to its colour + emoji.

const titles: Record<string, [fill: string, outline: string]> = {
  "mock-fruit-slot": ["#fff3b0", "#7a0a1e"],
  "mock-gold-slot": ["#ffd84a", "#2a1500"],
  "mock-roulette": ["#ffffff", "#06325a"],
  "mock-scratch": ["#ffe14d", "#3b0764"],
  "book-of-sands": ["#ffe08a", "#4a1c02"],
  "neon-nights": ["#ffe6fa", "#a1127f"],
  "wild-buffalo": ["#ffd27a", "#3a1404"],
  "sugar-rush-x": ["#ffffff", "#b0186c"],
  "dragon-fortune": ["#ffd84a", "#5a0000"],
  "aztec-gold": ["#fde68a", "#0c3b1e"],
  "lucky-clover": ["#fff1a8", "#064e2b"],
  "pirate-bay": ["#fde68a", "#0b1a44"],
  "aviator-x": ["#ffffff", "#8a1c04"],
  "rocket-moon": ["#ffffff", "#2a237a"],
  "plinko-drop": ["#ccfbf1", "#053b37"],
  "mines-field": ["#fde68a", "#111827"],
  "blackjack-classic": ["#ffffff", "#033a28"],
  "baccarat-pro": ["#fcd34d", "#3b0410"],
  "american-roulette": ["#ffffff", "#5a0808"],
  "keno-blast": ["#ffffff", "#075a70"],
  dice: ["#ffffff", "#0b5a2c"],
  crash: ["#ffffff", "#7a1010"],
  mines: ["#ffffff", "#074a73"],
  plinko: ["#ffffff", "#86104e"],
};

/** URL of the game's cover, or null when it has none (then the tile draws the colour + emoji fallback). */
export const artSrc = (slug: string) => (titles[slug] ? `/games/${slug}.svg` : null);

/** CSS custom properties for the title over the art. */
export function titleVars(slug: string, color: string): Record<string, string> {
  const [fill, outline] = titles[slug] ?? ["#ffffff", `color-mix(in srgb, ${color} 45%, #000)`];
  return { "--tf": fill, "--ts": outline };
}
