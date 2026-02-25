// src/utils/constants.js
// Shared constants used across the portal.

export const TIMEZONES = [
  "Pacific/Auckland", "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
  "Australia/Perth", "Asia/Singapore", "Asia/Tokyo", "Asia/Dubai",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles",
  "America/Chicago", "America/Denver",
];

export const COUNTRY_CODES = [
  { code: "+1", country: "US/CA" }, { code: "+44", country: "UK" },
  { code: "+61", country: "AU" }, { code: "+64", country: "NZ" },
  { code: "+65", country: "SG" }, { code: "+81", country: "JP" },
  { code: "+49", country: "DE" }, { code: "+33", country: "FR" },
  { code: "+971", country: "AE" }, { code: "+91", country: "IN" },
];

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const INITIAL_AVAILABILITY = DAYS.map((day, i) => ({
  day,
  enabled: i < 5,
  start: "09:00",
  end: "17:00",
  unavailable: [],
}));

export const COUNTRIES_STATES = {
  'Australia': ['New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia', 'Tasmania', 'Northern Territory', 'ACT'],
  'New Zealand': ['Auckland', 'Wellington', 'Canterbury', 'Waikato', 'Bay of Plenty', 'Otago'],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  'United States': ['California', 'New York', 'Texas', 'Florida', 'Illinois', 'Pennsylvania'],
};
