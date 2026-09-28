import React from 'react';

export function LogoIcon({ size = 42, className = '' }) {
  return (
    <div
      className={`logo-icon-box ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: 'var(--yellow, #FFE600)',
        border: '2.5px solid #000000',
        boxShadow: '3.5px 3.5px 0px #000000',
        borderRadius: size > 48 ? '12px' : '9px',
        display: 'grid',
        placeItems: 'center',
        transform: 'rotate(-2.5deg)',
        transition: 'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.18s ease',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <svg
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Signal Broadcast Alert Rays */}
        <path d="M7 10L4 6" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M14 7L14 3" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M21 8L24 4" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />

        {/* Neo-brutalist 4-point Alert Spark at Top-Right */}
        <path
          d="M28 2Q28 7.5 33.5 7.5Q28 7.5 28 13Q28 7.5 22.5 7.5Q28 7.5 28 2Z"
          fill="var(--coral, #FF5C5C)"
          stroke="#000000"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Outer Eye Contour */}
        <path
          d="M3 20C7 11 25 11 29 20C25 29 7 29 3 20Z"
          fill="#FFFFFF"
          stroke="#000000"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />

        {/* Iris / Outer Pupil */}
        <circle cx="16" cy="20" r="5.6" fill="#000000" />

        {/* Radar Ring (Lime) */}
        <circle cx="16" cy="20" r="3.4" fill="var(--lime, #A3E635)" stroke="#000000" strokeWidth="1" />

        {/* Center Pupil Core */}
        <circle cx="16" cy="20" r="1.6" fill="#000000" />

        {/* Catchlight Reflection Spark */}
        <circle cx="14" cy="18" r="1.2" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export default function Logo({
  size = 'medium',
  subtitle = 'PUBLIC NOTICE RADAR',
  showSubtitle = true,
  onClick,
}) {
  const isLarge = size === 'large';
  const isSmall = size === 'small';

  const iconSize = isLarge ? 54 : isSmall ? 32 : 42;
  const fontSize = isLarge ? '34px' : isSmall ? '20px' : '26px';
  const subFontSize = isLarge ? '11px' : isSmall ? '8px' : '9.5px';

  return (
    <div
      className="brand-logo-container"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isLarge ? '14px' : '11px',
        textDecoration: 'none',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <LogoIcon size={iconSize} />

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          className="brand-title-row"
          style={{
            fontFamily: "var(--font-display, 'Space Grotesk'), sans-serif",
            fontSize,
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#000000',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ textTransform: 'lowercase' }}>notice</span>
          <span
            className="brand-badge-me"
            style={{
              background: 'var(--yellow, #FFE600)',
              color: '#000000',
              border: '2.5px solid #000000',
              boxShadow: isLarge ? '3px 3px 0px #000000' : '2.2px 2.2px 0px #000000',
              borderRadius: isLarge ? '7px' : '5px',
              padding: isLarge ? '2px 9px' : '1px 7px',
              marginLeft: '5px',
              transform: 'rotate(3.5deg)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: isLarge ? '6px' : '4px',
              fontSize: '0.88em',
              lineHeight: 1.1,
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
            }}
          >
            <span>me</span>
            <span
              className="brand-beacon-dot"
              style={{
                width: isLarge ? '8px' : '6px',
                height: isLarge ? '8px' : '6px',
                borderRadius: '50%',
                background: 'var(--coral, #FF5C5C)',
                border: '1.2px solid #000000',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          </span>
        </div>

        {showSubtitle && subtitle && (
          <div style={{ marginTop: isLarge ? '6px' : '4px' }}>
            <span
              className="brand-subtitle"
              style={{
                fontFamily: "var(--font-mono, 'JetBrains Mono'), monospace",
                fontSize: subFontSize,
                fontWeight: 800,
                letterSpacing: '0.12em',
                background: '#FFFFFF',
                color: '#000000',
                border: '1.5px solid #000000',
                boxShadow: '2px 2px 0px #000000',
                padding: isLarge ? '2px 8px' : '1px 6px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                textTransform: 'uppercase',
                lineHeight: 1.3,
              }}
            >
              <span style={{ color: 'var(--lime, #A3E635)', fontSize: '11px', lineHeight: 1 }}>✦</span>
              <span>{subtitle}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
