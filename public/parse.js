// Rule-based Hinglish/Hindi/English shagun-entry parser.
// Used as the offline fallback when Sarvam AI is not configured, and to sanity-check LLM output.
(function (root) {
  const HINDI_DIGITS = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
  const WORDS = { 'hazaar':1000,'hazar':1000,'हज़ार':1000,'हजार':1000,'thousand':1000,'sau':100,'सौ':100,'hundred':100,'lakh':100000,'लाख':100000 };
  const SMALL = { 'ek':1,'एक':1,'one':1,'do':2,'दो':2,'two':2,'teen':3,'तीन':3,'three':3,'char':4,'chaar':4,'चार':4,'four':4,'paanch':5,'panch':5,'पांच':5,'पाँच':5,'five':5,'das':10,'दस':10,'ten':10,'gyarah':11,'ग्यारह':11,'eleven':11,'ikkis':21,'इक्कीस':21,'ikyavan':51,'इक्यावन':51 };
  function toAscii(s) { return s.replace(/[०-९]/g, d => HINDI_DIGITS[d]); }
  function parseAmount(text) {
    const t = toAscii(text).replace(/,/g, '');
    const m = t.match(/(?:₹|rs\.?|inr|रु\.?)?\s*(\d{2,7})(?:\s*(?:rs|rupees|rupaye|रुपये|रुपए|₹))?/i);
    if (m) return parseInt(m[1], 10);
    // words like "do hazaar ek sau" / "ikyavan sau"
    const toks = t.toLowerCase().split(/\s+/); let total = 0, cur = 0, seen = false;
    for (const w of toks) {
      if (SMALL[w] != null) { cur += SMALL[w]; seen = true; }
      else if (WORDS[w] != null) { total += (cur || 1) * WORDS[w]; cur = 0; seen = true; }
    }
    total += cur; return seen && total >= 10 ? total : null;
  }
  const GIFT_WORDS = /(saree|sari|साड़ी|watch|ghadi|घड़ी|gold|sona|सोना|silver|chandi|चांदी|hamper|dinner set|gift card|coin|sikka|सिक्का|kurta|lehenga|envelope|lifafa|लिफाफा)/i;
  const RELATIONS = /(uncle|aunty|auntie|ji|chacha|chachi|mama|mami|mausi|bua|fufa|tau|tai|bhaiya|bhabhi|didi|dada|dadi|nana|nani|family|parivar|परिवार|अंकल|आंटी|जी|चाचा|मामा|मौसी|बुआ|भैया|दीदी)/i;
  function parseName(text) {
    const t = text.trim();
    // "<Name ...> ne ..." / "<नाम> ने ..."
    let m = t.match(/^(.+?)\s+(?:ne|ने|gave|has given|from)\b/i) || t.match(/^(.+?)\s+ने\s/);
    if (m) return m[1].replace(/^(from)\s+/i, '').trim();
    m = t.match(/from\s+(.+?)(?:\s*[,.:]|\s+\d|$)/i);
    if (m) return m[1].trim();
    m = t.match(/^([^\d₹]+?)\s*[-:,]?\s*(?:₹|rs|\d)/i);
    return m ? m[1].trim() : t.split(/\s+/).slice(0, 2).join(' ');
  }
  function detectLang(text) { return /[\u0900-\u097F]/.test(text) ? 'hi-IN' : (/\b(ne|diye|diya|hazaar|rupaye|aur|ji)\b/i.test(text) ? 'hi-IN' : 'en-IN'); }
  function parseEntry(text) {
    const amount = parseAmount(text);
    const gm = text.match(GIFT_WORDS);
    const name = parseName(text);
    return {
      guest: name,
      amount: amount,
      gift: gm ? gm[1] : null,
      relation: (name.match(RELATIONS) || [null])[0],
      language: detectLang(text),
      raw: text,
      parser: 'rules'
    };
  }
  function thankYouTemplate(e, lang) {
    const amt = e.amount ? `₹${e.amount.toLocaleString('en-IN')}` : '';
    const what = [amt, e.gift].filter(Boolean).join(' aur ');
    if ((lang || e.language) === 'hi-IN') return `प्रिय ${e.guest}, शादी में आपके आशीर्वाद${what ? ' और ' + what.replace(' aur ', ' और ') : ''} के लिए दिल से धन्यवाद। आपका आना हमारे लिए बहुत खास था। 🙏`;
    return `Dear ${e.guest}, thank you so much for your blessings${what ? ' and the ' + what.replace(' aur ', ' and ') : ''} at the wedding. Having you there meant the world to us. 🙏`;
  }
  const api = { parseEntry, parseAmount, parseName, detectLang, thankYouTemplate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ShagunParse = api;
})(this);
