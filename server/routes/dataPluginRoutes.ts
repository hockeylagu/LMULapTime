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
  router.get('/scenes/:layoutKey', (req, res) => {
    const scene = provider.scene(req.params.layoutKey);
    if (!scene) { res.status(404).json({error: '3D track scene unavailable for this layout'}); return; }
    res.json(scene);
  });
  router.get('/scenes/:layoutKey/:revision/asset', (req, res) => {
    try {
      const bytes = provider.sceneAsset(req.params.layoutKey, req.params.revision);
      if (!bytes) { res.status(404).json({error: '3D scene revision unavailable'}); return; }
      res.type('model/gltf-binary').send(bytes);
    } catch { res.status(409).json({error: '3D scene changed on disk. Restore the package or restart the backend.'}); }
  });
  router.get('/vehicle-meshes/:recordId', (req, res) => {
    const mesh = provider.vehicleMesh(req.params.recordId);
    if (!mesh) { res.status(404).json({error: '3D vehicle mesh unavailable'}); return; }
    res.json(mesh);
  });
  router.get('/brake-board-artwork/:layoutKey', (req, res) => res.json(provider.brakeBoardArtwork(req.params.layoutKey)));
  router.get('/brake-board-artwork/:layoutKey/:revision/asset', (req, res) => {
    try {
      const bytes = provider.brakeBoardImage(req.params.layoutKey, req.params.revision);
      if (!bytes) { res.status(404).json({error: 'Brake-board image unavailable'}); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.type('png').send(bytes);
    } catch { res.status(409).json({error: 'Brake-board image changed on disk. Restore the package or restart the backend.'}); }
  });
  router.get('/vehicle-meshes/:recordId/:revision/asset', (req, res) => {
    try {
      const bytes = provider.vehicleMeshAsset(req.params.recordId, req.params.revision);
      if (!bytes) { res.status(404).json({error: '3D vehicle mesh revision unavailable'}); return; }
      res.type('model/gltf-binary').send(bytes);
    } catch { res.status(409).json({error: '3D vehicle mesh changed on disk. Restore the package or restart the backend.'}); }
  });
  router.get('/vehicle-liveries/:identity', (req, res) => {
    const livery = provider.vehicleLivery(req.params.identity);
    if (!livery) { res.status(404).json({error: 'Vehicle livery unavailable'}); return; }
    res.json(livery);
  });
  router.get('/vehicle-liveries/:liveryKey/:revision/asset', (req, res) => {
    try {
      const bytes = provider.vehicleLiveryAsset(req.params.liveryKey, req.params.revision);
      if (!bytes) { res.status(404).json({error: 'Vehicle livery unavailable'}); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.type('image/webp').send(bytes);
    } catch { res.status(409).json({error: 'Vehicle livery changed on disk. Restore the package or restart the backend.'}); }
  });
  return router;
}
