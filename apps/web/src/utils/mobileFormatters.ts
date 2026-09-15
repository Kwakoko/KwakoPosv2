/**
 * KwakoPos — Enterprise UI Formatters
 * Returns industry-standard, concise module names for navigation, dropdowns, and header badges.
 */

export function getShortModuleName(name?: string): string {
  if (!name) return 'Retail Store';
  const n = name.trim();

  const MAPPINGS: Record<string, string> = {
    Retail: 'Retail Store',
    'Retail Shop / General Store': 'Retail Store',
    Restaurant: 'Restaurant & Cafe',
    'Restaurant / Cafe': 'Restaurant & Cafe',
    'Restaurant & Lounge': 'Restaurant & Cafe',
    SACCO: 'SACCO & VICOBA',
    'SACCO / VICOBA': 'SACCO & VICOBA',
    Workforce: 'Workforce & HR',
    'Workforce Tracking & Time Management': 'Workforce & HR',
    Pharmacy: 'Pharmacy & Health',
    'Pharmacy / Chemist / Dispensary': 'Pharmacy & Health',
    'Pharmacy & Health': 'Pharmacy & Health',
    Hardware: 'Hardware & Building',
    'Hardware & Building Materials': 'Hardware & Building',
    Construction: 'Construction',
    'Construction Company': 'Construction',
    Law: 'Law Firm & Legal',
    'Law Firm / Legal Practice': 'Law Firm & Legal',
    RealEstate: 'Real Estate & Property',
    'Real Estate / Property Management': 'Real Estate & Property',
    Microfinance: 'Microfinance & Credit',
    'Microfinance & Lending': 'Microfinance & Credit',
    'Microfinance & Credit': 'Microfinance & Credit',
    Agriculture: 'Agriculture & Farming',
    'Agriculture / Farm Business': 'Agriculture & Farming',
    Electronics: 'Electronics Store',
    'Electronics Store': 'Electronics Store',
    Garage: 'Automotive & Garage',
    'Garage / Vehicle Workshop': 'Automotive & Garage',
    FuelStation: 'Fuel Station',
    'Fuel Station': 'Fuel Station',
    School: 'School Management',
    'School Management Lite': 'School Management',
    Bookshop: 'Bookshop & Stationers',
    'Bookshop / Stationery': 'Bookshop & Stationers',
    Security: 'Security Services',
    'Security Company Management': 'Security Services',
    Water: 'Water Supply',
    'Water Supply Management': 'Water Supply',
    Transport: 'Transport & Logistics',
    'Transport / Bus Operators': 'Transport & Logistics',
    Waste: 'Waste Management',
    'Waste Management': 'Waste Management',
    Wholesale: 'Wholesale Trade',
    'Wholesale Business': 'Wholesale Trade',
    Fashion: 'Fashion & Apparel',
    'Fashion / Clothing Store': 'Fashion & Apparel',
    Service: 'Professional Services',
    'Service Business': 'Professional Services',
    Cosmetics: 'Beauty & Cosmetics',
    'Beauty & Cosmetics Shop': 'Beauty & Cosmetics',
    Salon: 'Salon & Barber',
    'Salon & Barber Shop': 'Salon & Barber',
    'Salon & Spa': 'Salon & Barber',
    Hotel: 'Hospitality & Hotel',
    'Guest House / Hotel': 'Hospitality & Hotel',
    Poultry: 'Poultry & Livestock',
    'Poultry & Livestock Farm': 'Poultry & Livestock',
    Bar: 'Bar & Nightclub',
    'Bar & Nightclub': 'Bar & Nightclub',
    BusinessConsultant: 'Business Consulting',
    'Business Consultant': 'Business Consulting',
    'Business Consulting / Agency': 'Business Consulting',
    TechnicalCompany: 'Technical & IT',
    'Technical / IT Engineering': 'Technical & IT',
  };

  if (MAPPINGS[n]) return MAPPINGS[n];
  return n.split('/')[0].trim();
}

export function getShortBranchName(name?: string): string {
  if (!name) return 'Main HQ';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(name)) return 'Main HQ';
  const clean = name
    .replace(/\s*\(Active\)/gi, '')
    .replace(/\s*\(Audit\)/gi, '')
    .replace(/Tanzania\s*/gi, '')
    .replace(/Branch\s*/gi, '')
    .replace(/Outlet\s*/gi, '')
    .trim();
  if (clean.length > 14) {
    return clean.slice(0, 12) + '…';
  }
  return clean || 'Main HQ';
}

export function getShortTenantName(name?: string): string {
  if (!name) return 'Bravados';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(name)) return 'Bravados';
  const clean = name
    .replace(/\s*\(Active\)/gi, '')
    .replace(/\s*\(Audit\)/gi, '')
    .trim();
  return clean || 'Bravados';
}

export type IndustrySector = 'ALL' | 'COMMERCE' | 'HOSPITALITY' | 'HEALTH_AGRI' | 'FINANCE_LEGAL' | 'TRADES';
export type IndustrySortOption = 'SUBSCRIBED' | 'ALPHABETICAL' | 'POPULAR';

export interface SectorDefinition {
  id: IndustrySector;
  label: string;
  shortLabel: string;
}

export const INDUSTRY_SECTORS: SectorDefinition[] = [
  { id: 'ALL', label: 'All Sectors', shortLabel: 'All' },
  { id: 'COMMERCE', label: 'Retail & Commerce', shortLabel: 'Commerce' },
  { id: 'HOSPITALITY', label: 'Hospitality & Dining', shortLabel: 'Hospitality' },
  { id: 'HEALTH_AGRI', label: 'Healthcare & Agri', shortLabel: 'Health & Agri' },
  { id: 'FINANCE_LEGAL', label: 'Financial & Legal', shortLabel: 'Finance & Legal' },
  { id: 'TRADES', label: 'Trades & Technical', shortLabel: 'Trades & Tech' },
];

export const MODULE_SECTOR_MAP: Record<string, IndustrySector> = {
  Retail: 'COMMERCE',
  Wholesale: 'COMMERCE',
  Electronics: 'COMMERCE',
  Fashion: 'COMMERCE',
  Cosmetics: 'COMMERCE',
  Bookshop: 'COMMERCE',

  Restaurant: 'HOSPITALITY',
  Bar: 'HOSPITALITY',
  Hotel: 'HOSPITALITY',

  Pharmacy: 'HEALTH_AGRI',
  Poultry: 'HEALTH_AGRI',
  Agriculture: 'HEALTH_AGRI',

  SACCO: 'FINANCE_LEGAL',
  Microfinance: 'FINANCE_LEGAL',
  Law: 'FINANCE_LEGAL',
  BusinessConsultant: 'FINANCE_LEGAL',
  Service: 'FINANCE_LEGAL',

  Hardware: 'TRADES',
  Construction: 'TRADES',
  Garage: 'TRADES',
  FuelStation: 'TRADES',
  Water: 'TRADES',
  Waste: 'TRADES',
  Transport: 'TRADES',
  Security: 'TRADES',
  Workforce: 'TRADES',
  School: 'TRADES',
  TechnicalCompany: 'TRADES',
  RealEstate: 'TRADES',
};

export const MODULE_POPULARITY_RANK: Record<string, number> = {
  Retail: 1,
  Restaurant: 2,
  Pharmacy: 3,
  Hardware: 4,
  Poultry: 5,
  Wholesale: 6,
  Law: 7,
  RealEstate: 8,
  SACCO: 9,
  Garage: 10,
  Electronics: 11,
  Fashion: 12,
  Service: 13,
  Hotel: 14,
  FuelStation: 15,
  Workforce: 16,
  Microfinance: 17,
  Construction: 18,
  Agriculture: 19,
  School: 20,
  Cosmetics: 21,
  Salon: 22,
  Bar: 23,
  Bookshop: 24,
  Security: 25,
  Water: 26,
  Transport: 27,
  Waste: 28,
  BusinessConsultant: 29,
  TechnicalCompany: 30,
};

