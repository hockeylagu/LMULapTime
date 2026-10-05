import { Router } from 'express';
import { DataPlugin, dataPlugin } from '../plugins/dataPlugin.js';

export function createDataPluginRouter(provider:DataPlugin=dataPlugin):Router {
  const router=Router();
  router.use((_req,res,next)=>{
    res.setHeader('Cache-Control','no-store'); next();
  });
  router.get('/status',(_req,res)=>res.json(provider.status));
  // Logos are large SVGs: they have their own endpoint and are never bundled into the vehicle list.
  router.get('/vehicles',(_req,res)=>res.json({packageRevision:provider.status.revision,vehicles:provider.vehicles()}));
  router.get('/vehicles/logos',(_req,res)=>res.json({packageRevision:provider.status.revision,logos:provider.logos()}));
  router.get('/tracks/:layoutKey', (req,res)=>{
    const record=provider.track(req.params.layoutKey);
    if(!record){res.status(404).json({error:'Track data unavailable'});return;}
    res.json({packageRevision:provider.status.revision,...record});
  });
  return router;
}
