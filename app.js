'use strict';

const DB_NAME='doujinpos-pwa'; const DB_VERSION=1;
const STORES={products:'products', sales:'sales', moves:'moves', media:'media', settings:'settings'};
let db; let products=[]; let cart=new Map(); let payment='現金'; let mediaUrls=[]; let selectedProductId=null; let editingProductId=null;
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n||0));
const nowIso=()=>new Date().toISOString();
const localDate=iso=>new Date(iso).toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const uid=(p='id')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains(STORES.products)) d.createObjectStore(STORES.products,{keyPath:'id'}); if(!d.objectStoreNames.contains(STORES.sales)) d.createObjectStore(STORES.sales,{keyPath:'id'}); if(!d.objectStoreNames.contains(STORES.moves)) d.createObjectStore(STORES.moves,{keyPath:'id'}); if(!d.objectStoreNames.contains(STORES.media)) d.createObjectStore(STORES.media,{keyPath:'id'}); if(!d.objectStoreNames.contains(STORES.settings)) d.createObjectStore(STORES.settings,{keyPath:'key'});}; r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function store(name,mode='readonly'){return db.transaction(name,mode).objectStore(name)}
function getAll(name){return new Promise((res,rej)=>{const r=store(name).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function getOne(name,key){return new Promise((res,rej)=>{const r=store(name).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function putOne(name,val){return new Promise((res,rej)=>{const r=store(name,'readwrite').put(val);r.onsuccess=()=>res(val);r.onerror=()=>rej(r.error)})}
function delOne(name,key){return new Promise((res,rej)=>{const r=store(name,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function clearStore(name){return new Promise((res,rej)=>{const r=store(name,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

async function seed(){
 if(!(await getOne(STORES.settings,'circleName'))) await putOne(STORES.settings,{key:'circleName',value:'とほくらげ'});
 if(!(await getOne(STORES.settings,'lowStock'))) await putOne(STORES.settings,{key:'lowStock',value:3});
}

async function cleanupLegacySamples(){
 const done=await getOne(STORES.settings,'legacySampleCleanupV1');
 if(done?.value)return;
 const legacy=[
  {id:'SAMPLE-001',title:'新譜サンプル',note:'サンプル行'},
  {id:'SAMPLE-002',title:'旧譜サンプル',note:'サンプル行'}
 ];
 for(const x of legacy){
  const p=await getOne(STORES.products,x.id);
  if(p && p.title===x.title && p.note===x.note){
   await delOne(STORES.products,x.id);
   for(const type of ['cover','xfd','mv']) await delOne(STORES.media,`${x.id}:${type}`);
  }
 }
 await putOne(STORES.settings,{key:'legacySampleCleanupV1',value:true});
}

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hidden'),2200)}
async function refresh(){products=(await getAll(STORES.products)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'ja')); await renderProducts(); renderCart(); await renderAdmin(); await renderHistory();}

async function coverUrl(pid){const m=await getOne(STORES.media,`${pid}:cover`);if(!m?.blob)return null;const u=URL.createObjectURL(m.blob);mediaUrls.push(u);return u}
async function renderProducts(){for(const u of mediaUrls) URL.revokeObjectURL(u);mediaUrls=[];const low=Number((await getOne(STORES.settings,'lowStock'))?.value??3);const q=$('#searchBox').value.trim().toLowerCase();const list=products.filter(p=>p.active!==false && (!q || `${p.title} ${p.artist} ${p.id}`.toLowerCase().includes(q)));const g=$('#productGrid');g.innerHTML='';for(const p of list){const c=document.createElement('article');c.className=`product-card ${p.stock<=0?'soldout':''}`;const url=await coverUrl(p.id);c.innerHTML=`<button class="add-zone" ${p.stock<=0?'disabled':''} data-add="${esc(p.id)}"><div class="cover">${url?`<img src="${url}" alt="">`:`<div class="cover-fallback">♪</div>`}<span class="stock-badge ${p.stock<=0?'zero':p.stock<=low?'low':''}">${p.stock<=0?'完売':`残 ${p.stock}`}</span></div><div class="product-body"><div class="product-title">${esc(p.title)}</div><div class="product-meta"><span class="muted">${esc(p.artist||'')}</span><span class="price">${yen(p.price)}</span></div></button><div class="product-body"><div class="media-actions"><button data-xfd="${esc(p.id)}">▶ XFD</button></div></div>`;g.appendChild(c)}
  $('#catalogSummary').textContent=`${list.length}作品 / 総在庫 ${list.reduce((a,p)=>a+Number(p.stock||0),0)}枚`;
  $$('[data-add]').forEach(b=>b.onclick=()=>addCart(b.dataset.add)); $$('[data-xfd]').forEach(b=>b.onclick=()=>playXfd(b.dataset.xfd));
}
function addCart(id){const p=products.find(x=>x.id===id);if(!p||p.stock<=0)return;const n=cart.get(id)||0;if(n>=p.stock){toast('在庫数を超えて追加できません');return;}cart.set(id,n+1);renderCart()}
function renderCart(){const box=$('#cartItems');box.innerHTML='';let total=0,units=0;if(!cart.size){box.className='cart-items empty-state';box.textContent='商品をタップすると追加されます。'} else {box.className='cart-items';for(const [id,q] of cart){const p=products.find(x=>x.id===id);if(!p)continue;units+=q;total+=p.price*q;const line=document.createElement('div');line.className='cart-line';line.innerHTML=`<div><strong>${esc(p.title)}</strong><div class="cart-sub">${yen(p.price)} × ${q} = ${yen(p.price*q)}</div></div><div class="qty"><button data-dec="${esc(id)}">−</button><span>${q}</span><button data-inc="${esc(id)}">＋</button></div>`;box.appendChild(line)}}
 $('#cartCount').textContent=`${units}点`;$('#cartTotal').textContent=yen(total);$('#checkout').disabled=units===0;$$('[data-dec]').forEach(b=>b.onclick=()=>{const n=(cart.get(b.dataset.dec)||0)-1;n<=0?cart.delete(b.dataset.dec):cart.set(b.dataset.dec,n);renderCart()});$$('[data-inc]').forEach(b=>b.onclick=()=>addCart(b.dataset.inc));}

async function checkout(){if(!cart.size)return;const event=$('#eventName').value.trim()||'未設定イベント';const saleId=uid('sale');const time=nowIso();let amount=0;for(const [id,q] of cart){const p=await getOne(STORES.products,id);if(!p||p.stock<q){toast(`${p?.title||id} の在庫が不足しています`);await refresh();return;}amount+=p.price*q;}for(const [id,q] of cart){const p=await getOne(STORES.products,id);p.stock-=q;await putOne(STORES.products,p);await putOne(STORES.sales,{id:uid('saleLine'),saleId,timestamp:time,event,payment,productId:p.id,title:p.title,quantity:q,unitPrice:p.price,subtotal:p.price*q,cancelled:false});await putOne(STORES.moves,{id:uid('move'),timestamp:time,productId:p.id,title:p.title,delta:-q,reason:'販売',event,note:'',saleId});}cart.clear();toast(`会計 ${yen(amount)} を記録しました`);await refresh();}

async function playXfd(id){
 const p=products.find(x=>x.id===id);const m=await getOne(STORES.media,`${id}:xfd`);
 if(!m?.blob){toast('XFDが未登録です');return;}
 const u=URL.createObjectURL(m.blob);mediaUrls.push(u);
 const mime=String(m.mime||m.blob.type||'').toLowerCase();const name=String(m.name||'').toLowerCase();
 const isVideo=mime.startsWith('video/')||/\.(mp4|m4v|mov|webm|ogv|ogg)$/.test(name);
 if(isVideo){
  $('#audioPlayer').pause();$('#playerBar').classList.add('hidden');
  $('#videoPlayer').src=u;$('#videoTitle').textContent=`${p?.title||id} / XFD`;
  const d=$('#videoDialog');if(!d.open)d.showModal();$('#videoPlayer').play().catch(()=>{});
 }else{
  $('#videoPlayer').pause();if($('#videoDialog').open)$('#videoDialog').close();
  $('#audioPlayer').src=u;$('#playerTitle').textContent=p?.title||id;$('#playerType').textContent='XFD（音声）';
  const cover=await coverUrl(id);$('#playerCover').src=cover||'./icons/icon-192.png';$('#playerBar').classList.remove('hidden');$('#audioPlayer').play().catch(()=>{});
 }
}

function parseCSV(text){text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quote){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"') quote=false;else cell+=ch;}else{if(ch==='"')quote=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=ch;}}if(cell.length||row.length){row.push(cell);rows.push(row)}return rows.filter(r=>r.some(x=>x!==''));}
function headerIndex(h, names){for(const n of names){const i=h.findIndex(x=>String(x).trim()===n);if(i>=0)return i}return -1}
async function importCsv(file){const rows=parseCSV(await file.text());if(rows.length<2)throw new Error('CSVにデータ行がありません');const h=rows[0].map(x=>x.trim());const ix={id:headerIndex(h,['商品ID','product_id','id']),title:headerIndex(h,['タイトル','title']),artist:headerIndex(h,['サークル・アーティスト','アーティスト','artist']),price:headerIndex(h,['頒布価格','価格','price']),stock:headerIndex(h,['現在庫','在庫','stock']),active:headerIndex(h,['有効','active']),date:headerIndex(h,['発行日','date']),note:headerIndex(h,['備考','note'])};if([ix.id,ix.title,ix.price,ix.stock].some(v=>v<0))throw new Error('必須列「商品ID / タイトル / 頒布価格 / 現在庫」が見つかりません');let add=0,upd=0;for(const r of rows.slice(1)){const id=(r[ix.id]||'').trim();if(!id)continue;const existing=await getOne(STORES.products,id);const next={id,title:(r[ix.title]||'').trim(),artist:ix.artist>=0?(r[ix.artist]||'').trim():(existing?.artist||''),price:Number(String(r[ix.price]||'0').replace(/[,¥￥]/g,''))||0,stock:Number(String(r[ix.stock]||'0').replace(/,/g,''))||0,active:ix.active>=0?!['×','false','0','no'].includes(String(r[ix.active]||'').trim().toLowerCase()):true,date:ix.date>=0?(r[ix.date]||'').trim():'',note:ix.note>=0?(r[ix.note]||'').trim():''};if(existing){if(Number(existing.stock)!==Number(next.stock))await putOne(STORES.moves,{id:uid('move'),timestamp:nowIso(),productId:id,title:next.title,delta:Number(next.stock)-Number(existing.stock),reason:'原票同期',event:$('#eventName').value.trim()||'',note:`CSV取込 ${existing.stock} → ${next.stock}`,saleId:''});upd++;}else add++;await putOne(STORES.products,next);}return{add,upd};}

function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function downloadCsv(name,rows){const text='\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
async function exportInventory(){const ps=await getAll(STORES.products);downloadCsv('doujinpos_inventory.csv',[['商品ID','タイトル','サークル・アーティスト','頒布価格','現在庫','有効','発行日','備考'],...ps.map(p=>[p.id,p.title,p.artist,p.price,p.stock,p.active===false?'×':'○',p.date,p.note])])}
async function exportSales(){const ss=await getAll(STORES.sales);downloadCsv('doujinpos_sales.csv',[['sale_line_id','sale_id','timestamp','event','payment','product_id','title','quantity','unit_price','subtotal','cancelled'],...ss.map(s=>[s.id,s.saleId,s.timestamp,s.event,s.payment,s.productId,s.title,s.quantity,s.unitPrice,s.subtotal,s.cancelled])])}
async function exportMoves(){const ms=await getAll(STORES.moves);downloadCsv('doujinpos_stock_movements.csv',[['movement_id','timestamp','product_id','title','delta','reason','event','note','sale_id'],...ms.map(m=>[m.id,m.timestamp,m.productId,m.title,m.delta,m.reason,m.event,m.note,m.saleId])])}


function filenameBase(name){return String(name||'').replace(/\.[^.]+$/,'').trim()}
function mediaNameKey(s){return String(s||'').trim().toLowerCase().replace(/[\s＿_－\-]+/g,'-')}
function matchProductForMedia(fileName){
 const base=filenameBase(fileName);const key=mediaNameKey(base);
 const exact=products.filter(p=>mediaNameKey(p.id)===key || mediaNameKey(p.title)===key);
 if(exact.length===1)return exact[0];
 const pref=products.filter(p=>{
  const id=mediaNameKey(p.id), title=mediaNameKey(p.title);
  return (id && (key.startsWith(id+'-'))) || (title && (key.startsWith(title+'-')));
 });
 return pref.length===1?pref[0]:null;
}
async function importBulkXfd(files){
 let ok=0;const unmatched=[];const overwritten=[];
 for(const file of [...files]){
  const p=matchProductForMedia(file.name);
  if(!p){unmatched.push(file.name);continue;}
  const old=await getOne(STORES.media,`${p.id}:xfd`);if(old)overwritten.push(p.id);
  await putOne(STORES.media,{id:`${p.id}:xfd`,productId:p.id,type:'xfd',name:file.name,mime:file.type,blob:file,updatedAt:nowIso()});ok++;
 }
 await renderAdmin();await renderProducts();
 return {ok,unmatched,overwritten:[...new Set(overwritten)]};
}

async function renderAdmin(){
 const tb=$('#inventoryTable tbody');tb.innerHTML='';
 for(const p of products){
   const tr=document.createElement('tr');tr.className='inventory-row';tr.dataset.product=p.id;tr.tabIndex=0;
   tr.innerHTML=`<td>${esc(p.id)}</td><td><strong>${esc(p.title)}</strong></td><td>${yen(p.price)}</td><td><strong>${p.stock}</strong></td><td><span class="status-pill ${p.active===false?'off':'on'}">${p.active===false?'停止':'有効'}</span></td><td class="row-more">•••</td>`;
   tr.onclick=()=>openProductActions(p.id);tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProductActions(p.id)}};tb.appendChild(tr)
 }
 const ml=$('#mediaList');ml.innerHTML='';
 for(const p of products){
  const states={};for(const type of ['cover','xfd'])states[type]=!!(await getOne(STORES.media,`${p.id}:${type}`));
  const row=document.createElement('div');row.className='media-row';
  row.innerHTML=`<div><div class="media-title">${esc(p.title)}</div><div class="muted">${esc(p.id)}</div></div>${['cover','xfd'].map(type=>`<div class="media-slot ${states[type]?'ready':''}"><label>${type==='cover'?'ジャケット':'XFD（音声/動画）'}${states[type]?' ✓':''}<input type="file" data-media="${type}" data-pid="${esc(p.id)}" accept="${type==='cover'?'image/*':'audio/*,video/*'}"></label></div>`).join('')}`;
  ml.appendChild(row)
 }
 $$('[data-media]').forEach(inp=>inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;await putOne(STORES.media,{id:`${inp.dataset.pid}:${inp.dataset.media}`,productId:inp.dataset.pid,type:inp.dataset.media,name:file.name,mime:file.type,blob:file,updatedAt:nowIso()});toast(`${file.name} を保存しました`);await renderAdmin();await renderProducts();});
}


async function logStockMove(p,delta,reason,note=''){
 if(!delta)return;
 await putOne(STORES.moves,{id:uid('move'),timestamp:nowIso(),productId:p.id,title:p.title,delta,reason,event:$('#eventName').value.trim()||'',note,saleId:''});
}

async function openProductActions(id){
 const p=await getOne(STORES.products,id);if(!p)return;
 selectedProductId=id;
 $('#actionProductTitle').textContent=p.title;
 $('#actionProductMeta').textContent=`${p.id} / ${yen(p.price)} / ${p.active===false?'販売停止':'有効'}`;
 $('#actionProductStock').textContent=p.stock;
 $('#toggleProduct').textContent=p.active===false?'販売を再開':'販売停止';
 const d=$('#productActionDialog');if(!d.open)d.showModal();
}

async function adjustStock(id,delta){
 const p=await getOne(STORES.products,id);if(!p)return;
 const before=Number(p.stock||0);const after=Math.max(0,before+Number(delta||0));
 if(after===before){toast('在庫はこれ以上減らせません');return;}
 p.stock=after;await putOne(STORES.products,p);await logStockMove(p,after-before,'手動調整',`${before} → ${after}`);
 await refresh();await openProductActions(id);toast(`在庫を ${after} 枚にしました`);
}

async function setStockDirect(id){
 const p=await getOne(STORES.products,id);if(!p)return;
 const raw=prompt(`${p.title} の現在庫を入力`,String(p.stock));if(raw===null)return;
 const n=Number(String(raw).trim());if(!Number.isInteger(n)||n<0){alert('在庫は0以上の整数で入力してください');return;}
 const before=Number(p.stock||0);if(n===before)return;p.stock=n;await putOne(STORES.products,p);await logStockMove(p,n-before,'手動調整',`在庫数指定 ${before} → ${n}`);
 await refresh();await openProductActions(id);toast(`在庫を ${n} 枚にしました`);
}

function clearProductForm(){
 editingProductId=null;$('#productFormTitle').textContent='商品を追加';$('#productId').value='';$('#productId').readOnly=false;$('#productTitle').value='';$('#productArtist').value=$('#circleName').value.trim()||'';$('#productPrice').value='1000';$('#productStock').value='0';$('#productDate').value='';$('#productActive').checked=true;$('#productNote').value='';
}

function openNewProductForm(){clearProductForm();const d=$('#productEditDialog');if(!d.open)d.showModal();setTimeout(()=>$('#productId').focus(),0)}

async function openEditProductForm(id){
 const p=await getOne(STORES.products,id);if(!p)return;editingProductId=id;$('#productFormTitle').textContent='商品情報を編集';$('#productId').value=p.id;$('#productId').readOnly=true;$('#productTitle').value=p.title||'';$('#productArtist').value=p.artist||'';$('#productPrice').value=Number(p.price||0);$('#productStock').value=Number(p.stock||0);$('#productDate').value=p.date||'';$('#productActive').checked=p.active!==false;$('#productNote').value=p.note||'';if($('#productActionDialog').open)$('#productActionDialog').close();const d=$('#productEditDialog');if(!d.open)d.showModal();
}

async function saveProductForm(e){
 e.preventDefault();
 const id=$('#productId').value.trim();const title=$('#productTitle').value.trim();const price=Number($('#productPrice').value);const stock=Number($('#productStock').value);
 if(!id||!title){alert('商品IDとタイトルは必須です');return}if(!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0){alert('価格・在庫を正しく入力してください');return}
 const existing=editingProductId?await getOne(STORES.products,editingProductId):await getOne(STORES.products,id);
 if(!editingProductId&&existing){alert('同じ商品IDがすでにあります');return}
 const p={id:editingProductId||id,title,artist:$('#productArtist').value.trim(),price,stock,active:$('#productActive').checked,date:$('#productDate').value,note:$('#productNote').value.trim()};
 await putOne(STORES.products,p);
 if(existing){const before=Number(existing.stock||0);if(before!==stock)await logStockMove(p,stock-before,'手動編集',`${before} → ${stock}`)}else if(stock!==0){await logStockMove(p,stock,'商品追加',`初期在庫 ${stock}`)}
 $('#productEditDialog').close();await refresh();toast(existing?'商品を更新しました':'商品を追加しました');
}

async function toggleSelectedProduct(){
 const p=await getOne(STORES.products,selectedProductId);if(!p)return;p.active=p.active===false;await putOne(STORES.products,p);await refresh();await openProductActions(p.id);toast(p.active?'販売を再開しました':'販売を停止しました');
}

async function deleteSelectedProduct(){
 const p=await getOne(STORES.products,selectedProductId);if(!p)return;
 if(!confirm(`「${p.title}」を商品一覧から削除しますか？\n販売履歴・在庫移動履歴は残ります。`))return;
 await delOne(STORES.products,p.id);for(const type of ['cover','xfd','mv'])await delOne(STORES.media,`${p.id}:${type}`);cart.delete(p.id);selectedProductId=null;if($('#productActionDialog').open)$('#productActionDialog').close();await refresh();toast('商品を削除しました');
}

async function renderHistory(){const ss=(await getAll(STORES.sales)).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));$('#salesCount').textContent=new Set(ss.map(s=>s.saleId)).size;$('#soldUnits').textContent=ss.reduce((a,s)=>a+Number(s.quantity||0),0);$('#salesAmount').textContent=yen(ss.reduce((a,s)=>a+Number(s.subtotal||0),0));const tb=$('#salesTable tbody');tb.innerHTML='';for(const s of ss.slice(0,200)){const tr=document.createElement('tr');tr.innerHTML=`<td>${localDate(s.timestamp)}</td><td>${esc(s.title)}</td><td>${s.quantity}</td><td>${yen(s.subtotal)}</td><td>${esc(s.payment)}</td>`;tb.appendChild(tr)}}

async function loadSettings(){const c=await getOne(STORES.settings,'circleName'),l=await getOne(STORES.settings,'lowStock'),e=await getOne(STORES.settings,'eventName');if(c)$('#circleName').value=c.value;if(l)$('#lowStock').value=l.value;if(e)$('#eventName').value=e.value;}
async function saveSettings(){await putOne(STORES.settings,{key:'circleName',value:$('#circleName').value.trim()});await putOne(STORES.settings,{key:'lowStock',value:Number($('#lowStock').value||3)});await putOne(STORES.settings,{key:'eventName',value:$('#eventName').value.trim()});toast('設定を保存しました');await renderProducts();}

function bind(){
 $('#searchBox').oninput=renderProducts;$('#clearCart').onclick=()=>{cart.clear();renderCart()};$('#checkout').onclick=checkout;
 $$('.pay').forEach(b=>b.onclick=()=>{$$('.pay').forEach(x=>x.classList.remove('active'));b.classList.add('active');payment=b.dataset.payment});
 $('#closePlayer').onclick=()=>{$('#audioPlayer').pause();$('#playerBar').classList.add('hidden')};
 $('#closeVideo').onclick=()=>{$('#videoPlayer').pause();$('#videoDialog').close()};
 $('#openAdmin').onclick=()=>$('#adminDialog').showModal();$('#closeAdmin').onclick=()=>$('#adminDialog').close();
 $('#addProduct').onclick=openNewProductForm;$('#closeProductAction').onclick=()=>$('#productActionDialog').close();$('#stockMinus1').onclick=()=>adjustStock(selectedProductId,-1);$('#stockPlus1').onclick=()=>adjustStock(selectedProductId,1);$('#setStock').onclick=()=>setStockDirect(selectedProductId);$('#editProduct').onclick=()=>openEditProductForm(selectedProductId);$('#toggleProduct').onclick=toggleSelectedProduct;$('#deleteProduct').onclick=deleteSelectedProduct;
 $('#closeProductEdit').onclick=()=>$('#productEditDialog').close();$('#cancelProductEdit').onclick=()=>$('#productEditDialog').close();$('#productForm').onsubmit=saveProductForm;
 $$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===t));$$('.admin-section').forEach(s=>s.classList.toggle('active',s.dataset.section===t.dataset.tab));});
 $('#inventoryCsv').onchange=async()=>{const f=$('#inventoryCsv').files?.[0];if(!f)return;try{const r=await importCsv(f);const n=$('#importResult');n.textContent=`取込完了：新規 ${r.add}件 / 更新 ${r.upd}件`;n.classList.remove('hidden');toast('在庫原票を取り込みました');await refresh();}catch(e){alert(`CSV取込エラー: ${e.message}`)}};
 $('#bulkXfd').onchange=async()=>{const fs=$('#bulkXfd').files;if(!fs?.length)return;try{const r=await importBulkXfd(fs);const box=$('#bulkMediaResult');let msg=`一括登録：${r.ok}件`;if(r.unmatched.length)msg+=` / 未一致 ${r.unmatched.length}件：${r.unmatched.join('、')}`;if(r.overwritten.length)msg+=` / 上書き ${r.overwritten.length}商品`;box.textContent=msg;box.classList.remove('hidden');toast(`${r.ok}件のXFDを登録しました`);}catch(e){alert(`XFD一括登録エラー: ${e.message}`)}finally{$('#bulkXfd').value='';}};
 $('#downloadInventory').onclick=exportInventory;$('#downloadSales').onclick=exportSales;$('#downloadMoves').onclick=exportMoves;$('#saveSettings').onclick=saveSettings;
 $('#installHelp').onclick=()=>$('#installDialog').showModal();$('#closeInstall').onclick=()=>$('#installDialog').close();
 $('#eventName').onchange=async()=>putOne(STORES.settings,{key:'eventName',value:$('#eventName').value.trim()});
 $('#resetAll').onclick=async()=>{if(!confirm('商品・履歴・保存メディアをすべて削除します。元に戻せません。よろしいですか？'))return;for(const s of Object.values(STORES))await clearStore(s);cart.clear();await seed();await loadSettings();await refresh();toast('初期化しました');};
}

const APP_VERSION='0.3.3';
function versionedPublicUrl(){
  const u=new URL(location.href);
  u.hash='';u.search='';u.searchParams.set('v',APP_VERSION);
  return u.toString();
}
async function forceUpdate(){
  try{
    if('serviceWorker'in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.update().catch(()=>{})));
    }
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('doujinpos-shell-')).map(k=>caches.delete(k)));
  }catch(e){console.warn(e)}
  const u=new URL(location.href);u.hash='';u.search='';u.searchParams.set('v',APP_VERSION);u.searchParams.set('refresh',Date.now());location.replace(u.toString());
}
function bindUpdateTools(){
  const url=versionedPublicUrl();
  const el=$('#publicUrl');if(el)el.textContent=url;
  const cp=$('#copyPublicUrl');if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('URLをコピーしました')}catch{prompt('このURLをコピーしてください',url)}};
  const fu=$('#forceUpdate');if(fu)fu.onclick=forceUpdate;
}

(async()=>{db=await openDB();await seed();await cleanupLegacySamples();await loadSettings();bind();bindUpdateTools();await refresh();if('serviceWorker'in navigator){try{const reg=await navigator.serviceWorker.register('./sw.js?v=6',{updateViaCache:'none'});reg.update().catch(()=>{});}catch(e){console.warn(e)}}})();
