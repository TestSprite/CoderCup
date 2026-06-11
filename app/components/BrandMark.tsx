interface Props {
  size?: number;
  className?: string;
  // The mark uses currentColor for the brackets/pennants (caller controls
  // via color: var(--ink) etc.) and a fixed --accent for the champion bar.
}

export function BrandMark({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 365 365"
      fill="none"
      aria-hidden
      className={className}
    >
      {/* Champion bar — accent green, sits beneath the brackets */}
      <line
        x1="96.9399"
        y1="327"
        x2="267.034"
        y2="327"
        stroke="var(--accent)"
        strokeWidth="30"
      />
      {/* Left bracket frame { */}
      <path
        d="M139.738 49H68.028L68.028 122.181L30 159.681L68.028 194.331L68.028 269.573H139.738"
        stroke="currentColor"
        strokeWidth="30"
      />
      {/* Left pennant ' */}
      <path
        d="M119.151 155.454L128.241 135.729H109V92H154.479V131.357L140.433 155.454H119.151Z"
        fill="currentColor"
      />
      {/* Right pennant ' */}
      <path
        d="M205.14 155.683L214.23 135.958H194.989V92.2285H240.467V131.585L226.422 155.683H205.14Z"
        fill="currentColor"
      />
      {/* Right bracket frame } */}
      <path
        d="M225.333 50.0972H297.043L297.043 123.278L335.071 160.779L297.043 195.428L297.043 270.67H225.333"
        stroke="currentColor"
        strokeWidth="30"
      />
    </svg>
  );
}
