import { Router } from 'express';
import { DataPlugin, dataPlugin } from '../plugins/dataPlugin.js';

export function createDataPluginRouter(provider:DataPlugin=dataPlugin):Router {
  const router=Router();
  router.use((req,res,next)=>{
    const ip=req.socket.remoteAddress;
    const local=(host:string)=>['localhost','127.0.0.1','[::1]','::1'].includes(host);
    let allowedOrigin=true;
    try {if(req.headers.origin) {const url=new URL(req.headers.origin); allowedOrigin=local(url.hostname)&&[process.env.LMU_UI_ORIGIN||'http://localhost:5173','http://127.0.0.1:5173',`${req.protocol}://${req.headers.host}`].includes(url.origin);}} catch {allowedOrigin=false;}
    if (!ip || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip) || !local(req.hostname) || !allowedOrigin) {res.status(403).json({error:'Local application access required'});return;}
    res.setHeader('Cache-Control','no-store'); next();
  });
  router.get('/status',(_req,res)=>res.json(provider.status));
  router.get('/vehicles',(_req,res)=>res.json({packageRevision:provider.status.revision,vehicles:provider.vehicles()}));
  router.get('/tracks/:layoutKey', (req,res)=>{
    const record=provider.track(req.params.layoutKey);
    if(!record){res.status(404).json({error:'Track data unavailable'});return;}
    res.json({packageRevision:provider.status.revision,...record});
  });
  return router;
}
