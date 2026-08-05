import { useEffect, useMemo, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { CCY_RATES, YEARS, fmtMoney, getLiveRates, convertCurrency, inflate } from '../lib/currency';
import { LANGUAGES, translateText } from '../lib/translate';

const CCY_CODES = Object.keys(CCY_RATES);

function SwapIcon() {
  return (
    <svg width="16" height="16" viewBox="-5 -10 110 135" fill="var(--accent-soft)" style={{ transform: 'rotate(90deg)' }}>
      <path d="m92.223 45.656c-2.5234 0-4.5469 2.0195-4.5469 4.5469v11.719c0 4.0391-3.2305 7.2734-7.2734 7.2734l-44.242-0.003906 10.203-10.203c1.8164-1.8164 1.8164-4.6445 0-6.4648-1.8164-1.8164-4.6445-1.8164-6.4648 0l-18.082 18.082c-1.7188 1.7188-1.8164 4.6445 0 6.3633l18.082 18.383c0.91016 0.91016 2.0195 1.3125 3.2305 1.3125 1.1094 0 2.3242-0.40234 3.2305-1.3125 1.8164-1.7188 1.8164-4.6445 0.10156-6.4648l-10.703-10.605h44.645c8.9883 0 16.363-7.375 16.363-16.363l0.003906-11.715c0-2.5273-2.0234-4.5469-4.5469-4.5469z" />
      <path d="m53.434 40.102c-1.7188 1.8164-1.7188 4.6445 0.10156 6.4648 0.91016 0.91016 2.0195 1.3125 3.2305 1.3125s2.3242-0.40234 3.2305-1.3125l18.082-18.383c1.7188-1.8164 1.7188-4.6445 0-6.3633l-18.18-18.184c-1.8164-1.8164-4.6445-1.8164-6.4648 0-1.8164 1.8164-1.8164 4.6445 0 6.4648l10.504 10.504h-44.543c-8.9922 0-16.363 7.375-16.363 16.363v11.617c0 2.5234 2.0195 4.5469 4.5469 4.5469 2.5234 0 4.5469-2.0195 4.5469-4.5469l-0.003906-11.617c0-4.0391 3.2305-7.2734 7.2734-7.2734h44.344z" />
    </svg>
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
  const [rateDetailsOpen, setRateDetailsOpen] = useState(false);

  useEffect(() => { getLiveRates().then(setRates); }, []);

  useEffect(() => {
    if (!converterOpen) return;
    setTab('currency');
    setRateDetailsOpen(false);
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
  const usdEquivalent = rates && Object.keys(rates).length ? convertCurrency(inflatedInCcy, inflationCcy, 'USD', rates) : inflated;

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

        {tab === 'inflation' ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <select value={fromYear} onChange={(e) => setFromYear(parseInt(e.target.value))} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: 'var(--text)', outline: 'none' }}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={inflationCcy} onChange={(e) => setInflationCcy(e.target.value)} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: 'var(--text)', outline: 'none' }}>
                  {CCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)', outline: 'none' }} />
                {amount && (
                  <button onClick={() => setAmount('')} aria-label="Clear amount" style={{ flex: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="var(--text-muted)" strokeWidth="1.6" /><path d="M9 9l6 6M15 9l-6 6" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  </button>
                )}
              </div>
            </div>
            <div style={{ position: 'relative', height: 1, background: 'var(--border)' }}>
              <button onClick={() => { const f = fromYear; setFromYear(toYear); setToYear(f); }} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 34, height: 34, borderRadius: 999, background: 'var(--sheet)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><SwapIcon /></button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <select value={toYear} onChange={(e) => setToYear(parseInt(e.target.value))} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: 'var(--accent-soft)', outline: 'none' }}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-soft)' }}>{inflationCcy}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-soft)' }}>{symbol(inflationCcy)}{fmtMoney(inflatedInCcy)}</div>
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '14px 16px' }}>
              <select value={fromCcy} onChange={(e) => setFromCcy(e.target.value)} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: 'var(--text)', padding: 0, marginBottom: 8, outline: 'none' }}>
                {CCY_CODES.map((c) => <option key={c} value={c}>{CCY_RATES[c].label}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)', outline: 'none' }} />
                {amount && (
                  <button onClick={() => setAmount('')} aria-label="Clear amount" style={{ flex: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="var(--text-muted)" strokeWidth="1.6" /><path d="M9 9l6 6M15 9l-6 6" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  </button>
                )}
              </div>
            </div>
            <div style={{ position: 'relative', height: 1, background: 'var(--border)' }}>
              <button onClick={() => { const f = fromCcy; setFromCcy(toCcy); setToCcy(f); }} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 34, height: 34, borderRadius: 999, background: 'var(--sheet)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><SwapIcon /></button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <select value={toCcy} onChange={(e) => setToCcy(e.target.value)} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: 'var(--accent-soft)', padding: 0, marginBottom: 8, outline: 'none' }}>
                {CCY_CODES.map((c) => <option key={c} value={c}>{CCY_RATES[c].label}</option>)}
              </select>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-soft)' }}>{symbol(toCcy)}{fmtMoney(currencyResult)}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={() => setRateDetailsOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: '6px 0', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 700 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M12 11v5.5M12 8v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Rate details
          </button>
        </div>
        {rateDetailsOpen && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 10 }}>
            {tab === 'currency' ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>1 {fromCcy} &asymp; {fmtMoney(convertCurrency(1, fromCcy, toCcy, rates))} {toCcy}</div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{symbol(inflationCcy)}{fmtMoney(amt)} in {fromYear} &asymp; {symbol(inflationCcy)}{fmtMoney(inflatedInCcy)} in {toYear} (US CPI-based, then converted to {inflationCcy}) &asymp; ${fmtMoney(usdEquivalent)} USD today.</div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.4 }}>Approximate — exchange rates are live (updated hourly); inflation uses historical US CPI.</div>
          </div>
        )}
        {tab === 'inflation' && (
          <button onClick={() => { setTab('currency'); setFromCcy(inflationCcy); setToCcy('USD'); setAmount(String(Math.round(inflatedInCcy * 100) / 100)); }} className="ct-btn-ghost" style={{ width: '100%', height: 44, marginTop: 4, color: 'var(--accent-soft)' }}>See total in USD &rarr;</button>
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

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 16px 16px' }}>
            <select value={from} onChange={(e) => { setFrom(e.target.value); setResult(''); }} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--text)', padding: 0, marginBottom: 10, outline: 'none' }}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(''); }} placeholder="Enter text" style={{ width: '100%', minHeight: 44, border: 'none', background: 'transparent', padding: 0, fontSize: 17, lineHeight: 1.4, color: 'var(--text)', outline: 'none', resize: 'none' }} />
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 1, background: 'var(--border)' }}>
            <button onClick={swap} style={{ position: 'absolute', width: 34, height: 34, borderRadius: 999, background: 'var(--sheet)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><SwapIcon /></button>
          </div>
          <div style={{ padding: '16px 16px 14px' }}>
            <select value={to} onChange={(e) => { setTo(e.target.value); setResult(''); }} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--accent-soft)', padding: 0, marginBottom: 10, outline: 'none' }}>
              {LANGUAGES.filter((l) => l.code !== 'auto').map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <div style={{ fontSize: 17, fontWeight: result ? 700 : 400, lineHeight: 1.4, color: result ? 'var(--accent-soft)' : 'var(--text-faint)', minHeight: 26 }}>{loading ? 'Translating…' : (result || 'Translation')}</div>
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: '#E08A80', textAlign: 'center', marginBottom: 10 }}>{error}</div>}
        <button onClick={run} disabled={!text.trim() || loading} className="ct-btn-primary" style={{ width: '100%' }}>{loading ? 'Translating…' : 'Translate'}</button>
      </div>
    </div>
  );
}
