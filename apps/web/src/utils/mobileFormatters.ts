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
