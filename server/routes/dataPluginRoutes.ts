import path from 'node:path';
import { Router, static as serveStatic, type Response } from 'express';
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
  // Scenery and vehicle body files are served as is from the package folder (see `DataPlugin.filesRoot`), uncached like every response here.
  // A texture is a KTX2 compressed as one zstd file: the browser undoes the encoding while downloading, off the main thread.
  const root = provider.filesRoot();
  const setHeaders = (res: Response, file: string) => {
    if (file.endsWith('.ktx2.zst')) { res.setHeader('Content-Type', 'image/ktx2'); res.setHeader('Content-Encoding', 'zstd'); }
  };
  const files = (route: string, folder: string, label: string) => {
    if (root) router.use(route, serveStatic(path.join(root, folder), {index: false, etag: false, lastModified: false, cacheControl: false, acceptRanges: false, setHeaders}));
    router.use(route, (_req, res) => { res.status(404).json({error: `${label} unavailable`}); });
  };
  files('/scenery/files', 'scenery', '3D scenery file');
  files('/vehicles/files', 'vehicles', '3D vehicle file');
  router.get('/vehicles/:identity/body', (req, res) => {
    const body = provider.body(req.params.identity);
    if (!body) { res.status(404).json({error: '3D body unavailable for this vehicle'}); return; }
    res.json(body);
  });
  return router;
}
