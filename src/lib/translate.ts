export interface LanguageOption {
  code: string;
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ru', label: 'Russian' },
];

// Uses the free, keyless MyMemory Translation API (api.mymemory.translated.net).
// No true source-language auto-detection is offered by the free tier, so "Auto-detect"
// is sent as the literal source and MyMemory best-efforts it; rate-limited (~5k words/day
// anonymous). Swap this for a paid provider (DeepL/Google) if you outgrow it.
export async function translateText(text: string, from: string, to: string): Promise<string> {
  const langpair = `${from === 'auto' ? 'autodetect' : from}|${to}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Translation request failed');
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || data?.responseStatus >= 400) throw new Error('Translation failed');
  return String(translated);
}
