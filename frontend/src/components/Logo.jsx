import React from 'react';
import logoImg from '../assets/logo.png';

export function LogoIcon({ size = 42, className = '' }) {
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
      }}
    >
      <img
        src={logoImg}
        alt="Notice Me"
        width={size}
        height={size}
        className="brand-logo-img"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          display: 'block',
        }}
      />
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

  const iconSize = isLarge ? 58 : isSmall ? 34 : 46;
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
            fontFamily: "var(--font-brand, 'Outfit'), 'Plus Jakarta Sans', sans-serif",
            fontSize,
            fontWeight: 800,
            letterSpacing: '-0.035em',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span className="brand-title-notice">notice</span>
          <span
            className="brand-badge-me"
            style={{
              background: 'var(--yellow, #FFE600)',
              color: '#000000',
              border: '2.5px solid #000000',
              boxShadow: isLarge ? '3px 3px 0px #000000' : '2.2px 2.2px 0px #000000',
              borderRadius: isLarge ? '7px' : '5px',
              padding: isLarge ? '2px 9px' : '1px 7px',
              marginLeft: '6px',
              transform: 'rotate(3.5deg)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: isLarge ? '6px' : '4px',
              fontSize: '0.88em',
              fontWeight: 900,
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
                background: '#FF3B30',
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
              className="brand-subtitle-badge"
              style={{
                fontSize: subFontSize,
                padding: isLarge ? '2px 8px' : '1px 6px',
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
