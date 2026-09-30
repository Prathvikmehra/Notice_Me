/**
 * Canonical Frequency Parser & Utilities for Notice Me.
 * Single source of truth across cron scheduler, ingestion pipeline, API, and frontend.
 */

export const FREQUENCIES_MS = {
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '5d': 5 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const FREQUENCIES = FREQUENCIES_MS; // Backwards-compatible alias

/**
 * Parses any frequency string into integer elapsed hours.
 * Supports: '1h', '3h', '1d', '2d', '7d', 'weekly', 'biweekly', 'monthly', '14d', '30d'.
 * Defaults to 24 (1 day) for unknown or unspecified values.
 *
 * @param {string|null} freqStr
 * @returns {number}
 */
export function parseFrequencyToHours(freqStr) {
  if (!freqStr) return 24;
  const str = String(freqStr).trim().toLowerCase();
  if (str === '1h') return 1;
  if (str === '3h') return 3;
  if (['daily', '1d'].includes(str)) return 24;
  if (['weekly', '7d', '1w'].includes(str)) return 168;
  if (['biweekly', 'bi-weekly', '14d', '2w'].includes(str)) return 336;
  if (['monthly', '30d', '1m'].includes(str)) return 720;

  const match = str.match(/^(\d+)\s*(h|hours?|d|days?|w|weeks?|m|months?)?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = (match[2] || 'd').charAt(0).toLowerCase();
    if (unit === 'h') return Math.max(1, val);
    if (unit === 'd') return Math.max(1, val * 24);
    if (unit === 'w') return Math.max(1, val * 7 * 24);
    if (unit === 'm') return Math.max(1, val * 30 * 24);
  }
  return null;
}

/**
 * Parses any frequency string into milliseconds.
 *
 * @param {string|null} freqStr
 * @returns {number|null}
 */
export function parseFrequencyToMs(freqStr) {
  const hours = parseFrequencyToHours(freqStr);
  return hours !== null ? hours * 60 * 60 * 1000 : null;
}

/**
 * Parses any frequency string into calendar days (rounded).
 *
 * @param {string|null} freqStr
 * @returns {number|null}
 */
export function parseFrequencyToDays(freqStr) {
  const hours = parseFrequencyToHours(freqStr);
  if (hours === null) return null;
  if (hours < 24) return 1;
  return Math.max(1, Math.round(hours / 24));
}

/**
 * Returns human-readable frequency label.
 *
 * @param {string|null} freqStr
 * @returns {string}
 */
export function getFrequencyLabel(freqStr) {
  if (!freqStr) return 'daily';
  const str = String(freqStr).toLowerCase().trim();
  if (str === '1h') return 'every hour';
  if (str === '3h') return 'every 3 hours';
  if (str === '1d' || str === 'daily') return 'daily';
  if (str === '2d') return 'every 2 days';
  if (str === '3d') return 'every 3 days';
  if (str === '5d') return 'every 5 days';
  if (str === '7d' || str === 'weekly' || str === '1w') return 'weekly';
  if (str === '14d' || str === 'biweekly' || str === '2w') return 'bi-weekly';
  if (str === '30d' || str === 'monthly' || str === '1m') return 'monthly';
  const days = parseFrequencyToDays(str);
  return `every ${days} days`;
}

export default {
  FREQUENCIES_MS,
  FREQUENCIES,
  parseFrequencyToHours,
  parseFrequencyToMs,
  parseFrequencyToDays,
  getFrequencyLabel,
};
