// @ts-check
import { routes } from '../../../assets/js/generated/routes.js';
import * as schemas from '../../../assets/js/generated/validators.js';
import { validateGallery } from './catalog.js';

export class StudioError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

/** Protected transport uses the shared authentication owner for every request. */
export async function createStudioClient(host, signal) {
  const response = await fetch('/config-site.json', { cache:'no-store', signal });
  if (!response.ok) throw new StudioError('Studio configuration is unavailable.');
  const config = await response.json();
  if (!schemas.siteRuntime(config)) throw new StudioError('Studio configuration is invalid.');
  const auth = JSON.parse(host.getAttribute('auth-config'));
  if (auth.tauthUrl !== config.apiOrigin) throw new StudioError('Authentication and gallery API origins differ.');
  async function request(name, schema, { params = {}, query = {}, body, headers = {} } = {}) {
    const operation = routes.gallery[name];
    const path = operation.path.replace(/\{([^}]+)\}/g, (_, key) => encodeURIComponent(params[key]));
    const url = new URL(path, config.apiOrigin);
    for (const [key,value] of Object.entries(query)) if (value !== '' && value !== null) url.searchParams.set(key,String(value));
    const binary = body instanceof Blob;
    const response = await globalThis.MPRUI.authenticatedFetch(host, url.href, {
      method:operation.method, cache:'no-store', credentials:'include', signal,
      headers:{ Accept:schema ? 'application/json' : '*/*', ...(body === undefined ? {} : {'Content-Type':binary ? body.type : 'application/json'}), ...headers },
      ...(body === undefined ? {} : {body:binary ? body : JSON.stringify(body)}),
    }, { mutationReplay:'authorization-before-domain-work' });
    if (!response.ok) {
      const error=await response.json();
      if (!schemas.galleryError(error)) throw new StudioError('The gallery returned an invalid error.',response.status);
      throw new StudioError(error.message,response.status,error.code);
    }
    const value=schema ? await response.json() : await response.blob();
    signal.throwIfAborted();
    if (schema && !schema(value)) throw new StudioError('The gallery returned an invalid record.');
    return {value,etag:response.headers.get('ETag'),status:response.status};
  }
  function checkedDraft(value) {
    if (!schemas.galleryDraft(value)) throw new StudioError('Complete each draft field before saving.');
    validateGallery(value.gallery);
    for(const [id] of Object.entries(value.masters)) if(!value.gallery.artworks.some(work=>work.id===id)) throw new StudioError('A master refers to an absent artwork.');
    for(const work of value.gallery.artworks) if(work.offer && work.offer.revision!==value.masters[work.id]) throw new StudioError('Each offer needs its selected private master.');
    return value;
  }
  return {
    checkDraft:checkedDraft,
    async draft() { const result=await request('readDraft',schemas.galleryDraft); checkedDraft(result.value); if(!/^"draft-[1-9][0-9]*"$/.test(result.etag)) throw new StudioError('The gallery omitted the draft revision.'); return result; },
    async save(value,etag) { return request('replaceDraft',schemas.galleryDraft,{body:checkedDraft(value),headers:{'If-Match':etag}}); },
    assets:cursor=>request('listAssets',schemas.galleryAssetPage,{query:{limit:100,cursor}}),
    upload:file=>request('createAsset',schemas.galleryAsset,{body:file}),
    image:(assetId,representation='card')=>request('readAssetRepresentation',null,{params:{assetId,representation}}),
    publication:input=>request('createPublication',schemas.galleryPublication,{body:input}),
    archive:publicationId=>request('readPublicationArchive',null,{params:{publicationId}}),
    orders:query=>request('listOrders',schemas.galleryOwnerOrderPage,{query}),
    order:orderId=>request('readOrder',schemas.galleryOrder,{params:{orderId}}),
    reissue:(orderId,verifiedEmail,key)=>request('createAccessReissue',schemas.galleryAccessReissueCreation,{params:{orderId},body:{verifiedEmail},headers:{'Idempotency-Key':key}}),
  };
}
