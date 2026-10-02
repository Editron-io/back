import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const body=req.body||{};
    const text=typeof body.text==='string'?body.text.trim():'';
    const voice=typeof body.voice==='string'?body.voice.trim():'';
    if(!text)return res.status(400).json({error:'Text is required.'});
    if(!voice)return res.status(400).json({error:'Voice is required.'});
    const rate=Number.isFinite(Number(body.rate))?Math.max(-100,Math.min(200,Math.round(Number(body.rate)))):0;
    const pitch=Number.isFinite(Number(body.pitch))?Math.max(-100,Math.min(100,Math.round(Number(body.pitch)))):0;
    const startMs=Math.max(0,Math.round(Number(body.startMs)||0));

    const tts=new MsEdgeTTS({enableLogger:false});
    await tts.setMetadata(voice,OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,{
      wordBoundaryEnabled:true,
      sentenceBoundaryEnabled:false
    });
    const result=await tts.toStream(text,{rate:rate/100,pitch:`${pitch>=0?'+':''}${pitch}Hz`,volume:0});
    const boundaries=[];
    if(result.metadataStream){
      for await(const chunk of result.metadataStream){
        const raw=Buffer.from(chunk).toString('utf8').trim();
        if(!raw)continue;
        for(const line of raw.split(/\r?\n/).filter(Boolean)){
          try{
            const packet=JSON.parse(line);
            for(const item of packet.Metadata||[]){
              if(item.Type==='WordBoundary' && item.Data){
                boundaries.push({
                  offset100ns:Number(item.Data.Offset)||0,
                  duration100ns:Number(item.Data.Duration)||0,
                  text:item.Data.text?.Text||''
                });
              }
            }
          }catch{}
        }
      }
    }
    tts.close();
    if(!boundaries.length)throw new Error('Microsoft Edge returned no word-boundary metadata.');
    const words=boundaries.map((b,i)=>{
      const start=startMs+b.offset100ns/10000;
      const end=start+(b.duration100ns/10000);
      return `${i+1}\n${srtTime(start)} --> ${srtTime(Math.max(start+100,end))}\n${b.text}\n`;
    }).join('\n');
    res.setHeader('Content-Type','application/json');
    return res.status(200).json({srt:words});
  }catch(error){
    console.error('Edge TTS SRT failed:',error);
    return res.status(502).json({error:'Microsoft Edge subtitle timing failed.',detail:error?.message||String(error)});
  }
}
function srtTime(ms){
  ms=Math.max(0,Math.round(ms));
  const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),x=ms%1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(x).padStart(3,'0')}`;
}
