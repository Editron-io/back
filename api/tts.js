import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-100, Math.min(200, Math.round(n)));
}

function pitch(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0Hz';
  return `${n >= 0 ? '+' : ''}${Math.max(-100, Math.min(100, Math.round(n)))}Hz`;
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    stream.once('end', () => finish(resolve, Buffer.concat(chunks)));
    stream.once('error', error => finish(reject, error));
  });
}

function escapeError(error) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const voice = typeof body.voice === 'string' ? body.voice.trim() : '';

    if (!text) return res.status(400).json({ error: 'Text is required.' });
    if (!voice) return res.status(400).json({ error: 'Voice is required.' });
    if (text.length > 50000) return res.status(413).json({ error: 'Text is too long. Maximum is 50,000 characters per request.' });

    const rate = percent(body.rate ?? 0);
    const voicePitch = pitch(body.pitch ?? 0);

    // msedge-tts 2.x is maintained for the current Edge Read Aloud service and
    // uses an Edge-compatible User-Agent on the server side.
    const tts = new MsEdgeTTS({ enableLogger: false });

    await tts.setMetadata(
      voice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      {
        wordBoundaryEnabled: false,
        sentenceBoundaryEnabled: false
      }
    );

    const { audioStream } = tts.toStream(text, {
      rate: rate / 100,
      pitch: voicePitch,
      volume: 0
    });

    try {
      const audio = await collectStream(audioStream);
      if (!audio.length) throw new Error('Microsoft Edge returned no audio data.');

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(audio.length));
      res.setHeader('Cache-Control', 'no-store, no-transform');
      return res.status(200).send(audio);
    } finally {
      try { tts.close(); } catch {}
    }
  } catch (error) {
    console.error('Edge Neural TTS synthesis failed:', error);
    return res.status(502).json({
      error: 'Microsoft Edge Neural TTS failed.',
      detail: escapeError(error),
      hint: 'Check the selected voice and retry. The Vercel function uses the current Microsoft Edge Read Aloud protocol.'
    });
  }
}
