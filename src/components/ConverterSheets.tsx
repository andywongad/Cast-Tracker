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

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 16px' };
const cardLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 };
const valueText: React.CSSProperties = { fontSize: 22, fontWeight: 700, textAlign: 'right', minWidth: 0, flex: 1 };
const pickerStyle: React.CSSProperties = { flex: 'none', maxWidth: '58%', border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: 'var(--text)', padding: 0, outline: 'none' };

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
          width: 42, height: 42, borderRadius: 999, background: '#6366F1', border: '3px solid var(--sheet)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(99,102,241,0.4)', padding: 0,
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
  const [amount, setAmount] = useState('0');
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
          <button onClick={() => setTab('currency')} className="ct-tab-btn" style={{ border: tab === 'currency' ? 'none' : '1px solid var(--input-border)', background: tab === 'currency' ? '#6366F1' : 'transparent', color: tab === 'currency' ? '#fff' : 'var(--text-secondary)' }}>Currency</button>
          <button onClick={() => setTab('inflation')} className="ct-tab-btn" style={{ border: tab === 'inflation' ? 'none' : '1px solid var(--input-border)', background: tab === 'inflation' ? '#6366F1' : 'transparent', color: tab === 'inflation' ? '#fff' : 'var(--text-secondary)' }}>Then &rarr; now</button>
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {tab === 'inflation' ? (
            <>
              <div style={cardStyle}>
                <div style={cardLabel}>Then</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select value={fromYear} onChange={(e) => setFromYear(parseInt(e.target.value))} style={pickerStyle}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={inflationCcy} onChange={(e) => setInflationCcy(e.target.value)} style={pickerStyle}>
                    {CCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" style={{ ...valueText, border: 'none', background: 'transparent', padding: 0, color: 'var(--text)', outline: 'none' }} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select value={toYear} onChange={(e) => setToYear(parseInt(e.target.value))} style={{ ...pickerStyle, color: 'var(--accent-soft)' }}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span style={{ flex: 'none', fontSize: 15, fontWeight: 800, color: 'var(--accent-soft)' }}>{inflationCcy}</span>
                  <div style={{ ...valueText, color: 'var(--accent-soft)' }}>{symbol(inflationCcy)}{fmtMoney(inflatedInCcy)}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={cardStyle}>
                <div style={cardLabel}>From</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select value={fromCcy} onChange={(e) => setFromCcy(e.target.value)} style={pickerStyle}>
                    {CCY_CODES.map((c) => <option key={c} value={c}>{CCY_RATES[c].label}</option>)}
                  </select>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" style={{ ...valueText, border: 'none', background: 'transparent', padding: 0, color: 'var(--text)', outline: 'none' }} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select value={toCcy} onChange={(e) => setToCcy(e.target.value)} style={{ ...pickerStyle, color: 'var(--accent-soft)' }}>
                    {CCY_CODES.map((c) => <option key={c} value={c}>{CCY_RATES[c].label}</option>)}
                  </select>
                  <div style={{ ...valueText, color: 'var(--accent-soft)' }}>{symbol(toCcy)}{fmtMoney(currencyResult)}</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.4, marginBottom: 14 }}>
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
            <select value={to} onChange={(e) => { setTo(e.target.value); setResult(''); }} style={{ ...pickerStyle, display: 'block', maxWidth: '100%', color: 'var(--accent-soft)' }}>
              {LANGUAGES.filter((l) => l.code !== 'auto').map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <div style={{ marginTop: 10, fontSize: 17, fontWeight: result ? 700 : 400, lineHeight: 1.4, color: result ? 'var(--accent-soft)' : 'var(--text-faint)', minHeight: 46 }}>{loading ? 'Translating…' : (result || 'Translation')}</div>
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: '#E08A80', textAlign: 'center', marginBottom: 10 }}>{error}</div>}
        <button onClick={run} disabled={!text.trim() || loading} className="ct-btn-primary" style={{ width: '100%' }}>{loading ? 'Translating…' : 'Translate'}</button>
      </div>
    </div>
  );
}
