import { Router, type Response } from 'express';
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
  router.get('/scenery/:layoutKey', (req, res) => {
    const layout = provider.sceneryLayout(req.params.layoutKey);
    if (!layout) { res.status(404).json({error: '3D scenery unavailable for this layout'}); return; }
    res.json(layout);
  });
  // Scenery and car files are content-named (sha256), so the bytes at a URL never change.
  const sendFile = (res: Response, read: () => Buffer | null, type: string, label: string) => {
    try {
      const bytes = read();
      if (!bytes) { res.status(404).json({error: `${label} unavailable`}); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); res.type(type).send(bytes);
    } catch { res.status(409).json({error: `${label} changed on disk. Restore the package or restart the backend.`}); }
  };
  router.get('/scenery/files/:file', (req, res) => sendFile(res, () => provider.sceneryFile(`scenery/${req.params.file}`), req.params.file.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream', '3D scenery file'));
  router.get('/scenery/files/textures/:file', (req, res) => sendFile(res, () => provider.sceneryFile(`scenery/textures/${req.params.file}`), 'image/ktx2', '3D scenery texture'));
  router.get('/cars/:identity', (req, res) => {
    const car = provider.car(req.params.identity);
    if (!car) { res.status(404).json({error: 'Textured car unavailable for this vehicle'}); return; }
    res.json(car);
  });
  router.get('/cars/files/:file', (req, res) => sendFile(res, () => provider.carFile(`cars/${req.params.file}`), req.params.file.endsWith('.glb') ? 'model/gltf-binary' : 'application/json', '3D car file'));
  router.get('/cars/files/textures/:file', (req, res) => sendFile(res, () => provider.carFile(`cars/textures/${req.params.file}`), 'image/ktx2', '3D car texture'));
  return router;
}
