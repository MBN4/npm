'use strict';

const nhs = 'https://www.nhs.uk/medicines/paracetamol-for-adults/';
const haleon = 'https://www.haleonhealthpartner.com/en-pk/pain-relief/brands/panadol/products/extra/';
const leaflet = 'https://www.medicines.org.uk/emc/product/4503/smpc';
const drap = 'https://eapp.dra.gov.pk/WebProductIndex.php?view=dospin';
const caution = 'Paracetamol allergy mein use na karein. Liver ya kidney disease, ya heavy alcohol use ho to pharmacist ya doctor se pehle baat karein.';
const overdose = 'Cold and flu medicines ka label bhi check karein. Do paracetamol products ek saath lene se overdose ho sakta hai. Extra dose ho jaye to foran medical help lein, chahe tabiyat theek lag rahi ho.';
const effects = 'Sahi use par side effects rare hain. Rash, chehre ya galay ki sujan, ya saans mein mushkil severe allergy ho sakti hai. Foran medical help lein.';
const interactions = 'Warfarin ke saath regular use bleeding risk barha sakta hai. Flucloxacillin, metoclopramide ya domperidone le rahe hon to pharmacist ko batayein.';
const products = [
  {id:'extra',name:'Panadol Extra',pack:'Panadol',variant:'Extra',strength:'Paracetamol 500 mg + caffeine 65 mg per tablet',dose:'500 mg + 65 mg',cat:'OTC',tone:'pink',info:{
    'Uses':'Dard aur bukhar ke symptoms ke liye. Caffeine pain-relief effect ko support karta hai.',
    'Strength & brands':'Har tablet mein paracetamol 500 mg aur caffeine 65 mg hai. Pakistan ka example Panadol Extra hai. Hamesha exact pack par ingredients aur strength dekhein.',
    'Side effects':effects+' Caffeine se bechaini, neend ki mushkil ya dil ki dharkan mehsoos ho sakti hai.',
    'Contraindications':caution+' Caffeine ya kisi aur ingredient se allergy ho to bhi use na karein.',
    'Interactions':interactions+' Lithium le rahe hon to pehle pharmacist ya prescriber se poochhein. Zyada chai, coffee ya energy drinks se caffeine intake barh sakti hai.',
    'Pregnancy & feeding':'Caffeine wali yeh combination pregnancy mein recommended nahi hai. Breastfeeding mein plain paracetamol aam tor par preferred hoti hai. Apne pack ka leaflet check karein.',
    'Safe use':overdose
  },sources:[['Haleon Pakistan · Panadol Extra',haleon],['Haleon UK · combination product information',leaflet],['NHS · paracetamol',nhs]]},
  {id:'plain',name:'Paracetamol',pack:'Panadol',variant:'Regular',strength:'Paracetamol 500 mg per tablet',dose:'500 mg',cat:'OTC',tone:'blue',info:{
    'Uses':'Dard aur bukhar kam karne wali medicine. Misal ke taur par headache, toothache aur body aches mein symptoms kam kar sakti hai.',
    'Strength & brands':'Generic paracetamol, jise acetaminophen bhi kehte hain. Is sample mein 500 mg per tablet hai. Punjab formulary mein plain Panadol, Calpol, Disprol, Febrol aur Relifal ke 500 mg tablet examples listed hain. Current formulation aur availability DRAP registry aur pack se verify karein.',
    'Side effects':effects,
    'Contraindications':caution,
    'Interactions':interactions,
    'Pregnancy & feeding':'Plain paracetamol aam tor par pregnancy aur breastfeeding mein preferred painkiller hoti hai. Zaroorat par lowest effective dose aur shortest time ke liye use karein.',
    'Safe use':overdose
  },sources:[['NHS · paracetamol',nhs],['DRAP · registered product lookup',drap],['Punjab Health · formulary','https://pshealthpunjab.gov.pk/Upload/notifications/flggz0rx.idd9203843.pdf'],['Haleon Pakistan · Panadol range','https://www.haleon.pk/our-brands/panadol/']]},
  {id:'rx',name:'Prescription medicines',strength:'Prescription review',cat:'Prescription',tone:'blue'},
  {id:'multi',name:'Daily Multivitamin',strength:'Sample product · label varies by brand',cat:'Multivitamins',tone:'gold'}
];
const $ = id => document.getElementById(id);
const btn = (label,handler,css='') => {
  const el = document.createElement('button');
  el.type='button'; el.textContent=label; el.className=css; el.addEventListener('click',handler);
  return el;
};
const p = (value,css='') => {
  const el = document.createElement('p'); el.textContent=value; el.className=css; return el;
};
const panel=$('panel'), body=$('panel-body');
const cart=new Map(), applications=[];
let category='All', featured=products[0], query='', mobileCountry;
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let paused=motion.matches;

function showPanel(title,...children){
  $('panel-title').textContent=title;
  body.replaceChildren(...children);
  if(!panel.open) panel.showModal();
}
$('close').addEventListener('click',()=>panel.close());

function showBranch(label){
  for(const button of $('branches').children) button.setAttribute('aria-pressed',String(button.textContent===label));
  const title=document.createElement('h3'); title.textContent=label;
  const content=$('branch-content');
  content.replaceChildren(title);
  if(label==='Sources'){
    const list=document.createElement('ul');
    for(const [name,url] of featured.sources){
      const li=document.createElement('li'), a=document.createElement('a');
      a.textContent=name; a.href=url; a.target='_blank'; a.rel='noopener noreferrer';
      li.append(a); list.append(li);
    }
    content.append(list);
  }else content.append(p(featured.info[label]));
}

function setFeatured(product){
  featured=product;
  $('pack-name').textContent=product.pack;
  $('pack-variant').textContent=product.variant;
  $('pack-dose').textContent=product.strength;
  $('featured-name').textContent=product.name;
  $('pack-back-name').textContent=product.id==='plain'?'Panadol Regular':product.name;
  $('pack-back-strength').textContent=product.strength;
  $('pack-stage').dataset.variant=product.id;
  const art=$('pack-art');
  art.hidden=true;
  art.onload=()=>{art.hidden=false;};
  art.onerror=()=>{art.hidden=true;};
  art.src='/site/assets/pack-'+product.id+'-front.webp';
  if(art.complete&&art.naturalWidth)art.hidden=false;
  $('tablet').parentElement.classList.remove('revealed');
}
function openMap(){
  $('detail-name').textContent=featured.name;
  $('detail-strength').textContent=featured.strength;
  const hub=document.createElement('span');
  hub.className='map-hub';
  hub.textContent=featured.name;
  $('branches').replaceChildren(hub,...[...Object.keys(featured.info),'Sources'].map(label=>btn(label,()=>showBranch(label))));
  $('details').hidden=false;
  showBranch('Uses');
  $('details').scrollIntoView({behavior:motion.matches?'instant':'smooth',block:'nearest'});
}
function setPaused(value){
  paused=value;
  $('box').classList.toggle('paused',paused);
  $('rotate').textContent=paused?'Play rotation':'Pause rotation';
  $('rotate').setAttribute('aria-pressed',String(paused));
}
setFeatured(featured);
setPaused(paused);
const packStage=$('pack-stage'), packBox=$('box');
let manualAngle=-20, drag;
function turnPack(angle){
  manualAngle=angle;
  packBox.style.setProperty('--manual-angle',angle+'deg');
  packBox.classList.add('manual');
  setPaused(true);
}
$('rotate').onclick=()=>{
  if(paused)packBox.classList.remove('manual');
  packBox.classList.toggle('motion-ok',paused && motion.matches);
  setPaused(!paused);
};
$('turn-pack').onclick=()=>turnPack(manualAngle+45);
packStage.onpointerdown=event=>{
  if(!event.isPrimary||event.button!==0)return;
  drag={x:event.clientX,angle:manualAngle};
  packStage.setPointerCapture(event.pointerId);
};
packStage.onpointermove=event=>{
  if(!drag||!event.isPrimary)return;
  const distance=event.clientX-drag.x;
  if(Math.abs(distance)>3)turnPack(drag.angle+distance*.72);
};
packStage.onpointerup=packStage.onpointercancel=()=>{drag=null;};
$('extract').onclick=()=>{
  turnPack(-20);
  const scene=$('tablet').parentElement;
  scene.classList.remove('revealed');
  requestAnimationFrame(()=>requestAnimationFrame(()=>scene.classList.add('revealed')));
  $('details').hidden ? setTimeout(openMap,motion.matches?0:580) : openMap();
};
$('close-map').onclick=()=>{
  $('details').hidden=true;
  $('extract').focus();
};

function renderProducts(){
  const matches=products.filter(product=>(category==='All'||category===product.cat)&&
    (product.name+' '+product.strength+' '+(product.id==='plain'?'Panadol plain acetaminophen':'')).toLowerCase().includes(query));
  $('products').replaceChildren();
  if(!matches.length) $('products').append(p('No matching medicine. Try another brand or ingredient.','muted'));
  for(const product of matches){
    const card=document.createElement('article'); card.className='product';
    const art=document.createElement('div'); art.className='visual '+product.tone;
    if(product.info){
      const pack=document.createElement('img');
      pack.src='/site/assets/pack-'+product.id+'-photo.webp'; pack.alt=''; pack.loading='lazy';
      art.append(pack);
    }else{
      const pack=document.createElement('span'); pack.className='mini-pack';
      pack.textContent=product.id==='rx'?'Rx Review':product.name; art.append(pack);
    }
    const tag=document.createElement('small'); tag.textContent=product.cat;
    const title=document.createElement('h3'); title.textContent=product.name;
    const actions=document.createElement('div'); actions.className='actions';
    if(product.info) actions.append(btn('Explore',()=>{setFeatured(product);openMap();},'outline'));
    if(product.id==='rx') actions.append(btn('Review process',()=>showPanel('Prescription review',p('Pharmacist review is required before a prescription order can be accepted. Prescription uploads are disabled in this preview.','notice')),'outline'));
    else actions.append(btn('Add to cart',()=>{cart.set(product.id,(cart.get(product.id)||0)+1);renderCartCount();}));
    card.append(art,tag,title,p(product.strength),actions);
    $('products').append(card);
  }
}
function selectCategory(value){
  category=value;
  for(const button of $('filters').querySelectorAll('button')) button.setAttribute('aria-pressed',String(button.dataset.cat===value));
  renderProducts();
}
$('filters').onclick=event=>{const filter=event.target.closest('button[data-cat]');if(filter)selectCategory(filter.dataset.cat);};
$('query').oninput=event=>{query=event.target.value.trim().toLowerCase();if(query && category!=='All')selectCategory('All');else renderProducts();};
$('search').onsubmit=event=>{event.preventDefault();$('catalog').scrollIntoView({behavior:motion.matches?'instant':'smooth'});};
renderProducts();

function renderCartCount(){ $('count').textContent=[...cart.values()].reduce((sum,count)=>sum+count,0); }
function openCart(){
  showPanel('Your cart',p(cart.size?'Preview only. Prices, availability and payment are disabled.':'Your cart is empty.','notice'));
  for(const [id,qty] of cart){
    const product=products.find(item=>item.id===id), row=document.createElement('div');
    row.className='item-row';
    row.append(p(product.name+' × '+qty),btn('Remove one',()=>{if(qty===1)cart.delete(id);else cart.set(id,qty-1);renderCartCount();openCart();},'outline'));
    body.append(row);
  }
  if(cart.size) body.append(btn('Guest checkout',()=>showPanel('Guest checkout',p('Delivery and pharmacy pickup are available as preview choices.','notice'),checkoutForm())));
}
function checkoutForm(){
  const form=document.createElement('form');
  form.innerHTML='<fieldset><legend>Fulfilment</legend><label><input type="radio" name="fulfilment" value="pickup" checked> Pharmacy pickup</label><label><input type="radio" name="fulfilment" value="delivery"> Delivery</label></fieldset><button>Preview order summary</button>';
  form.onsubmit=event=>{event.preventDefault();const delivery=new FormData(form).get('fulfilment');showPanel('Order preview',p('Selected fulfilment: '+(delivery==='pickup'?'Pharmacy pickup':'Delivery')),p('Demo complete. No order or payment was sent.','notice'),btn('Back to cart',openCart,'outline'));};
  return form;
}
$('bag').onclick=openCart;

// International calling codes. Shared numbering plans use their common prefix.
const callingCodes = `US:1 CA:1 AG:1 AI:1 AS:1 BB:1 BM:1 BS:1 DM:1 DO:1 GD:1 GU:1 JM:1 KN:1 KY:1 LC:1 MP:1 MS:1 PR:1 SX:1 TC:1 TT:1 VC:1 VG:1 VI:1 RU:7 KZ:7 EG:20 ZA:27 GR:30 NL:31 BE:32 FR:33 ES:34 HU:36 IT:39 VA:39 RO:40 CH:41 AT:43 GB:44 GG:44 IM:44 JE:44 DK:45 SE:46 NO:47 SJ:47 PL:48 DE:49 PE:51 MX:52 CU:53 AR:54 BR:55 CL:56 CO:57 VE:58 MY:60 AU:61 CC:61 CX:61 ID:62 PH:63 NZ:64 PN:64 SG:65 TH:66 JP:81 KR:82 VN:84 CN:86 TR:90 IN:91 PK:92 AF:93 LK:94 MM:95 IR:98 SS:211 MA:212 EH:212 DZ:213 TN:216 LY:218 GM:220 SN:221 MR:222 ML:223 GN:224 CI:225 BF:226 NE:227 TG:228 BJ:229 MU:230 LR:231 SL:232 GH:233 NG:234 TD:235 CF:236 CM:237 CV:238 ST:239 GQ:240 GA:241 CG:242 CD:243 AO:244 GW:245 IO:246 AC:247 SC:248 SD:249 RW:250 ET:251 SO:252 DJ:253 KE:254 TZ:255 UG:256 BI:257 MZ:258 ZM:260 MG:261 RE:262 YT:262 ZW:263 NA:264 MW:265 LS:266 BW:267 SZ:268 KM:269 SH:290 TA:290 ER:291 AW:297 FO:298 GL:299 GI:350 PT:351 LU:352 IE:353 IS:354 AL:355 MT:356 CY:357 FI:358 AX:358 BG:359 LT:370 LV:371 EE:372 MD:373 AM:374 BY:375 AD:376 MC:377 SM:378 UA:380 RS:381 ME:382 XK:383 HR:385 SI:386 BA:387 MK:389 CZ:420 SK:421 LI:423 FK:500 GS:500 BZ:501 GT:502 SV:503 HN:504 NI:505 CR:506 PA:507 PM:508 HT:509 GP:590 BL:590 MF:590 BO:591 GY:592 EC:593 GF:594 PY:595 MQ:596 SR:597 UY:598 CW:599 BQ:599 TL:670 NF:672 AQ:672 BN:673 NR:674 PG:675 TO:676 SB:677 VU:678 FJ:679 PW:680 WF:681 CK:682 NU:683 WS:685 KI:686 NC:687 TV:688 PF:689 TK:690 FM:691 MH:692 KP:850 HK:852 MO:853 KH:855 LA:856 BD:880 TW:886 MV:960 LB:961 JO:962 SY:963 IQ:964 KW:965 SA:966 YE:967 OM:968 PS:970 AE:971 IL:972 BH:973 QA:974 BT:975 MN:976 NP:977 TJ:992 TM:993 AZ:994 GE:995 KG:996 UZ:998`;
const regionNames=new Intl.DisplayNames(['en'],{type:'region'});
const regions=callingCodes.split(' ').map(entry=>{
  const [iso,code]=entry.split(':');
  return {iso,code,name:regionNames.of(iso)};
}).sort((a,b)=>a.name.localeCompare(b.name));
const byIso=Object.fromEntries(regions.map(region=>[region.iso,region]));

const zones={"Europe/Andorra":"AD","Asia/Dubai":"AE","Asia/Kabul":"AF","America/Antigua":"AG","America/Anguilla":"AI","Europe/Tirane":"AL","Asia/Yerevan":"AM","Africa/Luanda":"AO","Antarctica/McMurdo":"AQ","Antarctica/Casey":"AQ","Antarctica/Davis":"AQ","Antarctica/DumontDUrville":"AQ","Antarctica/Mawson":"AQ","Antarctica/Palmer":"AQ","Antarctica/Rothera":"AQ","Antarctica/Syowa":"AQ","Antarctica/Troll":"AQ","Antarctica/Vostok":"AQ","America/Argentina/Buenos_Aires":"AR","America/Argentina/Cordoba":"AR","America/Argentina/Salta":"AR","America/Argentina/Jujuy":"AR","America/Argentina/Tucuman":"AR","America/Argentina/Catamarca":"AR","America/Argentina/La_Rioja":"AR","America/Argentina/San_Juan":"AR","America/Argentina/Mendoza":"AR","America/Argentina/San_Luis":"AR","America/Argentina/Rio_Gallegos":"AR","America/Argentina/Ushuaia":"AR","Pacific/Pago_Pago":"AS","Europe/Vienna":"AT","Australia/Lord_Howe":"AU","Antarctica/Macquarie":"AU","Australia/Hobart":"AU","Australia/Melbourne":"AU","Australia/Sydney":"AU","Australia/Broken_Hill":"AU","Australia/Brisbane":"AU","Australia/Lindeman":"AU","Australia/Adelaide":"AU","Australia/Darwin":"AU","Australia/Perth":"AU","Australia/Eucla":"AU","America/Aruba":"AW","Europe/Mariehamn":"AX","Asia/Baku":"AZ","Europe/Sarajevo":"BA","America/Barbados":"BB","Asia/Dhaka":"BD","Europe/Brussels":"BE","Africa/Ouagadougou":"BF","Europe/Sofia":"BG","Asia/Bahrain":"BH","Africa/Bujumbura":"BI","Africa/Porto-Novo":"BJ","America/St_Barthelemy":"BL","Atlantic/Bermuda":"BM","Asia/Brunei":"BN","America/La_Paz":"BO","America/Kralendijk":"BQ","America/Noronha":"BR","America/Belem":"BR","America/Fortaleza":"BR","America/Recife":"BR","America/Araguaina":"BR","America/Maceio":"BR","America/Bahia":"BR","America/Sao_Paulo":"BR","America/Campo_Grande":"BR","America/Cuiaba":"BR","America/Santarem":"BR","America/Porto_Velho":"BR","America/Boa_Vista":"BR","America/Manaus":"BR","America/Eirunepe":"BR","America/Rio_Branco":"BR","America/Nassau":"BS","Asia/Thimphu":"BT","Africa/Gaborone":"BW","Europe/Minsk":"BY","America/Belize":"BZ","America/St_Johns":"CA","America/Halifax":"CA","America/Glace_Bay":"CA","America/Moncton":"CA","America/Goose_Bay":"CA","America/Blanc-Sablon":"CA","America/Toronto":"CA","America/Iqaluit":"CA","America/Atikokan":"CA","America/Winnipeg":"CA","America/Resolute":"CA","America/Rankin_Inlet":"CA","America/Regina":"CA","America/Swift_Current":"CA","America/Edmonton":"CA","America/Cambridge_Bay":"CA","America/Inuvik":"CA","America/Vancouver":"CA","America/Creston":"CA","America/Dawson_Creek":"CA","America/Fort_Nelson":"CA","America/Whitehorse":"CA","America/Dawson":"CA","Indian/Cocos":"CC","Africa/Kinshasa":"CD","Africa/Lubumbashi":"CD","Africa/Bangui":"CF","Africa/Brazzaville":"CG","Europe/Zurich":"CH","Africa/Abidjan":"CI","Pacific/Rarotonga":"CK","America/Santiago":"CL","America/Coyhaique":"CL","America/Punta_Arenas":"CL","Pacific/Easter":"CL","Africa/Douala":"CM","Asia/Shanghai":"CN","Asia/Urumqi":"CN","America/Bogota":"CO","America/Costa_Rica":"CR","America/Havana":"CU","Atlantic/Cape_Verde":"CV","America/Curacao":"CW","Indian/Christmas":"CX","Asia/Nicosia":"CY","Asia/Famagusta":"CY","Europe/Prague":"CZ","Europe/Berlin":"DE","Europe/Busingen":"DE","Africa/Djibouti":"DJ","Europe/Copenhagen":"DK","America/Dominica":"DM","America/Santo_Domingo":"DO","Africa/Algiers":"DZ","America/Guayaquil":"EC","Pacific/Galapagos":"EC","Europe/Tallinn":"EE","Africa/Cairo":"EG","Africa/El_Aaiun":"EH","Africa/Asmara":"ER","Europe/Madrid":"ES","Africa/Ceuta":"ES","Atlantic/Canary":"ES","Africa/Addis_Ababa":"ET","Europe/Helsinki":"FI","Pacific/Fiji":"FJ","Atlantic/Stanley":"FK","Pacific/Chuuk":"FM","Pacific/Pohnpei":"FM","Pacific/Kosrae":"FM","Atlantic/Faroe":"FO","Europe/Paris":"FR","Africa/Libreville":"GA","Europe/London":"GB","America/Grenada":"GD","Asia/Tbilisi":"GE","America/Cayenne":"GF","Europe/Guernsey":"GG","Africa/Accra":"GH","Europe/Gibraltar":"GI","America/Nuuk":"GL","America/Danmarkshavn":"GL","America/Scoresbysund":"GL","America/Thule":"GL","Africa/Banjul":"GM","Africa/Conakry":"GN","America/Guadeloupe":"GP","Africa/Malabo":"GQ","Europe/Athens":"GR","Atlantic/South_Georgia":"GS","America/Guatemala":"GT","Pacific/Guam":"GU","Africa/Bissau":"GW","America/Guyana":"GY","Asia/Hong_Kong":"HK","America/Tegucigalpa":"HN","Europe/Zagreb":"HR","America/Port-au-Prince":"HT","Europe/Budapest":"HU","Asia/Jakarta":"ID","Asia/Pontianak":"ID","Asia/Makassar":"ID","Asia/Jayapura":"ID","Europe/Dublin":"IE","Asia/Jerusalem":"IL","Europe/Isle_of_Man":"IM","Asia/Kolkata":"IN","Indian/Chagos":"IO","Asia/Baghdad":"IQ","Asia/Tehran":"IR","Atlantic/Reykjavik":"IS","Europe/Rome":"IT","Europe/Jersey":"JE","America/Jamaica":"JM","Asia/Amman":"JO","Asia/Tokyo":"JP","Africa/Nairobi":"KE","Asia/Bishkek":"KG","Asia/Phnom_Penh":"KH","Pacific/Tarawa":"KI","Pacific/Kanton":"KI","Pacific/Kiritimati":"KI","Indian/Comoro":"KM","America/St_Kitts":"KN","Asia/Pyongyang":"KP","Asia/Seoul":"KR","Asia/Kuwait":"KW","America/Cayman":"KY","Asia/Almaty":"KZ","Asia/Qyzylorda":"KZ","Asia/Qostanay":"KZ","Asia/Aqtobe":"KZ","Asia/Aqtau":"KZ","Asia/Atyrau":"KZ","Asia/Oral":"KZ","Asia/Vientiane":"LA","Asia/Beirut":"LB","America/St_Lucia":"LC","Europe/Vaduz":"LI","Asia/Colombo":"LK","Africa/Monrovia":"LR","Africa/Maseru":"LS","Europe/Vilnius":"LT","Europe/Luxembourg":"LU","Europe/Riga":"LV","Africa/Tripoli":"LY","Africa/Casablanca":"MA","Europe/Monaco":"MC","Europe/Chisinau":"MD","Europe/Podgorica":"ME","America/Marigot":"MF","Indian/Antananarivo":"MG","Pacific/Majuro":"MH","Pacific/Kwajalein":"MH","Europe/Skopje":"MK","Africa/Bamako":"ML","Asia/Yangon":"MM","Asia/Ulaanbaatar":"MN","Asia/Hovd":"MN","Asia/Macau":"MO","Pacific/Saipan":"MP","America/Martinique":"MQ","Africa/Nouakchott":"MR","America/Montserrat":"MS","Europe/Malta":"MT","Indian/Mauritius":"MU","Indian/Maldives":"MV","Africa/Blantyre":"MW","America/Mexico_City":"MX","America/Cancun":"MX","America/Merida":"MX","America/Monterrey":"MX","America/Matamoros":"MX","America/Chihuahua":"MX","America/Ciudad_Juarez":"MX","America/Ojinaga":"MX","America/Mazatlan":"MX","America/Bahia_Banderas":"MX","America/Hermosillo":"MX","America/Tijuana":"MX","Asia/Kuala_Lumpur":"MY","Asia/Kuching":"MY","Africa/Maputo":"MZ","Africa/Windhoek":"NA","Pacific/Noumea":"NC","Africa/Niamey":"NE","Pacific/Norfolk":"NF","Africa/Lagos":"NG","America/Managua":"NI","Europe/Amsterdam":"NL","Europe/Oslo":"NO","Asia/Kathmandu":"NP","Pacific/Nauru":"NR","Pacific/Niue":"NU","Pacific/Auckland":"NZ","Pacific/Chatham":"NZ","Asia/Muscat":"OM","America/Panama":"PA","America/Lima":"PE","Pacific/Tahiti":"PF","Pacific/Marquesas":"PF","Pacific/Gambier":"PF","Pacific/Port_Moresby":"PG","Pacific/Bougainville":"PG","Asia/Manila":"PH","Asia/Karachi":"PK","Europe/Warsaw":"PL","America/Miquelon":"PM","Pacific/Pitcairn":"PN","America/Puerto_Rico":"PR","Asia/Gaza":"PS","Asia/Hebron":"PS","Europe/Lisbon":"PT","Atlantic/Madeira":"PT","Atlantic/Azores":"PT","Pacific/Palau":"PW","America/Asuncion":"PY","Asia/Qatar":"QA","Indian/Reunion":"RE","Europe/Bucharest":"RO","Europe/Belgrade":"RS","Europe/Kaliningrad":"RU","Europe/Moscow":"RU","Europe/Simferopol":"UA","Europe/Kirov":"RU","Europe/Volgograd":"RU","Europe/Astrakhan":"RU","Europe/Saratov":"RU","Europe/Ulyanovsk":"RU","Europe/Samara":"RU","Asia/Yekaterinburg":"RU","Asia/Omsk":"RU","Asia/Novosibirsk":"RU","Asia/Barnaul":"RU","Asia/Tomsk":"RU","Asia/Novokuznetsk":"RU","Asia/Krasnoyarsk":"RU","Asia/Irkutsk":"RU","Asia/Chita":"RU","Asia/Yakutsk":"RU","Asia/Khandyga":"RU","Asia/Vladivostok":"RU","Asia/Ust-Nera":"RU","Asia/Magadan":"RU","Asia/Sakhalin":"RU","Asia/Srednekolymsk":"RU","Asia/Kamchatka":"RU","Asia/Anadyr":"RU","Africa/Kigali":"RW","Asia/Riyadh":"SA","Pacific/Guadalcanal":"SB","Indian/Mahe":"SC","Africa/Khartoum":"SD","Europe/Stockholm":"SE","Asia/Singapore":"SG","Atlantic/St_Helena":"SH","Europe/Ljubljana":"SI","Arctic/Longyearbyen":"SJ","Europe/Bratislava":"SK","Africa/Freetown":"SL","Europe/San_Marino":"SM","Africa/Dakar":"SN","Africa/Mogadishu":"SO","America/Paramaribo":"SR","Africa/Juba":"SS","Africa/Sao_Tome":"ST","America/El_Salvador":"SV","America/Lower_Princes":"SX","Asia/Damascus":"SY","Africa/Mbabane":"SZ","America/Grand_Turk":"TC","Africa/Ndjamena":"TD","Indian/Kerguelen":"TF","Africa/Lome":"TG","Asia/Bangkok":"TH","Asia/Dushanbe":"TJ","Pacific/Fakaofo":"TK","Asia/Dili":"TL","Asia/Ashgabat":"TM","Africa/Tunis":"TN","Pacific/Tongatapu":"TO","Europe/Istanbul":"TR","America/Port_of_Spain":"TT","Pacific/Funafuti":"TV","Asia/Taipei":"TW","Africa/Dar_es_Salaam":"TZ","Europe/Kyiv":"UA","Africa/Kampala":"UG","Pacific/Midway":"UM","Pacific/Wake":"UM","America/New_York":"US","America/Detroit":"US","America/Kentucky/Louisville":"US","America/Kentucky/Monticello":"US","America/Indiana/Indianapolis":"US","America/Indiana/Vincennes":"US","America/Indiana/Winamac":"US","America/Indiana/Marengo":"US","America/Indiana/Petersburg":"US","America/Indiana/Vevay":"US","America/Chicago":"US","America/Indiana/Tell_City":"US","America/Indiana/Knox":"US","America/Menominee":"US","America/North_Dakota/Center":"US","America/North_Dakota/New_Salem":"US","America/North_Dakota/Beulah":"US","America/Denver":"US","America/Boise":"US","America/Phoenix":"US","America/Los_Angeles":"US","America/Anchorage":"US","America/Juneau":"US","America/Sitka":"US","America/Metlakatla":"US","America/Yakutat":"US","America/Nome":"US","America/Adak":"US","Pacific/Honolulu":"US","America/Montevideo":"UY","Asia/Samarkand":"UZ","Asia/Tashkent":"UZ","Europe/Vatican":"VA","America/St_Vincent":"VC","America/Caracas":"VE","America/Tortola":"VG","America/St_Thomas":"VI","Asia/Ho_Chi_Minh":"VN","Pacific/Efate":"VU","Pacific/Wallis":"WF","Pacific/Apia":"WS","Asia/Aden":"YE","Indian/Mayotte":"YT","Africa/Johannesburg":"ZA","Africa/Lusaka":"ZM","Africa/Harare":"ZW","Asia/Calcutta":"IN","US/Eastern":"US","US/Central":"US","US/Pacific":"US","US/Mountain":"US","Europe/Kiev":"UA","Asia/Katmandu":"NP"};

function detectedRegion(){
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  if(byIso[zones[timezone]])return byIso[zones[timezone]];
  for(const language of navigator.languages||[navigator.language]){
    try{
      const region=new Intl.Locale(language).region;
      if(region && byIso[region] && language!=='en-US') return byIso[region];
    }catch{}
  }
  try{return byIso[new Intl.Locale(navigator.language).region]||byIso.PK;}catch{return byIso.PK;}
}
function setupPicker(form){
  const input=form.querySelector('#region-search'), options=form.querySelector('#region-options'), note=form.querySelector('#country-note');
  const label=region=>region.name+' (+'+region.code+')';
  function select(region,automatic){
    mobileCountry=region;
    input.value=label(region);
    note.textContent=automatic?'Suggested from browser settings. You can change it.':'Selected manually.';
    options.hidden=true;
    input.setAttribute('aria-expanded','false');
  }
  function list(search){
    const term=search.trim().toLowerCase();
    const matched=regions.filter(region=>region.name.toLowerCase().includes(term)||region.iso.toLowerCase()===term||('+'+region.code).includes(term));
    options.replaceChildren(...matched.map(region=>btn(label(region),()=>{select(region,false);input.focus();options.hidden=true;input.setAttribute('aria-expanded','false');})));
    if(!matched.length) options.append(p('No country matches.'));
    options.hidden=false;
    input.setAttribute('aria-expanded','true');
  }
  select(detectedRegion(),true);
  input.onfocus=()=>{input.select();list('');};
  input.oninput=()=>{mobileCountry=null;note.textContent='Choose a country from the results.';list(input.value);};
  input.onkeydown=event=>{
    if(event.key==='ArrowDown'){event.preventDefault();options.querySelector('button')?.focus();}
    if(event.key==='Escape'&&!options.hidden){event.preventDefault();event.stopPropagation();options.hidden=true;input.setAttribute('aria-expanded','false');}
  };
  form.querySelector('#auto-country').onclick=()=>select(detectedRegion(),true);
}

function openApplication(){
  const form=document.createElement('form');
  form.innerHTML='<label>Full name<input name="name" maxlength="80" placeholder="Demo Student" required></label><label>Email<input name="email" type="email" placeholder="student@example.com" required></label><label>Age<input name="age" type="number" min="1" max="120" required></label><label>Field of study or profession<select name="field" required><option value="">Choose your field</option><option>Pre-medical student</option><option>Medical student</option><option>Pharm-D or B.Pharm student</option><option>Pharmacist</option><option>Pharmacy technician (Category B)</option><option>Nurse or nursing student</option><option>Allied health</option><option>Other health sciences</option></select></label><div class="picker"><label for="region-search">Country or calling code</label><input id="region-search" type="search" autocomplete="off" aria-controls="region-options" aria-expanded="false"><div class="choices" id="region-options" hidden></div><small id="country-note"></small></div><button type="button" id="auto-country" class="outline">Use detected country</button><label>Mobile number<input name="mobile" type="tel" inputmode="tel" required placeholder="300 000 0000"></label><p class="muted" role="status" id="application-status"></p><button>Submit demo request</button>';
  form.onsubmit=event=>{
    event.preventDefault();
    const data=new FormData(form);
    const status=form.querySelector('#application-status');
    if(!mobileCountry){status.textContent='Select a country from the search results.';return;}
    const mobile=String(data.get('mobile')).replace(/[\s()-]/g,'');
    if(!/^\d{5,14}$/.test(mobile)||mobileCountry.code.length+mobile.length>15){status.textContent='Enter a valid national number without the calling code.';return;}
    const email=String(data.get('email')).trim().toLowerCase();
    if(!/^[^@]+@example\.(com|net|org)$/.test(email)){status.textContent='For the preview, enter a sample email such as student@example.com.';return;}
    if(applications.some(application=>application.email===email)){status.textContent='A request already exists for this sample email.';return;}
    applications.push({email,name:String(data.get('name')).trim(),field:data.get('field'),status:'Pending'});
    showPanel('Request submitted',p('Your demo application is pending review. No email was sent.','notice'),btn('Open reviewer preview',openReview));
  };
  showPanel('Request student access',p('Use sample details only. The test application resets when this page reloads.','notice'),form);
  setupPicker(form);
}
$('apply').onclick=openApplication;

function openReview(){
  showPanel('Reviewer dashboard',p('Preview email notifications and approval decisions here.','notice'));
  if(!applications.length)body.append(p('No applications yet. Submit a sample request first.'));
  for(const application of applications){
    const row=document.createElement('article'); row.className='study-card';
    const title=document.createElement('strong'); title.textContent=application.name;
    row.append(title,p(application.email+' · '+application.field),p('Status: '+application.status));
    const email=document.createElement('details'); email.className='study-card';
    const summary=document.createElement('summary'); summary.textContent='Review email preview';
    email.append(summary,p('Subject: New Abdul’s Pharma access request'),p(application.name+' applied as '+application.field+'. Open the reviewer dashboard to approve or deny the request.'));
    row.append(email);
    if(application.status==='Pending'){
      const actions=document.createElement('div'); actions.className='actions';
      for(const [label,status] of [['Approve','Approved'],['Deny','Denied']]){
        actions.append(btn(label,()=>{application.status=status;openReview();},label==='Deny'?'outline':''));
      }
      row.append(actions);
    }
    body.append(row);
  }
}
$('review').onclick=openReview;

function openLogin(){
  const form=document.createElement('form');
  form.innerHTML='<label>Approved demo email<input type="email" name="email" placeholder="student@example.com" required></label><p class="muted" role="status" id="sign-in-status"></p><button>Enter learning preview</button>';
  form.onsubmit=event=>{
    event.preventDefault();
    const email=String(new FormData(form).get('email')).trim().toLowerCase();
    const application=applications.find(item=>item.email===email);
    if(application?.status==='Approved'){openLessons();return;}
    form.querySelector('#sign-in-status').textContent=application?.status==='Pending'?'Your request is pending review.':application?.status==='Denied'?'Your request was denied.':'Apply with this email to request access.';
  };
  showPanel('Student sign-in',p('Preview access uses the approved sample email in this browser session.','notice'),form);
}
$('login').onclick=openLogin;

function openLessons(){
  const lessons=[
    ['Pharmacology foundations','Compare generic ingredients, brand names, strengths and dosage forms. Review each product leaflet before dispensing.'],
    ['Drug interactions','Review active ingredients and check for duplicate therapy, then check the patient’s medicine list against a trusted interaction resource.','/site/assets/safer-care.webp'],
    ['Medicine infographics','Study the reference chart and check the medicine’s current leaflet for counselling details.','/site/assets/flunisolide.webp']
  ];
  showPanel('Abdul’s Pharma learning',p('Student learning preview. Check current prescribing information before using a chart clinically.','notice'));
  for(const [title,copy,source] of lessons){
    const card=document.createElement('details'); card.className='study-card';
    const summary=document.createElement('summary'); summary.textContent=title;
    card.append(summary,p(copy));
    if(source){
      const img=document.createElement('img');
      img.src=source; img.alt=title+' infographic from Abdul’s Pharma';
      img.loading='lazy'; img.className='study-image';
      img.onerror=()=>img.remove(); card.append(img);
    }
    body.append(card);
  }
  body.append(btn('Pharma Journey Quiz', openPharmaQuiz));
}

function openPharmaQuiz(){
  const quiz = document.createElement('section');
  quiz.className = 'pharma-quiz';
  showPanel('Abdul’s Pharma learning', btn('Back to lessons', openLessons), quiz);
  mountPharmaQuiz(quiz);
}

const chapters=[
  {id:'study',tab:'Study',title:'The first pharmacology class',alt:'Student reading a pharmacology textbook with anatomy and molecule sketches behind him',copy:'Abdul learns how medicines act, how the body handles them, and why the same medicine can affect people differently.'},
  {id:'pharmacy',tab:'Pharmacy',title:'Counselling at the counter',alt:'Pharmacist explaining a medicine box to a customer',copy:'As a pharmacist, he checks the medicine and explains how to use it, what to watch for, and when to ask for help.'},
  {id:'lab',tab:'Lab',title:'A formulation starts in the lab',alt:'Pharmacist in protective eyewear pipetting into a green flask',copy:'The research team compares candidate formulations and tests properties such as stability and how the tablet releases its ingredient.'},
  {id:'manufacturing',tab:'Manufacturing',title:'From formulation to production',alt:'Pharmacist in cleanroom protective clothing inspecting a tablet line',copy:'In the factory, controlled production and quality checks help confirm that batches meet specifications before release.'},
  {id:'launch',tab:'Launch',title:'Preparing the medicine for launch',alt:'Pharmacist presenting a generic medicine carton and blister pack',copy:'After the required reviews and approvals, the team prepares the packaging and patient information so people can identify and use the medicine correctly.'},
  {id:'body',tab:'In the body',title:'From swallowing to an effect',alt:'Conceptual diagram of the digestive tract, bloodstream and a drug binding to a receptor',copy:'Many swallowed medicines are absorbed in the small intestine. After entering the blood, an ingredient can reach a target such as a receptor and change how cells respond. The route and target depend on the medicine.'}
];
let chapter=0, storyTimer=null;
const chapterButtons=chapters.map(({tab},index)=>btn(tab,()=>{stopStory();showChapter(index);}));
$('story-steps').append(...chapterButtons);
function showChapter(index){
  chapter=index;
  const current=chapters[index];
  const art=$('story-image');
  art.src='/site/assets/story-'+current.id+'.webp';
  art.alt=current.alt;
  $('story-chapter').textContent='CHAPTER '+(index+1)+' OF '+chapters.length;
  $('story-title').textContent=current.title;
  $('story-copy').textContent=current.copy;
  $('story-source').hidden=current.id!=='body';
  $('story-back').disabled=index===0;
  $('story-next').disabled=index===chapters.length-1;
  chapterButtons.forEach((button,position)=>button.setAttribute('aria-pressed',String(position===index)));
  const frame=$('story-frame');
  frame.classList.remove('enter');
  requestAnimationFrame(()=>requestAnimationFrame(()=>frame.classList.add('enter')));
}
function stopStory(){
  clearInterval(storyTimer);
  storyTimer=null;
  $('story-play').textContent='Play story';
  $('story-play').setAttribute('aria-pressed','false');
}
$('story-back').onclick=()=>{stopStory();if(chapter>0)showChapter(chapter-1);};
$('story-next').onclick=()=>{stopStory();if(chapter<chapters.length-1)showChapter(chapter+1);};
$('story-play').onclick=()=>{
  if(storyTimer){stopStory();return;}
  if(chapter===chapters.length-1)showChapter(0);
  $('story-play').textContent='Pause story';
  $('story-play').setAttribute('aria-pressed','true');
  storyTimer=setInterval(()=>{
    if(chapter===chapters.length-1){stopStory();return;}
    showChapter(chapter+1);
  },6500);
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopStory();});
showChapter(0);

function openChatbook(){
  const transcript=document.createElement('div');
  transcript.className='chat-transcript';
  transcript.setAttribute('role','log');
  transcript.setAttribute('aria-label','Chatbook conversation');
  transcript.append(p('Ask where to find a medicine, an order preview, the comic story, or the student portal.'));
  const topics=[
    {label:'Find a medicine',terms:/panadol|paracetamol|medicine|dawa|otc|multivitamin|prescription/i,reply:'Search by brand or ingredient. Select Explore on a matching medicine to open its mind map.',link:'Medicine shop',target:'catalog'},
    {label:'Order preview',terms:/order|cart|checkout|delivery|pickup/i,reply:'Add a catalogue item to your cart to try guest checkout and choose pickup or delivery.',link:'Open cart',action:openCart},
    {label:'Pharma story',terms:/story|comic|journey|lab|manufactur|body/i,reply:'Follow Abdul from pharmacology class to pharmacy practice, the lab, manufacturing, launch and the body.',link:'Read the story',target:'journey'},
    {label:'Student access',terms:/student|access|learn|approval|sign.in/i,reply:'Request access in the student portal. In this preview, the reviewer can approve a sample request in the same session.',link:'Student portal',target:'academy'}
  ];
  function answer(question,topic){
    const reply=p(topic?.reply||'Chatbook can guide you to the medicine catalogue, checkout preview, comic story or student portal.');
    if(topic){
      const link=topic.action?btn(topic.link,topic.action,'outline'):document.createElement('a');
      if(!topic.action){
        link.href='#'+topic.target;
        link.textContent=topic.link;
        link.addEventListener('click',()=>panel.close());
      }
      reply.append(document.createElement('br'),link);
    }
    transcript.append(p(question,'chat-question'),reply);
    transcript.scrollTop=transcript.scrollHeight;
  }
  const shortcuts=document.createElement('div');
  shortcuts.className='actions chat-actions';
  shortcuts.append(...topics.map(topic=>btn(topic.label,()=>answer(topic.label,topic),'outline')));
  const form=document.createElement('form');
  form.innerHTML='<label>Ask about the website<input name="question" placeholder="Where can I find the comic?" maxlength="180" required></label><button>Ask Chatbook</button>';
  form.onsubmit=event=>{
    event.preventDefault();
    const question=String(new FormData(form).get('question')).trim();
    if(!question)return;
    answer(question,topics.find(topic=>topic.terms.test(question)));
    form.reset();
  };
  showPanel('Chatbook',transcript,shortcuts,form);
}
$('chatbook').onclick=openChatbook;
