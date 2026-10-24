(function(){
  'use strict';

  /* =====================================================================
     CONFIG — comes from js/config.js (the only file the owner edits).
     Everything below falls back to safe defaults if config.js is missing
     or has a typo.
     ===================================================================== */
  var CFG = (window.APP_CONFIG && typeof window.APP_CONFIG === 'object') ? window.APP_CONFIG : {};
  var VET_CONTACTS = Array.isArray(CFG.VET_CONTACTS) ? CFG.VET_CONTACTS : [];
  var REVIEW = (CFG.REVIEW && typeof CFG.REVIEW === 'object') ? CFG.REVIEW : {reviewer:'', date:''};
  REVIEW.reviewer = String(REVIEW.reviewer || '').trim(); REVIEW.date = String(REVIEW.date || '').trim();
  var POPULAR_IDS = (CFG.POPULAR_IDS && typeof CFG.POPULAR_IDS === 'object') ? CFG.POPULAR_IDS : {dog:[], cat:[]};
  var WSAVA_URL = CFG.WSAVA_URL || 'https://wsava.org/wp-content/uploads/2024/06/Feeding-treats-to-your-cat-v2.pdf';
  var FEEDBACK = (CFG.FEEDBACK && typeof CFG.FEEDBACK === 'object') ? CFG.FEEDBACK : {};
  var FB_FIELDS = (FEEDBACK.fields && typeof FEEDBACK.fields === 'object') ? FEEDBACK.fields : {};
  var DATA_URL = 'data/foods.json';

  /* ===================================================================== */

  var CATEGORIES = ['ผลไม้','ผัก','เนื้อสัตว์/ไข่','ขนม/ของหวาน','เครื่องดื่ม','อื่นๆ'];
  var STATUS_ORDER = ['safe','limited','avoid','toxic','unknown'];
  var STATUS = {
    safe:    {word:'กินได้',            icon:'i-safe',    desc:'ให้กินได้ ตามวิธีที่แนะนำ ไม่ปรุงรส'},
    limited: {word:'กินได้บ้าง',         icon:'i-limited', desc:'ได้เล็กน้อย นาน ๆ ครั้ง หรือมีเงื่อนไข'},
    avoid:   {word:'ควรหลีกเลี่ยง',      icon:'i-avoid',   desc:'ไม่ใช่พิษร้ายแรง แต่มีความเสี่ยง ไม่ควรให้'},
    toxic:   {word:'ห้ามกิน',           icon:'i-toxic',   desc:'เป็นพิษหรืออันตราย ห้ามให้เด็ดขาด'},
    unknown: {word:'ไม่มีข้อมูลยืนยัน',  icon:'i-unknown', desc:'ยังไม่ควรให้ จนกว่าจะปรึกษาสัตวแพทย์'}
  };
  // Emergency urgency per status: go = go now, call = phone a vet / watch, watch = watch at home
  var URGENCY = {
    toxic:   {lvl:'go',    icon:'i-toxic',   text:'ไปหาสัตวแพทย์ทันที'},
    avoid:   {lvl:'call',  icon:'i-phone',   text:'โทรปรึกษาสัตวแพทย์ / สังเกตอาการ'},
    limited: {lvl:'call',  icon:'i-phone',   text:'โทรปรึกษาสัตวแพทย์ / สังเกตอาการ'},
    safe:    {lvl:'watch', icon:'i-safe',    text:'สังเกตอาการที่บ้าน'},
    unknown: {lvl:'call',  icon:'i-phone',   text:'โทรปรึกษาสัตวแพทย์'}
  };
  var SPECIES = {
    dog:{name:'สุนัข', nick:'น้องหมา', icon:'#i-dog'},
    cat:{name:'แมว',  nick:'น้องแมว', icon:'#i-cat'}
  };
  var LS = {species:'kdm-species', profile:'kdm-profile', favs:'kdm-favs', recent:'kdm-recent', requests:'kdm-requests',
            notice:'kdm-notice', optout:'kdm-optout', local:'kdm-feedback-local', iosHint:'kdm-ios-hint'};
  var MAX_RECENT = 8;
  var DISH_RE = /(ทอด|ย่าง|ปิ้ง|ผัด|แกง|ต้ม|ส้มตำ|ตำ|ข้าวมัน|ลูกชิ้น|ยำ|ลาบ|น้ำตก|กะเพรา|ก๋วยเตี๋ยว|โจ๊ก|ข้าวขาหมู|ข้าวหมก|หมูกระทะ|สุกี้|ชาบู|ทอดมัน)/;

  /* ---------- data (loaded from data/foods.json, see loadFoods) ---------- */
  var FOODS = [];
  var BY_ID = {};
  var LEFTOVERS = null;
  var dataReady = false;
  function setFoods(list){
    FOODS = (Array.isArray(list) ? list : []).filter(function(f){ return f && f.id && f.name_th; });
    BY_ID = {};
    FOODS.forEach(function(f){
      BY_ID[f.id] = f;
      var names = [f.name_th].concat(f.aliases || []);
      f._keys = names.map(key).filter(Boolean);
      f._rkeys = names.map(rawKey).filter(Boolean);
    });
    // The "seasoned human food / leftovers" item, found by its aliases rather than hardcoded text
    LEFTOVERS = FOODS.filter(function(f){
      return (f.aliases||[]).some(function(a){ return /^(leftovers|table scraps|อาหารเหลือ|เศษอาหาร)$/i.test(a); });
    })[0] || null;
  }

  /* ---------- small helpers ---------- */
  var $ = function(s, r){ return (r||document).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function safeUrl(u){ return /^https?:\/\//i.test(String(u||'')) ? u : null; }
  function icon(id, cls){ return '<svg'+(cls?' class="'+cls+'"':'')+' aria-hidden="true"><use href="#'+id+'"/></svg>'; }
  function statusOf(food, sp){
    var s = food && food[sp] && food[sp].status;
    return STATUS[s] ? s : 'unknown';
  }
  function badge(st){
    var m = STATUS[st];
    return '<span class="badge s-'+st+'">'+icon(m.icon)+m.word+'</span>';
  }

  /* localStorage wrappers: every access guarded, app works without storage */
  function lsGet(k, fallback){
    try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
    catch(e){ return fallback; }
  }
  function lsSet(k, v){
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; }
  }
  function lsDel(k){ try { localStorage.removeItem(k); } catch(e){} }

  /* Pick the chosen species' part of a field like "สุนัข: … | แมว: …".
     Untagged text applies to both. Returns '' if the species has no part. */
  function speciesPart(text, sp){
    if (!text) return '';
    var label = sp === 'cat' ? 'แมว' : 'สุนัข';
    var parts = String(text).split('|').map(function(p){ return p.trim(); }).filter(Boolean);
    var tagRe = /^(สุนัข|แมว)\s*:\s*/;
    var out = parts.filter(function(p){
      var m = p.match(tagRe);
      return !m || m[1] === label;
    }).map(function(p){ return p.replace(tagRe, ''); });
    return out.join(' ').trim();
  }

  /* ---------- forgiving Thai search ---------- */
  // Common spelling variants, applied after tone marks are stripped
  var VARIANTS = [
    [/แอบเปิ/g,'แอปเปิ'], [/แอปปิ/g,'แอปเปิ'], [/คโก/g,'กโก'], [/^ซอก/,'ชอก'], [/ชอคโก/g,'ชอกโก'],
    [/ไอศครีม/g,'ไอศกรีม'], [/ไอติม/g,'ไอศกรีม'], [/^ซีส/,'ชีส'],
    [/แมคคา/g,'แมคา'], [/กะเทียม/g,'กระเทียม'], [/ลิลลิ/g,'ลิลลี']
  ];
  function key(s){
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFC');
    s = s.replace(/[\s​\-_.,/()'"]+/g, '');      // spaces & punctuation
    s = s.replace(/[็-์]/g, '');             // ็ ่ ้ ๊ ๋ ์
    VARIANTS.forEach(function(v){ s = s.replace(v[0], v[1]); });
    return s;
  }
  // Tone-preserving key, used only to rank exact-spelling matches first (ไข่ vs ไข้)
  function rawKey(s){ return String(s || '').toLowerCase().replace(/[\s\u200b\-_.,/()'"]+/g, ''); }
  // Levenshtein distance with early exit above `max`
  function lev(a, b, max){
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++){
      cur = [i]; var rowMin = i;
      for (j = 1; j <= b.length; j++){
        cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // rank: 0 startsWith, 1 includes, 2 small typo, 3 query contains a known food word
  function search(raw){
    var q = key(raw);
    if (!q) return [];
    var rq = rawKey(raw);
    var maxD = q.length >= 6 ? 2 : 1;
    var scored = [];
    FOODS.forEach(function(f, idx){
      var best = 9;
      f._keys.forEach(function(k){
        if (k.indexOf(q) === 0) best = Math.min(best, 0);
        else if (k.indexOf(q) !== -1) best = Math.min(best, 1);
        else if (q.length >= 3 && (lev(q, k, maxD) <= maxD ||
                 (k.length > q.length && lev(q, k.slice(0, q.length), 1) <= 1))) best = Math.min(best, 2);
        else if (q.length >= 4 && k.length >= 3 && q.indexOf(k) !== -1) best = Math.min(best, 3);
      });
      if (best < 9){
        // same tier: exact spelling (with tone marks) ranks first
        if (best <= 1 && !f._rkeys.some(function(k){ return k.indexOf(rq) !== -1; })) best += 0.5;
        scored.push({f:f, s:best, i:idx});
      }
    });
    scored.sort(function(a, b){ return a.s - b.s || a.i - b.i; });
    return scored.map(function(x){ return x.f; });
  }
  function looksLikeDish(raw){ return DISH_RE.test(String(raw || '')); }

  /* ---------- request a missing food: local copy + optional silent send ---------- */
  function requestFood(query, sp){
    var q = String(query || '').trim().slice(0, 80);
    var list = lsGet(LS.requests, []);
    if (!Array.isArray(list)) list = [];
    list.push({q:q, species:sp || null, t:new Date().toISOString()});
    if (list.length > 100) list = list.slice(-100);
    var saved = lsSet(LS.requests, list);
    sendAuto('request', {query:q, species:SP_TXT[sp] || ''});
    return saved;
  }

  /* =====================================================================
     FEEDBACK via Google Forms (configured in js/config.js → FEEDBACK)
     - Nothing is sent unless postUrl + field ids are set.
     - Automatic sends (helpful / request / missed) also need: the one-time
       notice has been seen, and the user has not turned on the opt-out.
     - Google's response cannot be read (no-cors), so "resolved" = sent.
     ===================================================================== */
  var SP_TXT = {dog:'สุนัข', cat:'แมว', both:'ทั้งสอง'};
  var PETS_TXT = {dog:'สุนัข', cat:'แมว', both:'ทั้งสุนัขและแมว'};
  var RET_TXT = {yes:'ใช้แน่', maybe:'อาจจะ', no:'คงไม่'};
  function entryName(id){
    id = String(id || '').trim();
    if (!id) return '';
    if (/^entry\.\d+$/.test(id)) return id;
    if (/^\d+$/.test(id)) return 'entry.' + id;
    return '';
  }
  function fieldName(k){ return entryName(FB_FIELDS[k]); }
  function postUrl(){
    var u = safeUrl(FEEDBACK.postUrl);
    return u ? String(u).trim() : null;
  }
  function formUrl(){
    var u = safeUrl(FEEDBACK.formUrl);
    return u ? String(u).trim() : null;
  }
  function remoteConfigured(){ return !!(postUrl() && fieldName('type')); }
  function surveyPostReady(){
    return remoteConfigured() && ['species','ease','trust','again'].every(fieldName);
  }
  function noticeSeen(){ return lsGet(LS.notice, null); }
  function optedOut(){ return lsGet(LS.optout, false) === true; }
  function autoSendAllowed(){
    return remoteConfigured() && noticeSeen() === 'remote' && !optedOut();
  }
  function buildParams(data){
    var p = new URLSearchParams();
    Object.keys(data).forEach(function(k){
      var name = fieldName(k), v = data[k];
      if (name && v != null && v !== '') p.append(name, String(v));
    });
    return p;
  }
  // Returns a promise: resolves true when the request left the device, false otherwise.
  function postForm(data){
    var url = postUrl();
    if (!url || !window.fetch) return Promise.resolve(false);
    try {
      return fetch(url, {method:'POST', mode:'no-cors', body:buildParams(data)})
        .then(function(){ return true; }, function(){ return false; });
    } catch(e){ return Promise.resolve(false); }
  }
  // Local copy of every feedback event (kept on this phone only, last 50 per kind)
  function localStash(kind, item){
    var loc = lsGet(LS.local, {});
    if (!loc || typeof loc !== 'object') loc = {};
    var arr = Array.isArray(loc[kind]) ? loc[kind] : [];
    arr.push(item);
    loc[kind] = arr.slice(-50);
    lsSet(LS.local, loc);
  }
  function sendAuto(type, data){
    var item = {}; Object.keys(data).forEach(function(k){ item[k] = data[k]; });
    item.t = new Date().toISOString();
    localStash(type, item);
    if (!autoSendAllowed()) return Promise.resolve(false);
    data.type = type;
    return postForm(data);
  }

  /* ---------- missed searches (not-found): debounced + deduped per session ---------- */
  var missedTimer = null, missedSeen = {};
  try { missedSeen = JSON.parse(sessionStorage.getItem('kdm-missed-seen') || '{}') || {}; } catch(e){ missedSeen = {}; }
  function recordMissed(raw, sp){
    clearTimeout(missedTimer);
    var q = String(raw || '').trim().slice(0, 80), k = key(q);
    if (k.length < 2 || !sp) return;
    var mk = k + '|' + sp;
    if (missedSeen[mk]) return;
    missedSeen[mk] = 1;
    try { sessionStorage.setItem('kdm-missed-seen', JSON.stringify(missedSeen)); } catch(e){}
    sendAuto('missed', {query:q, species:SP_TXT[sp] || ''});
  }
  function scheduleMissed(){
    clearTimeout(missedTimer);
    missedTimer = setTimeout(function(){
      var raw = $('#q').value.trim();
      if (current === 'search' && raw && !$('#notfound-inline').hidden) recordMissed(raw, species);
    }, 1500);
  }

  /* ---------- state ---------- */
  var species = SPECIES[lsGet(LS.species, null)] ? lsGet(LS.species, null) : null;
  var profile = loadProfile();
  if (!species && profile && SPECIES[profile.species]) species = profile.species;
  var emgSpecies = null;     // species chosen inside emergency mode
  var emgFoodId = null;      // food selected inside emergency mode
  var nfQuery = '';          // query shown on the not-found screen
  var currentFoodId = null;
  var current = '';          // current route token
  var pendingToken = null;   // deep link waiting for species choice

  function setSpecies(sp){
    species = sp;
    lsSet(LS.species, sp);
  }
  function loadProfile(){
    var p = lsGet(LS.profile, null);
    return (p && typeof p === 'object') ? p : null;
  }
  function getFavs(){ var a = lsGet(LS.favs, []); return Array.isArray(a) ? a.filter(function(id){ return BY_ID[id]; }) : []; }
  function getRecent(){ var a = lsGet(LS.recent, []); return Array.isArray(a) ? a.filter(function(id){ return BY_ID[id]; }) : []; }
  function addRecent(id){
    var a = getRecent().filter(function(x){ return x !== id; });
    a.unshift(id);
    lsSet(LS.recent, a.slice(0, MAX_RECENT));
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg){
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.hidden = true; }, 2600);
  }

  /* ---------- views ---------- */
  var VIEWS = ['loading','error','pet','search','result','notfound','emergency','profile','about','feedback','nearby'];
  function show(name){
    VIEWS.forEach(function(v){ $('#view-'+v).hidden = (v !== name); });
    var hint = $('#ios-hint'); if (hint) hint.hidden = !(name === 'pet' || name === 'search') || !iosHintWanted();
    document.body.classList.toggle('cat', species === 'cat');
    $$('.js-draft').forEach(function(b){ b.hidden = !!REVIEW.reviewer; });
  }
  function focusMain(el){
    var t = el || $('#main');
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    try { t.focus({preventScroll:true}); } catch(e){ t.focus(); }
    window.scrollTo(0, 0);
  }

  function renderSearchChrome(){
    var sp = SPECIES[species];
    $$('.sp-name').forEach(function(n){ n.textContent = sp.name; });
    $$('.sp-icon').forEach(function(n){ n.setAttribute('href', sp.icon); });
    $('#search-h').textContent = sp.nick + 'กินอันนี้ได้ไหม?';
  }

  function chip(id){ return '<button type="button" class="chip" data-food="'+esc(id)+'">'+esc(BY_ID[id].name_th)+'</button>'; }
  function resRow(f, attr){
    return '<li><button type="button" class="res-btn" '+(attr||'data-food')+'="'+esc(f.id)+'">'+
      '<span class="res-name">'+esc(f.name_th)+'<span class="res-cat">'+esc(f.category||'')+'</span></span>'+
      badge(statusOf(f, species))+'</button></li>';
  }
  function renderPopular(){
    var ids = (POPULAR_IDS[species] || []).filter(function(id){ return BY_ID[id]; });
    $('#popular').innerHTML = ids.map(chip).join('');
    $('#pop-h').hidden = !ids.length; $('#popular').hidden = !ids.length;
  }
  function renderSaved(){
    var rec = getRecent();
    $('#recent-block').hidden = !rec.length;
    $('#recent').innerHTML = rec.map(chip).join('');
    var favs = getFavs();
    $('#favs').innerHTML = favs.map(function(id){ return resRow(BY_ID[id]); }).join('');
    $('#fav-empty').hidden = favs.length > 0;
  }
  function renderCategories(){
    var present = CATEGORIES.filter(function(c){ return FOODS.some(function(f){ return f.category === c; }); });
    $('#categories').innerHTML = present.map(function(c){
      return '<button type="button" class="chip" data-cat="'+esc(c)+'" aria-pressed="false">'+esc(c)+'</button>';
    }).join('');
  }
  function legendHTML(){
    return STATUS_ORDER.map(function(s){
      return '<li>'+badge(s)+'<span class="muted">'+STATUS[s].desc+'</span></li>';
    }).join('');
  }

  function renderList(items, label){
    $('#results-area').hidden = false;
    $('#res-label').textContent = label;
    $('#results').innerHTML = items.map(function(f){ return resRow(f); }).join('');
  }
  // Suggest the leftovers item when the query looks like a Thai dish
  function dishHintHTML(raw, items){
    if (!LEFTOVERS || !looksLikeDish(raw)) return '';
    if (items && items.some(function(f){ return f.id === LEFTOVERS.id; })) return '';
    return '<div class="suggest"><p>ดูเหมือนเป็นอาหารปรุงสำเร็จ ส่วนใหญ่มีเกลือ น้ำมัน หอม หรือกระเทียม ลองดูข้อมูลนี้:</p>'+
      '<ul class="results">'+resRow(LEFTOVERS)+'</ul></div>';
  }
  function notFoundHTML(q, headingId){
    return icon('i-unknown')+
      '<h2'+(headingId?' id="'+headingId+'" tabindex="-1"':'')+'>ยังไม่มีข้อมูลอาหารนี้</h2>'+
      (q ? '<p class="muted">ไม่พบ “'+esc(q)+'” ในฐานข้อมูล</p>' : '')+
      '<p><strong>ยังไม่ควรให้'+esc(SPECIES[species].nick)+'กิน</strong> จนกว่าจะได้ยืนยันกับสัตวแพทย์</p>'+
      (q ? '<button type="button" class="btn-sec" data-action="request-food" data-q="'+esc(q)+'">'+icon('i-plus')+'ขอให้เพิ่มเมนูนี้</button>'+
           '<p class="req-done" role="status" hidden></p>' : '')+
      '<p class="small muted" style="margin:10px 0 0">ถ้าน้องกินไปแล้ว กดปุ่มสีแดง “กินไปแล้ว ทำไงดี?” ด้านบน</p>';
  }
  function setCatPressed(cat){
    $$('#categories .chip').forEach(function(b){
      b.setAttribute('aria-pressed', String(b.getAttribute('data-cat') === cat));
    });
  }
  function clearResults(){
    $('#results-area').hidden = true;
    $('#results').innerHTML = '';
    $('#dish-hint').innerHTML = '';
    $('#notfound-inline').hidden = true;
    $('#res-status').textContent = '';
    $('#browse').hidden = false;
    setCatPressed(null);
  }

  function runSearch(){
    var raw = $('#q').value, q = raw.trim();
    $('#clear-q').hidden = !raw;
    setCatPressed(null);
    if (!key(q)){ clearResults(); renderSaved(); return; }
    var items = search(q);
    renderList(items, items.length ? 'พบ '+items.length+' รายการ' : '');
    $('#dish-hint').innerHTML = dishHintHTML(q, items);
    var nf = $('#notfound-inline');
    nf.hidden = items.length > 0;
    nf.innerHTML = items.length ? '' : notFoundHTML(q);
    $('#browse').hidden = true;
    $('#res-status').textContent = items.length ? 'พบ '+items.length+' รายการ' : 'ยังไม่มีข้อมูลอาหารนี้';
    if (items.length) clearTimeout(missedTimer); else scheduleMissed();
  }

  function showCategory(cat){
    $('#q').value = ''; $('#clear-q').hidden = true;
    var items = FOODS.filter(function(f){ return f.category === cat; }).sort(function(a, b){
      return STATUS_ORDER.indexOf(statusOf(a, species)) - STATUS_ORDER.indexOf(statusOf(b, species));
    });
    renderList(items, 'หมวด '+cat+' ('+items.length+')');
    $('#dish-hint').innerHTML = '';
    $('#notfound-inline').hidden = true;
    setCatPressed(cat);
    $('#res-status').textContent = 'หมวด '+cat+' พบ '+items.length+' รายการ';
    var area = $('#results-area');
    if (area.scrollIntoView) area.scrollIntoView({block:'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }

  /* ---------- trust layer ---------- */
  function reviewChipHTML(){
    if (REVIEW.reviewer){
      return '<span class="review-chip done">'+icon('i-shield')+'ตรวจทานโดย สพ.'+esc(REVIEW.reviewer)+(REVIEW.date ? ' · วันที่ '+esc(REVIEW.date) : '')+'</span>';
    }
    return '<span class="review-chip draft">'+icon('i-shield')+'สถานะ: ฉบับร่าง รอสัตวแพทย์ตรวจทาน</span>';
  }
  function sourceItems(srcs){
    return srcs.map(function(s){
      return '<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title || s.url)+'<span class="sr-only"> (เปิดในแท็บใหม่)</span></a></li>';
    }).join('');
  }
  function sourcesHTML(list){
    var srcs = (list || []).filter(function(s){ return s && safeUrl(s.url); });
    return srcs.length ? '<ul class="sources">'+sourceItems(srcs)+'</ul>' : '<p class="muted small">ยังไม่มีแหล่งอ้างอิง</p>';
  }

  /* ---------- treat guideline (WSAVA 10%) ---------- */
  // Rough estimate only: RER = 70 x kg^0.75, times a conservative maintenance factor
  function treatKcal(p){
    var kg = parseFloat(p && p.weight);
    if (!(kg > 0 && kg < 150) || p.stage === 'baby') return null;
    var factor = (p.stage === 'senior' || p.overweight) ? 1.0 : (p.species === 'cat' ? 1.2 : 1.6);
    var rer = 70 * Math.pow(kg, 0.75);
    return Math.round(rer * factor * 0.10);
  }
  function treatCardHTML(){
    var p = profile && profile.species === species ? profile : null;
    var html = '<div class="card treat"><h2>'+icon('i-paw')+'ปริมาณขนมต่อวัน</h2>'+
      '<p>ขนมและอาหารเสริมทุกชนิดรวมกันไม่ควรเกิน 10% ของพลังงานต่อวัน (แนวทาง WSAVA)</p>';
    if (p){
      var kc = treatKcal(p);
      var who = p.name ? esc(p.name) : esc(SPECIES[species].nick);
      if (kc != null){
        html += '<p class="kcal">'+who+' ('+esc(p.weight)+' กก.): ไม่เกินประมาณ '+kc+' kcal ต่อวัน</p>'+
          '<p class="est-note">ค่าประมาณคร่าว ๆ ปรึกษาสัตวแพทย์สำหรับตัวเลขที่เหมาะกับน้อง</p>';
      }
      if (p.kidney || p.stage === 'baby'){
        html += '<div class="caveat">น้องมีภาวะพิเศษ ควรถามสัตวแพทย์ก่อนให้อาหารนอกมื้อ</div>';
      }
    } else {
      html += '<p class="small muted"><button type="button" class="link-btn" style="padding:0;min-height:44px" data-action="profile">ใส่น้ำหนักน้องในโปรไฟล์</button> เพื่อดูตัวเลขโดยประมาณ</p>';
    }
    html += '<p class="small"><a href="'+esc(WSAVA_URL)+'" target="_blank" rel="noopener noreferrer">WSAVA – Feeding treats to your cat (PDF)<span class="sr-only"> (เปิดในแท็บใหม่)</span></a></p></div>';
    return html;
  }

  /* ---------- "if eaten" block, shared by result + emergency ---------- */
  function ifEatenHTML(food, sp, withEmgLink){
    var st = statusOf(food, sp), u = URGENCY[st];
    var txt = speciesPart(food.if_eaten_th, sp) || 'สังเกตอาการอย่างใกล้ชิด และโทรปรึกษาสัตวแพทย์ อย่าทำให้อาเจียนเองถ้าสัตวแพทย์ไม่ได้แนะนำ';
    return '<div class="card lvl-'+u.lvl+'">'+
      '<h2>ถ้า'+esc(SPECIES[sp].nick)+'กินไปแล้ว</h2>'+
      '<p class="urg">'+icon(u.icon)+u.text+'</p>'+
      '<p>'+esc(txt)+'</p>'+
      (withEmgLink ? '<button type="button" class="btn-danger" data-action="emergency-food" data-id="'+esc(food.id)+'">'+icon('i-siren')+'เปิดโหมดฉุกเฉิน และรายชื่อโรงพยาบาลสัตว์</button>' : '')+
    '</div>';
  }

  /* ---------- share ---------- */
  function shareText(food){
    var st = statusOf(food, species);
    var note = (food[species] && food[species].note_th) || '';
    if (note.length > 90) note = note.slice(0, 88) + '…';
    return food.name_th + ' — ' + SPECIES[species].name + ': ' + STATUS[st].word +
      (note ? '\n' + note : '') + '\nข้อมูลจากแอป กินได้ไหม?';
  }

  /* ---------- result ---------- */
  function renderResult(food){
    var st = statusOf(food, species), m = STATUS[st], sp = SPECIES[species];
    var info = food[species] || {};
    var isFav = getFavs().indexOf(food.id) !== -1;
    var html =
      '<div class="status-card s-'+st+'">'+
        icon(m.icon, 'big-ic')+
        '<p class="word">'+m.word+'</p>'+
        '<p class="for">สำหรับ'+esc(sp.name)+'</p>'+
      '</div>'+
      '<div class="title-row"><h1 class="food-name" id="food-h" tabindex="-1">'+esc(food.name_th)+'</h1>'+
        '<button type="button" class="fav-btn" data-action="fav" data-id="'+esc(food.id)+'" aria-pressed="'+isFav+'" aria-label="บันทึกรายการนี้">'+icon('i-heart')+'</button></div>'+
      '<p class="food-cat">หมวด '+esc(food.category||'-')+'</p>'+
      '<div class="note"><p style="margin:0">'+esc(info.note_th || 'ยังไม่มีคำอธิบายเพิ่มเติม')+'</p></div>';

    if (st === 'safe' || st === 'limited'){
      var serving = speciesPart(food.serving_th, species);
      if (serving){
        html += '<div class="card tip"><h2>'+icon('i-bowl')+'วิธีให้อย่างปลอดภัย</h2><p>'+esc(serving)+'</p></div>';
      }
      html += treatCardHTML();
    }

    html += ifEatenHTML(food, species, st !== 'safe');

    var text = shareText(food);
    html +=
      '<div class="share-row">'+
        '<a class="btn-sec" href="https://social-plugins.line.me/lineit/share?text='+encodeURIComponent(text)+'" target="_blank" rel="noopener">'+icon('i-chat')+'แชร์ทาง LINE<span class="sr-only"> (เปิดในแท็บใหม่)</span></a>'+
        '<button type="button" class="btn-sec" data-action="copy-share">'+icon('i-copy')+'คัดลอกข้อความ</button>'+
      '</div>'+
      '<div class="copy-fallback" hidden><label for="share-text" class="small muted">กดค้างที่ข้อความเพื่อคัดลอก</label><textarea id="share-text" readonly>'+esc(text)+'</textarea></div>';

    html += helpfulHTML(food);

    html += '<div class="trust"><h2>ความน่าเชื่อถือของข้อมูล</h2>'+reviewChipHTML()+
      '<h3 style="margin-top:8px">แหล่งอ้างอิง</h3>'+sourcesHTML(food.sources)+
      '<p class="small muted" style="margin-top:8px">ความรู้ทั่วไป ไม่ใช่การวินิจฉัยหรือคำแนะนำเฉพาะตัว <button type="button" class="link-btn" style="min-height:44px;padding:0" data-action="about">เกี่ยวกับข้อมูล</button></p></div>';

    $('#result-body').innerHTML = html;
    var other = species === 'dog' ? 'cat' : 'dog';
    $('#other-sp-btn span').textContent = 'ดูผลสำหรับ' + SPECIES[other].name;
  }

  /* ---------- "was this helpful" on results ---------- */
  var helpedThisVisit = {};   // key food|species -> 'yes' | 'no' | 'no-sent'
  function helpfulHTML(food){
    var hk = food.id + '|' + species, st = helpedThisVisit[hk];
    var done = st && st !== 'no';
    return '<div class="helpful" data-food-id="' + esc(food.id) + '"><h2 id="help-h">คำตอบนี้มีประโยชน์ไหม?</h2>' +
      '<div class="help-row" role="group" aria-labelledby="help-h">' +
        '<button type="button" class="help-btn" data-action="help-yes" aria-pressed="' + (st === 'yes') + '"' + (st ? ' disabled' : '') + '>' + icon('i-thumb') + 'มีประโยชน์</button>' +
        '<button type="button" class="help-btn" data-action="help-no" aria-pressed="' + (st === 'no' || st === 'no-sent') + '"' + (done ? ' disabled' : '') + '>' + icon('i-thumb-down') + 'ยังไม่ชัด</button>' +
      '</div>' +
      '<div class="help-more"' + (st === 'no' ? '' : ' hidden') + '>' +
        '<label for="help-note">อะไรที่ยังไม่ชัด? (ไม่บังคับ)</label>' +
        '<textarea id="help-note" maxlength="300" placeholder="เช่น ไม่แน่ใจว่าให้ได้เท่าไร"></textarea>' +
        '<p class="hint">ไม่ต้องใส่ชื่อ เบอร์โทร หรืออีเมล</p>' +
        '<button type="button" class="mini-btn" data-action="help-send">' + icon('i-send') + 'ส่ง</button>' +
      '</div>' +
      '<p class="help-msg" role="status"' + (done ? '' : ' hidden') + '>' + (done ? 'ขอบคุณสำหรับคำตอบค่ะ' : '') + '</p></div>';
  }
  function helpfulDone(box, data){
    var msg = box.querySelector('.help-msg');
    msg.hidden = false; msg.textContent = 'ขอบคุณสำหรับคำตอบค่ะ';
    sendAuto('helpful', data);
  }
  function onHelpful(btn, yes){
    var box = btn.closest('.helpful'), id = box.getAttribute('data-food-id'), hk = id + '|' + species;
    var btns = box.querySelectorAll('.help-btn'), f = BY_ID[id];
    btns[0].setAttribute('aria-pressed', String(yes)); btns[1].setAttribute('aria-pressed', String(!yes));
    if (yes){
      helpedThisVisit[hk] = 'yes';
      btns[0].disabled = btns[1].disabled = true;
      box.querySelector('.help-more').hidden = true;
      helpfulDone(box, {food:(f ? f.name_th : id) + ' (' + id + ')', species:SP_TXT[species], helpful:'มีประโยชน์'});
    } else {
      helpedThisVisit[hk] = 'no';
      btns[0].disabled = true;
      box.querySelector('.help-more').hidden = false;
      box.querySelector('#help-note').focus();
    }
  }
  function sendUnclear(btn){
    var box = btn.closest('.helpful'), id = box.getAttribute('data-food-id'), f = BY_ID[id];
    var note = box.querySelector('#help-note').value.trim().slice(0, 300);
    helpedThisVisit[id + '|' + species] = 'no-sent';
    $$('.help-btn', box).forEach(function(b){ b.disabled = true; });
    box.querySelector('.help-more').hidden = true;
    helpfulDone(box, {food:(f ? f.name_th : id) + ' (' + id + ')', species:SP_TXT[species], helpful:'ยังไม่ชัด', comment:note});
  }

  /* ---------- feedback survey screen ---------- */
  var fbSubmitted = null;   // {mode:'sent'|'form'|'copy', answers}
  function radioVal(name){ var r = $('input[name="' + name + '"]:checked'); return r ? r.value : null; }
  function resetFeedback(){
    fbSubmitted = null;
    $('#fb-form').reset();
    $('#fb-wish-count').textContent = '0/500 ตัวอักษร';
    $$('#fb-form .field-err').forEach(function(p){ p.hidden = true; });
    $$('#fb-form .invalid').forEach(function(r){ r.classList.remove('invalid'); });
  }
  function feedbackMode(){ return surveyPostReady() ? 'post' : (formUrl() ? 'form' : 'copy'); }
  function renderFeedback(){
    if (!radioVal('fb-pets') && species && !fbSubmitted){
      var r = $('input[name="fb-pets"][value="' + species + '"]'); if (r) r.checked = true;
    }
    var mode = feedbackMode(), m = $('#fb-mode');
    m.hidden = mode === 'post' || !!fbSubmitted;
    m.textContent = mode === 'form'
      ? 'กดส่งแล้ว แอปจะเปิดแบบฟอร์มออนไลน์ที่กรอกคำตอบไว้ให้ กดส่งในแบบฟอร์มอีกครั้งเพื่อยืนยัน'
      : 'ตอนนี้ยังไม่ได้เชื่อมแบบฟอร์มออนไลน์ กดส่งแล้วจะได้ข้อความสรุปไว้คัดลอกส่งให้ผู้จัดทำ';
    $('#fb-consent-label').textContent = mode === 'copy'
      ? 'ยินยอมให้ใช้คำตอบแบบไม่ระบุตัวตนเพื่อพัฒนาแอป'
      : 'ยินยอมให้ส่งคำตอบแบบไม่ระบุตัวตนไปยังแบบฟอร์มของผู้จัดทำ (Google Forms) เพื่อพัฒนาแอป';
    $('#fb-form').hidden = !!fbSubmitted;
    var done = $('#fb-done');
    done.hidden = !fbSubmitted;
    if (!fbSubmitted){ done.innerHTML = ''; return; }
    var html;
    if (fbSubmitted.mode === 'sent'){
      html = '<div class="card done-card">' + icon('i-check-c') +
        '<h2>ส่งคำตอบแล้ว ขอบคุณค่ะ</h2><p>ความคิดเห็นของคุณช่วยให้แอปนี้ดีขึ้นสำหรับเจ้าของสัตว์เลี้ยงคนอื่น ๆ</p>';
    } else if (fbSubmitted.mode === 'form'){
      html = '<div class="card done-card">' + icon('i-send') +
        '<h2>เปิดแบบฟอร์มให้แล้ว</h2><p>กดปุ่ม “ส่ง” ในแบบฟอร์มเพื่อยืนยัน ถ้าแบบฟอร์มไม่เปิด กดปุ่มด้านล่าง</p>' +
        '<a class="btn-sec" href="' + esc(prefillUrl(fbSubmitted.answers)) + '" target="_blank" rel="noopener">' + icon('i-send') + 'เปิดแบบฟอร์มอีกครั้ง<span class="sr-only"> (เปิดในแท็บใหม่)</span></a>';
    } else {
      html = '<div class="card fallback-card"><h2>' + icon('i-info') + 'อีกขั้นเดียว</h2>' +
        '<p>คัดลอกข้อความนี้ แล้วส่งให้ผู้จัดทำแอปทางช่องทางที่คุณได้รับลิงก์มา</p>' +
        '<label for="fb-copy-text" class="small muted">ข้อความสรุปคำตอบของคุณ</label>' +
        '<textarea id="fb-copy-text" readonly>' + esc(summaryText(fbSubmitted.answers)) + '</textarea>' +
        '<button type="button" class="btn-sec" data-action="fb-copy">' + icon('i-copy') + 'คัดลอกข้อความ</button>';
    }
    html += '<button type="button" class="btn-primary" data-action="home-or-search">กลับไปใช้งานต่อ</button>' +
      '<button type="button" class="link-btn" data-action="fb-again">' + (fbSubmitted.mode === 'sent' ? 'ส่งความคิดเห็นเพิ่ม' : 'แก้คำตอบ') + '</button></div>';
    done.innerHTML = html;
  }
  function surveyData(a){
    return {type:'survey', species:SP_TXT[a.pets] || '', ease:a.ease, trust:a.trust, again:RET_TXT[a.comeback] || '', comment:a.wish};
  }
  function prefillUrl(a){
    var base = formUrl(); if (!base) return '';
    var p = buildParams(surveyData(a));
    var qs = p.toString();
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'usp=pp_url' + (qs ? '&' + qs : '');
  }
  function summaryText(a){
    var lines = ['ความคิดเห็นแอป กินได้ไหม?',
      'เลี้ยง: ' + (PETS_TXT[a.pets] || '-'),
      'ใช้งานง่าย: ' + a.ease + '/5',
      'เชื่อถือคำตอบ: ' + a.trust + '/5',
      'จะกลับมาใช้อีก: ' + (RET_TXT[a.comeback] || '-')];
    if (a.wish) lines.push('อยากให้เพิ่ม: ' + a.wish);
    var loc = lsGet(LS.local, {}) || {};
    var res = Array.isArray(loc.helpful) ? loc.helpful : [];
    if (res.length){
      var yes = res.filter(function(r){ return r && r.helpful === 'มีประโยชน์'; }).length;
      lines.push('ให้คะแนนผลลัพธ์: มีประโยชน์ ' + yes + ' · ยังไม่ชัด ' + (res.length - yes));
      res.filter(function(r){ return r && r.helpful !== 'มีประโยชน์'; }).slice(-5).forEach(function(r){
        lines.push('- ' + r.food + ' ยังไม่ชัด' + (r.comment ? ': ' + r.comment : ''));
      });
    }
    var reqs = (lsGet(LS.requests, []) || []).concat(Array.isArray(loc.missed) ? loc.missed.map(function(m){ return {q:m.query}; }) : []);
    var seen = {}, names = [];
    reqs.forEach(function(r){ if (r && r.q){ var k = key(r.q); if (k && !seen[k]){ seen[k] = 1; names.push(r.q); } } });
    if (names.length) lines.push('อาหารที่หาไม่เจอ/อยากให้เพิ่ม: ' + names.slice(-10).join(', '));
    return lines.join('\n');
  }
  function validateFeedback(){
    var errs = [];
    function check(rowId, errId, ok, msg){
      var row = $(rowId), p = $(errId);
      row.classList.toggle('invalid', !ok);
      p.hidden = ok; p.textContent = ok ? '' : msg;
      if (!ok) errs.push(row);
    }
    check('#fb-pets-row', '#fb-pets-err', !!radioVal('fb-pets'), 'กรุณาเลือกว่าเลี้ยงอะไร');
    check('#fb-ease-row', '#fb-ease-err', !!radioVal('fb-ease'), 'กรุณาให้คะแนน 1–5');
    check('#fb-trust-row', '#fb-trust-err', !!radioVal('fb-trust'), 'กรุณาให้คะแนน 1–5');
    check('#fb-ret-row', '#fb-ret-err', !!radioVal('fb-ret'), 'กรุณาเลือกคำตอบ');
    check('#fb-consent-row', '#fb-consent-err', $('#fb-consent').checked, 'กรุณากดยินยอมก่อนส่ง');
    return errs;
  }
  var fbBusy = false;
  function submitFeedback(){
    if (fbBusy) return;
    var errs = validateFeedback(), sum = $('#fb-err');
    if (errs.length){
      sum.hidden = false; sum.textContent = 'ยังตอบไม่ครบ ' + errs.length + ' ข้อ';
      var first = errs[0].querySelector('input'); if (first) first.focus();
      return;
    }
    sum.hidden = true;
    var answers = {
      pets: radioVal('fb-pets'), ease: Number(radioVal('fb-ease')), trust: Number(radioVal('fb-trust')),
      comeback: radioVal('fb-ret'), wish: $('#fb-wish').value.trim().slice(0, 500)
    };
    var mode = feedbackMode();
    function finish(m){
      fbSubmitted = {mode:m, answers:answers};
      renderFeedback(); focusMain($('#fb-done'));
    }
    if (mode === 'post'){
      var btn = $('#fb-submit'), lbl = btn.querySelector('span');
      fbBusy = true; btn.disabled = true; lbl.textContent = 'กำลังส่ง…';
      postForm(surveyData(answers)).then(function(ok){
        fbBusy = false; btn.disabled = false; lbl.textContent = 'ส่งความคิดเห็น';
        if (ok){ finish('sent'); }
        else { sum.hidden = false; sum.textContent = 'ยังส่งไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'; }
      });
      return;
    }
    if (mode === 'form'){
      // opened directly inside the click/submit handler so pop-up blockers allow it
      try { window.open(prefillUrl(answers), '_blank', 'noopener'); } catch(e){}
      finish('form'); return;
    }
    finish('copy');
  }

  /* ---------- emergency ---------- */
  function renderEmergency(){
    $$('[data-emg-sp]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-emg-sp') === emgSpecies)); });
    runEmgSearch();
    renderEmgAnswer();
    renderVets();
  }
  function runEmgSearch(){
    var raw = $('#eq').value.trim();
    $('#clear-eq').hidden = !raw;
    var list = $('#emg-results');
    if (!raw || emgFoodId){ list.innerHTML = ''; $('#emg-status').textContent = ''; return; }
    var items = search(raw).slice(0, 6);
    var spForBadge = emgSpecies || species || 'dog';
    list.innerHTML = items.map(function(f){
      return '<li><button type="button" class="res-btn" data-emg-food="'+esc(f.id)+'"><span class="res-name">'+esc(f.name_th)+
        '<span class="res-cat">'+esc(f.category||'')+'</span></span>'+(emgSpecies ? badge(statusOf(f, spForBadge)) : '')+'</button></li>';
    }).join('');
    if (!items.length){
      var hint = LEFTOVERS && looksLikeDish(raw)
        ? '<li><button type="button" class="res-btn" data-emg-food="'+esc(LEFTOVERS.id)+'"><span class="res-name">'+esc(LEFTOVERS.name_th)+'<span class="res-cat">ใกล้เคียงที่สุด</span></span></button></li>' : '';
      list.innerHTML = hint + '<li class="card lvl-call" style="margin-top:0"><p class="urg">'+icon('i-phone')+URGENCY.unknown.text+'</p>'+
        '<p style="margin:0">ยังไม่มีข้อมูล “'+esc(raw)+'” แจ้งสัตวแพทย์ว่ากินอะไร ประมาณเท่าไร และเมื่อไร นำบรรจุภัณฑ์หรือรูปถ่ายไปด้วยถ้ามี</p></li>';
    }
    $('#emg-status').textContent = items.length ? 'พบ '+items.length+' รายการ' : 'ไม่พบข้อมูล ให้โทรปรึกษาสัตวแพทย์';
  }
  function renderEmgAnswer(){
    var box = $('#emg-answer');
    var food = emgFoodId && BY_ID[emgFoodId];
    if (!food){ box.innerHTML = ''; return; }
    var head = '<div class="sec-head"><p style="margin:0"><strong>'+esc(food.name_th)+'</strong></p>'+
      '<button type="button" class="link-btn" data-action="emg-clear">เลือกใหม่</button></div>';
    if (!emgSpecies){
      box.innerHTML = head + '<p class="card">เลือกด้านบนก่อนว่าน้องเป็นสุนัขหรือแมว เพราะความอันตรายต่างกัน</p>';
      return;
    }
    box.innerHTML = head + '<p style="margin:6px 0 0">'+badge(statusOf(food, emgSpecies))+' สำหรับ'+SPECIES[emgSpecies].name+'</p>'+
      ifEatenHTML(food, emgSpecies, false) +
      '<button type="button" class="link-btn" data-action="emg-full" data-id="'+esc(food.id)+'">ดูข้อมูลเต็มและแหล่งอ้างอิง</button>';
  }
  function renderVets(){
    renderEmgNearby();
    var area = $('#vet-area');
    var list = (Array.isArray(VET_CONTACTS) ? VET_CONTACTS : []).filter(function(v){ return v && v.name && v.phone; });
    if (!list.length){
      area.innerHTML = '<div class="placeholder"><p><strong>ยังไม่มีรายชื่อ — เพิ่มโรงพยาบาลสัตว์ใกล้คุณ</strong></p>'+
        '<p style="margin:0">ระหว่างนี้ ให้โทรหาโรงพยาบาลสัตว์หรือคลินิกที่ใกล้ที่สุดที่เปิดอยู่ แนะนำให้บันทึกเบอร์โรงพยาบาลสัตว์ 24 ชม. ใกล้บ้านไว้ในโทรศัพท์ตั้งแต่วันนี้</p></div>';
      return;
    }
    area.innerHTML = '<ul class="vet-list">'+list.map(function(v, i){
      var tel = String(v.phone).replace(/[^\d+]/g, '');
      return '<li class="vet"><h3>'+esc(v.name)+'</h3>'+
        '<p class="meta">'+esc(v.province || '')+(v.hours ? ' · '+esc(v.hours) : '')+'</p>'+
        '<div class="phone-row"><span class="phone" id="vet-ph-'+i+'">'+esc(v.phone)+'</span>'+
        '<button type="button" class="mini-btn" data-action="copy-phone" data-phone="'+esc(v.phone)+'" aria-label="คัดลอกเบอร์ '+esc(v.name)+'">'+icon('i-copy')+'คัดลอก</button>'+
        (tel ? '<a class="mini-btn" href="tel:'+esc(tel)+'" aria-label="โทรหา '+esc(v.name)+'">'+icon('i-phone')+'โทร</a>' : '')+
        '</div></li>';
    }).join('')+'</ul>';
  }

  /* ---------- nearby services: plain links to Google Maps search (no location access) ---------- */
  var NEARBY_ICONS = {pin:'i-pin', cross:'i-cross', bowl:'i-bowl', heart:'i-heart', scissors:'i-scissors', clock:'i-clock'};
  function mapsUrl(q){ return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
  function nearbyItems(){
    return (Array.isArray(CFG.NEARBY) ? CFG.NEARBY : []).filter(function(n){ return n && n.title && n.query; });
  }
  function renderNearby(){
    var items = nearbyItems();
    $('#nearby-list').innerHTML = items.length ? items.map(function(n){
      return '<a class="row-btn" href="'+esc(mapsUrl(n.query))+'" target="_blank" rel="noopener">'+
        icon(NEARBY_ICONS[n.icon] || 'i-pin')+
        '<span>'+esc(n.title)+(n.sub ? '<span class="sub">'+esc(n.sub)+'</span>' : '')+'</span>'+
        '<svg aria-hidden="true" class="ext"><use href="#i-ext"/></svg><span class="sr-only">(เปิด Google Maps ในหน้าต่างใหม่)</span></a>';
    }).join('') : '<p class="muted">ยังไม่ได้ตั้งค่ารายการบริการ</p>';
  }
  function renderEmgNearby(){
    var box = $('#emg-near'); if (!box) return;
    var n = nearbyItems().filter(function(x){ return x.icon === 'clock'; })[0] || {query:'โรงพยาบาลสัตว์ 24 ชั่วโมง ใกล้ฉัน'};
    box.innerHTML = '<a class="btn-danger" href="'+esc(mapsUrl(n.query))+'" target="_blank" rel="noopener">'+icon('i-pin')+'หาโรงพยาบาลสัตว์ 24 ชม. ใกล้ฉัน</a>'+
      '<p class="small muted" style="margin:8px 0 0">เปิด Google Maps ควรโทรยืนยันว่าเปิดอยู่ก่อนเดินทาง</p>';
  }

  /* ---------- profile ---------- */
  function fillProfileForm(){
    var p = profile || {};
    $('#pf-name').value = p.name || '';
    var sp = p.species || species;
    $$('input[name="pf-sp"]').forEach(function(r){ r.checked = r.value === sp; });
    $('#pf-kg').value = p.weight || '';
    $$('input[name="pf-stage"]').forEach(function(r){ r.checked = r.value === (p.stage || 'adult'); });
    $('#pf-over').checked = !!p.overweight;
    $('#pf-kidney').checked = !!p.kidney;
    $('#pf-msg').hidden = true;
  }
  function saveProfileFromForm(){
    var spEl = $('input[name="pf-sp"]:checked');
    var msg = $('#pf-msg');
    if (!spEl){ msg.hidden = false; msg.textContent = 'กรุณาเลือกว่าเป็นสุนัขหรือแมว'; return false; }
    var kgRaw = $('#pf-kg').value.replace(',', '.').trim();
    var kg = kgRaw ? parseFloat(kgRaw) : null;
    if (kgRaw && !(kg > 0 && kg < 150)){ msg.hidden = false; msg.textContent = 'น้ำหนักไม่ถูกต้อง ใส่เป็นตัวเลขกิโลกรัม เช่น 4.5'; return false; }
    var stEl = $('input[name="pf-stage"]:checked');
    profile = {
      name: $('#pf-name').value.trim().slice(0, 30),
      species: spEl.value,
      weight: kg ? Math.round(kg * 10) / 10 : null,
      stage: stEl ? stEl.value : 'adult',
      overweight: $('#pf-over').checked,
      kidney: $('#pf-kidney').checked
    };
    var ok = lsSet(LS.profile, profile);
    setSpecies(profile.species);
    toast(ok ? 'บันทึกโปรไฟล์แล้ว' : 'ใช้โปรไฟล์ได้ แต่บันทึกในเครื่องนี้ไม่ได้');
    return true;
  }
  function updateHomeProfileLabel(){
    var p = profile;
    $('#home-profile-label').textContent = p ? 'โปรไฟล์: ' + (p.name || SPECIES[p.species].nick) + (p.weight ? ' · ' + p.weight + ' กก.' : '') : 'ตั้งโปรไฟล์น้อง (ไม่บังคับ)';
  }

  /* ---------- about ---------- */
  function renderAbout(){
    $('#about-review').innerHTML = reviewChipHTML();
    $('#about-legend').innerHTML = legendHTML();
    var seen = {}, all = [];
    FOODS.forEach(function(f){ (f.sources || []).forEach(function(s){
      if (s && safeUrl(s.url) && !seen[s.url]){ seen[s.url] = 1; all.push(s); }
    }); });
    all.push({title:'WSAVA – Feeding treats to your cat (แนวทางขนมไม่เกิน 10%)', url:WSAVA_URL});
    all.sort(function(a, b){ return String(a.title).localeCompare(String(b.title)); });
    $('#about-sources').innerHTML = sourceItems(all);
    $('#about-src-sum').textContent = 'ดูรายการแหล่งอ้างอิง (' + all.length + ')';
    renderPrivacyBox();
  }
  function renderPrivacyBox(){
    var on = remoteConfigured();
    $('#optout').checked = optedOut();
    $('#optout-row').hidden = !on;
    $('#privacy-state').textContent = on
      ? 'แอปส่งข้อมูลแบบไม่ระบุตัวตนไปยังแบบฟอร์ม Google ของผู้จัดทำ ได้แก่ การกด “มีประโยชน์/ยังไม่ชัด” ชื่ออาหารที่ค้นหาแล้วไม่เจอ และคำขอให้เพิ่มเมนู ไม่ส่งชื่อ เบอร์โทร หรืออีเมล เว้นแต่คุณพิมพ์เอง'
      : 'ตอนนี้แอปไม่ส่งข้อมูลการใช้งานออกจากเครื่องของคุณ';
  }

  /* ---------- copy helpers ---------- */
  function copyText(text, onFail){
    function fail(){ if (onFail) onFail(); else toast('คัดลอกไม่ได้ กดค้างที่ข้อความเพื่อคัดลอก'); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ toast('คัดลอกแล้ว'); }, fail);
      } else fail();
    } catch(e){ fail(); }
  }
  function selectEl(el){
    try { el.focus(); el.select && el.select(); } catch(e){}
    if (!el.select){
      try { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch(e){}
    }
  }

  /* =====================================================================
     ROUTING — plain tokens only (no "/"): pet, search, food-<id>, nf,
     emergency, profile, about, dog, cat. pushState is a convenience; the
     app renders directly and still works if history/hash is unavailable.
     ===================================================================== */
  function go(token, opts){
    opts = opts || {};
    current = token;
    try {
      var st = {t:token, q:nfQuery};
      if (opts.replace) history.replaceState(st, '', '#' + token);
      else if (location.hash !== '#' + token) history.pushState(st, '', '#' + token);
    } catch(e){}
    render(token, opts);
  }
  function needsSpecies(t){ return t === 'search' || t === 'nf' || t.indexOf('food-') === 0; }
  function render(token, opts){
    opts = opts || {};
    current = token;
    if (token === 'dog' || token === 'cat'){ setSpecies(token); token = current = 'search'; }
    if (token === 'emergency'){
      if (!emgSpecies) emgSpecies = species;
      show('emergency'); renderEmergency(); focusMain($('#emg-h')); return;
    }
    maybeShowNotice();
    if (token === 'profile'){ fillProfileForm(); show('profile'); focusMain($('#prof-h')); return; }
    if (token === 'about'){ renderAbout(); show('about'); focusMain($('#about-h')); return; }
    if (token === 'feedback'){ renderFeedback(); show('feedback'); focusMain($('#fb-h')); return; }
    if (token === 'nearby'){ renderNearby(); show('nearby'); focusMain($('#near-h')); return; }
    if (!dataReady){ show(dataFailed ? 'error' : 'loading'); return; }
    if (!species || token === '' || token === 'pet' || !needsSpecies(token)){
      if (needsSpecies(token)) pendingToken = token;
      updateHomeProfileLabel();
      show('pet'); focusMain($('#pet-h')); return;
    }
    renderSearchChrome();
    if (token.indexOf('food-') === 0){
      var food = BY_ID[token.slice(5)];
      if (food){
        currentFoodId = food.id;
        addRecent(food.id);
        renderResult(food); show('result'); focusMain($('#food-h')); return;
      }
      nfQuery = '';
      token = 'nf';
    }
    if (token === 'nf'){
      $('#nf-body').innerHTML = notFoundHTML(nfQuery, 'nf-h');
      $('#nf-dish').innerHTML = dishHintHTML(nfQuery, null);
      show('notfound'); focusMain($('#nf-h')); return;
    }
    renderPopular(); renderSaved();
    show('search');
    runSearch();
    if (!opts.keepFocus) focusMain($('#search-h'));
  }
  function tokenFromLocation(){
    var h = '';
    try { h = decodeURIComponent(location.hash.replace(/^#/, '')); } catch(e){ h = location.hash.replace(/^#/, ''); }
    if (h.indexOf('food/') === 0) h = 'food-' + h.slice(5);   // v1 links
    if (h.indexOf('nf/') === 0){ nfQuery = h.slice(3); h = 'nf'; }
    return h;
  }
  function goSearch(focusInput){
    go('search', {keepFocus: !!focusInput});
    if (focusInput) $('#q').focus();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function(e){
    var t = e.target.closest('button, a'); if (!t) return;
    if (t.classList.contains('sp-card')){
      setSpecies(t.getAttribute('data-sp'));
      $('#q').value = ''; clearResults();
      var next = pendingToken; pendingToken = null;
      if (next) go(next); else goSearch(true);
      return;
    }
    if (t.hasAttribute('data-food')){ go('food-' + t.getAttribute('data-food')); return; }
    if (t.hasAttribute('data-cat')){ showCategory(t.getAttribute('data-cat')); return; }
    if (t.hasAttribute('data-emg-sp')){
      emgSpecies = t.getAttribute('data-emg-sp');
      if (!species) setSpecies(emgSpecies);
      renderEmergency(); return;
    }
    if (t.hasAttribute('data-emg-food')){
      emgFoodId = t.getAttribute('data-emg-food');
      renderEmergency();
      var ans = $('#emg-answer');
      if (ans.firstElementChild){ ans.setAttribute('tabindex', '-1'); focusMain(ans); ans.scrollIntoView && ans.scrollIntoView({block:'start'}); }
      return;
    }
    var a = t.getAttribute('data-action');
    if (!a){
      if (t.id === 'brand-link'){ e.preventDefault(); go(species ? 'search' : 'pet'); }
      else if (t.id === 'clear-q' || t.id === 'clear-results'){ $('#q').value = ''; clearResults(); renderSaved(); $('#clear-q').hidden = true; $('#q').focus(); }
      else if (t.id === 'clear-eq'){ $('#eq').value = ''; emgFoodId = null; renderEmergency(); $('#eq').focus(); }
      return;
    }
    if (t.tagName === 'A') e.preventDefault();
    switch (a){
      case 'change-pet': go('pet'); break;
      case 'back-search': goSearch(true); break;
      case 'new-search': $('#q').value = ''; clearResults(); goSearch(true); break;
      case 'home-or-search': go(species ? 'search' : 'pet'); break;
      case 'emergency': go('emergency'); break;
      case 'emergency-food':
        emgFoodId = t.getAttribute('data-id'); emgSpecies = species;
        $('#eq').value = BY_ID[emgFoodId] ? BY_ID[emgFoodId].name_th : '';
        go('emergency'); break;
      case 'emg-clear': emgFoodId = null; $('#eq').value = ''; renderEmergency(); $('#eq').focus(); break;
      case 'emg-full':
        if (emgSpecies) setSpecies(emgSpecies);
        go('food-' + t.getAttribute('data-id')); break;
      case 'profile': go('profile'); break;
      case 'about': go('about'); break;
      case 'nearby': go('nearby'); break;
      case 'other-species':
        setSpecies(species === 'dog' ? 'cat' : 'dog');
        if (currentFoodId) go('food-' + currentFoodId, {replace:true});
        break;
      case 'fav': {
        var id = t.getAttribute('data-id'), favs = getFavs(), i = favs.indexOf(id);
        if (i === -1) favs.unshift(id); else favs.splice(i, 1);
        var ok = lsSet(LS.favs, favs);
        t.setAttribute('aria-pressed', String(i === -1));
        toast(!ok ? 'บันทึกในเครื่องนี้ไม่ได้' : (i === -1 ? 'บันทึกแล้ว' : 'นำออกจากรายการที่บันทึกแล้ว'));
        break;
      }
      case 'copy-share': {
        var box = $('.copy-fallback'), ta = $('#share-text');
        copyText(ta.value, function(){ box.hidden = false; selectEl(ta); toast('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความไว้ให้แล้ว'); });
        break;
      }
      case 'copy-phone': {
        var phone = t.getAttribute('data-phone'), span = t.parentNode.querySelector('.phone');
        copyText(phone, function(){ selectEl(span); toast('เลือกเบอร์ไว้ให้แล้ว กดค้างเพื่อคัดลอก'); });
        break;
      }
      case 'request-food': {
        var q = t.getAttribute('data-q'), done = t.parentNode.querySelector('.req-done');
        var saved = requestFood(q, species);
        t.disabled = true;
        done.hidden = false;
        done.textContent = saved ? 'บันทึกคำขอแล้ว ขอบคุณค่ะ' : 'บันทึกคำขอในเครื่องนี้ไม่ได้ ขอบคุณค่ะ';
        break;
      }
      case 'help-yes': onHelpful(t, true); break;
      case 'help-no': onHelpful(t, false); break;
      case 'help-send': sendUnclear(t); break;
      case 'feedback': go('feedback'); break;
      case 'fb-again': resetFeedback(); renderFeedback(); focusMain($('#fb-h')); break;
      case 'fb-copy': {
        var fta = $('#fb-copy-text');
        copyText(fta.value, function(){ selectEl(fta); toast('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความไว้ให้แล้ว'); });
        break;
      }
      case 'retry-data': loadFoods(); break;
      case 'install': doInstall(); break;
      case 'ios-hint-close': lsSet(LS.iosHint, 'closed'); $('#ios-hint').hidden = true; break;
      case 'update-app': applyUpdate(); break;
      case 'notice-show': openNotice(); break;
      case 'clear-local': {
        if (!window.confirm('ลบโปรไฟล์ รายการที่บันทึก ประวัติการค้นหา และการตั้งค่าทั้งหมดในเครื่องนี้?')) break;
        Object.keys(LS).forEach(function(k){ if (k !== 'notice') lsDel(LS[k]); });
        profile = null; species = null; helpedThisVisit = {};
        renderPrivacyBox(); toast('ลบข้อมูลในเครื่องนี้แล้ว');
        break;
      }
      case 'clear-recent': lsDel(LS.recent); renderSaved(); toast('ล้างประวัติแล้ว'); break;
      case 'delete-profile':
        profile = null; lsDel(LS.profile); fillProfileForm(); updateHomeProfileLabel();
        $('#pf-msg').hidden = false; $('#pf-msg').textContent = 'ลบโปรไฟล์แล้ว';
        break;
    }
  });
  $('#q').addEventListener('input', runSearch);
  $('#search-form').addEventListener('submit', function(e){
    e.preventDefault();
    var raw = $('#q').value.trim(); if (!raw) return;
    var items = search(raw);
    if (items.length === 1) go('food-' + items[0].id);
    else if (!items.length){ recordMissed(raw, species); nfQuery = raw; go('nf'); }
  });
  $('#eq').addEventListener('input', function(){ emgFoodId = null; renderEmgAnswer(); runEmgSearch(); });
  $('#emg-form').addEventListener('submit', function(e){
    e.preventDefault();
    var items = search($('#eq').value.trim());
    if (items.length === 1){ emgFoodId = items[0].id; renderEmergency(); }
  });
  $('#fb-form').addEventListener('submit', function(e){ e.preventDefault(); submitFeedback(); });
  $('#fb-wish').addEventListener('input', function(){
    $('#fb-wish-count').textContent = this.value.length + '/500 ตัวอักษร';
  });
  $('#fb-form').addEventListener('change', function(e){
    var row = e.target.closest('.form-row');
    if (row && row.classList.contains('invalid')){
      row.classList.remove('invalid');
      var p = row.querySelector('.field-err'); if (p) p.hidden = true;
    }
  });
  $('#optout').addEventListener('change', function(){
    lsSet(LS.optout, this.checked);
    toast(this.checked ? 'ปิดการส่งข้อมูลการใช้งานแล้ว' : 'เปิดการส่งข้อมูลการใช้งานแล้ว');
  });
  $('#profile-form').addEventListener('submit', function(e){
    e.preventDefault();
    if (saveProfileFromForm()) go('search');
  });
  window.addEventListener('popstate', function(e){
    var st = e.state;
    if (st && typeof st.q === 'string') nfQuery = st.q;
    var t = (st && typeof st.t === 'string') ? st.t : tokenFromLocation();
    render(t);
  });
  window.addEventListener('hashchange', function(){
    var t = tokenFromLocation();
    if (t !== current) render(t);
  });

  /* =====================================================================
     ONE-TIME NOTICE — shown before anything could be sent.
     'remote' = full notice (Google Form configured), 'local' = light notice.
     If the owner connects a form later, people who saw only the light
     notice see the full one once. Never shown on top of emergency mode.
     ===================================================================== */
  var lastFocus = null;
  function openDlg(d){
    if (!d || d.open) return;
    lastFocus = document.activeElement;
    try { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } catch(e){ d.setAttribute('open', ''); }
  }
  function neededNotice(){ return remoteConfigured() ? 'remote' : 'local'; }
  function noticeOK(){
    var seen = noticeSeen();
    return seen === 'remote' || (seen === 'local' && neededNotice() === 'local');
  }
  function openNotice(){
    var remote = neededNotice() === 'remote';
    $('#notice-remote').hidden = !remote;
    $('#notice-draft').hidden = !!REVIEW.reviewer;
    openDlg($('#notice-dlg'));
  }
  function maybeShowNotice(){ if (!noticeOK()) openNotice(); }
  $('#notice-dlg').addEventListener('close', function(){
    lsSet(LS.notice, neededNotice());
    if (lastFocus && document.contains(lastFocus) && lastFocus.focus){ try { lastFocus.focus({preventScroll:true}); } catch(e){} }
  });
  // Escape also counts as "seen": the sheet only informs, it asks for nothing.

  /* =====================================================================
     INSTALL PROMPT (Android/desktop Chrome) + iOS "Add to Home Screen" hint
     ===================================================================== */
  var deferredPrompt = null;
  function isStandalone(){
    try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch(e){ return false; }
  }
  function isIOS(){
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function iosHintWanted(){ return isIOS() && !isStandalone() && lsGet(LS.iosHint, null) !== 'closed'; }
  function setInstallVisible(on){ $$('.js-install').forEach(function(b){ b.hidden = !on; }); }
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    setInstallVisible(true);
  });
  window.addEventListener('appinstalled', function(){ deferredPrompt = null; setInstallVisible(false); toast('ติดตั้งแอปแล้ว'); });
  function doInstall(){
    if (!deferredPrompt) return;
    var p = deferredPrompt; deferredPrompt = null;
    setInstallVisible(false);
    try { p.prompt(); } catch(e){}
  }

  /* =====================================================================
     SERVICE WORKER (offline + "new version" toast). Only on https/localhost.
     ===================================================================== */
  var waitingSW = null, reloading = false;
  function showUpdateBar(sw){ waitingSW = sw; $('#update-bar').hidden = false; }
  function applyUpdate(){
    if (waitingSW){ waitingSW.postMessage({type:'SKIP_WAITING'}); }
    else location.reload();
  }
  function registerSW(){
    if (!('serviceWorker' in navigator)) return;
    var h = location.hostname;
    var okHost = location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    if (!okHost) return;
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if (reloading) return;
      reloading = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function(reg){
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
      reg.addEventListener('updatefound', function(){
        var nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', function(){
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(nw);
        });
      });
      // check for a new version when the app comes back to the foreground
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'visible') { try { reg.update(); } catch(e){} }
      });
    }).catch(function(err){ console.warn('service worker registration failed', err); });
  }

  /* =====================================================================
     DATA LOADING — data/foods.json, relative URL so it works in any folder
     ===================================================================== */
  var dataFailed = false;
  function loadFoods(){
    dataFailed = false;
    if (current !== 'emergency' && current !== 'profile' && current !== 'about' && current !== 'feedback' && current !== 'nearby') show('loading');
    return fetch(DATA_URL, {cache:'no-cache'}).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(list){
      setFoods(list);
      if (!FOODS.length) throw new Error('empty food list');
      dataReady = true;
      renderCategories();
      if (current === 'emergency') renderEmergency();          // keep focus where the user is
      else if (current === 'profile' || current === 'about' || current === 'feedback' || current === 'nearby') { /* static screens */ }
      else render(current === '' && species ? 'search' : current);
    }).catch(function(err){
      console.error('โหลด data/foods.json ไม่สำเร็จ', err);
      dataFailed = true;
      if (current !== 'emergency' && current !== 'profile' && current !== 'about' && current !== 'feedback' && current !== 'nearby') show('error');
    });
  }

  /* ---------- init ---------- */
  $('#legend').innerHTML = legendHTML();
  var start = tokenFromLocation();
  try { history.replaceState({t:start, q:nfQuery}, '', location.hash || location.pathname + location.search); } catch(e){}
  current = start;
  if (start === 'emergency' || start === 'profile' || start === 'about' || start === 'feedback' || start === 'nearby') render(start);
  else show('loading');
  loadFoods();
  registerSW();
})();
