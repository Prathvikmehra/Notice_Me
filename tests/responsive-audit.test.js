import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.resolve(__dirname, '../frontend/src/styles.css');

test('Responsive audit: styles.css covers all critical device breakpoints', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  // Key breakpoints for responsive web design
  const requiredBreakpoints = [
    '(max-width: 1024px)',
    '(max-width: 900px)',
    '(max-width: 768px)',
    '(max-width: 640px)',
    '(max-width: 480px)',
    '(max-width: 440px)',
    '(max-width: 360px)',
  ];

  for (const bp of requiredBreakpoints) {
    assert.ok(css.includes(bp), `Expected styles.css to include breakpoint ${bp}`);
  }
});

test('Responsive audit: mobile viewport overflow and touch protection rules exist', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('overflow-x: hidden'), 'Expected overflow-x: hidden rule');
  assert.ok(css.includes('touch-action: manipulation'), 'Expected touch-action: manipulation rule for mobile tap responsiveness');
  assert.ok(css.includes('text-size-adjust: 100%'), 'Expected text-size-adjust rule to prevent unwanted iOS Safari zooming');
  assert.ok(css.includes('dvh'), 'Expected modern dynamic viewport height (dvh) units for mobile browser chrome');
});

test('Responsive audit: all modals adapt gracefully on mobile screens', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify responsive modal constraints
  assert.ok(css.includes('.chat-modal-window'), 'AI Chat modal exists');
  assert.ok(css.includes('.dossier-modal-container'), 'Dossier modal exists');
  assert.ok(css.includes('.profile-modal-container'), 'Profile modal exists');
  assert.ok(css.includes('.pro-modal-container'), 'Pro modal exists');

  // Verify mobile styles for modals
  assert.ok(css.includes('.profile-theme-grid'), 'Profile theme grid is responsive');
  assert.ok(css.includes('.profile-name-row'), 'Profile name row is responsive');
  assert.ok(css.includes('.dossier-toolbar-actions'), 'Dossier toolbar actions are responsive');
});

test('Responsive audit: topbar and detail views handle narrow screens without horizontal clipping', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.topbar-search'), 'Topbar search is styled');
  assert.ok(css.includes('.topbar-chat-btn'), 'Topbar chat button is styled');
  assert.ok(css.includes('.search-header-row'), 'Search header row is responsive');
  assert.ok(css.includes('.briefing-radar-strip'), 'Briefing radar strip is styled');
  assert.ok(css.includes('.diff-comparison-grid'), 'Diff comparison grid adapts');
});
