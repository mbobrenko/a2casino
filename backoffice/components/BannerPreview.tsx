/** Same gradient the player lobby (web/components/BannerCarousel) uses. */
export function bannerGradient(color: string): string {
  const c = /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#3d5afe";
  return `linear-gradient(120deg, color-mix(in srgb, ${c} 40%, #0f0d1a), ${c})`;
}

export default function BannerPreview({
  title,
  subtitle,
  ctaText,
  color,
  emoji,
}: {
  title: string;
  subtitle: string;
  ctaText: string;
  color: string;
  emoji: string;
}) {
  return (
    <div className="banner-preview" style={{ background: bannerGradient(color) }}>
      <div className="bp-text">
        <div className="bp-title">{title || "Заголовок баннера"}</div>
        {subtitle && <div className="bp-sub">{subtitle}</div>}
        {ctaText && <span className="bp-cta">{ctaText}</span>}
      </div>
      {emoji && <div className="bp-emoji">{emoji}</div>}
    </div>
  );
}
