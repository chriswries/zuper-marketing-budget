import { CostCenter, FiscalYear, LineItem, MonthlyValues, Vendor } from '@/types/budget';

// Mock Vendors
export const mockVendors: Vendor[] = [
  { id: 'v1', name: 'Google Ads', aliases: ['Google', 'GOOGLE ADS'] },
  { id: 'v2', name: 'Meta Ads', aliases: ['Facebook', 'META', 'FB Ads'] },
  { id: 'v3', name: 'LinkedIn Ads', aliases: ['LinkedIn', 'LINKEDIN ADS'] },
  { id: 'v4', name: 'Salesforce', aliases: ['SFDC', 'Salesforce.com'] },
  { id: 'v5', name: 'HubSpot', aliases: ['HUBSPOT'] },
  { id: 'v6', name: 'Marketo', aliases: ['Adobe Marketo'] },
  { id: 'v7', name: 'Drift', aliases: ['DRIFT'] },
  { id: 'v8', name: 'Gong', aliases: ['GONG.IO'] },
  { id: 'v9', name: 'ZoomInfo', aliases: ['ZOOMINFO'] },
  { id: 'v10', name: 'Various', aliases: [] },
];

// Helper to create monthly values
function createMonthlyValues(values: number[]): MonthlyValues {
  return {
    feb: values[0] || 0,
    mar: values[1] || 0,
    apr: values[2] || 0,
    may: values[3] || 0,
    jun: values[4] || 0,
    jul: values[5] || 0,
    aug: values[6] || 0,
    sep: values[7] || 0,
    oct: values[8] || 0,
    nov: values[9] || 0,
    dec: values[10] || 0,
    jan: values[11] || 0,
  };
}

// Helper to create recurring monthly values
function createRecurringMonthly(amount: number): MonthlyValues {
  return createMonthlyValues(Array(12).fill(amount));
}

// Helper to create one-time spend in a specific month
function createOneTimeSpend(monthIndex: number, amount: number): MonthlyValues {
  const values = Array(12).fill(0);
  values[monthIndex] = amount;
  return createMonthlyValues(values);
}

// Mock Fiscal Year
export const mockFiscalYear: FiscalYear = {
  id: 'fy25',
  name: 'FY25',
  startDate: '2025-02-01',
  endDate: '2026-01-31',
  status: 'active',
  totalBudgetLimit: 2400000,
};

// Cost Center 1: Demand Generation
const demandGenLineItems: LineItem[] = [
  {
    id: 'li-1',
    costCenterId: 'cc-1',
    name: 'Google Ads - Search',
    vendor: mockVendors[0],
    ownerId: 'user-1',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([25000, 28000, 30000, 32000, 35000, 35000, 30000, 28000, 32000, 35000, 25000, 20000]),
    forecastValues: createMonthlyValues([26000, 29000, 31000, 33000, 36000, 34000, 29000, 27000, 31000, 34000, 24000, 19000]),
    actualValues: createMonthlyValues([25500, 28800, 30500, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-2',
    costCenterId: 'cc-1',
    name: 'Meta Ads - Campaigns',
    vendor: mockVendors[1],
    ownerId: 'user-1',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([15000, 18000, 20000, 22000, 25000, 25000, 22000, 20000, 22000, 25000, 18000, 15000]),
    forecastValues: createMonthlyValues([16000, 19000, 21000, 23000, 26000, 24000, 21000, 19000, 21000, 24000, 17000, 14000]),
    actualValues: createMonthlyValues([15200, 18500, 20200, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-3',
    costCenterId: 'cc-1',
    name: 'LinkedIn Ads - ABM',
    vendor: mockVendors[2],
    ownerId: 'user-2',
    isContracted: true,
    isAccrual: false,
    contractStartDate: '2025-02-01',
    contractEndDate: '2026-01-31',
    autoRenew: true,
    cancellationNoticeDays: 60,
    budgetValues: createRecurringMonthly(12000),
    forecastValues: createRecurringMonthly(12000),
    actualValues: createMonthlyValues([12000, 12000, 12000, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-4',
    costCenterId: 'cc-1',
    name: 'Content Syndication',
    vendor: mockVendors[9],
    ownerId: 'user-2',
    isContracted: false,
    isAccrual: true,
    budgetValues: createMonthlyValues([8000, 8000, 10000, 10000, 12000, 12000, 10000, 10000, 12000, 12000, 8000, 8000]),
    forecastValues: createMonthlyValues([8000, 8000, 10000, 10000, 12000, 12000, 10000, 10000, 12000, 12000, 8000, 8000]),
    actualValues: createMonthlyValues([7800, 8200, 9500, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
];

// Cost Center 2: Marketing Ops & Tech
const marketingOpsLineItems: LineItem[] = [
  {
    id: 'li-5',
    costCenterId: 'cc-2',
    name: 'HubSpot Platform',
    vendor: mockVendors[4],
    ownerId: 'user-3',
    isContracted: true,
    isAccrual: false,
    contractStartDate: '2025-02-01',
    contractEndDate: '2026-01-31',
    autoRenew: false,
    cancellationNoticeDays: 90,
    budgetValues: createRecurringMonthly(8500),
    forecastValues: createRecurringMonthly(8500),
    actualValues: createMonthlyValues([8500, 8500, 8500, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-6',
    costCenterId: 'cc-2',
    name: 'ZoomInfo Data',
    vendor: mockVendors[8],
    ownerId: 'user-3',
    isContracted: true,
    isAccrual: true,
    contractStartDate: '2025-02-01',
    contractEndDate: '2026-01-31',
    autoRenew: true,
    cancellationNoticeDays: 60,
    budgetValues: createRecurringMonthly(5000),
    forecastValues: createRecurringMonthly(5000),
    actualValues: createMonthlyValues([5000, 5000, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-7',
    costCenterId: 'cc-2',
    name: 'Drift Chatbot',
    vendor: mockVendors[6],
    ownerId: 'user-3',
    isContracted: true,
    isAccrual: false,
    contractStartDate: '2025-02-01',
    contractEndDate: '2026-01-31',
    autoRenew: true,
    cancellationNoticeDays: 30,
    budgetValues: createRecurringMonthly(2500),
    forecastValues: createRecurringMonthly(2500),
    actualValues: createMonthlyValues([2500, 2500, 2500, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-8',
    costCenterId: 'cc-2',
    name: 'Analytics Tools',
    vendor: mockVendors[9],
    ownerId: 'user-4',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([3000, 3000, 3500, 3500, 4000, 4000, 3500, 3500, 4000, 4000, 3000, 3000]),
    forecastValues: createMonthlyValues([3200, 3200, 3700, 3700, 4200, 4200, 3700, 3700, 4200, 4200, 3200, 3200]),
    actualValues: createMonthlyValues([3100, 3050, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-9',
    costCenterId: 'cc-2',
    name: 'Website Hosting & CDN',
    vendor: mockVendors[9],
    ownerId: 'user-4',
    isContracted: false,
    isAccrual: false,
    budgetValues: createRecurringMonthly(1500),
    forecastValues: createRecurringMonthly(1500),
    actualValues: createMonthlyValues([1480, 1520, 1490, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
];

// Cost Center 3: Events & Field Marketing
const eventsLineItems: LineItem[] = [
  {
    id: 'li-10',
    costCenterId: 'cc-3',
    name: 'Annual User Conference',
    vendor: null,
    ownerId: 'user-5',
    isContracted: false,
    isAccrual: true,
    budgetValues: createMonthlyValues([5000, 10000, 15000, 20000, 25000, 50000, 0, 0, 0, 0, 0, 0]),
    forecastValues: createMonthlyValues([5000, 10000, 15000, 22000, 28000, 55000, 0, 0, 0, 0, 0, 0]),
    actualValues: createMonthlyValues([4800, 9500, 14200, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-11',
    costCenterId: 'cc-3',
    name: 'Trade Shows - Q1/Q2',
    vendor: null,
    ownerId: 'user-5',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([15000, 25000, 20000, 30000, 15000, 10000, 0, 0, 0, 0, 0, 0]),
    forecastValues: createMonthlyValues([16000, 26000, 21000, 31000, 16000, 11000, 0, 0, 0, 0, 0, 0]),
    actualValues: createMonthlyValues([15500, 24800, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-12',
    costCenterId: 'cc-3',
    name: 'Trade Shows - Q3/Q4',
    vendor: null,
    ownerId: 'user-5',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([0, 0, 0, 0, 0, 0, 10000, 25000, 30000, 20000, 15000, 5000]),
    forecastValues: createMonthlyValues([0, 0, 0, 0, 0, 0, 12000, 27000, 32000, 22000, 17000, 6000]),
    actualValues: createMonthlyValues([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-13',
    costCenterId: 'cc-3',
    name: 'Executive Dinners',
    vendor: mockVendors[9],
    ownerId: 'user-6',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([5000, 5000, 8000, 8000, 5000, 5000, 5000, 8000, 8000, 8000, 5000, 5000]),
    forecastValues: createMonthlyValues([5000, 5000, 8000, 8000, 5000, 5000, 5000, 8000, 8000, 8000, 5000, 5000]),
    actualValues: createMonthlyValues([4900, 5200, 7800, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-14',
    costCenterId: 'cc-3',
    name: 'Swag & Promotional Items',
    vendor: mockVendors[9],
    ownerId: 'user-6',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([3000, 3000, 5000, 5000, 8000, 8000, 5000, 5000, 8000, 8000, 5000, 3000]),
    forecastValues: createMonthlyValues([3500, 3500, 5500, 5500, 8500, 8500, 5500, 5500, 8500, 8500, 5500, 3500]),
    actualValues: createMonthlyValues([3200, 3100, 5200, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'li-15',
    costCenterId: 'cc-3',
    name: 'Regional Meetups',
    vendor: null,
    ownerId: 'user-6',
    isContracted: false,
    isAccrual: false,
    budgetValues: createMonthlyValues([2000, 2000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 2000, 2000]),
    forecastValues: createMonthlyValues([2000, 2000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 2000, 2000]),
    actualValues: createMonthlyValues([1800, 2100, 2900, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  },
];

// Cost Centers
export const mockCostCenters: CostCenter[] = [
  {
    id: 'cc-1',
    name: 'Demand Generation',
    ownerId: 'user-1',
    annualLimit: 1000000,
    lineItems: demandGenLineItems,
  },
  {
    id: 'cc-2',
    name: 'Marketing Ops & Tech',
    ownerId: 'user-3',
    annualLimit: 250000,
    lineItems: marketingOpsLineItems,
  },
  {
    id: 'cc-3',
    name: 'Events & Field Marketing',
    ownerId: 'user-5',
    annualLimit: 600000,
    lineItems: eventsLineItems,
  },
];

// Export all mock data together
export const mockBudgetData = {
  fiscalYear: mockFiscalYear,
  costCenters: mockCostCenters,
  vendors: mockVendors,
};
