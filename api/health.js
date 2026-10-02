export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json({
    ok: true,
    service: 'AudioVerse Edge Neural TTS',
    runtime: 'Vercel Node.js',
    tts: 'msedge-tts',
    message: 'Backend is online.'
  });
}
