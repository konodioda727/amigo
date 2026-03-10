import type React from "react";

export interface AmigoLogoProps extends React.SVGProps<SVGSVGElement> {
  isAnimating?: boolean;
}

export const AmigoLogo: React.FC<AmigoLogoProps> = ({
  isAnimating = false,
  className = "",
  ...props
}) => {
  return (
    <svg
      viewBox="0 0 100 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Amigo Logo"
      {...props}
    >
      <title>Amigo Logo</title>
      {/* Body */}
      <circle cx="45" cy="50" r="22" fill="#E0F2FE" />

      {/* Blush */}
      <ellipse cx="32" cy="53" rx="3" ry="1.5" fill="#FECACA" opacity="0.8" />
      <ellipse cx="58" cy="53" rx="3" ry="1.5" fill="#FECACA" opacity="0.8" />

      {/* Eyes */}
      <g>
        <circle cx="36" cy="44" r="5" fill="#ffffff" />
        <circle cx="54" cy="44" r="5" fill="#ffffff" />

        {/* Pupils */}
        <circle cx="37" cy="44" r="2.5" fill="#334155">
          {isAnimating && (
            <animate
              attributeName="cx"
              values="34; 39; 34"
              dur="0.5s"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <circle cx="55" cy="44" r="2.5" fill="#334155">
          {isAnimating && (
            <animate
              attributeName="cx"
              values="52; 57; 52"
              dur="0.5s"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
              repeatCount="indefinite"
            />
          )}
        </circle>
      </g>

      {/* Sweat drop (working hard!) */}
      {isAnimating && (
        <g>
          <path d="M 22 32 Q 25 37 22 40 Q 19 37 22 32" fill="#93C5FD">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 0,2; 0,0"
              dur="1s"
              repeatCount="indefinite"
            />
            <animate attributeName="opacity" values="1; 0.3; 1" dur="1s" repeatCount="indefinite" />
          </path>
        </g>
      )}

      {/* Paper */}
      <rect
        x="62"
        y="42"
        width="22"
        height="28"
        rx="2"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="1.5"
        transform="rotate(12 65 40)"
      />

      {/* Text lines on paper */}
      <g transform="rotate(12 65 40)">
        <line
          x1="66"
          y1="48"
          x2="80"
          y2="48"
          stroke="#E2E8F0"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="66"
          y1="54"
          x2="78"
          y2="54"
          stroke="#E2E8F0"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="66"
          y1="60"
          x2="81"
          y2="60"
          stroke="#E2E8F0"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      {/* Hand writing with pen */}
      <g>
        {isAnimating && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0,0; 5,-2; -1,3; 4,-1; 0,0"
            dur="0.4s"
            repeatCount="indefinite"
          />
        )}
        {/* Pen body */}
        <path d="M 68 45 L 82 30 L 85 33 L 71 48 Z" fill="#FDE047" />
        {/* Nib */}
        <path d="M 68 45 L 65 48 L 71 48 Z" fill="#475569" />
        {/* Eraser tip */}
        <path d="M 82 30 L 85 33 L 87 31 L 84 28 Z" fill="#FCA5A5" />
        {/* Hand */}
        <circle cx="72" cy="46" r="4.5" fill="#BAE6FD" />
      </g>
    </svg>
  );
};
