import { useEffect, useMemo, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { CCY_RATES, YEARS, fmtMoney, getLiveRates, convertCurrency, inflate } from '../lib/currency';
import { LANGUAGES, translateText } from '../lib/translate';

const CCY_CODES = Object.keys(CCY_RATES);

/** Vertical up/down pair for the filled swap puck that straddles the two converter cards. */
function SwapArrowsVertical() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 3.5v17M8.5 20.5L5 17M8.5 20.5L12 17" />
      <path d="M15.5 20.5v-17M15.5 3.5L12 7M15.5 3.5L19 7" />
    </svg>
  );
}

const cardStyle: React.CSSProperties = { background: 'var(--card)', border: 'none', borderRadius: 22, padding: 20, boxShadow: 'var(--shadow-card)' };
const cardLabel: React.CSSProperties = { fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 };
// Oversized, ultra-light numerals are the anchor of the fintech look.
const valueText: React.CSSProperties = { fontSize: 34, fontWeight: 200, letterSpacing: '-0.02em', textAlign: 'right', minWidth: 0, flex: 1 };
/**
 * Stacked, not side by side. Sharing a row with a 34px numeral left the amount a few dozen pixels
 * on a phone, so 50000000 was clipped mid-number. The picker gets its own line and the amount gets
 * the full width underneath.
 */
const pickerStyle: React.CSSProperties = { display: 'block', width: '100%', border: 'none', background: 'transparent', fontSize: 15, fontWeight: 500, color: 'var(--text)', padding: 0, outline: 'none' };

/**
 * Thousands separators while typing, so you can see at a glance whether you've entered 5 million
 * or 50. Display-only: `amount` stays an unformatted string, which is what parseFloat and the
 * prefill both expect.
 *
 * A trailing "." is preserved mid-typing — stripping it would delete the decimal point the moment
 * it was typed.
 */
function groupDigits(raw: string): string {
  if (!raw) return '';
  const [int, ...rest] = raw.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!rest.length) return grouped;
  return `${grouped}.${rest.join('')}`;
}

/** Digits and at most one decimal point, capped at two places. */
function sanitizeAmount(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, '');
  const [int, ...rest] = cleaned.split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
}

/**
 * The blue puck straddling the two cards. Renders as a zero-height flex item between them so it
 * lands in the gap regardless of how tall either card is — the translator's cards differ.
 */
function SwapPuck({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ position: 'relative', height: 0, zIndex: 2 }}>
      <button
        onClick={onClick}
        aria-label="Swap"
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 42, height: 42, borderRadius: 999, background: 'var(--accent)', border: '4px solid var(--sheet)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: 'var(--shadow-card)', padding: 0,
        }}
      >
        <SwapArrowsVertical />
      </button>
    </div>
  );
}

export function ValueConverterSheet() {
  const { converterOpen, converterPrefill, closeConverter } = useUI();
  const [tab, setTab] = useState<'currency' | 'inflation'>('currency');
  /**
   * Empty, not '0'. A literal zero sitting in the field means the first digit typed lands next to
   * it — "05" — or has to be deleted first. The placeholder shows a ghosted 0 instead, so the
   * field reads the same but starts genuinely empty. Clearing with the ⊗ returns to that state.
   */
  const [amount, setAmount] = useState('');
  const [fromCcy, setFromCcy] = useState('USD');
  const [toCcy, setToCcy] = useState('USD');
  const [fromYear, setFromYear] = useState(1965);
  const [toYear, setToYear] = useState(2026);
  const [inflationCcy, setInflationCcy] = useState('USD');
  const [rates, setRates] = useState<Record<string, number>>({});

  useEffect(() => { getLiveRates().then(setRates); }, []);

  useEffect(() => {
    if (!converterOpen) return;
    setTab('currency');
    // Reopening starts clean rather than showing the last conversion's amount.
    setAmount('');
    if (converterPrefill) {
      if (converterPrefill.fromCcy) { setFromCcy(converterPrefill.fromCcy); setInflationCcy(converterPrefill.fromCcy); }
      if (converterPrefill.toCcy) setToCcy(converterPrefill.toCcy);
      if (converterPrefill.amount) setAmount(converterPrefill.amount);
    }
  }, [converterOpen, converterPrefill]);

  if (!converterOpen) return null;

  const amt = parseFloat(amount) || 0;
  const currencyResult = rates && Object.keys(rates).length ? convertCurrency(amt, fromCcy, toCcy, rates) : amt;
  const inflated = inflate(amt, fromYear, toYear);
  const inflatedInCcy = rates && Object.keys(rates).length ? convertCurrency(inflated, 'USD', inflationCcy, rates) : inflated;

  const symbol = (code: string) => CCY_RATES[code]?.symbol || '';

  return (
    <div className="ct-scrim" onClick={closeConverter}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />
        <div className="ct-sheet-title">Value converter</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button onClick={() => setTab('currency')} className={`ct-tab-btn${tab === 'currency' ? ' is-active' : ''}`}>Currency</button>
          <button onClick={() => setTab('inflation')} className={`ct-tab-btn${tab === 'inflation' ? ' is-active' : ''}`}>Then &rarr; now</button>
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {tab === 'inflation' ? (
            <>
              <div style={cardStyle}>
                <div style={cardLabel}>Then</div>
                {/* Year and currency stay paired on one line — both are short — with the amount
                    underneath on its own, same as the currency tab. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <select value={fromYear} onChange={(e) => setFromYear(parseInt(e.target.value))} style={{ ...pickerStyle, width: 'auto', flex: 'none' }}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={inflationCcy} onChange={(e) => setInflationCcy(e.target.value)} style={{ ...pickerStyle, width: 'auto', flex: 'none' }}>
                    {CCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <input value={groupDigits(amount)} onChange={(e) => setAmount(sanitizeAmount(e.target.value))} inputMode="decimal" placeholder="0" style={{ ...valueText, border: 'none', background: 'transparent', padding: 0, color: 'var(--text)', outline: 'none' }} />
                  {amount && (
                    <button onClick={() => setAmount('')} aria-label="Clear amount" style={{ flex: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="var(--text-muted)" strokeWidth="1.6" /><path d="M9 9l6 6M15 9l-6 6" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              </div>
              <SwapPuck onClick={() => { const f = fromYear; setFromYear(toYear); setToYear(f); }} />
              <div style={cardStyle}>
                <div style={cardLabel}>Now</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <select value={toYear} onChange={(e) => setToYear(parseInt(e.target.value))} style={{ ...pickerStyle, width: 'auto', flex: 'none', color: 'var(--text)' }}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span style={{ flex: 'none', fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{inflationCcy}</span>
                </div>
                <div style={{ ...valueText, color: 'var(--text)', marginTop: 6 }}>{symbol(inflationCcy)}{fmtMoney(inflatedInCcy)}</div>
              </div>
            </>
          ) : (
            <>
              <div style={cardStyle}>
                <div style={cardLabel}>From</div>
                <select value={fromCcy} onChange={(e) => setFromCcy(e.target.value)} style={pickerStyle}>
                  {CCY_CODES.map((c) => <option key={c} value={c}>{CCY_RATES[c].label}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <input value={groupDigits(amount)} onChange={(e) => setAmount(sanitizeAmount(e.target.value))} inputMode="decimal" placeholder="0" style={{ ...valueText, border: 'none', background: 'transparent', padding: 0, color: 'var(--text)', outline: 'none' }} />
                  {amount && (
                    <button onClick={() => setAmount('')} aria-label="Clear amount" style={{ flex: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="var(--text-muted)" strokeWidth="1.6" /><path d="M9 9l6 6M15 9l-6 6" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              </div>
              <SwapPuck onClick={() => { const f = fromCcy; setFromCcy(toCcy); setToCcy(f); }} />
              <div style={cardStyle}>
                <div style={cardLabel}>To</div>
                <select value={toCcy} onChange={(e) => setToCcy(e.target.value)} style={{ ...pickerStyle, color: 'var(--text)' }}>
                  {CCY_CODES.map((c) => <option key={c} value={c}>{CCY_RATES[c].label}</option>)}
                </select>
                <div style={{ ...valueText, color: 'var(--text)', marginTop: 6 }}>{symbol(toCcy)}{fmtMoney(currencyResult)}</div>
              </div>
            </>
          )}
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.4, marginBottom: 14 }}>
          Approximate — exchange rates are live (updated hourly); inflation uses historical US CPI.
        </div>

        {tab === 'inflation' && (
          <button onClick={() => { setTab('currency'); setFromCcy(inflationCcy); setToCcy('USD'); setAmount(String(Math.round(inflatedInCcy * 100) / 100)); }} className="ct-btn-primary" style={{ width: '100%' }}>See total in USD</button>
        )}
      </div>
    </div>
  );
}

export function TranslatorSheet() {
  const { translatorOpen, closeTranslator } = useUI();
  const [from, setFrom] = useState('auto');
  const [to, setTo] = useState('en');
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (translatorOpen) { setResult(''); setError(''); } }, [translatorOpen]);

  if (!translatorOpen) return null;

  const swap = () => {
    const f = from === 'auto' ? 'en' : from, t = to === 'auto' ? 'en' : to;
    setFrom(t); setTo(f); setResult(''); setError('');
  };

  const run = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const r = await translateText(text.trim(), from, to);
      setResult(r);
    } catch {
      setError('Translation failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ct-scrim" onClick={closeTranslator}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />
        <div className="ct-sheet-title">Translate</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <div style={cardStyle}>
            <div style={cardLabel}>From</div>
            <select value={from} onChange={(e) => { setFrom(e.target.value); setResult(''); }} style={{ ...pickerStyle, display: 'block', maxWidth: '100%' }}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(''); }} placeholder="Enter text" style={{ width: '100%', minHeight: 46, marginTop: 10, border: 'none', background: 'transparent', padding: 0, fontSize: 17, lineHeight: 1.4, color: 'var(--text)', outline: 'none', resize: 'none' }} />
          </div>
          <SwapPuck onClick={swap} />
          <div style={cardStyle}>
            <div style={cardLabel}>To</div>
            <select value={to} onChange={(e) => { setTo(e.target.value); setResult(''); }} style={{ ...pickerStyle, display: 'block', maxWidth: '100%', color: 'var(--text)' }}>
              {LANGUAGES.filter((l) => l.code !== 'auto').map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <div style={{ marginTop: 10, fontSize: 17, fontWeight: result ? 400 : 300, lineHeight: 1.4, color: result ? 'var(--text)' : 'var(--text-faint)', minHeight: 46 }}>{loading ? 'Translating…' : (result || 'Translation')}</div>
          </div>
        </div>

        {error && <div style={{ fontSize: 14, color: '#E08A80', textAlign: 'center', marginBottom: 10 }}>{error}</div>}
        <button onClick={run} disabled={!text.trim() || loading} className="ct-btn-primary" style={{ width: '100%' }}>{loading ? 'Translating…' : 'Translate'}</button>
      </div>
    </div>
  );
}
