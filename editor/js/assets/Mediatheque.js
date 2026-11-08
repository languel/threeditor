// Catalog and facet/search logic adapted from languel/artistmodelstudio src/assets/mediatheque.js.
/** Public catalog, session cache, URL resolution and search facets.
 * Local mirrors and personal CORS hosts can be selected in Catalog connection.
 * Schema: https://languel.github.io/mediatheque/llms.txt
 */
export const DEFAULT_BASE = 'https://languel.github.io/mediatheque/';
// Catalog browsing includes every kind; the editor validates supported formats on use.

export const mediathequeBase = () => {
  let b = null;
  try { b = localStorage.getItem('threeditor_mediatheque_base'); } catch { /* default */ }
  return (b || DEFAULT_BASE).replace(/\/?$/, '/');
};

let cache = null;          // { base, records, at }
let pending = null;
const listeners = new Set();
export const state = { status: 'unknown', error: null };   // 'unknown' | 'loading' | 'ok' | 'offline'
export const onMediathequeChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const set = (status, error = null) => { state.status = status; state.error = error; for (const fn of listeners) fn(state); };

/** Fetch the catalog (once per session and base; `force` asks again). Resolves to the records, or [] if unreachable. */
export async function loadCatalog({ force = false, timeout = 8000 } = {}) {
  const base = mediathequeBase();
  if (!force && cache?.base === base) return cache.records;
  if (pending) return pending;
  set('loading');
  pending = (async () => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(`${base}catalog.json`, { signal: ctl.signal, cache: 'no-cache' });
      if (!r.ok) throw new Error(`The archive answered ${r.status}`);
      const all = await r.json();
      if (!Array.isArray(all)) throw new Error('Not a catalog');
      const records = all.filter(x => x.status !== 'draft').map(x => ({ ...x, abs: resolve(base, x) }));
      cache = { base, records, at: Date.now() };
      set('ok');
      return records;
    } catch (err) {
      cache = null;
      set('offline', err.name === 'AbortError' ? 'The archive did not answer in time' : err.message);
      return [];
    } finally { clearTimeout(timer); pending = null; }
  })();
  return pending;
}

export const assetURL = (base, p) => {
  if (!p) return null;
  const url = new URL(p, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Assets require an HTTP(S) URL.');
  return url.href;
};
const abs = assetURL;
/** Absolute addresses of a record's files. */
export function resolve(base, x) {
  // `url` is the stable primary (media.<ext>, original.gif or clips/<nn>.webm); a base override swaps its origin.
  // A GIF is also published as video (media.mp4): that plays on a timeline and knows its length.
  const rel = x.media || x.url || '';
  return { url: abs(base, rel.split('#')[0]), video: abs(base, x.video_media), thumb: abs(base, x.thumb), poster: abs(base, x.poster), proxy: abs(base, x.proxy), original: abs(base, x.original), bvh: abs(base, x.bvh), page: `${base}site/index.html#/${x.id}` };
}

/** Distinct values of a facet, most common first: ['tags' | 'collections' | 'demos'] → [[value, count]]. */
export function facet(records, key, limit = 40) {
  const n = new Map();
  for (const r of records) for (const v of r[key] || []) n.set(v, (n.get(v) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

const words = s => String(s || '').toLowerCase();
/**
 * Filter records. `query`: words match title, summary, keywords, creators, tags, collections and demos;
 * `#tag` matches a tag exactly. `filters`: { kind, clips: bool|null, pd: bool, tags: [], collection }.
 */
export function search(records, query = '', filters = {}) {
  const terms = words(query).split(/\s+/).filter(Boolean);
  return records.filter(r => {
    if (filters.kind && filters.kind !== 'all' && r.kind !== filters.kind) return false;
    if (filters.clips === true && r.type !== 'clip') return false;
    if (filters.clips === false && r.type === 'clip') return false;
    if (filters.pd && r.rights?.status !== 'public-domain') return false;
    if (filters.collection && !(r.collections || []).includes(filters.collection)) return false;
    if (filters.tags?.length && !filters.tags.every(t => (r.tags || []).includes(t))) return false;
    if (!terms.length) return true;
    const hay = words([r.title, r.parent_title, r.summary, r.date, ...(r.keywords || []), ...(r.creators || []), ...(r.tags || []), ...(r.collections || []), ...(r.demos || [])].join(' '));
    return terms.every(t => (t.startsWith('#') ? (r.tags || []).includes(t.slice(1)) : hay.includes(t)));
  });
}

/** The asset id a record has in Assets (the same record added twice is one asset). */
export const assetId = r => `mediatheque:${r.id}`;
export const isPublicDomain = r => r.rights?.status === 'public-domain';
/** "Title: credit" line for captions and exports. */
export const creditLine = r => r.credit || [r.creators?.join(', '), r.date, r.rights?.license].filter(Boolean).join(', ');
