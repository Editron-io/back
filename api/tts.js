import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

function clampRate(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.max(-100, Math.min(200, Math.round(n)));
}

function clampPitch(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.max(-100, Math.min(100, Math.round(n)));
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    let finished = false;

    function done(fn, value) {
      if (finished) {
        return;
      }

      finished = true;
      fn(value);
    }

    stream.on('data', chunk => {
      if (chunk) {
        chunks.push(Buffer.from(chunk));
      }
    });

    stream.once('end', () => {
      done(resolve, Buffer.concat(chunks));
    });

    stream.once('error', error => {
      done(reject, error);
    });
  });
}

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || 'Unknown error');
}

export default async function handler(req, res) {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST,OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  let tts = null;

  try {

    const body = req.body || {};

    const text =
      typeof body.text === 'string'
        ? body.text.trim()
        : '';

    const voice =
      typeof body.voice === 'string'
        ? body.voice.trim()
        : '';

    if (!text) {
      return res.status(400).json({
        error: 'Text is required.'
      });
    }

    if (!voice) {
      return res.status(400).json({
        error: 'Voice is required.'
      });
    }

    if (text.length > 50000) {
      return res.status(413).json({
        error:
          'Text is too long. Maximum is 50,000 characters per request.'
      });
    }

    const rate = clampRate(body.rate ?? 0);
    const pitch = clampPitch(body.pitch ?? 0);

    console.log(
      `TTS request: voice=${voice}, rate=${rate}, pitch=${pitch}, chars=${text.length}`
    );

    tts = new MsEdgeTTS({
      enableLogger: false
    });

    await tts.setMetadata(
      voice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      {
        wordBoundaryEnabled: false,
        sentenceBoundaryEnabled: false
      }
    );

    /*
     * IMPORTANT:
     *
     * Do NOT use volume: 0 here.
     *
     * We want normal audible speech.
     */
    const options = {
      rate: rate / 100,
      pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
      volume: 100
    };

    console.log(
      'TTS options:',
      JSON.stringify(options)
    );

    const result = tts.toStream(
      text,
      options
    );

    if (!result || !result.audioStream) {
      throw new Error(
        'Microsoft Edge did not return an audio stream.'
      );
    }

    const audio =
      await collectStream(result.audioStream);

    if (!audio || audio.length === 0) {
      throw new Error(
        'Microsoft Edge returned an empty audio file.'
      );
    }

    /*
     * Basic MP3 sanity check.
     *
     * MP3 normally starts with ID3 or an MPEG frame sync.
     */
    const isID3 =
      audio.length >= 3 &&
      audio[0] === 0x49 &&
      audio[1] === 0x44 &&
      audio[2] === 0x33;

    const hasMpegSync =
      audio.length >= 2 &&
      audio[0] === 0xff &&
      (audio[1] & 0xe0) === 0xe0;

    if (!isID3 && !hasMpegSync) {
      console.error(
        'Unexpected audio bytes:',
        audio.subarray(0, 20).toString('hex')
      );

      throw new Error(
        'Microsoft Edge returned data that does not look like a valid MP3.'
      );
    }

    console.log(
      `TTS audio generated successfully: ${audio.length} bytes`
    );

    res.setHeader(
      'Content-Type',
      'audio/mpeg'
    );

    res.setHeader(
      'Content-Length',
      String(audio.length)
    );

    res.setHeader(
      'Cache-Control',
      'no-store, no-transform'
    );

    return res
      .status(200)
      .send(audio);

  } catch (error) {

    console.error(
      'Edge Neural TTS synthesis failed:',
      error
    );

    return res.status(502).json({
      error:
        'Microsoft Edge Neural TTS failed.',
      detail:
        errorMessage(error),
      hint:
        'Check the selected Edge Neural voice and retry.'
    });

  } finally {

    if (tts) {
      try {
        tts.close();
      } catch {}
    }

  }
}
