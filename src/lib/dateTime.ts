/**
 * Centralized date/time formatting utilities with timezone support.
 * All timestamps should use the configured timezone from Admin settings.
 */

export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

export const TIMEZONE_OPTIONS = [
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'UTC', label: 'UTC' },
] as const;

/**
 * Format an ISO date string as a date only (e.g., "Jan 7, 2026")
 */
export function formatDate(isoString: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format an ISO date string as a full date and time (e.g., "Jan 7, 2026, 3:45 PM")
 */
export function formatDateTime(isoString: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format an ISO date string as a short audit timestamp (e.g., "Jan 7, 3:45 PM")
 */
export function formatAuditTimestamp(isoString: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
