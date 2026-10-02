import { MsEdgeTTS } from 'msedge-tts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackPath = path.join(__dirname, '..', 'data', 'edge-tts-voices.json');
let fallback = null;
let liveCache = null;
let liveCacheAt = 0;
const CACHE_MS = 10 * 60 * 1000;

function loadFallback() {
  if (fallback) return fallback;
  try {
    const raw = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    fallback = Array.isArray(raw) ? raw : (Array.isArray(raw.voices) ? raw.voices : []);
  } catch {
    fallback = [];
  }
  return fallback;
}

function normalize(v) {
  const shortName = v?.ShortName || v?.shortName || v?.Name || v?.name || '';
  const locale = v?.Locale || v?.locale || '';
  if (!shortName || !locale) return null;
  return {
    ShortName: shortName,
    Locale: locale,
    Gender: v?.Gender || v?.gender || '',
    FriendlyName: v?.FriendlyName || v?.friendlyName || shortName
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const bundled = loadFallback().map(normalize).filter(Boolean);

  try {
    if (!liveCache || Date.now() - liveCacheAt > CACHE_MS) {
      const tts = new MsEdgeTTS({ enableLogger: false });
      const live = await tts.getVoices();
      const normalized = (live || []).map(normalize).filter(Boolean);
      if (normalized.length >= bundled.length) {
        liveCache = normalized;
        liveCacheAt = Date.now();
      }
    }
  } catch (error) {
    console.warn('Live Edge voice catalog unavailable; using bundled catalog:', error?.message || error);
  }

  const voices = liveCache?.length ? liveCache : bundled;
  return res.status(200).json({
    ok: true,
    source: liveCache?.length ? 'microsoft-edge-live' : 'bundled-fallback',
    count: voices.length,
    voices
  });
}
