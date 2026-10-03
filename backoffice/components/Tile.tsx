export default function Tile({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone?: "pos" | "neg"; hint?: string }) {
  return (
    <div className="tile" title={hint}>
      <div className="tile-label">{label}</div>
      <div className={`tile-value${tone ? " " + tone : ""}`}>{value}</div>
    </div>
  );
}
