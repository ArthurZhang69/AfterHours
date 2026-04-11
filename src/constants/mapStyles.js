// Default map centre: UCL / Bloomsbury, London
export const DEFAULT_CENTER = { lat: 51.5246, lng: -0.1340 }
export const DEFAULT_ZOOM = 14

// Route colours
export const ROUTE_COLORS = {
  safe:   '#4FC3F7',  // cyan-blue  — lower crime exposure
  risky:  '#FF5252',  // red        — higher crime exposure
  active: '#00E5FF',  // bright cyan — currently selected/navigating
}

// Crime category colour coding
export const CRIME_COLORS = {
  'violent-crime':          '#FF2D2D',
  'robbery':                '#FF5722',
  'theft-from-the-person':  '#FF9800',
  'anti-social-behaviour':  '#FFC107',
  'drugs':                  '#CE93D8',
  'public-order':           '#FF7043',
  'other-theft':            '#FFB74D',
  'vehicle-crime':          '#90CAF9',
  'default':                '#9E9E9E',
}

export const CRIME_LABELS = {
  'violent-crime':          'Violent Crime',
  'robbery':                'Robbery',
  'theft-from-the-person':  'Personal Theft',
  'anti-social-behaviour':  'Anti-social Behaviour',
  'drugs':                  'Drugs',
  'public-order':           'Public Order',
  'other-theft':            'Other Theft',
  'vehicle-crime':          'Vehicle Crime',
}
