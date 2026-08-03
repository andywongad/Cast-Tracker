export const CPI_TABLE: Record<number, number> = {
  1913: 9.9, 1914: 10.0, 1915: 10.1, 1916: 10.9, 1917: 12.8, 1918: 15.0, 1919: 17.3, 1920: 20.0, 1921: 17.9, 1922: 16.8,
  1923: 17.1, 1924: 17.1, 1925: 17.5, 1926: 17.7, 1927: 17.4, 1928: 17.1, 1929: 17.1, 1930: 16.7, 1931: 15.2, 1932: 13.7,
  1933: 13.0, 1934: 13.4, 1935: 13.7, 1936: 13.9, 1937: 14.4, 1938: 14.1, 1939: 13.9, 1940: 14.0, 1941: 14.7, 1942: 16.3,
  1943: 17.3, 1944: 17.6, 1945: 18.0, 1946: 19.5, 1947: 22.3, 1948: 24.1, 1949: 23.8, 1950: 24.1, 1951: 26.0, 1952: 26.5,
  1953: 26.7, 1954: 26.9, 1955: 26.8, 1956: 27.2, 1957: 28.1, 1958: 28.9, 1959: 29.1, 1960: 29.6, 1961: 29.9, 1962: 30.2,
  1963: 30.6, 1964: 31.0, 1965: 31.5, 1966: 32.4, 1967: 33.4, 1968: 34.8, 1969: 36.7, 1970: 38.8, 1971: 40.5, 1972: 41.8,
  1973: 44.4, 1974: 49.3, 1975: 53.8, 1976: 56.9, 1977: 60.6, 1978: 65.2, 1979: 72.6, 1980: 82.4, 1981: 90.9, 1982: 96.5,
  1983: 99.6, 1984: 103.9, 1985: 107.6, 1986: 109.6, 1987: 113.6, 1988: 118.3, 1989: 124.0, 1990: 130.7, 1991: 136.2, 1992: 140.3,
  1993: 144.5, 1994: 148.2, 1995: 152.4, 1996: 156.9, 1997: 160.5, 1998: 163.0, 1999: 166.6, 2000: 172.2, 2001: 177.1, 2002: 179.9,
  2003: 184.0, 2004: 188.9, 2005: 195.3, 2006: 201.6, 2007: 207.3, 2008: 215.3, 2009: 214.5, 2010: 218.1, 2011: 224.9, 2012: 229.6,
  2013: 233.0, 2014: 236.7, 2015: 237.0, 2016: 240.0, 2017: 245.1, 2018: 251.1, 2019: 255.7, 2020: 258.8, 2021: 271.0, 2022: 292.7,
  2023: 304.7, 2024: 313.7, 2025: 320.8, 2026: 329.5,
};

export interface CurrencyInfo {
  rate: number; // relative to USD, static fallback
  label: string;
  symbol: string;
}

export const CCY_RATES: Record<string, CurrencyInfo> = {
  USD: { rate: 1, label: 'USD — US Dollar', symbol: '$' },
  EUR: { rate: 0.92, label: 'EUR — Euro', symbol: '€' },
  GBP: { rate: 0.79, label: 'GBP — British Pound', symbol: '£' },
  JPY: { rate: 149, label: 'JPY — Japanese Yen', symbol: '¥' },
  KRW: { rate: 1380, label: 'KRW — Korean Won', symbol: '₩' },
  CNY: { rate: 7.1, label: 'CNY — Chinese Yuan', symbol: '¥' },
  CAD: { rate: 1.36, label: 'CAD — Canadian Dollar', symbol: '$' },
  AUD: { rate: 1.51, label: 'AUD — Australian Dollar', symbol: '$' },
  INR: { rate: 83.5, label: 'INR — Indian Rupee', symbol: '₹' },
  MXN: { rate: 18.3, label: 'MXN — Mexican Peso', symbol: '$' },
  BRL: { rate: 5.4, label: 'BRL — Brazilian Real', symbol: 'R$' },
};

export const COUNTRY_CCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', KR: 'KRW', JP: 'JPY', CN: 'CNY', TW: 'CNY', HK: 'CNY', IN: 'INR',
  MX: 'MXN', BR: 'BRL', CA: 'CAD', AU: 'AUD', FR: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
};

export const YEARS = Array.from({ length: 2026 - 1913 + 1 }, (_, i) => 1913 + i).reverse();

export function fmtMoney(n: number): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 0 : 2 });
}

export function inflate(amount: number, fromYear: number, toYear: number): number {
  const from = CPI_TABLE[fromYear] ?? CPI_TABLE[1965];
  const to = CPI_TABLE[toYear] ?? CPI_TABLE[2026];
  return (amount * to) / from;
}

// Live FX rates, no API key required. Falls back to the static table above on failure.
let liveRatesCache: { rates: Record<string, number>; at: number } | null = null;

export async function getLiveRates(): Promise<Record<string, number>> {
  if (liveRatesCache && Date.now() - liveRatesCache.at < 1000 * 60 * 60) return liveRatesCache.rates;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    if (data.result !== 'success' || !data.rates) throw new Error('bad payload');
    liveRatesCache = { rates: data.rates, at: Date.now() };
    return data.rates;
  } catch {
    const fallback = Object.fromEntries(Object.entries(CCY_RATES).map(([k, v]) => [k, v.rate]));
    return fallback;
  }
}

export function convertCurrency(amount: number, from: string, to: string, rates: Record<string, number>): number {
  const fromRate = rates[from] ?? CCY_RATES[from]?.rate ?? 1;
  const toRate = rates[to] ?? CCY_RATES[to]?.rate ?? 1;
  return (amount / fromRate) * toRate;
}
