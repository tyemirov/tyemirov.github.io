// @ts-check
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standalone from 'ajv/dist/standalone/index.js';
import { build } from 'esbuild';
import { compile } from 'json-schema-to-typescript';
import SwaggerParser from '@apidevtools/swagger-parser';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const base = 'https://tyemirov.net/contracts/';
const names = ['gallery', 'music', 'site', 'site-runtime'];
const schemas = Object.fromEntries(await Promise.all(names.map(async name => [name, JSON.parse(await readFile(`${root}/contracts/${name}.schema.json`, 'utf8'))])));
const ajv = new Ajv({ strict: true, allErrors: true, code: { source: true, esm: true }, schemas: Object.values(schemas) });
addFormats(ajv);
const entries = {
  sourceCatalog: `${base}site.schema.json#/$defs/sourceCatalog`,
  publicCatalog: `${base}site.schema.json#/$defs/publicCatalog`,
  galleryCatalog: `${base}gallery.schema.json#/$defs/catalog`,
  galleryDraft: `${base}gallery.schema.json#/$defs/draft`,
  musicCatalog: `${base}music.schema.json#/$defs/catalog`,
  siteRuntime: `${base}site-runtime.schema.json`,
};
for (const domain of ['gallery', 'music']) {
  for (const name of Object.keys(schemas[domain].$defs)) {
    const schema = schemas[domain].$defs[name];
    if (schema.type === 'object' && !Object.values(entries).includes(`${base}${domain}.schema.json#/$defs/${name}`)) entries[domain + name[0].toUpperCase() + name.slice(1)] = `${base}${domain}.schema.json#/$defs/${name}`;
  }
}
const outputs = new Map();
const galleryTypes = {
  catalog: 'catalog', image: 'publicImage', artwork: 'artwork', offer: 'offer', offeredFile: 'offeredFile', collection: 'collection', exhibit: 'exhibit', section: 'section', draft: 'draft',
  asset: 'asset', error: 'apiError', assetPage: 'assetPage', readiness: 'readiness', orderInput: 'orderInput', orderItem: 'orderItem', order: 'orderView', orderCreation: 'orderCreation',
  entitlement: 'entitlement', downloadInput: 'downloadLinkInput', download: 'download', downloadCreation: 'downloadCreation', accessReissueInput: 'accessReissueInput',
  accessReissue: 'accessReissue', accessReissueCreation: 'accessReissueCreation', ownerOrder: 'ownerOrderSummary', ownerOrderPage: 'ownerOrderPage', orderUpdate: 'orderUpdate', receipt: 'receiptView',
  publicationRequest: 'publicationRequest', publication: 'publication', orderSnapshot: 'orderSnapshot', emptyInput: 'emptyInput',
};
const fieldNames = { id: 'ID', artworkId: 'ArtworkID', artworkIds: 'ArtworkIDs', coverArtworkId: 'CoverArtworkID', cardUrl: 'CardURL', lightboxUrl: 'LightboxURL', offerIds: 'OfferIDs', offerId: 'OfferID', orderId: 'OrderID', approvalUrl: 'ApprovalURL', archiveUrl: 'ArchiveURL', orderUrl: 'OrderURL', requestId: 'RequestID', draftEtag: 'DraftETag' };
function goType(schema, owner, field) {
  if (schema.$ref) return galleryTypes[schema.$ref.split('/').pop()];
  if (schema.anyOf) return '*' + goType(schema.anyOf.find(value => value.type !== 'null'), owner, field);
  if (schema.type === 'array') return '[]' + goType(schema.items === false ? schema.prefixItems[0] : schema.items, owner, field);
  if (schema.type === 'object' && schema.additionalProperties) return 'map[string]' + goType(schema.additionalProperties, owner, field);
  if (field === 'status' && ['order', 'ownerOrder', 'orderUpdate'].includes(owner)) return 'orderStatus';
  if (owner === 'receipt' && field === 'status') return 'receiptStatus';
  if (schema.type === 'integer') return 'int';
  if (schema.type === 'number') return 'float64';
  if (schema.type === 'string' || typeof schema.const === 'string') return 'string';
  throw new Error(`Unsupported Go type: ${owner}.${field}`);
}
const goModels = Object.entries(galleryTypes).map(([name, type]) => `type ${type} struct {\n${Object.entries(schemas.gallery.$defs[name].properties).map(([field, value]) => `${fieldNames[field] || field[0].toUpperCase() + field.slice(1)} ${goType(value, name, field)} \`json:"${field}"\``).join('\n')}\n}`).join('\n\n');
outputs.set('services/gallery/models_generated.go', execFileSync('gofmt', { input: '// Code generated from contracts/gallery.schema.json. DO NOT EDIT.\npackage gallery\n\n' + goModels + '\n', encoding: 'utf8' }));
const musicTypes={grantInput:'grantInput',expiration:'grantExpiration',grant:'grantResponse'};
const musicFields={grantId:'GrantID',trackId:'TrackID',playlistUrl:'PlaylistURL',durationMs:'DurationMS',serverTime:'ServerTime',expiresAt:'ExpiresAt'};
const musicModels=Object.entries(musicTypes).map(([name,type])=>`type ${type} struct {\n${Object.entries(schemas.music.$defs[name].properties).map(([field,value])=>`${musicFields[field]} ${value.format==='date-time'?'time.Time':value.type==='integer'?'int64':'string'} \`json:"${field}"\``).join('\n')}\n}`).join('\n\n');
outputs.set('services/music-stream/internal/stream/models_generated.go',execFileSync('gofmt',{input:'// Code generated from contracts/music.schema.json. DO NOT EDIT.\npackage stream\nimport "time"\n'+musicModels+'\nvar schemaNames=map[string]string{"grantInput":"grantInput","grantExpiration":"expiration"}\n',encoding:'utf8'}));
outputs.set('services/music-stream/internal/stream/contract.schemas.json',JSON.stringify(schemas.music)+'\n');
outputs.set('services/gallery/contract.schemas.json', JSON.stringify(schemas.gallery) + '\n');
outputs.set('services/gallery/schema_names_generated.go', execFileSync('gofmt', { input: '// Code generated from contracts/gallery.schema.json. DO NOT EDIT.\npackage gallery\n\nvar schemaNames = map[string]string{\n' + Object.entries(galleryTypes).map(([schema, type]) => `${JSON.stringify(type)}: ${JSON.stringify(schema)},`).join('\n') + '\n}\n', encoding: 'utf8' }));
function expand(value, document) {
  if (Array.isArray(value)) return value.map(item => expand(item, document));
  if (value === null || typeof value !== 'object') return value;
  if (value.$ref) {
    const [file, pointer] = value.$ref.split('#');
    const target = file ? schemas[basename(file, '.schema.json')] : document;
    if (!target) throw new Error(`Unknown schema reference: ${value.$ref}`);
    const selected = pointer ? pointer.slice(1).split('/').reduce((current, key) => current[key], target) : target;
    return expand(selected, target);
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['$id', '$defs', '$schema'].includes(key)).map(([key, item]) => [key, expand(item, document)]));
}
const source = standalone(ajv, entries);
const result = await build({ stdin: { contents: source, resolveDir: root, sourcefile: 'validators.js' }, bundle: true, write: false, format: 'esm', platform: 'browser', minify: true });
outputs.set('assets/js/generated/validators.js', '// Generated from contracts/*.schema.json. Do not edit.\n' + result.outputFiles[0].text);
for (const [name, ref] of Object.entries(entries)) {
  const type = await compile(expand({ $ref: ref }, null), name, { bannerComment: '// Generated from contracts/*.schema.json. Do not edit.', maxItems: -1 });
  outputs.set(`contracts/generated/${name}.d.ts`, type);
}
const routes = {};
for (const name of ['gallery', 'music']) {
  const api = JSON.parse(await readFile(`${root}/contracts/${name}.openapi.yaml`, 'utf8'));
  const bundled = expand(api, null);
  await SwaggerParser.validate(structuredClone(bundled));
  routes[name] = Object.fromEntries(Object.entries(api.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => [operation.operationId, { method: method.toUpperCase(), path }])));
  outputs.set(`contracts/generated/${name}.openapi.json`, JSON.stringify(bundled, null, 2) + '\n');
  outputs.set(name === 'gallery' ? 'services/gallery/contract.openapi.json' : 'services/music-stream/internal/stream/contract.openapi.json', JSON.stringify(bundled) + '\n');
  const constants = name === 'gallery' ? {
    readinessPath: 'readReadiness', schemaPath: 'readOpenAPI', assetsPath: 'listAssets', assetPath: 'readAsset', representationPath: 'readAssetRepresentation',
    draftPath: 'readDraft', publicationsPath: 'createPublication', publicationArchivePath: 'readPublicationArchive', ordersPath: 'listOrders', orderPath: 'readOrder',
    capturesPath: 'createCapture', paymentEventsPath: 'receivePaymentEvent', downloadLinksPath: 'createDownloadLink', downloadPath: 'readDownload',
    accessReissuesPath: 'createAccessReissue', accessReissuePath: 'readAccessReissue',
  } : { grantRoute: 'createGrant', readinessPath: 'readReadiness', healthPath: 'readHealth', schemaPath: 'readOpenAPI' };
  const go = `// Code generated from contracts/${name}.openapi.yaml. DO NOT EDIT.\npackage ${name === 'gallery' ? 'gallery' : 'stream'}\n\nconst (\n${Object.entries(constants).map(([key, id]) => `${key} = ${JSON.stringify(routes[name][id].path)}`).join('\n')}\n)\n`;
  outputs.set(name === 'gallery' ? 'services/gallery/routes_generated.go' : 'services/music-stream/internal/stream/routes_generated.go', execFileSync('gofmt', { input: go, encoding: 'utf8' }));
}
outputs.set('assets/js/generated/routes.js', '// @ts-check\n// Generated from contracts/*.openapi.yaml. Do not edit.\nexport const routes = Object.freeze(' + JSON.stringify(routes, null, 2) + ');\n');
for (const [path, contents] of outputs) {
  if (process.argv.includes('--check')) {
    if (await readFile(`${root}/${path}`, 'utf8') !== contents) throw new Error(`Generated contract differs: ${path}`);
  } else {
    await mkdir(resolve(root, path, '..'), { recursive: true });
    await writeFile(`${root}/${path}`, contents);
  }
}
