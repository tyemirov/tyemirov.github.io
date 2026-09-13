// @ts-check
import { galleryOrderStatuses } from '/assets/js/generated/routes.js';
import { initializeSiteFooter } from '../../assets/js/footer.js';
import { createStudioClient } from './core/studio.js';
import { validatePublicCatalog } from '../../assets/js/catalog.js';

const host=document.querySelector('mpr-header');
const workspace=document.querySelector('#studio-workspace');
const panel=document.querySelector('#studio-panel');
const status=document.querySelector('#studio-status');
const preview=document.querySelector('#studio-preview-dialog');
let client, draft, etag, baseDigest, area='Library', dirty=false, busy=false, active=false;
let activeUser, editing=false, pendingEdits=false, publicationURL;
let session=new AbortController();
const imageURLs=new Map();
const publicationRequests=new Map();
const reissueKeys=new Map();
let controlSequence=0;

function element(tag,text,attributes={}) {
  const node=document.createElement(tag); if(text!==null) node.textContent=text;
  for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
  return node;
}
function button(label,action) { const node=element('button',label,{type:'button'});node.addEventListener('click',()=>void execute(action));return node; }
function field(form,label,value='',options={}) {
  const wrapper=element('div',null,{class:'studio-field'});const input=element(options.multiline?'textarea':'input',null);
  input.id=`studio-control-${++controlSequence}`;wrapper.append(element('label',label,{for:input.id}));
  input.name=options.name || label; input.value=value; input.required=options.required!==false;
  if(!options.multiline)input.type=options.type || 'text';
  for(const key of ['min','max','step','pattern','maxLength'])if(options[key]!==undefined)input[key]=options[key];
  if(options.readOnly)input.readOnly=true;
  wrapper.append(input);form.append(wrapper);return input;
}
function select(form,label,choices,value='') {
  const wrapper=element('div',null,{class:'studio-field'});const input=element('select',null);input.name=label;
  input.id=`studio-control-${++controlSequence}`;wrapper.append(element('label',label,{for:input.id}));
  for(const [id,title] of choices)input.append(element('option',title,{value:id}));
  input.value=value;wrapper.append(input);form.append(wrapper);return input;
}
function changed() {dirty=true;document.querySelector('#studio-reviewed').checked=false;document.querySelector('#studio-save-state').textContent='Unsaved changes';}
function setSaved() {dirty=false;document.querySelector('#studio-save-state').textContent='Saved draft';}
function report(error) {
  if(error.name==='AbortError' || !active && error.status!==403)return;
  status.textContent=error.status===403?'Only the gallery owner can open this workspace.':error.status===412?'The draft changed in another session. Your edits remain here. Reload the saved draft to replace them.':error.message;
}
async function execute(action) {
  if(busy)return;busy=true;workspace.inert=true;preview.inert=true;workspace.setAttribute('aria-busy','true');
  try {await action();}catch(error){report(error);}finally{busy=false;workspace.inert=false;preview.inert=false;workspace.removeAttribute('aria-busy');}
}
function clear() {
  active=false;session.abort();workspace.hidden=true;panel.replaceChildren();preview.close();
  document.querySelector('#studio-preview-content').replaceChildren();document.querySelector('#studio-export-status').replaceChildren();
  for(const url of imageURLs.values())URL.revokeObjectURL(url);imageURLs.clear();publicationRequests.clear();reissueKeys.clear();
  if(publicationURL)URL.revokeObjectURL(publicationURL);publicationURL=undefined;
  activeUser=undefined;editing=false;pendingEdits=false;
  client=undefined;draft=undefined;etag=undefined;baseDigest=undefined;setSaved();
  status.textContent='Sign in to open the owner workspace.';
}
async function catalogDigest() {
  const response=await fetch('/data/site.json',{cache:'no-store',signal:session.signal});
  if(!response.ok)throw new Error('The published catalog is unavailable.');
  const bytes=await response.arrayBuffer();validatePublicCatalog(JSON.parse(new TextDecoder().decode(bytes)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
}
async function openWorkspace() {
  session.abort();session=new AbortController();active=true;status.textContent='Opening the owner workspace…';
  try {
    client=await createStudioClient(host,session.signal);
    const result=await client.draft();
    draft=result.value;etag=result.etag;baseDigest=await catalogDigest();setSaved();workspace.hidden=false;
    status.textContent='Owner workspace ready.';await renderArea();
  }catch(error){workspace.hidden=true;report(error);}
}
document.addEventListener('mpr-ui:auth:authenticated',event=>{
  if(event.target!==host)return;
  const user=event.detail.profile.user_id;
  if(active && activeUser===user)return;
  clear();activeUser=user;void openWorkspace();
});
document.addEventListener('mpr-ui:auth:unauthenticated',clear);
document.addEventListener('mpr-ui:auth:error',()=>{if(!active)status.textContent='Sign-in is unavailable. Try the shared sign-in control again.';});
void initializeSiteFooter({themeAttribute:'data-theme'});
window.addEventListener('beforeunload',event=>{if(dirty || pendingEdits){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>session.abort());
window.addEventListener('pageshow',event=>{if(event.persisted)void execute(async()=>{
  const snapshot=await globalThis.MPRUI.resolveAuthProfileSnapshot(host);
  if(snapshot.status!=='authenticated'){clear();return;}
  session=new AbortController();client=await createStudioClient(host,session.signal);
  const currentDigest=await catalogDigest();
  if(currentDigest!==baseDigest){baseDigest=currentDigest;document.querySelector('#studio-reviewed').checked=false;}
  if(dirty || pendingEdits){status.textContent='Your unsaved edits remain here. Review the current catalog before publication.';return;}
  const result=await client.draft();draft=result.value;etag=result.etag;await renderArea();
});});

function beginEditor(form){editing=true;pendingEdits=false;form.addEventListener('input',()=>{pendingEdits=true;});form.addEventListener('change',()=>{pendingEdits=true;});}
function leaveEditor(){return !pendingEdits || window.confirm('Discard the changes you have not applied to the draft?');}
async function cancelEditor(){if(leaveEditor())await renderArea();}

async function save() {
  if(editing)throw new Error('Apply or cancel the open editor before saving the draft.');
  const result=await client.save(draft,etag);draft=result.value;etag=result.etag;setSaved();status.textContent='Draft saved.';
}
document.querySelector('#studio-save').addEventListener('click',()=>void execute(save));
document.querySelector('#studio-reload').addEventListener('click',()=>void execute(async()=>{
  if((dirty || pendingEdits) && !window.confirm('Replace your unsaved edits with the saved draft?'))return;
  const result=await client.draft();draft=result.value;etag=result.etag;baseDigest=await catalogDigest();setSaved();await renderArea();status.textContent='Saved draft loaded.';
}));
for(const tab of document.querySelectorAll('[data-area]'))tab.addEventListener('click',()=>void execute(async()=>{if(!leaveEditor())return;area=tab.dataset.area;await renderArea();}));
async function renderArea() {
  if(!active || !draft)return;editing=false;pendingEdits=false;panel.replaceChildren();panel.setAttribute('aria-label',area);
  for(const tab of document.querySelectorAll('[data-area]'))tab.setAttribute('aria-pressed',String(tab.dataset.area===area));
  if(area==='Library')await library();else if(area==='Orders')await orders();else groups(area==='Collections'?'collections':'exhibits');
}
async function privateImage(assetId,representation='card') {
  const key=assetId+representation;if(imageURLs.has(key))return imageURLs.get(key);
  const {value}=await client.image(assetId,representation);const url=URL.createObjectURL(value);imageURLs.set(key,url);return url;
}
async function workImage(work) {return draft.masters[work.id]?privateImage(draft.masters[work.id]):work.image.cardUrl;}

async function library() {
  panel.append(element('h2','Library'));
  const drop=element('div',null,{class:'studio-drop'});const label=element('label','Upload images');
  const input=element('input',null,{type:'file',multiple:'',accept:'image/png,image/jpeg,image/webp'});label.append(input);drop.append(label,element('p','Choose or drop PNG, JPEG, or WebP images, up to 25 MiB each. Originals stay private.'));
  const uploads=element('ul',null,{'aria-label':'Upload progress'});drop.append(uploads);panel.append(drop);
  async function upload(files) {
    for(const file of files){
      const row=element('li',`${file.name}: uploading…`);const progress=element('progress',null,{'aria-label':`Upload ${file.name}`});row.append(progress);uploads.append(row);
      try{const {value,status:code}=await client.upload(file);row.textContent=`${file.name}: ${code===200?'existing image ready for reuse':'uploaded'}`;await assetCard(value,assets);}
      catch(error){row.textContent=`${file.name}: ${error.message}`;}
    }
    input.value='';
  }
  input.addEventListener('change',()=>void execute(()=>upload([...input.files])));
  drop.addEventListener('dragover',event=>{event.preventDefault();});
  drop.addEventListener('drop',event=>{event.preventDefault();void execute(()=>upload([...event.dataTransfer.files]));});
  const assets=element('div',null,{class:'studio-grid','aria-label':'Private images'});panel.append(assets);
  const more=button('Load more images',()=>loadAssets(cursor));let cursor=null;
  async function loadAssets(next){const {value}=await client.assets(next);for(const asset of value.items)await assetCard(asset,assets);cursor=value.nextCursor;more.hidden=cursor===null;}
  panel.append(more);await loadAssets(null);
  panel.append(element('h2','Artworks'));
  const works=element('div',null,{class:'studio-grid'});panel.append(works);
  for(const work of draft.gallery.artworks){
    const card=element('article',null,{class:'studio-card'});const image=element('img',null,{alt:work.alt,src:await workImage(work)});
    card.append(image,element('h3',work.title),element('p',`${work.medium} · ${work.year}`),button(`Edit ${work.title}`,()=>editArtwork(work,null)),button(`Remove ${work.title}`,async()=>{
      const used=draft.gallery.collections.some(group=>group.artworkIds.includes(work.id)) || draft.gallery.exhibits.some(group=>group.sections.some(section=>section.artworkIds.includes(work.id)));
      if(used)throw new Error('Remove this artwork from its collections and exhibits first.');
      draft.gallery.artworks=draft.gallery.artworks.filter(item=>item.id!==work.id);delete draft.masters[work.id];changed();await renderArea();
    }));works.append(card);
  }
}
async function assetCard(asset,container){
  if(container.querySelector(`[data-asset-id="${asset.id}"]`))return;
  const card=element('article',null,{class:'studio-card','data-asset-id':asset.id});
  card.append(element('img',null,{src:await privateImage(asset.id),alt:`Private image ${asset.id.slice(0,8)}`}),element('p',`${asset.width} × ${asset.height} · ${asset.format}`),button('Create artwork',()=>editArtwork(null,asset)));
  const choices=select(card,'Replace master for', [['','Select artwork'],...draft.gallery.artworks.map(work=>[work.id,work.title])]);
  card.append(button('Review replacement',()=>{if(!choices.value)throw new Error('Select an artwork for this master.');editArtwork(draft.gallery.artworks.find(work=>work.id===choices.value),asset);}));
  container.prepend(card);
}
function editArtwork(existing,asset){
  const work=existing?structuredClone(existing):{id:'',title:'',description:'',alt:'',medium:'',year:'',image:null,offer:null};
  if(asset)work.image={cardUrl:`/gallery/images/previews/${asset.id}.png`,lightboxUrl:`/gallery/images/full/${asset.id}.png`,width:asset.width,height:asset.height,format:asset.format};
  panel.replaceChildren(element('h2',existing?'Edit artwork':'Create artwork'));const form=element('form',null,{class:'studio-form'});panel.append(form);beginEditor(form);
  const id=field(form,'Artwork ID',work.id,{readOnly:!!existing,pattern:'[a-z0-9]+(-[a-z0-9]+)*',maxLength:100});
  const title=field(form,'Artwork title',work.title);const description=field(form,'Image description',work.description,{multiline:true});const alt=field(form,'Alt text',work.alt);const medium=field(form,'Medium',work.medium);const year=field(form,'Year',work.year);
  const saleLabel=element('label',' Offer for sale');const sale=element('input',null,{type:'checkbox'});sale.checked=!!work.offer;saleLabel.prepend(sale);form.append(saleLabel);
  const offerFields=element('fieldset',null);offerFields.append(element('legend','Digital offer'));form.append(offerFields);
  const offerID=field(offerFields,'Offer ID',work.offer?.id || '',{pattern:'[a-z0-9]+(-[a-z0-9]+)*'});
  const cents=field(offerFields,'Price in cents',String(work.offer?.priceCents || ''),{type:'number',min:1,max:1000000000,step:1});
  const currency=field(offerFields,'Currency',work.offer?.currency || 'USD',{pattern:'[A-Z]{3}',maxLength:3});
  const license=field(offerFields,'License',work.offer?.license || '',{multiline:true});const fileLabel=field(offerFields,'Included file',work.offer?.file.label || '');
  const terms=field(offerFields,'Delivery terms',work.offer?.deliveryTerms || '',{multiline:true});
  const updateSale=()=>{offerFields.hidden=!sale.checked;offerFields.disabled=!sale.checked;};sale.addEventListener('change',updateSale);updateSale();
  form.append(element('button','Apply artwork',{type:'submit'}),button('Cancel',cancelEditor));
  form.addEventListener('submit',event=>{event.preventDefault();void execute(async()=>{
    const master=asset?.id || draft.masters[work.id];
    Object.assign(work,{id:id.value,title:title.value,description:description.value,alt:alt.value,medium:medium.value,year:year.value});
    if(!existing && draft.gallery.artworks.some(item=>item.id===work.id))throw new Error('An artwork already uses that ID.');
    if(sale.checked && !master)throw new Error('Select a private master before creating an offer.');
    work.offer=sale.checked?{id:offerID.value,priceCents:Number(cents.value),currency:currency.value,license:license.value,revision:master,file:{label:fileLabel.value,format:work.image.format,width:work.image.width,height:work.image.height},deliveryTerms:terms.value}:null;
    const candidate=structuredClone(draft);const index=candidate.gallery.artworks.findIndex(item=>item.id===work.id);
    if(index<0)candidate.gallery.artworks.push(work);else candidate.gallery.artworks[index]=work;
    if(master)candidate.masters[work.id]=master;client.checkDraft(candidate);draft=candidate;changed();await renderArea();status.textContent='Artwork applied to the unsaved draft.';
  });});
}

function orderedList(container,values,title,onChange){
  const list=element('ol',null,{class:'studio-order-list'});container.append(list);let dragged;
  function move(from,to){if(to<0 || to>=values.length)return;pendingEdits=true;values.splice(to,0,values.splice(from,1)[0]);onChange();render();}
  function render(){list.replaceChildren();values.forEach((value,index)=>{
    const name=title(value);const row=element('li',null,{draggable:'true'});row.append(element('span',name));
    const up=button(`Move up ${name}`,()=>move(index,index-1));up.disabled=index===0;
    const down=button(`Move down ${name}`,()=>move(index,index+1));down.disabled=index===values.length-1;
    row.append(up,down,button(`Remove ${name}`,()=>{pendingEdits=true;values.splice(index,1);onChange();render();}));
    row.addEventListener('dragstart',event=>{dragged=index;event.dataTransfer.setData('text/plain',String(index));});
    row.addEventListener('dragover',event=>event.preventDefault());row.addEventListener('drop',event=>{event.preventDefault();if(Number.isInteger(dragged))move(dragged,index);dragged=undefined;});list.append(row);
  });}render();return render;
}
function groupArtworks(container,ids){
  const title=id=>draft.gallery.artworks.find(work=>work.id===id).title;
  const refresh=orderedList(container,ids,title,()=>{});
  const choice=select(container,'Add artwork',draft.gallery.artworks.map(work=>[work.id,work.title]),draft.gallery.artworks[0]?.id || '');
  container.append(button('Add selected artwork',()=>{if(choice.value && !ids.includes(choice.value)){pendingEdits=true;ids.push(choice.value);refresh();}}));
}
function groups(kind){
  const singular=kind==='collections'?'collection':'exhibit';panel.append(element('h2',area),button(`New ${singular}`,()=>editGroup(kind,null)));
  for(const group of draft.gallery[kind]){
    const row=element('article',null,{class:'studio-card'});row.append(element('h3',group.title),element('p',group.introduction),button(`Edit ${group.title}`,()=>editGroup(kind,group)),button(`Delete ${group.title}`,()=>{draft.gallery[kind]=draft.gallery[kind].filter(item=>item.id!==group.id);changed();groupsRefresh();}));panel.append(row);
  }
  function groupsRefresh(){panel.replaceChildren();groups(kind);}
}
function editGroup(kind,existing){
  const exhibit=kind==='exhibits';const singular=exhibit?'exhibit':'collection';const name=exhibit?'Exhibit':'Collection';
  const group=existing?structuredClone(existing):{id:'',title:'',introduction:'',coverArtworkId:'',coverPosition:[50,50],...(exhibit?{subtitle:'',startDate:'',endDate:'',sections:[]}:{artworkIds:[]})};
  panel.replaceChildren(element('h2',`${existing?'Edit':'New'} ${singular}`));const form=element('form',null,{class:'studio-form'});panel.append(form);beginEditor(form);
  const id=field(form,`${name} ID`,group.id,{readOnly:!!existing,pattern:'[a-z0-9]+(-[a-z0-9]+)*'});const title=field(form,`${name} title`,group.title);const introduction=field(form,'Introduction',group.introduction,{multiline:true});
  let subtitle,start,end;
  if(exhibit){subtitle=field(form,'Subtitle',group.subtitle);start=field(form,'Start date',group.startDate,{type:'date'});end=field(form,'End date',group.endDate,{type:'date'});}
  const cover=select(form,'Cover artwork',[['','Select cover'],...draft.gallery.artworks.map(work=>[work.id,work.title])],group.coverArtworkId);
  const cropX=field(form,'Cover crop horizontal',String(group.coverPosition[0]),{type:'number',min:0,max:100,step:'any'});const cropY=field(form,'Cover crop vertical',String(group.coverPosition[1]),{type:'number',min:0,max:100,step:'any'});
  if(exhibit){
    const sections=element('div',null,{'aria-label':'Exhibit sections'});form.append(sections);
    const sectionOrder=element('div',null);form.append(sectionOrder);
    function renderSections(){
      sections.replaceChildren();sectionOrder.replaceChildren();
      orderedList(sectionOrder,group.sections,section=>section.title || 'Untitled section',()=>queueMicrotask(renderSections));
      for(const section of group.sections){const box=element('fieldset',null);box.append(element('legend','Section'));const sid=field(box,'Section ID',section.id,{pattern:'[a-z0-9]+(-[a-z0-9]+)*'});sid.addEventListener('input',()=>section.id=sid.value);const stitle=field(box,'Section title',section.title);stitle.addEventListener('input',()=>section.title=stitle.value);groupArtworks(box,section.artworkIds);sections.append(box);}
    }
    form.append(button('Add section',()=>{pendingEdits=true;group.sections.push({id:`section-${crypto.randomUUID()}`,title:'',artworkIds:[]});renderSections();}));renderSections();
  }else groupArtworks(form,group.artworkIds);
  form.append(element('button',`Apply ${singular}`,{type:'submit'}),button('Cancel',cancelEditor));
  form.addEventListener('submit',event=>{event.preventDefault();void execute(async()=>{
    Object.assign(group,{id:id.value,title:title.value,introduction:introduction.value,coverArtworkId:cover.value,coverPosition:[Number(cropX.value),Number(cropY.value)]});
    if(exhibit)Object.assign(group,{subtitle:subtitle.value,startDate:start.value,endDate:end.value});
    if(!existing && draft.gallery[kind].some(item=>item.id===group.id))throw new Error(`A ${singular} already uses that ID.`);
    const candidate=structuredClone(draft);const index=candidate.gallery[kind].findIndex(item=>item.id===group.id);if(index<0)candidate.gallery[kind].push(group);else candidate.gallery[kind][index]=group;
    client.checkDraft(candidate);draft=candidate;changed();await renderArea();status.textContent=`${name} applied to the unsaved draft.`;
  });});
}

async function orders(){
  panel.append(element('h2','Orders'));const filters=element('form',null,{class:'studio-toolbar'});
  const email=field(filters,'Buyer email','',{type:'email',required:false});
  const state=select(filters,'Order status',[['','All'],...galleryOrderStatuses.map(value=>[value,value])]);
  filters.append(element('button','Find orders',{type:'submit'}));panel.append(filters);
  const list=element('div',null);panel.append(list);let cursor=null;
  const more=button('Load more orders',()=>load(cursor));panel.append(more);
  async function load(next){
    const {value}=await client.orders({limit:50,email:email.value,status:state.value,cursor:next});if(!next)list.replaceChildren();
    if(!value.items.length && !next)list.append(element('p','No orders match these filters.'));
    for(const order of value.items){const card=element('article',null,{class:'studio-card','data-order-id':order.id});card.append(element('h3',order.email),element('p',`${order.status} · ${new Intl.NumberFormat('en-US',{style:'currency',currency:order.currency}).format(order.totalCents/100)}`),element('p',`Receipt: ${order.receipt?.status || 'not queued'}`),button('Open order',()=>orderDetails(order.id,card)));list.append(card);}
    cursor=value.nextCursor;more.hidden=cursor===null;
  }
  filters.addEventListener('submit',event=>{event.preventDefault();void execute(()=>load(null));});await load(null);
}
async function orderDetails(id,container){
  const {value:order}=await client.order(id);container.replaceChildren(element('h3',order.email),element('p',`Order ${order.id} · ${order.status}`));
  for(const item of order.items)container.append(element('h4',item.title),element('p',item.offer.license),element('p',item.offer.deliveryTerms));
  for(const item of order.entitlements)container.append(element('p',`File access: ${item.status}`));
  const form=element('form',null);container.append(form);const verified=field(form,'Verified buyer email','',{type:'email'});
  form.append(element('p','Verify the buyer through your support process, then enter the confirmed address.'),element('button','Reissue access',{type:'submit'}));
  const output=element('div',null,{role:'status'});container.append(output);
  form.addEventListener('submit',event=>{event.preventDefault();void execute(async()=>{
    const identity=id+'|'+verified.value;const key=reissueKeys.get(identity) || crypto.randomUUID();reissueKeys.set(identity,key);
    const {value}=await client.reissue(id,verified.value,key);output.replaceChildren(element('p','Access reissued. Share the order page and access code separately with the verified buyer.'));
    const link=element('a','Buyer order page',{href:new URL(value.orderUrl,location.origin).href});output.append(link);
    field(output,'Order access code',value.accessSecret,{readOnly:true});
    output.append(button('Hide access code',()=>output.replaceChildren()));
  });});
}

async function showPreview(){
  if(editing)throw new Error('Apply or cancel the open editor before previewing the draft.');
  client.checkDraft(draft);const content=document.querySelector('#studio-preview-content');content.replaceChildren();
  content.append(element('h2',draft.gallery.title),element('p',draft.gallery.description));
  async function workCard(work,container){const card=element('article',null,{class:'studio-card'});card.append(element('img',null,{src:await workImage(work),alt:work.alt}),element('h4',work.title),element('p',work.description),element('p',`${work.medium} · ${work.year}`));if(work.offer)card.append(element('p',`${work.offer.priceCents/100} ${work.offer.currency}`),element('p',work.offer.license),element('p',work.offer.deliveryTerms));container.append(card);}
  async function section(title,ids){content.append(element('h3',title));const grid=element('div',null,{class:'studio-grid'});content.append(grid);for(const id of ids)await workCard(draft.gallery.artworks.find(work=>work.id===id),grid);}
  async function groupCover(group){
    const work=draft.gallery.artworks.find(work=>work.id===group.coverArtworkId);
    const image=element('img',null,{src:await workImage(work),alt:work.alt,class:'studio-preview-cover','data-preview-cover':group.id});
    image.style.objectPosition=`${group.coverPosition[0]}% ${group.coverPosition[1]}%`;
    content.append(image,element('h2',group.title),element('p',group.introduction));
  }
  for(const group of draft.gallery.collections){await groupCover(group);await section('Works',group.artworkIds);}
  for(const group of draft.gallery.exhibits){await groupCover(group);content.append(element('p',group.subtitle),element('p',`${group.startDate} – ${group.endDate}`));for(const part of group.sections)await section(part.title,part.artworkIds);}
  await section('Library',draft.gallery.artworks.map(work=>work.id));
  document.querySelector('#studio-reviewed').checked=false;document.querySelector('#studio-export-status').textContent=dirty?'Save the draft before exporting.':'';preview.showModal();
}
document.querySelector('#studio-preview').addEventListener('click',()=>void execute(showPreview));
document.querySelector('#studio-preview-close').addEventListener('click',()=>preview.close());
for(const control of document.querySelectorAll('[data-preview-width]'))control.addEventListener('click',()=>document.querySelector('#studio-preview-content').style.width=`${control.dataset.previewWidth}px`);
document.querySelector('#studio-export').addEventListener('click',()=>void execute(async()=>{
  const output=document.querySelector('#studio-export-status');
  if(dirty){output.textContent='Save the draft, then review the preview again.';return;}
  if(!document.querySelector('#studio-reviewed').checked){output.textContent='Review the preview and confirm before exporting.';return;}
  try{
    const identity=etag+'|'+baseDigest;let publication=publicationRequests.get(identity);
    if(!publication){publication=(await client.publication({draftEtag:etag,baseCatalogDigest:baseDigest})).value;publicationRequests.set(identity,publication);}
    const {value}=await client.archive(publication.id);if(publicationURL)URL.revokeObjectURL(publicationURL);publicationURL=URL.createObjectURL(value);const anchor=element('a','Download publication',{href:publicationURL,download:`gallery-publication-${publication.id}.zip`});output.replaceChildren(anchor);anchor.click();
  }catch(error){output.textContent=error.message;throw error;}
}));
