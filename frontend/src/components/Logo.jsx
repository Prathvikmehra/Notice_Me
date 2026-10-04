import React from 'react';
import logoImg from '../assets/logo.png';

export function LogoIcon({ size = 36, className = '' }) {
  return (
    <div
      className={`logo-icon-box ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        userSelect: 'none',
        flexShrink: 0,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <img
        src={logoImg}
        alt="Notice Me"
        width={size}
        height={size}
        className="brand-logo-img"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}

export default function Logo({
  size = 'medium',
  subtitle = 'STATEFUL CHANGE RADAR',
  showSubtitle = true,
  onClick,
}) {
  const isLarge = size === 'large';
  const isSmall = size === 'small';

  const iconSize = isLarge ? 44 : isSmall ? 28 : 34;
  const fontSize = isLarge ? '26px' : isSmall ? '17px' : '20px';
  const subFontSize = isLarge ? '10px' : isSmall ? '8px' : '9px';

  return (
    <div
      className="brand-logo-container"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isLarge ? '12px' : isSmall ? '8px' : '10px',
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
            fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
            fontSize,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-primary)',
          }}
        >
          <span className="brand-title-notice">Notice</span>
          <span className="brand-badge-me">
            <span>Me</span>
            <span className="brand-beacon-dot" aria-hidden="true" />
          </span>
        </div>

        {showSubtitle && subtitle && (
          <div style={{ marginTop: '2px' }}>
            <span
              className="brand-subtitle-badge"
              style={{
                fontSize: subFontSize,
                letterSpacing: '0.06em',
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              }}
            >
              {subtitle}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
