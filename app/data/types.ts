export type Source = {url:string; title:string; license?:string; checkedAt:string};
export type University = {id:string; code:string; name:string; province:string; city:string; is985:boolean; is211:boolean; tier:'S'|'A'|'B'; campusName:string|null; position:[number,number]|null; website:string|null; subjects:string[]; sources:Source[]; campusId:string|null; gaps:string[]};
export type POI = {id:string; name:string; position:[number,number,number]; description:string; sourceUrl:string; verified:boolean};
export type TourRoute = {id:string; name:string; poiIds:string[]; path:[number,number,number][]; verified:boolean};
export type Campus = {id:string; universityId:string; name:string; origin:[number,number]; crs:'EPSG:4326'; modelUrl:string; bounds:[number,number,number,number]; pois:POI[]; tours:TourRoute[]; sources:Source[]; status:'draft'|'verified'; counts:Record<string,number>};
export type AssetManifest = {campusId:string; modelUrl:string; sha256:string; geometrySource:Source; estimatedHeights:boolean; boundaryVerified:boolean; layoutVerified:boolean; detailedLandmarks:number; releaseReady:boolean};
