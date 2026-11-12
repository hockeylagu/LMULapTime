/** 3D vehicle bodies of the package: a GLB with four wheel rigs, a descriptor JSON and KTX2 textures each (docs/PACKAGE_FORMAT.md, Vehicles). The shapes are the contract's. */
import type { VehicleBody } from '../../packageContract/index.js';

export type { BodyDescriptor, CarAppearance, CarCamera, CarCorner, CarLamp, CarLampRole, CarMapRef, CarMaterialRecipe, CarSurface, VehicleBody, VehicleBodyModel, VehicleBodyTexture } from '../../packageContract/index.js';

/** A body as `/api/data-plugin/vehicles/<id>/body` serves it: the catalog row (no file paths: they are derived from `sha256` and `folder`) and the package revision. */
export interface BodyResource extends VehicleBody { packageRevision: string }
