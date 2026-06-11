/**
 * Vendor brand marks for the leaderboard agents. SVG paths sourced from
 * simple-icons (https://simpleicons.org) — MIT-licensed, attribution
 * intentionally kept in the source file:
 *
 *   - Anthropic: simple-icons/anthropic
 *   - OpenAI:    iconify simple-icons:openai (Iconify mirror;
 *                simple-icons dropped the openai slug in v16)
 *   - Google:    simple-icons/google
 *
 * Used by Nav, leaderboard rows, agent cards, identity strip, and the
 * live broadcast racer cards.
 */

interface Props {
  slug: string;
  size?: number;
  /** When the parent already paints the brand-colored square (the design
   * convention for .agent-logo), the glyph paints in white. When the
   * glyph is standalone (e.g. inside a methodology block), the glyph
   * paints in its brand color. Defaults to white-on-color. */
  variant?: 'white-on-color' | 'color-on-paper';
  className?: string;
}

const BRAND_COLOR: Record<string, string> = {
  'claude-code': '#D97706',
  codex: '#10A37F',
  antigravity: '#4285F4',
  kimi: '#8B5CF6',
};

export function AgentLogo({ slug, size = 38, variant = 'white-on-color', className }: Props) {
  const onColor = variant === 'white-on-color';
  const background = onColor ? BRAND_COLOR[slug] ?? '#0A0A0A' : 'transparent';
  const glyphColor = onColor ? '#fff' : BRAND_COLOR[slug] ?? '#0A0A0A';
  const padding = Math.round(size * 0.21);
  const inner = size - padding * 2;

  return (
    <span
      className={className}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background,
        flexShrink: 0,
      }}
      aria-label={`${slug} logo`}
      role="img"
    >
      <svg
        width={inner}
        height={inner}
        viewBox="0 0 24 24"
        fill={glyphColor}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {slug === 'claude-code' && <AnthropicPath />}
        {slug === 'codex' && <OpenAIPath />}
        {slug === 'antigravity' && <GooglePath />}
        {(slug === 'kimi' || !(slug in BRAND_COLOR)) && <FallbackPath slug={slug} />}
      </svg>
    </span>
  );
}

function AnthropicPath() {
  return (
    <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
  );
}

function OpenAIPath() {
  return (
    <path d="M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z" />
  );
}

function GooglePath() {
  return (
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
  );
}

function FallbackPath({ slug }: { slug: string }) {
  const label = slug.slice(0, 2).toUpperCase();
  return (
    <text
      x="12"
      y="17"
      textAnchor="middle"
      fontSize="14"
      fontFamily="ui-monospace, monospace"
      fontWeight="600"
    >
      {label}
    </text>
  );
}
