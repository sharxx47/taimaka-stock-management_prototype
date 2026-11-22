// Fixed rules and demo constants. Every threshold here comes from CLAUDE.md.
// Thresholds are starting assumptions to tune with Taimaka.

export const TIME_ZONE = 'Africa/Lagos'; // West Africa Time, UTC+1, no daylight saving
export const TZ_OFFSET = '+01:00';

// The prototype's "today" is the bin card date. The demo clock starts at 6:05 PM
// ("Data as of 30 Oct 6:05 PM") and moves forward with real time, stopping at the end of the day.
export const TODAY = '2026-10-30';
export const DEMO_START = '2026-10-30T18:05:00+01:00';
export const DEMO_END = '2026-10-30T23:59:00+01:00';

export const DAYS_PER_MONTH = 30.4;
export const SACHETS_PER_CARTON = 150;

// Usage
export const AMC_MONTHS = 2; // average of the most recent complete months (Aug and Sep for this data)
export const MIN_MONTHS_FOR_FIRM_TARGET = 3; // fewer complete months of data: "Estimated target"

// Targets (forced-ordering max-min)
export const FACILITY_TARGET_MONTHS = 2;
export const CENTRAL_TARGET_MONTHS = 3;

// Status thresholds
export const ORDER_NOW_DAYS = 10; // runs out within 10 days
export const RUNNING_LOW_MONTHS = 1; // less than 1 month
export const TOO_MUCH_MONTHS = 4; // more than 4 months
export const ABOVE_TARGET_MIN_MONTHS = 2; // logistics view: 2 to 4 months

// Count differences
export const RUTF_ALERT_SACHETS = SACHETS_PER_CARTON; // 1 carton
export const RUTF_ALERT_DAYS = 3; // or 3 days of the site's own use, whichever is smaller
export const OTHER_FLAG_PERCENT = 0.05; // more than 5%
export const OTHER_FLAG_DAYS = 2; // or 2 days of use, whichever is larger

// Escalation
export const ESCALATION_FLAGS = 3; // 3 flags
export const ESCALATION_WINDOW_DAYS = 14; // in 14 days goes to the supervisor
export const MANAGEMENT_AFTER_DAYS = 30; // still happening 30 days after the first flag

// Shipments
export const SENT_ALERT_HOURS = 72;

export const CORRECTION_REASONS = [
  { id: 'damaged', label: 'Damaged' },
  { id: 'expired', label: 'Expired' },
  { id: 'theft_loss', label: 'Theft or loss' },
  { id: 'count_correction', label: 'Count correction' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'returned', label: 'Returned by caregiver' },
  { id: 'other', label: 'Other' }, // needs text
];

export const STOCK_TYPES = [
  { id: 'therapeutic_food', label: 'Therapeutic food' },
  { id: 'medication', label: 'Medication' },
  { id: 'consumable', label: 'Medical and non-medical consumables' },
  { id: 'non_consumable', label: 'Non-consumables' },
];

export const STORAGE_KEY = 'taimaka-stock-demo';
export const STORAGE_VERSION = 1;

export const TEST_PIN = '1234';

// Test sign-in safety (round 4): 3 tries, then a short lock that ends by itself.
export const PIN_TRIES = 3;
export const PIN_LOCK_MINUTES = 1; // prototype; the real app would use a longer time (15 minutes, to set with Taimaka)
export const REAL_PIN_LOCK_MINUTES = 15;
