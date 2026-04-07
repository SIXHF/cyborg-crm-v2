/**
 * SSN Area Number → State lookup (pre-2011 assignment table)
 * Matches v1's ssn_lookup_info() exactly
 */

const SSN_AREAS: Record<string, [number, number][]> = {
  "New Hampshire": [[1, 3]],
  "Maine": [[4, 7]],
  "Vermont": [[8, 9]],
  "Massachusetts": [[10, 34]],
  "Rhode Island": [[35, 39]],
  "Connecticut": [[40, 49]],
  "New York": [[50, 134]],
  "New Jersey": [[135, 158]],
  "Pennsylvania": [[159, 211]],
  "Maryland": [[212, 220]],
  "Delaware": [[221, 222]],
  "Virginia": [[223, 231], [691, 699]],
  "West Virginia": [[232, 236]],
  "North Carolina": [[237, 246], [681, 690]],
  "South Carolina": [[247, 251], [654, 658]],
  "Georgia": [[252, 260], [667, 675]],
  "Florida": [[261, 267], [589, 595], [766, 772]],
  "Ohio": [[268, 302]],
  "Indiana": [[303, 317]],
  "Illinois": [[318, 361]],
  "Michigan": [[362, 386]],
  "Wisconsin": [[387, 399]],
  "Kentucky": [[400, 407]],
  "Tennessee": [[408, 415], [756, 763]],
  "Alabama": [[416, 424]],
  "Mississippi": [[425, 428], [587, 588]],
  "Arkansas": [[429, 432], [676, 679]],
  "Louisiana": [[433, 439], [659, 665]],
  "Oklahoma": [[440, 448]],
  "Texas": [[449, 467], [627, 645]],
  "Minnesota": [[468, 477]],
  "Iowa": [[478, 485]],
  "Missouri": [[486, 500]],
  "North Dakota": [[501, 502]],
  "South Dakota": [[503, 504]],
  "Nebraska": [[505, 508]],
  "Kansas": [[509, 515]],
  "Montana": [[516, 517]],
  "Idaho": [[518, 519]],
  "Wyoming": [[520, 520]],
  "Colorado": [[521, 524], [650, 653]],
  "New Mexico": [[525, 525], [585, 585]],
  "Arizona": [[526, 527], [600, 601], [764, 765]],
  "Utah": [[528, 529], [646, 647]],
  "Nevada": [[530, 530], [648, 649]],
  "Washington": [[531, 539]],
  "Oregon": [[540, 544]],
  "California": [[545, 573], [602, 626]],
  "Alaska": [[574, 574]],
  "Hawaii": [[575, 576], [750, 751]],
  "District of Columbia": [[577, 579]],
  "Puerto Rico": [[580, 584], [596, 599]],
  "Virgin Islands": [[580, 584]],
  "Pacific Territories": [[586, 586]],
  "Railroad Board": [[700, 728]],
};

const STATE_ABBR: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
  "Puerto Rico": "PR", "Virgin Islands": "VI",
};

export interface SsnLookupResult {
  valid: boolean;
  state: string | null;
  abbr: string | null;
  era: "pre-2011" | "post-2011-random" | "pre-1963" | "invalid";
  note: string;
}

export function ssnLookupInfo(ssnRaw: string): SsnLookupResult {
  const digits = ssnRaw.replace(/\D/g, "");

  // Last 4 only — can't determine state
  if (digits.length === 4) {
    return { valid: true, state: null, abbr: null, era: "post-2011-random", note: "Last 4 digits only — state cannot be determined" };
  }

  if (digits.length !== 9) {
    return { valid: false, state: null, abbr: null, era: "invalid", note: "Invalid SSN format" };
  }

  const area = parseInt(digits.slice(0, 3));
  const group = parseInt(digits.slice(3, 5));
  const serial = parseInt(digits.slice(5, 9));

  // Invalid areas
  if (area === 0) return { valid: false, state: null, abbr: null, era: "invalid", note: "Area 000 was never issued" };
  if (area === 666) return { valid: false, state: null, abbr: null, era: "invalid", note: "Area 666 was never issued" };
  if (area >= 900) return { valid: false, state: null, abbr: null, era: "invalid", note: "Areas 900-999 were never issued" };
  if (group === 0) return { valid: false, state: null, abbr: null, era: "invalid", note: "Group 00 was never issued" };
  if (serial === 0) return { valid: false, state: null, abbr: null, era: "invalid", note: "Serial 0000 was never issued" };

  // Look up state from area number
  for (const [state, ranges] of Object.entries(SSN_AREAS)) {
    for (const [min, max] of ranges) {
      if (area >= min && area <= max) {
        const abbr = STATE_ABBR[state] || null;
        const era = state === "Railroad Board" ? "pre-1963" : "pre-2011";
        return {
          valid: true,
          state,
          abbr,
          era,
          note: `Issued in ${state}${abbr ? ` (${abbr})` : ""} — ${era === "pre-1963" ? "Railroad Board (pre-1963)" : "pre-2011 assignment"}`,
        };
      }
    }
  }

  // Area not found in pre-2011 table — post-2011 random assignment
  return {
    valid: true,
    state: null,
    abbr: null,
    era: "post-2011-random",
    note: "Post-June 2011 random assignment — state cannot be determined from area number",
  };
}
