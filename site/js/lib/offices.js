// NWS forecast offices by their three-letter code, for "Surveyed by NWS Norman".

const OFFICES = {
  OUN: 'Norman',
  TSA: 'Tulsa',
  FWD: 'Fort Worth',
  IND: 'Indianapolis',
  MLB: 'Melbourne',
  MFL: 'Miami',
  TBW: 'Tampa Bay',
  JAN: 'Jackson',
  BMX: 'Birmingham',
  HUN: 'Huntsville',
  LZK: 'Little Rock',
  SHV: 'Shreveport',
  LCH: 'Lake Charles',
  LIX: 'New Orleans',
  MEG: 'Memphis',
  OHX: 'Nashville',
  DMX: 'Des Moines',
  DVN: 'Quad Cities',
  ICT: 'Wichita',
  TOP: 'Topeka',
  EAX: 'Kansas City',
  SGF: 'Springfield',
  LSX: 'St. Louis',
  ILX: 'Lincoln',
  LOT: 'Chicago',
  IWX: 'Northern Indiana',
  ILN: 'Wilmington',
  PAH: 'Paducah',
  HNX: 'Hanford',
  MTR: 'San Francisco',
};

/** "NWS Norman", "NWS office XYZ", or "NWS". */
export const office = (wfo) => (OFFICES[wfo] ? `NWS ${OFFICES[wfo]}` : wfo ? `NWS office ${wfo}` : 'NWS');
