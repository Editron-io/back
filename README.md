# AudioVerse TTS Bridge — Vercel Backend

This is a separate Vercel Node.js project. It receives requests from the AudioVerse frontend and performs Microsoft Edge Neural TTS through `msedge-tts`.

## Endpoints
- `GET /api/health`
- `GET /api/voices`
- `POST /api/tts`
- `POST /api/srt`

No Azure key is required by this bridge.

## Deploy
Import this folder as a separate Vercel project. Vercel installs the `msedge-tts` dependency from `package.json`.
