import React from 'react';

/**
 * SmartDocLogoIcon
 *
 * Official verified isometric cube brand mark for SmartDoc.
 * Represents a secure, verifiable smart container with distributed workflow nodes
 * (apex, lower-left, lower-right) and a centralized approval verification stamp.
 */
export default function SmartDocLogoIcon({
  size = 20,
  className = '',
  checkColor,
  ...props
}) {
  const rawId = React.useId();
  const maskId = `sd-cube-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={`smart-doc-logo-icon ${className}`.trim()}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="#ffffff" />
          {/* Checkmark cuts through the center badge as a crisp transparent void */}
          <path
            d="M43.5 50.5 L48 55.5 L57.5 44"
            stroke="#000000"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        {/* Outer Hexagon outline */}
        <path
          d="M 50 11 L 85 31 L 85 71 L 50 91 L 15 71 L 15 31 Z"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />

        {/* 3 Internal edges meeting at the center junction */}
        <path d="M 15 31 L 50 51" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <path d="M 85 31 L 50 51" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <path d="M 50 91 L 50 51" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />

        {/* 3 Outer node circles (Top apex, Lower-Left, Lower-Right) */}
        <circle cx="50" cy="11" r="6.5" fill="currentColor" />
        <circle cx="15" cy="71" r="6.5" fill="currentColor" />
        <circle cx="85" cy="71" r="6.5" fill="currentColor" />

        {/* Center verification badge */}
        <circle cx="50" cy="51" r="12.5" fill="currentColor" />
      </g>

      {/* Explicit colored checkmark if checkColor is provided */}
      {checkColor && (
        <path
          d="M43.5 50.5 L48 55.5 L57.5 44"
          stroke={checkColor}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </svg>
  );
}
