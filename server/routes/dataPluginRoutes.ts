import { Router } from 'express';
import { DataPlugin, dataPlugin } from '../plugins/dataPlugin.js';

export function createDataPluginRouter(provider:DataPlugin=dataPlugin):Router {
  const router=Router();
  router.use((_req,res,next)=>{
    res.setHeader('Cache-Control','no-store'); next();
  });
  // Logos are large SVGs, loaded separately from telemetry's resolved vehicle records.
  router.get('/vehicles/logos',(_req,res)=>res.json({packageRevision:provider.status.revision,logos:provider.logos()}));
  router.get('/tracks/:layoutKey', (req,res)=>{
    const record=provider.track(req.params.layoutKey);
    if(!record){res.status(404).json({error:'Track data unavailable'});return;}
    res.json({packageRevision:provider.status.revision,...record});
  });
  return router;
}
