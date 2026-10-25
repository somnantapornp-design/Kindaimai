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
    dog:{name:'น้องหมา', nick:'น้องหมา', icon:'icons/pet-dog.jpg'},
    cat:{name:'น้องแมว', nick:'น้องแมว', icon:'icons/pet-cat.jpg'}
  };
  var LS = {species:'kdm-species', profile:'kdm-profile', pets:'kdm-pets-v1', petsDamaged:'kdm-pets-v1-damaged', favs:'kdm-favs', recent:'kdm-recent', requests:'kdm-requests',
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
  var SP_TXT = {dog:'น้องหมา', cat:'น้องแมว', both:'ทั้งสอง'};
  var PETS_TXT = {dog:'น้องหมา', cat:'น้องแมว', both:'ทั้งน้องหมาและน้องแมว'};
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

  /* =====================================================================
     HEALTH BOOK DATA (สมุดสุขภาพน้อง) — key kdm-pets-v1, on this device only.
     {activeId, pets:[{id,name,species,birthDate,ageYears,ageMonths,ageSetAt,
       sex,sterilized,lifeStage,flags:{overweight,kidney},weights[],vaccines[],
       deworm[],meds[],appts[],createdAt}]}
       meds:  [{id,name,instructions,times:['08:00'],start,end,refillDate,note,doses:[{date,time,at}]}]
       appts: [{id,date,time,clinic,reason,note,done}]
     Works in memory when storage is blocked (storageOK = false → note shown).
     ===================================================================== */
  var TH_MON = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var MAX_LIST = 500, MAX_PETS = 50, MAX_MEDS = 100, MAX_APPTS = 300, MAX_TIMES = 6, MAX_DOSES = 600, DOSE_DAYS = 90;
  var ISO_RE = /^\d{4}-\d{2}-\d{2}$/, ID_RE = /^[A-Za-z0-9_-]{1,40}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  function isoOf(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }   // local date, no UTC shift
  function todayISO(){ return isoOf(new Date()); }
  function parseISO(s){
    if (!ISO_RE.test(String(s || ''))) return null;
    var p = s.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return (d.getFullYear() === +p[0] && d.getMonth() === +p[1] - 1 && d.getDate() === +p[2]) ? d : null;
  }
  function validISO(s){ return !!parseISO(s) && s >= '1980-01-01' && s <= '2200-12-31'; }
  function dayNum(s){ var p = s.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
  function daysUntil(s){ return dayNum(s) - dayNum(todayISO()); }
  function thDate(s){ var d = parseISO(s); return d ? d.getDate() + ' ' + TH_MON[d.getMonth()] + ' ' + (d.getFullYear() + 543) : ''; }
  function thDateShort(s, withYear){ var d = parseISO(s); return d ? d.getDate() + ' ' + TH_MON[d.getMonth()] + (withYear ? ' ' + String(d.getFullYear() + 543).slice(2) : '') : ''; }
  function newId(p){ return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cleanStr(v, max){ return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function kgFmt(kg){ return (Math.round(kg * 10) / 10).toFixed(1); }
  function emptyBook(){ return {activeId:null, pets:[]}; }
  function nowHM(){ var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function addDaysISO(s, n){ var d = parseISO(s); return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
  function doseCutoff(){ return addDaysISO(todayISO(), -(DOSE_DAYS - 1)); }   // keep the last 90 days (incl. today)
  function medActive(m, day){ day = day || todayISO(); return m.start <= day && (!m.end || m.end >= day); }
  function medStopped(m){ return !!m.end && m.end < todayISO(); }
  function doseGiven(m, day, t){ return m.doses.some(function(d){ return d.date === day && d.time === t; }); }

  // Strict validation + sanitising. Returns a clean book, or throws Error(Thai message).
  function validateBook(raw){
    function bad(m){ throw new Error(m); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('ไฟล์ไม่ใช่ข้อมูลสมุดสุขภาพ');
    if (!Array.isArray(raw.pets)) bad('ไม่พบรายชื่อน้องในไฟล์');
    if (raw.pets.length > MAX_PETS) bad('ไฟล์มีจำนวนน้องมากเกินไป');
    function optDate(v, what){ if (v == null || v === '') return ''; if (!validISO(v)) bad('วันที่' + what + 'ไม่ถูกต้อง'); return v; }
    function reqDate(v, what){ if (!validISO(v)) bad('วันที่' + what + 'ไม่ถูกต้อง'); return v; }
    function idOf(v){ if (!ID_RE.test(String(v || ''))) bad('รหัสรายการในไฟล์ไม่ถูกต้อง'); return String(v); }
    function list(v, what, max){ if (v == null) return []; if (!Array.isArray(v)) bad('ข้อมูล' + what + 'ไม่ถูกต้อง'); if (v.length > (max || MAX_LIST)) bad('ข้อมูล' + what + 'มากเกินไป'); return v; }
    function optTime(v, what){ if (v == null || v === '') return ''; if (typeof v !== 'string' || !TIME_RE.test(v)) bad('เวลา' + what + 'ไม่ถูกต้อง'); return v; }
    function reqTime(v, what){ if (typeof v !== 'string' || !TIME_RE.test(v)) bad('เวลา' + what + 'ไม่ถูกต้อง'); return v; }
    function obj(v, what){ if (!v || typeof v !== 'object' || Array.isArray(v)) bad('ข้อมูล' + what + 'ไม่ถูกต้อง'); return v; }
    var seen = {};
    var pets = raw.pets.map(function(p){
      obj(p, 'น้อง');
      var id = idOf(p.id); if (seen[id]) bad('รหัสน้องซ้ำกันในไฟล์'); seen[id] = 1;
      var name = cleanStr(p.name, 30); if (!name) bad('มีน้องที่ไม่มีชื่อ');
      if (!SPECIES[p.species]) bad('ชนิดสัตว์ของ ' + name + ' ไม่ถูกต้อง');
      function intOrNull(v, max){ if (v == null || v === '') return null; if (typeof v !== 'number' || v !== Math.floor(v) || v < 0 || v > max) bad('อายุของ ' + name + ' ไม่ถูกต้อง'); return v; }
      var flags = p.flags == null ? {} : obj(p.flags, 'ภาวะพิเศษ');
      if (['', 'male', 'female'].indexOf(p.sex == null ? '' : p.sex) === -1) bad('เพศของ ' + name + ' ไม่ถูกต้อง');
      if (['', 'yes', 'no'].indexOf(p.sterilized == null ? '' : p.sterilized) === -1) bad('ข้อมูลทำหมันของ ' + name + ' ไม่ถูกต้อง');
      if (['young', 'adult', 'senior'].indexOf(p.lifeStage) === -1) bad('ช่วงวัยของ ' + name + ' ไม่ถูกต้อง');
      var eids = {};
      function eid(v){ var i = idOf(v); if (eids[i]) bad('รหัสบันทึกซ้ำกันในไฟล์'); eids[i] = 1; return i; }
      return {
        id:id, name:name, species:p.species,
        birthDate: optDate(p.birthDate, 'เกิด'),
        ageYears: intOrNull(p.ageYears, 40), ageMonths: intOrNull(p.ageMonths, 11),
        ageSetAt: optDate(p.ageSetAt, 'บันทึกอายุ'),
        sex: p.sex || '', sterilized: p.sterilized || '', lifeStage: p.lifeStage,
        flags: {overweight: flags.overweight === true, kidney: flags.kidney === true},
        weights: list(p.weights, 'น้ำหนัก').map(function(w){
          obj(w, 'น้ำหนัก');
          if (typeof w.kg !== 'number' || !(w.kg >= 0.1 && w.kg <= 150)) bad('น้ำหนักในไฟล์ไม่ถูกต้อง');
          return {id:eid(w.id), date:reqDate(w.date, 'ชั่งน้ำหนัก'), kg:Math.round(w.kg * 10) / 10};
        }),
        vaccines: list(p.vaccines, 'วัคซีน').map(function(v){
          obj(v, 'วัคซีน');
          var n = cleanStr(v.name, 60); if (!n) bad('มีบันทึกวัคซีนที่ไม่มีชื่อ');
          return {id:eid(v.id), date:reqDate(v.date, 'ฉีดวัคซีน'), name:n, nextDue:optDate(v.nextDue, 'นัด'), note:cleanStr(v.note, 200)};
        }),
        deworm: list(p.deworm, 'ถ่ายพยาธิ').map(function(v){
          obj(v, 'ถ่ายพยาธิ');
          var n = cleanStr(v.product, 60); if (!n) bad('มีบันทึกถ่ายพยาธิที่ไม่มีชื่อผลิตภัณฑ์');
          return {id:eid(v.id), date:reqDate(v.date, 'ถ่ายพยาธิ'), product:n, nextDue:optDate(v.nextDue, 'นัด'), note:cleanStr(v.note, 200)};
        }),
        meds: list(p.meds, 'ยา', MAX_MEDS).map(function(m){
          obj(m, 'ยา');
          var n = cleanStr(m.name, 60); if (!n) bad('มีบันทึกยาที่ไม่มีชื่อยา');
          var times = list(m.times, 'เวลาให้ยา', MAX_TIMES).map(function(t){ return reqTime(t, 'ให้ยา ' + n); });
          if (!times.length) bad('ยา ' + n + ' ไม่มีเวลาให้ยา');
          times = times.filter(function(t, i){ return times.indexOf(t) === i; }).sort();
          var start = reqDate(m.start, 'เริ่มให้ยา'), end = optDate(m.end, 'หยุดยา');
          if (end && end < start) bad('วันสิ้นสุดของยา ' + n + ' อยู่ก่อนวันเริ่ม');
          var cut = doseCutoff(), dk = {};
          var doses = list(m.doses, 'การให้ยา', 2000).map(function(d){
            obj(d, 'การให้ยา');
            var at = String(d.at == null ? '' : d.at);
            if (!STAMP_RE.test(at)) bad('เวลาบันทึกการให้ยาไม่ถูกต้อง');
            return {date:reqDate(d.date, 'ให้ยา'), time:reqTime(d.time, 'ให้ยา'), at:at};
          }).filter(function(d){ var k = d.date + ' ' + d.time; if (dk[k] || d.date < cut) return false; dk[k] = 1; return true; });
          return {id:eid(m.id), name:n, instructions:cleanStr(m.instructions, 200), times:times, start:start, end:end,
            refillDate:optDate(m.refillDate, 'รับยา'), note:cleanStr(m.note, 200), doses:doses.slice(-MAX_DOSES)};
        }),
        appts: list(p.appts, 'นัดหมอ', MAX_APPTS).map(function(a){
          obj(a, 'นัดหมอ');
          if (a.done != null && typeof a.done !== 'boolean') bad('สถานะนัดหมอไม่ถูกต้อง');
          return {id:eid(a.id), date:reqDate(a.date, 'นัดหมอ'), time:optTime(a.time, 'นัดหมอ'), clinic:cleanStr(a.clinic, 80),
            reason:cleanStr(a.reason, 60), note:cleanStr(a.note, 200), done:a.done === true};
        }),
        createdAt: cleanStr(p.createdAt, 40)
      };
    });
    var active = pets.some(function(p){ return p.id === raw.activeId; }) ? raw.activeId : (pets[0] ? pets[0].id : null);
    return {activeId:active, pets:pets};
  }
  function probeStorage(){
    try { localStorage.setItem('kdm-probe', '1'); localStorage.removeItem('kdm-probe'); return true; } catch(e){ return false; }
  }
  var storageOK = probeStorage();
  // Old single profile {species, weight, stage:'baby'|'adult'|'senior', overweight, kidney, name} → first pet
  function migrateOldProfile(){
    var p = lsGet(LS.profile, null);
    if (!p || typeof p !== 'object' || !SPECIES[p.species]) return null;
    var kg = parseFloat(p.weight), today = todayISO();
    var pet = {
      id:newId('p'), name:cleanStr(p.name, 30) || SPECIES[p.species].nick, species:p.species,
      birthDate:'', ageYears:null, ageMonths:null, ageSetAt:'', sex:'', sterilized:'',
      lifeStage: p.stage === 'baby' ? 'young' : (p.stage === 'senior' ? 'senior' : 'adult'),
      flags:{overweight:!!p.overweight, kidney:!!p.kidney},
      weights: (kg >= 0.1 && kg <= 150) ? [{id:newId('w'), date:today, kg:Math.round(kg * 10) / 10}] : [],
      vaccines:[], deworm:[], meds:[], appts:[], createdAt:new Date().toISOString()
    };
    return {activeId:pet.id, pets:[pet]};
  }
  function loadBook(){
    var raw = lsGet(LS.pets, null);
    if (raw != null){
      try { return validateBook(raw); }
      catch(e){ lsSet(LS.petsDamaged, raw); return emptyBook(); }   // keep a copy, never crash
    }
    var mig = migrateOldProfile();
    if (mig){
      if (lsSet(LS.pets, mig)) lsDel(LS.profile);   // remove the old key only once the new one is saved
      return mig;
    }
    return emptyBook();
  }
  function saveBook(){
    var ok = lsSet(LS.pets, book);
    if (!ok) storageOK = false;
    return ok;
  }
  function petById(id){ return book.pets.filter(function(p){ return p.id === id; })[0] || null; }
  function activePet(){ return petById(book.activeId) || book.pets[0] || null; }
  function sortedDesc(arr){ return arr.slice().sort(function(a, b){ return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); }
  function latestWeight(p){ return p && p.weights.length ? sortedDesc(p.weights)[0] : null; }
  // Age in whole months: from birthDate, or the approximate age advanced by time since ageSetAt
  function ageMonthsOf(p){
    var now = new Date();
    function monthsSince(d){ var m = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth(); if (now.getDate() < d.getDate()) m--; return Math.max(0, m); }
    var b = parseISO(p && p.birthDate);
    if (b) return monthsSince(b);
    if (p && (p.ageYears != null || p.ageMonths != null)){
      var base = (p.ageYears || 0) * 12 + (p.ageMonths || 0), set = parseISO(p.ageSetAt);
      return base + (set ? monthsSince(set) : 0);
    }
    return null;
  }
  function ageText(m){
    if (m == null) return '';
    var y = Math.floor(m / 12), mo = m % 12;
    if (!y && !mo) return 'ไม่ถึง 1 เดือน';
    return (y ? y + ' ปี' : '') + (y && mo ? ' ' : '') + (mo ? mo + ' เดือน' : '');
  }
  function stageOf(p){ var m = ageMonthsOf(p); return (m != null && m < 12) ? 'young' : p.lifeStage; }
  // Upcoming / overdue appointments across all pets (nextDue within `days`, or overdue)
  function dueItems(days){
    var out = [];
    book.pets.forEach(function(p){
      p.vaccines.forEach(function(v){ if (v.nextDue) out.push({pet:p, kind:'vaccine', item:v, due:v.nextDue, d:daysUntil(v.nextDue)}); });
      p.deworm.forEach(function(v){ if (v.nextDue) out.push({pet:p, kind:'deworm', item:v, due:v.nextDue, d:daysUntil(v.nextDue)}); });
      p.meds.forEach(function(m){ if (m.refillDate && !medStopped(m)) out.push({pet:p, kind:'med', item:m, due:m.refillDate, d:daysUntil(m.refillDate)}); });
      p.appts.forEach(function(a){ if (!a.done) out.push({pet:p, kind:'appt', item:a, due:a.date, d:daysUntil(a.date)}); });
    });
    return out.filter(function(x){ return x.d <= days; }).sort(function(a, b){
      return a.d - b.d || String(a.item.time || '').localeCompare(String(b.item.time || ''));
    });
  }
  function dueTitle(x){
    if (x.kind === 'vaccine') return (/^วัคซีน/.test(x.item.name) ? '' : 'วัคซีน') + x.item.name;
    if (x.kind === 'med') return 'รับยา ' + x.item.name;
    if (x.kind === 'appt') return 'นัดหมอ' + (x.item.reason ? ': ' + x.item.reason : '');
    return 'ถ่ายพยาธิ/เห็บหมัด: ' + x.item.product;
  }

  // Today's doses not yet given, across all pets (sorted by time)
  function todayDoses(){
    var day = todayISO(), now = nowHM(), out = [];
    book.pets.forEach(function(p){
      p.meds.forEach(function(m){
        if (!medActive(m, day)) return;
        m.times.forEach(function(t){ if (!doseGiven(m, day, t)) out.push({pet:p, med:m, time:t, late:t < now}); });
      });
    });
    return out.sort(function(a, b){ return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
  }
  function setDose(petId, medId, t, given){
    var p = petById(petId), m = p && p.meds.filter(function(x){ return x.id === medId; })[0], day = todayISO();
    if (!m || m.times.indexOf(t) === -1 || !medActive(m, day)) return false;
    var cut = doseCutoff();
    m.doses = m.doses.filter(function(d){ return d.date >= cut && !(d.date === day && d.time === t); });
    if (given) m.doses.push({date:day, time:t, at:new Date().toISOString()});
    if (m.doses.length > MAX_DOSES) m.doses = m.doses.slice(-MAX_DOSES);
    saveBook();
    return true;
  }

  /* ---------- state ---------- */
  var species = SPECIES[lsGet(LS.species, null)] ? lsGet(LS.species, null) : null;
  var book = loadBook();
  if (!species && activePet()) species = activePet().species;
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
  var VIEWS = ['loading','error','pet','search','result','notfound','emergency','profile','about','feedback','nearby','adopt'];
  function show(name){
    VIEWS.forEach(function(v){ $('#view-'+v).hidden = (v !== name); });
    var hint = $('#ios-hint'); if (hint) hint.hidden = !(name === 'pet' || name === 'search') || !iosHintWanted();
    document.body.classList.toggle('cat', species === 'cat');
    $$('.js-draft').forEach(function(b){ b.hidden = !!REVIEW.reviewer; });
    var tab = {pet:'home', search:'eat', result:'eat', notfound:'eat', nearby:'nearby', adopt:'adopt', profile:'profile'}[name] || '';
    $$('.tabbar [data-tab]').forEach(function(b){
      if (b.getAttribute('data-tab') === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
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
    $$('.sp-icon').forEach(function(n){ n.setAttribute('src', sp.icon); });
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
  // p = a pet from the health book; uses its latest weight, life stage (auto 'young' < 12 months) and flags
  function treatKcal(p){
    var w = latestWeight(p), kg = w ? w.kg : NaN, stage = stageOf(p);
    if (!(kg > 0 && kg < 150) || stage === 'young') return null;
    var factor = (stage === 'senior' || p.flags.overweight) ? 1.0 : (p.species === 'cat' ? 1.2 : 1.6);
    var rer = 70 * Math.pow(kg, 0.75);
    return Math.round(rer * factor * 0.10);
  }
  // inBook = shown inside the health book (pet given explicitly); otherwise the active pet if it matches the species searched
  function treatCardHTML(pet, inBook){
    var p = pet || null;
    if (!inBook){ p = activePet(); if (p && p.species !== species) p = null; }
    var html = '<div class="card treat"><h2>'+icon('i-paw')+'ปริมาณขนมต่อวัน</h2>'+
      '<p>ขนมและอาหารเสริมทุกชนิดรวมกันไม่ควรเกิน 10% ของพลังงานต่อวัน (แนวทาง WSAVA)</p>';
    if (p){
      var kc = treatKcal(p), w = latestWeight(p);
      if (kc != null){
        html += '<p class="kcal">'+esc(p.name)+' ('+kgFmt(w.kg)+' กก.): ไม่เกินประมาณ '+kc+' kcal ต่อวัน</p>'+
          '<p class="est-note">ค่าประมาณคร่าว ๆ ปรึกษาสัตวแพทย์สำหรับตัวเลขที่เหมาะกับน้อง</p>';
      } else if (!w){
        html += '<p class="small muted">'+(inBook ? '<button type="button" class="link-btn" style="padding:0" data-action="hb-add-weight">เพิ่มบันทึกน้ำหนัก</button>'
          : '<button type="button" class="link-btn" style="padding:0" data-action="profile">เพิ่มน้ำหนักในสมุดสุขภาพ</button>')+' เพื่อดูตัวเลขโดยประมาณ</p>';
      }
      if (p.flags.kidney || stageOf(p) === 'young'){
        html += '<div class="caveat">น้องมีภาวะพิเศษ ควรถามสัตวแพทย์ก่อนให้อาหารนอกมื้อ</div>';
      }
    } else {
      html += '<p class="small muted"><button type="button" class="link-btn" style="padding:0;min-height:44px" data-action="profile">ใส่ข้อมูลน้องในสมุดสุขภาพ</button> เพื่อดูตัวเลขโดยประมาณ</p>';
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
      box.innerHTML = head + '<p class="card">เลือกด้านบนก่อนว่าเป็นน้องหมาหรือน้องแมว เพราะความอันตรายต่างกัน</p>';
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
  function linkRow(href, ic, title, sub){
    return '<a class="row-btn" href="'+esc(href)+'" target="_blank" rel="noopener">'+icon(ic)+
      '<span>'+esc(title)+(sub ? '<span class="sub">'+esc(sub)+'</span>' : '')+'</span>'+
      '<svg aria-hidden="true" class="ext"><use href="#i-ext"/></svg><span class="sr-only">(เปิดในหน้าต่างใหม่)</span></a>';
  }
  /* ---------- rehoming board: posts come from a published Google Sheet (CSV),
       only rows the owner approved are in that sheet; the app never writes there ---------- */
  var REHOME = (CFG.REHOME && typeof CFG.REHOME === 'object') ? CFG.REHOME : {};
  var LS_RH = 'kdm-rehome-cache';
  var rhPosts = null, rhLoading = false, rhSp = 'all', rhError = false, rhFromCache = null, rhOpen = {};
  function parseCSV(text){
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++){
      var c = text[i];
      if (q){
        if (c === '"'){ if (text[i+1] === '"'){ cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ','){ row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r'){
        if (c === '\r' && text[i+1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length){ row.push(cell); rows.push(row); }
    return rows.filter(function(r){ return r.some(function(x){ return String(x).trim() !== ''; }); });
  }
  function rhSpecies(v){
    v = String(v || '');
    if (/แมว|cat/i.test(v)) return 'cat';
    if (/หมา|สุนัข|dog/i.test(v)) return 'dog';
    return '';
  }
  function driveImg(u){
    u = String(u || '').split(/[\s,]+/)[0];
    var m = u.match(/[?&]id=([\w-]{10,})/) || u.match(/\/d\/([\w-]{10,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
    return /^https:\/\//.test(u) ? u : '';
  }
  function lineUrl(id){
    id = String(id || '').trim().replace(/\s+/g, '');
    if (!id) return '';
    return id.charAt(0) === '@' ? 'https://line.me/R/ti/p/@' + encodeURIComponent(id.slice(1)) : 'https://line.me/R/ti/p/~' + encodeURIComponent(id);
  }
  function rowsToPosts(rows){
    if (!rows.length) return [];
    var head = rows[0].map(function(h){ return String(h).trim().toLowerCase(); });
    return rows.slice(1).map(function(r, i){
      var o = {}; head.forEach(function(h, j){ o[h] = String(r[j] == null ? '' : r[j]).trim(); });
      o.sp = rhSpecies(o.species);
      o.id = 'p' + (o.posted_at || i).replace(/\W+/g, '');
      o.adopted = /ได้บ้าน|adopted/i.test(o.status || '');
      return o;
    }).filter(function(o){ return o.name || o.details; });
  }
  function loadRehome(force){
    var url = safeUrl(REHOME.listingsCsvUrl);
    if (!url){ rhPosts = []; renderRehome(); return; }
    if (rhLoading || (rhPosts && !force)) { renderRehome(); return; }
    rhLoading = true; rhError = false; renderRehome();
    fetch(url, {cache:'no-cache'}).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function(t){
      rhPosts = rowsToPosts(parseCSV(t)).reverse();   // newest first
      rhFromCache = null;
      lsSet(LS_RH, {at: new Date().toISOString(), posts: rhPosts});
    }).catch(function(e){
      console.error('โหลดโพสต์หาบ้านไม่สำเร็จ', e);
      var c = lsGet(LS_RH, null);
      if (c && Array.isArray(c.posts)){ rhPosts = c.posts; rhFromCache = c.at; } else { rhPosts = []; rhError = true; }
    }).then(function(){ rhLoading = false; renderRehome(); });
  }
  function rhCard(p){
    var img = driveImg(p.photo), open = !!rhOpen[p.id];
    var facts = [p.sex, p.age, [p.district, p.province].filter(Boolean).join(' ')].filter(Boolean).map(esc).join(' · ');
    var care = [p.sterilized ? 'ทำหมัน: ' + esc(p.sterilized) : '', p.vaccinated ? 'วัคซีน: ' + esc(p.vaccinated) : ''].filter(Boolean).join(' · ');
    var line = String(p.line_id || '').trim();
    var panel = '';
    if (open){
      panel = '<div class="rh-contact" id="rh-c-'+esc(p.id)+'">'+
        '<p class="rh-warn">'+icon('i-shield')+'<span><strong>ก่อนติดต่อ:</strong> ไม่โอนเงินมัดจำหรือค่าใช้จ่ายใด ๆ ก่อนพบน้อง นัดเจอในที่สาธารณะ ขอดูประวัติวัคซีน ถ้าถูกเรียกเงิน ให้กดแจ้งโพสต์</span></p>'+
        (line ? '<p class="rh-line">LINE ID ผู้โพสต์: <span class="phone">'+esc(line)+'</span></p>'+
          '<div class="phone-row"><button type="button" class="mini-btn" data-action="copy-phone" data-phone="'+esc(line)+'">'+icon('i-copy')+'คัดลอก LINE ID</button>'+
          '<a class="mini-btn" href="'+esc(lineUrl(line))+'" target="_blank" rel="noopener">'+icon('i-chat')+'เปิด LINE</a></div>'
          : '<p class="muted small">โพสต์นี้ไม่มี LINE ID</p>')+
        '<button type="button" class="link-btn rh-report" data-action="rh-report" data-id="'+esc(p.id)+'" data-name="'+esc(p.name)+'">แจ้งโพสต์ไม่เหมาะสม</button>'+
      '</div>';
    }
    return '<li class="rh-card'+(p.adopted ? ' is-adopted' : '')+'">'+
      '<div class="rh-ph">'+(img ? '<img src="'+esc(img)+'" alt="รูป'+esc(p.name || 'น้อง')+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.className=\'rh-fallback\';this.alt=\'\';this.src=\'icons/pet-'+(p.sp || 'dog')+'.jpg\'">' : '<img src="icons/pet-'+(p.sp || 'dog')+'.jpg" alt="" class="rh-fallback">')+
        (p.adopted ? '<span class="rh-badge">ได้บ้านแล้ว</span>' : '')+'</div>'+
      '<div class="rh-body">'+
        '<h3>'+esc(p.name || 'น้องรอบ้าน')+' <span class="rh-sp rh-'+(p.sp || 'x')+'">'+esc(SP_TXT[p.sp] || p.species || '')+'</span></h3>'+
        (facts ? '<p class="small muted">'+facts+'</p>' : '')+
        (care ? '<p class="small">'+care+'</p>' : '')+
        (p.details ? '<p class="rh-details">'+esc(p.details)+'</p>' : '')+
        (p.adopted ? '' : '<button type="button" class="btn-primary rh-want" data-action="rh-interest" data-id="'+esc(p.id)+'" aria-expanded="'+open+'" aria-controls="rh-c-'+esc(p.id)+'">'+icon('i-heart')+(open ? 'ซ่อนช่องทางติดต่อ' : 'สนใจรับเลี้ยง')+'</button>')+
        panel+
      '</div></li>';
  }
  function renderRehome(){
    var box = $('#rh-post'), formU = safeUrl(REHOME.postFormUrl), csvU = safeUrl(REHOME.listingsCsvUrl);
    box.innerHTML = formU
      ? '<a class="btn-primary rh-post-btn" href="'+esc(formU)+'" target="_blank" rel="noopener">'+icon('i-plus')+'โพสต์หาบ้านให้น้อง</a>'+
        '<p class="small muted" style="margin:6px 0 0">กรอกแบบฟอร์มพร้อมรูป ผู้ดูแลแอปตรวจก่อนขึ้นหน้านี้ ให้รับเลี้ยงฟรีเท่านั้น</p>'
      : '<p class="placeholder small">ยังไม่เปิดรับโพสต์หาบ้าน ผู้ดูแลแอปกำลังตั้งค่าแบบฟอร์ม</p>';
    $$('[data-rh-sp]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-rh-sp') === rhSp)); });
    var list = $('#rh-list'), st = $('#rh-status');
    if (!csvU){ list.innerHTML = ''; st.textContent = 'ยังไม่มีโพสต์หาบ้าน'; return; }
    if (rhLoading && !rhPosts){ list.innerHTML = ''; st.textContent = 'กำลังโหลดโพสต์…'; return; }
    var where = key($('#rh-q').value || '');
    var items = (rhPosts || []).filter(function(p){
      if (rhSp !== 'all' && p.sp !== rhSp) return false;
      return !where || key((p.province || '') + (p.district || '')).indexOf(where) !== -1;
    }).sort(function(a, b){ return (a.adopted ? 1 : 0) - (b.adopted ? 1 : 0); });
    st.textContent = rhError ? 'โหลดโพสต์ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่' :
      (items.length ? 'พบ ' + items.length + ' โพสต์' : 'ยังไม่มีโพสต์ที่ตรงกับตัวเลือกนี้') +
      (rhFromCache ? ' (ข้อมูลที่บันทึกไว้ล่าสุด)' : '');
    list.innerHTML = items.map(rhCard).join('');
  }
  function renderAdopt(){
    loadRehome(false);
    var s = (Array.isArray(CFG.ADOPT_SEARCH) ? CFG.ADOPT_SEARCH : []).filter(function(n){ return n && n.title && n.query; });
    $('#adopt-search').innerHTML = s.map(function(n){ return linkRow(mapsUrl(n.query), 'i-pin', n.title, n.sub); }).join('');
    var o = (Array.isArray(CFG.ADOPT_ORGS) ? CFG.ADOPT_ORGS : []).filter(function(n){ return n && n.name && /^https?:\/\//.test(n.url || ''); });
    $('#adopt-orgs').innerHTML = o.length ? o.map(function(n){ return linkRow(n.url, 'i-adopt', n.name, n.sub); }).join('')
      : '<p class="muted small">ยังไม่มีรายชื่อองค์กร</p>';
  }
  function renderEmgNearby(){
    var box = $('#emg-near'); if (!box) return;
    var n = nearbyItems().filter(function(x){ return x.icon === 'clock'; })[0] || {query:'โรงพยาบาลสัตว์ 24 ชั่วโมง ใกล้ฉัน'};
    box.innerHTML = '<a class="btn-danger" href="'+esc(mapsUrl(n.query))+'" target="_blank" rel="noopener">'+icon('i-pin')+'หาโรงพยาบาลสัตว์ 24 ชม. ใกล้ฉัน</a>'+
      '<p class="small muted" style="margin:8px 0 0">เปิด Google Maps ควรโทรยืนยันว่าเปิดอยู่ก่อนเดินทาง</p>';
  }

  /* =====================================================================
     HEALTH BOOK UI (สมุดสุขภาพน้อง) — tokens: profile, pet-new, pet-edit.
     All three live in #view-profile; the "โปรไฟล์" tab stays highlighted.
     Never computes or suggests vaccine/deworming schedules or doses.
     ===================================================================== */
  var hbTab = 'weight';          // weight | vaccine | deworm | med | appt
  var hbForm = null;             // {kind, id|null} — inline entry form that is open
  var pfEditId = null;           // pet being edited on the pet form (null = new pet)
  var pendingConfirm = null;     // {fn, back} for the in-page confirmation
  var HB_TABS = [{k:'weight', t:'น้ำหนัก'}, {k:'vaccine', t:'วัคซีน'}, {k:'deworm', t:'ถ่ายพยาธิ'}, {k:'med', t:'ยา'}, {k:'appt', t:'นัดหมอ'}];
  var HB_LIST = {weight:'weights', vaccine:'vaccines', deworm:'deworm', med:'meds', appt:'appts'};
  var HB_NAME = {weight:'น้ำหนัก', vaccine:'วัคซีน', deworm:'ถ่ายพยาธิ / ป้องกันเห็บหมัด', med:'ยา', appt:'นัดหมอ'};
  var HB_CAP = {weight:MAX_LIST, vaccine:MAX_LIST, deworm:MAX_LIST, med:MAX_MEDS, appt:MAX_APPTS};
  var SEX_TXT = {male:'ผู้', female:'เมีย', '':'ไม่ระบุเพศ'};
  var STER_TXT = {yes:'ทำหมันแล้ว', no:'ยังไม่ทำหมัน', '':'ไม่ทราบเรื่องทำหมัน'};
  var STAGE_TXT = {young:'ลูก', adult:'โต', senior:'สูงวัย'};
  var VAX_SUGGEST = ['พิษสุนัขบ้า','วัคซีนรวมน้องหมา','วัคซีนรวมน้องแมว','ลิวคีเมียแมว','อื่นๆ'];
  var SCHEDULE_NOTE = 'ตารางวัคซีนและการถ่ายพยาธิขึ้นกับอายุ สุขภาพ และการเลี้ยงดู ให้ใส่วันนัดตามที่สัตวแพทย์แนะนำ';
  var APPT_SUGGEST = ['ตรวจติดตาม','ฉีดวัคซีน','ผ่าตัด','ทำหมัน','ตรวจเลือด','ทำฟัน','ตรวจสุขภาพประจำปี'];
  var MED_NOTE = 'แอปไม่แนะนำยา ขนาดยา หรือความถี่ในการให้ยา ใส่ตามฉลากหรือที่สัตวแพทย์สั่งเท่านั้น ถ้าน้องมีอาการผิดปกติหลังให้ยา ให้ติดต่อสัตวแพทย์';
  var REMIND_NOTE = 'แอปเตือนได้เมื่อเปิดแอป หากต้องการให้มือถือเตือนแม้ไม่ได้เปิดแอป กด เพิ่มลงปฏิทิน';

  function setActive(id){
    var p = petById(id); if (!p) return;
    book.activeId = id; saveBook(); setSpecies(p.species);
  }
  function savedToast(msg){ toast(storageOK ? msg : msg + ' (เฉพาะตอนนี้ เบราว์เซอร์บันทึกถาวรไม่ได้)'); }

  /* ---------- in-page confirmation (no confirm()/alert()) ---------- */
  function askInline(host, msg, yesLabel, onYes){
    closeConfirm();
    pendingConfirm = {fn:onYes, back:document.activeElement};
    var box = document.createElement('div');
    box.className = 'confirm';
    box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-labelledby', 'cf-msg');
    box.innerHTML = '<p id="cf-msg">'+icon('i-limited')+'<span>'+esc(msg)+'</span></p>'+
      '<div class="confirm-row"><button type="button" class="btn-del" data-action="confirm-yes">'+esc(yesLabel)+'</button>'+
      '<button type="button" class="mini-btn" data-action="confirm-no">ยกเลิก</button></div>';
    host.appendChild(box);
    box.querySelector('[data-action="confirm-no"]').focus();
    if (box.scrollIntoView) box.scrollIntoView({block:'nearest'});
  }
  function closeConfirm(){ $$('.confirm').forEach(function(b){ b.parentNode.removeChild(b); }); }

  /* ---------- downloads (.ics / backup) ---------- */
  function downloadFile(text, name, type){
    try {
      var url = URL.createObjectURL(new Blob([text], {type:type}));
      var a = document.createElement('a');
      a.href = url; a.download = name; a.hidden = true;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
      return true;
    } catch(e){ toast('ดาวน์โหลดไฟล์ไม่ได้ในเบราว์เซอร์นี้'); return false; }
  }
  function fileSafe(s){ return String(s).replace(/[\\\/:*?"<>|#%&{}$!'@+`=\u0000-\u001f]+/g, '').replace(/\s+/g, '-').slice(0, 40) || 'pet'; }
  function icsEsc(s){ return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  // RFC 5545: fold lines at 75 octets without splitting a UTF-8 character
  function icsFold(line){
    var out = [], cur = '', bytes = 0, limit = 75;
    for (var i = 0; i < line.length; i++){
      var c = line.charCodeAt(i), ch = line.charAt(i), n;
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < line.length){ ch += line.charAt(++i); n = 4; }
      else n = c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
      if (bytes + n > limit){ out.push(cur); cur = ''; bytes = 0; limit = 74; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function icsStamp(){ return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }
  function icsDay(iso){ return iso.replace(/-/g, ''); }
  function icsAlarm(trigger, text){ return ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(text), 'TRIGGER:' + trigger, 'END:VALARM']; }
  function icsAllDay(uid, iso, summary, desc, extra){
    return ['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + icsStamp(),
      'DTSTART;VALUE=DATE:' + icsDay(iso), 'DTEND;VALUE=DATE:' + icsDay(addDaysISO(iso, 1)),
      'SUMMARY:' + icsEsc(summary), 'DESCRIPTION:' + icsEsc(desc), 'TRANSP:TRANSPARENT'].concat(extra || [],
      icsAlarm('-P1D', 'พรุ่งนี้: ' + summary), ['END:VEVENT']);
  }
  function icsDoc(lines){
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//kindaimai//health-book//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
      .concat(lines, ['END:VCALENDAR']).map(icsFold).join('\r\n') + '\r\n';
  }
  var ICS_FROM = 'จากสมุดสุขภาพน้อง แอป กินได้ไหม?';
  // all-day reminder for a vaccine / deworming / refill date
  function icsFor(x){
    var summary = dueTitle(x) + ' — ' + x.pet.name;
    var desc = 'นัด' + ICS_FROM + (x.item.note ? '\n' + x.item.note : '');
    return icsDoc(icsAllDay(x.item.id + '-' + icsDay(x.due) + '@kindaimai', x.due, summary, desc));
  }
  // medicine: one daily repeating event per time of day (floating local time) + refill day
  function medIcs(p, m){
    var today = todayISO(), out = [];
    var from = m.start > today ? m.start : today;
    var summary = 'ให้ยา ' + m.name + ' — ' + p.name;
    if (!m.end || m.end >= from){
      var rule = m.end ? 'RRULE:FREQ=DAILY;UNTIL=' + icsDay(m.end) + 'T235959' : 'RRULE:FREQ=DAILY;COUNT=30';
      var desc = (m.instructions ? 'วิธีให้ (ตามที่สัตวแพทย์สั่ง): ' + m.instructions : 'ให้ตามฉลากหรือที่สัตวแพทย์สั่ง') +
        (m.note ? '\nหมายเหตุ: ' + m.note : '') +
        (m.end ? '' : '\nเตือนไว้ 30 วัน ถ้ายังต้องให้ยาต่อ ให้เปิดแอปแล้วกด เพิ่มลงปฏิทิน อีกครั้งเพื่อต่ออายุการเตือน') +
        '\n' + ICS_FROM;
      m.times.forEach(function(t){
        out = out.concat(['BEGIN:VEVENT', 'UID:' + m.id + '-' + t.replace(':', '') + '-' + icsDay(from) + '@kindaimai', 'DTSTAMP:' + icsStamp(),
          'DTSTART:' + icsDay(from) + 'T' + t.replace(':', '') + '00', 'DURATION:PT10M', rule,
          'SUMMARY:' + icsEsc(summary), 'DESCRIPTION:' + icsEsc(desc)],
          icsAlarm('PT0M', summary + ' เวลา ' + t), ['END:VEVENT']);
      });
    }
    if (m.refillDate && m.refillDate >= today)
      out = out.concat(icsAllDay(m.id + '-refill-' + icsDay(m.refillDate) + '@kindaimai', m.refillDate, 'รับยา ' + m.name + ' — ' + p.name,
        'นัดรับยา/ยาจะหมด ' + ICS_FROM + (m.note ? '\n' + m.note : '')));
    return out.length ? icsDoc(out) : '';
  }
  // vet appointment: 1-hour timed event (alarms 1 day + 2 hours before) or all-day
  function apptIcs(p, a){
    var summary = 'นัดหมอ' + (a.reason ? ': ' + a.reason : '') + ' — ' + p.name;
    var desc = 'นัด' + ICS_FROM + (a.note ? '\n' + a.note : '');
    var loc = a.clinic ? ['LOCATION:' + icsEsc(a.clinic)] : [];
    var uid = a.id + '-' + icsDay(a.date) + '@kindaimai';
    if (!a.time) return icsDoc(icsAllDay(uid, a.date, summary, desc, loc));
    return icsDoc(['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + icsStamp(),
      'DTSTART:' + icsDay(a.date) + 'T' + a.time.replace(':', '') + '00', 'DURATION:PT1H',
      'SUMMARY:' + icsEsc(summary), 'DESCRIPTION:' + icsEsc(desc)].concat(loc,
      icsAlarm('-P1D', 'พรุ่งนี้ ' + a.time + ' น.: ' + summary), icsAlarm('-PT2H', 'อีก 2 ชั่วโมง: ' + summary), ['END:VEVENT']));
  }
  function dueOf(kind, e){ return kind === 'med' ? e.refillDate : kind === 'appt' ? e.date : e.nextDue; }
  function icsDone(text, name){
    if (text && downloadFile(text, name, 'text/calendar;charset=utf-8'))
      toast('ดาวน์โหลดไฟล์ปฏิทินแล้ว เปิดไฟล์เพื่อเพิ่มลงปฏิทิน');
  }
  function downloadIcs(petId, kind, id){
    var p = petById(petId); if (!p) return;
    var item = (p[HB_LIST[kind]] || []).filter(function(e){ return e.id === id; })[0];
    var due = item && dueOf(kind, item);
    if (!due) return;
    var text = kind === 'appt' ? apptIcs(p, item) : icsFor({pet:p, kind:kind, item:item, due:due});
    icsDone(text, 'kindaimai-' + fileSafe(p.name) + '-' + due + '.ics');
  }
  function downloadMedIcs(petId, id){
    var p = petById(petId); if (!p) return;
    var m = p.meds.filter(function(e){ return e.id === id; })[0]; if (!m) return;
    var text = medIcs(p, m);
    if (!text) return toast('ยานี้หยุดแล้ว ไม่มีเวลาให้ยาที่จะเพิ่มลงปฏิทิน');
    icsDone(text, 'kindaimai-' + fileSafe(p.name) + '-ยา-' + fileSafe(m.name) + '.ics');
  }

  /* ---------- pieces of the book screen ---------- */
  function storeNoteHTML(){
    return storageOK ? '' : '<p class="store-warn" role="status">'+icon('i-limited')+'<span><strong>เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้</strong> ใช้งานได้ตามปกติ แต่ข้อมูลจะหายเมื่อปิดแอป ลองปิดโหมดไม่ระบุตัวตน หรือกด “สำรองข้อมูล” เก็บไว้</span></p>';
  }
  function switcherHTML(active){
    return '<div class="hb-switch" role="group" aria-label="เลือกน้อง">'+book.pets.map(function(p){
      var on = p.id === active.id;
      return '<button type="button" class="pet-chip sp-'+p.species+'" data-action="pet-pick" data-id="'+esc(p.id)+'" aria-pressed="'+on+'">'+
        '<img class="pet-ph" src="'+SPECIES[p.species].icon+'" alt="" width="56" height="56">'+
        '<span class="pc-name">'+esc(p.name)+'</span><span class="sr-only"> ('+SPECIES[p.species].name+')</span></button>';
    }).join('')+
    '<button type="button" class="pet-chip add" data-action="pet-new"><span class="pc-plus">'+icon('i-plus')+'</span><span class="pc-name">เพิ่มน้อง</span></button></div>';
  }
  function dueState(x){
    if (x.d < 0) return {cls:'over', ic:'i-limited', when:(x.kind === 'appt' ? 'เลยวันนัด ' + (-x.d) + ' วัน ยังไม่ได้กด “ไปแล้ว”' : 'เลยกำหนด ' + (-x.d) + ' วัน')};
    return {cls:'soon', ic:'i-clock', when: x.d === 0 ? 'ถึงกำหนดวันนี้' : 'อีก ' + x.d + ' วัน'};
  }
  function dueDateText(x){
    if (x.kind === 'med') return 'นัดรับยา/ยาจะหมด ' + thDate(x.due);
    if (x.kind === 'appt') return 'นัด ' + thDate(x.due) + (x.item.time ? ' เวลา ' + x.item.time + ' น.' : '') + (x.item.clinic ? ' · ' + esc(x.item.clinic) : '');
    return 'นัด ' + thDate(x.due);
  }
  function dueRowHTML(x, withCal){
    var s = dueState(x), what = dueTitle(x) + ' — ' + x.pet.name;
    return '<li class="due '+s.cls+'">'+
      '<button type="button" class="due-main" data-action="due-open" data-pet="'+esc(x.pet.id)+'" data-kind="'+x.kind+'">'+icon(s.ic)+
        '<span><span class="due-when">'+s.when+'</span><span class="due-what">'+esc(what)+'</span><span class="due-date">'+dueDateText(x)+'</span></span></button>'+
      (withCal && x.d >= 0 ? '<button type="button" class="mini-btn" data-action="ics" data-pet="'+esc(x.pet.id)+'" data-kind="'+x.kind+'" data-id="'+esc(x.item.id)+'" aria-label="เพิ่มลงปฏิทิน: '+esc(what)+'">'+icon('i-cal')+'เพิ่มลงปฏิทิน</button>' : '')+
    '</li>';
  }
  function todayRowHTML(x){
    var what = x.med.name + ' — ' + x.pet.name;
    return '<li class="dose-row'+(x.late ? ' late' : '')+'">'+icon(x.late ? 'i-limited' : 'i-clock', 'dr-ic')+
      '<span class="dr-main"><span class="dr-time">'+x.time+' น.'+(x.late ? ' <span class="due-tag over">เลยเวลา</span>' : '')+'</span>'+
        '<span class="dr-what">'+esc(what)+'</span>'+(x.med.instructions ? '<span class="dr-how">'+esc(x.med.instructions)+'</span>' : '')+'</span>'+
      '<button type="button" class="mini-btn dr-give" data-action="dose-give" data-pet="'+esc(x.pet.id)+'" data-med="'+esc(x.med.id)+'" data-time="'+x.time+'" aria-label="ให้แล้ว: '+esc(what)+' เวลา '+x.time+'">'+icon('i-check-c')+'ให้แล้ว</button></li>';
  }
  function todayDosesHTML(idH){
    var items = todayDoses();
    if (!items.length) return '';
    var late = items.filter(function(x){ return x.late; }).length;
    return '<h2 id="'+idH+'">'+icon('i-clock')+'วันนี้ต้องให้ยา</h2>'+
      '<p class="small muted dr-sum">เหลือ '+items.length+' ครั้ง'+(late ? ' (เลยเวลา '+late+' ครั้ง)' : '')+' ของน้องทุกตัว</p>'+
      '<ul class="dose-list">'+items.map(todayRowHTML).join('')+'</ul>';
  }
  function upcomingHTML(){
    var items = dueItems(30);
    if (!items.length) return '';
    return '<section class="hb-due" aria-labelledby="due-h"><h2 id="due-h">'+icon('i-clock')+'นัดที่ใกล้ถึง</h2>'+
      '<p class="small muted">นัดภายใน 30 วันและนัดที่เลยกำหนด ของน้องทุกตัว</p>'+
      '<ul class="due-list">'+items.map(function(x){ return dueRowHTML(x, true); }).join('')+'</ul></section>';
  }
  function renderHomeMeds(){
    var box = $('#home-meds'); if (!box) return;
    var html = todayDosesHTML('hm-h');
    box.hidden = !html; box.innerHTML = html;
  }
  function renderHomeDue(){
    var box = $('#home-due'); if (!box) return;
    var items = dueItems(7);
    box.hidden = !items.length;
    box.innerHTML = !items.length ? '' :
      '<h2 id="hd-h">'+icon('i-clock')+'นัดที่ใกล้ถึง</h2><ul class="due-list">'+items.slice(0, 3).map(function(x){ return dueRowHTML(x, false); }).join('')+'</ul>'+
      (items.length > 3 ? '<p class="small muted" style="margin:6px 0 0">และอีก '+(items.length - 3)+' รายการในสมุดสุขภาพ</p>' : '');
  }
  function summaryHTML(p){
    var m = ageMonthsOf(p), w = latestWeight(p);
    var facts = [
      ['อายุ', m == null ? 'ยังไม่ระบุ' : ageText(m) + (p.birthDate ? '<span class="sub">เกิด '+thDate(p.birthDate)+'</span>' : '<span class="sub">โดยประมาณ</span>')],
      ['น้ำหนักล่าสุด', w ? kgFmt(w.kg)+' กก.<span class="sub">'+thDate(w.date)+'</span>' : 'ยังไม่มีบันทึก'],
      ['เพศ / ทำหมัน', SEX_TXT[p.sex] + '<span class="sub">' + STER_TXT[p.sterilized] + '</span>'],
      ['ช่วงวัย', STAGE_TXT[stageOf(p)]]
    ];
    var fl = [p.flags.overweight ? 'น้ำหนักเกิน' : '', p.flags.kidney ? 'โรคไต' : ''].filter(Boolean);
    if (fl.length) facts.push(['ภาวะพิเศษ', fl.join(', ')]);
    return '<section class="card hb-sum sp-'+p.species+'" aria-labelledby="sum-h">'+
      '<div class="hb-sum-top"><img class="pet-ph" src="'+SPECIES[p.species].icon+'" alt="" width="64" height="64">'+
        '<div class="hb-sum-name"><h2 id="sum-h">'+esc(p.name)+'</h2><span class="sp-badge sp-'+p.species+'">'+SPECIES[p.species].name+'</span></div>'+
        '<button type="button" class="mini-btn" data-action="pet-edit" aria-label="แก้ไขข้อมูล '+esc(p.name)+'">'+icon('i-edit')+'แก้ไข</button></div>'+
      '<dl class="hb-facts">'+facts.map(function(f){ return '<div><dt>'+f[0]+'</dt><dd>'+f[1]+'</dd></div>'; }).join('')+'</dl>'+
      '<button type="button" class="btn-sec hb-quickw" data-action="hb-add-weight">'+icon('i-plus')+'บันทึกน้ำหนักวันนี้</button></section>'+
      treatCardHTML(p, true);
  }

  /* ---------- weight chart (inline SVG, single series, colors from tokens) ---------- */
  function niceStep(range, n){
    var raw = range / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function weightsAsc(p){
    return p.weights.map(function(w, i){ return {w:w, i:i}; })
      .sort(function(a, b){ return a.w.date < b.w.date ? -1 : a.w.date > b.w.date ? 1 : a.i - b.i; })
      .map(function(x){ return x.w; });
  }
  function weightChartHTML(p){
    var pts = weightsAsc(p);
    if (pts.length < 2) return '';
    var W = 320, H = 176, L = 42, R = 18, T = 26, B = 30;
    var xs = pts.map(function(w){ return dayNum(w.date); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    if (x1 === x0){ x0 -= 1; x1 += 1; }
    var ks = pts.map(function(w){ return w.kg; });
    var lo = Math.min.apply(null, ks), hi = Math.max.apply(null, ks);
    if (hi - lo < 0.4){ lo -= 0.5; hi += 0.5; } else { var pad = (hi - lo) * 0.12; lo -= pad; hi += pad; }
    var step = niceStep(hi - lo, 4), y0 = Math.max(0, Math.floor(lo / step) * step), y1 = Math.ceil(hi / step) * step;
    var dec = step >= 1 && step % 1 === 0 ? 0 : (Math.round(step * 10) === step * 10 ? 1 : 2);
    function sx(d){ return L + (d - x0) / (x1 - x0) * (W - L - R); }
    function sy(v){ return T + (y1 - v) / (y1 - y0) * (H - T - B); }
    function r1(n){ return Math.round(n * 10) / 10; }
    var g = '';
    for (var v = y0; v <= y1 + step / 1000; v += step){
      var yy = r1(sy(v));
      g += '<line class="ch-grid" x1="'+L+'" x2="'+(W - R)+'" y1="'+yy+'" y2="'+yy+'"/>'+
        '<text class="ch-tick" x="'+(L - 6)+'" y="'+(yy + 4)+'" text-anchor="end">'+v.toFixed(dec)+'</text>';
    }
    var first = pts[0], last = pts[pts.length - 1];
    var withYear = first.date.slice(0, 4) !== last.date.slice(0, 4);
    g += '<text class="ch-tick" x="'+L+'" y="'+(H - 8)+'" text-anchor="start">'+thDateShort(first.date, withYear)+'</text>'+
      '<text class="ch-tick" x="'+(W - R)+'" y="'+(H - 8)+'" text-anchor="end">'+thDateShort(last.date, withYear)+'</text>';
    var path = pts.map(function(w, i){ return (i ? 'L' : 'M') + r1(sx(dayNum(w.date))) + ' ' + r1(sy(w.kg)); }).join(' ');
    g += '<path class="ch-line" d="'+path+'"/>';
    pts.forEach(function(w, i){
      var isLast = i === pts.length - 1;
      g += '<circle class="'+(isLast ? 'ch-last' : 'ch-pt')+'" cx="'+r1(sx(dayNum(w.date)))+'" cy="'+r1(sy(w.kg))+'" r="'+(isLast ? 6 : 4)+'"><title>'+thDate(w.date)+': '+kgFmt(w.kg)+' กก.</title></circle>';
    });
    var lx = r1(sx(dayNum(last.date))), ly = r1(sy(last.kg));
    g += '<text class="ch-lab" x="'+lx+'" y="'+(ly < T + 14 ? ly + 22 : ly - 12)+'" text-anchor="'+(lx > W - 60 ? 'end' : 'middle')+'">'+kgFmt(last.kg)+' กก.</text>';
    var label = 'กราฟน้ำหนัก ' + p.name + ' ' + pts.length + ' บันทึก จาก ' + kgFmt(first.kg) + ' กก. (' + thDate(first.date) + ') เป็น ' + kgFmt(last.kg) + ' กก. (' + thDate(last.date) + ')';
    return '<figure class="hb-chart sp-'+p.species+'"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(label)+'">'+g+'</svg></figure>';
  }

  /* ---------- health book tabs, lists and inline entry forms ---------- */
  function chgText(diff){
    if (Math.abs(diff) < 0.05) return 'เท่าเดิม';
    return (diff > 0 ? '+' : '-') + kgFmt(Math.abs(diff)) + ' กก.';
  }
  function itemActs(kind, e, what){
    return '<div class="hb-acts">'+
      '<button type="button" class="mini-btn" data-action="hb-edit" data-kind="'+kind+'" data-id="'+esc(e.id)+'" aria-label="แก้ไข '+esc(what)+'">'+icon('i-edit')+'แก้ไข</button>'+
      '<button type="button" class="mini-btn" data-action="hb-del" data-kind="'+kind+'" data-id="'+esc(e.id)+'" aria-label="ลบ '+esc(what)+'">'+icon('i-trash')+'ลบ</button></div>';
  }
  function noteHTML(text, ic){ return '<p class="hb-sched">'+icon(ic || 'i-info')+'<span>'+text+'</span></p>'; }
  function calBtnHTML(action, p, kind, e, what){
    return '<button type="button" class="mini-btn hb-cal" data-action="'+action+'" data-pet="'+esc(p.id)+'" data-kind="'+kind+'" data-id="'+esc(e.id)+'" aria-label="เพิ่มลงปฏิทิน: '+esc(what)+'">'+icon('i-cal')+'เพิ่มลงปฏิทิน</button>';
  }
  function dueTagHTML(x){ var s = x.d <= 30 ? dueState(x) : null; return s ? ' <span class="due-tag '+s.cls+'">'+icon(s.ic)+s.when+'</span>' : ''; }
  function medItemHTML(p, m){
    var today = todayISO(), now = nowHM(), active = medActive(m, today), stopped = medStopped(m);
    var what = 'ยา ' + m.name;
    var period = 'เริ่ม ' + thDate(m.start) + ' · ' + (m.end ? 'ถึง ' + thDate(m.end) : 'ต่อเนื่อง');
    var h = '<li class="hb-item med-item"><div class="hb-main"><span class="hb-val">'+esc(m.name)+'</span>'+
      (m.instructions ? '<p class="med-how"><span class="muted">วิธีให้: </span>'+esc(m.instructions)+'</p>' : '')+
      '<span class="hb-date">เวลาให้ยา '+m.times.map(function(t){ return t + ' น.'; }).join(', ')+'</span>'+
      '<span class="hb-date">'+period+(m.start > today ? ' <span class="due-tag soon">'+icon('i-clock')+'ยังไม่ถึงวันเริ่ม</span>' : '')+'</span>';
    if (m.refillDate){
      var x = {pet:p, kind:'med', item:m, due:m.refillDate, d:daysUntil(m.refillDate)};
      h += '<p class="hb-next">นัดรับยา/ยาจะหมด '+thDate(m.refillDate)+(stopped ? '' : dueTagHTML(x))+'</p>';
    }
    if (active){
      h += '<fieldset class="dose-today"><legend>วันนี้ ('+thDate(today)+')</legend>'+m.times.map(function(t){
        var given = doseGiven(m, today, t), late = !given && t < now, id = 'dose-' + m.id + '-' + t.replace(':', '');
        return '<label class="check dose-chk" for="'+id+'"><input type="checkbox" id="'+id+'" data-dose data-pet="'+esc(p.id)+'" data-med="'+esc(m.id)+'" data-time="'+t+'"'+(given ? ' checked' : '')+'>'+
          '<span>'+t+' น. ให้แล้ว</span>'+(late ? '<span class="due-tag over">'+icon('i-limited')+'เลยเวลา</span>' : '')+'</label>';
      }).join('')+'</fieldset>';
    }
    if (m.note) h += '<p class="hb-note">'+esc(m.note)+'</p>';
    if (!stopped) h += calBtnHTML('ics-med', p, 'med', m, 'ให้ยา ' + m.name + ' — ' + p.name);
    return h + '</div>' + itemActs('med', m, what) + '</li>';
  }
  function medListHTML(p){
    var today = todayISO();
    var cur = p.meds.filter(function(m){ return !medStopped(m); }).sort(function(a, b){
      var aa = medActive(a, today) ? 0 : 1, bb = medActive(b, today) ? 0 : 1;
      return aa - bb || (a.start < b.start ? -1 : a.start > b.start ? 1 : a.name.localeCompare(b.name));
    });
    var old = p.meds.filter(medStopped).sort(function(a, b){ return a.end < b.end ? 1 : a.end > b.end ? -1 : 0; });
    var html = !p.meds.length ? '<p class="muted small hb-none">ยังไม่มีบันทึกยา</p>' :
      (cur.length ? '<ul class="hb-list">'+cur.map(function(m){ return medItemHTML(p, m); }).join('')+'</ul>' : '<p class="muted small hb-none">ไม่มียาที่กำลังให้อยู่</p>');
    if (old.length) html += '<details class="hb-old"><summary>ยาที่หยุดแล้ว ('+old.length+')</summary><ul class="hb-list">'+old.map(function(m){ return medItemHTML(p, m); }).join('')+'</ul></details>';
    return html + noteHTML(MED_NOTE) + noteHTML(REMIND_NOTE, 'i-clock');
  }
  function apptItemHTML(p, a){
    var x = {pet:p, kind:'appt', item:a, due:a.date, d:daysUntil(a.date)};
    var title = a.reason || 'นัดหมอ', what = 'นัดหมอ ' + (a.reason ? a.reason + ' ' : '') + 'วันที่ ' + thDate(a.date), id = 'appt-done-' + a.id;
    return '<li class="hb-item appt-item'+(a.done ? ' is-done' : '')+'"><div class="hb-main"><span class="hb-val">'+esc(title)+'</span>'+
      '<span class="hb-date">วันนัด '+thDate(a.date)+(a.time ? ' เวลา '+a.time+' น.' : '')+(a.done ? '' : dueTagHTML(x))+'</span>'+
      (a.clinic ? '<span class="hb-date appt-clinic">'+icon('i-pin')+esc(a.clinic)+'</span>' : '')+
      (a.note ? '<p class="hb-note">'+esc(a.note)+'</p>' : '')+
      '<label class="check appt-done" for="'+id+'"><input type="checkbox" id="'+id+'" data-appt-done data-id="'+esc(a.id)+'"'+(a.done ? ' checked' : '')+'><span>ไปแล้ว</span></label>'+
      (!a.done && x.d >= 0 ? calBtnHTML('ics', p, 'appt', a, dueTitle(x) + ' — ' + p.name) : '')+
      '</div>' + itemActs('appt', a, what) + '</li>';
  }
  function apptListHTML(p){
    var today = todayISO();
    function asc(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.time).localeCompare(String(b.time)); }
    var open = p.appts.filter(function(a){ return !a.done; }).sort(asc);
    var past = p.appts.filter(function(a){ return a.done; }).sort(function(a, b){ return -asc(a, b); });
    var html = !p.appts.length ? '<p class="muted small hb-none">ยังไม่มีนัดหมอ</p>' :
      (open.length ? '<ul class="hb-list">'+open.map(function(a){ return apptItemHTML(p, a); }).join('')+'</ul>' : '<p class="muted small hb-none">ไม่มีนัดที่รออยู่</p>');
    if (past.length) html += '<details class="hb-old"><summary>นัดที่ไปแล้ว ('+past.length+')</summary><ul class="hb-list">'+past.map(function(a){ return apptItemHTML(p, a); }).join('')+'</ul></details>';
    return html + noteHTML(REMIND_NOTE, 'i-clock');
  }
  function listHTML(p, kind){
    if (kind === 'med') return medListHTML(p);
    if (kind === 'appt') return apptListHTML(p);
    if (kind === 'weight'){
      var asc = weightsAsc(p);
      if (!asc.length) return '<p class="muted small hb-none">ยังไม่มีบันทึกน้ำหนัก</p>';
      var rows = asc.map(function(w, i){ return {w:w, diff: i ? w.kg - asc[i - 1].kg : null}; }).reverse();
      return weightChartHTML(p) + '<ul class="hb-list">'+rows.map(function(r){
        var what = 'น้ำหนัก ' + kgFmt(r.w.kg) + ' กก. วันที่ ' + thDate(r.w.date);
        return '<li class="hb-item"><div class="hb-main"><span class="hb-val">'+kgFmt(r.w.kg)+' กก.</span>'+
          '<span class="hb-date">'+thDate(r.w.date)+'</span>'+
          (r.diff != null ? '<span class="hb-chg">'+chgText(r.diff)+' <span class="muted">จากครั้งก่อน</span></span>' : '')+'</div>'+
          itemActs(kind, r.w, what)+'</li>';
      }).join('')+'</ul>';
    }
    var arr = sortedDesc(p[HB_LIST[kind]]);
    var html = !arr.length ? '<p class="muted small hb-none">ยังไม่มีบันทึก'+HB_NAME[kind]+'</p>' :
      '<ul class="hb-list">'+arr.map(function(e){
        var name = kind === 'vaccine' ? e.name : e.product;
        var what = name + ' วันที่ ' + thDate(e.date), due = '';
        if (e.nextDue){
          var x = {pet:p, kind:kind, item:e, due:e.nextDue, d:daysUntil(e.nextDue)};
          var s = x.d <= 30 ? dueState(x) : null;
          due = '<p class="hb-next">นัดครั้งถัดไป '+thDate(e.nextDue)+
            (s ? ' <span class="due-tag '+s.cls+'">'+icon(s.ic)+s.when+'</span>' : '')+'</p>'+
            (x.d >= 0 ? '<button type="button" class="mini-btn hb-cal" data-action="ics" data-pet="'+esc(p.id)+'" data-kind="'+kind+'" data-id="'+esc(e.id)+'" aria-label="เพิ่มลงปฏิทิน: '+esc(dueTitle(x)+' — '+p.name)+'">'+icon('i-cal')+'เพิ่มลงปฏิทิน</button>' : '');
        }
        return '<li class="hb-item"><div class="hb-main"><span class="hb-val">'+esc(name)+'</span>'+
          '<span class="hb-date">'+(kind === 'vaccine' ? 'ฉีดเมื่อ ' : 'ให้เมื่อ ')+thDate(e.date)+'</span>'+due+
          (e.note ? '<p class="hb-note">'+esc(e.note)+'</p>' : '')+'</div>'+itemActs(kind, e, what)+'</li>';
      }).join('')+'</ul>';
    return html + '<p class="hb-sched">'+icon('i-info')+'<span>'+SCHEDULE_NOTE+'</span></p>';
  }
  function formRow(forId, label, input){ return '<div class="form-row"><label for="'+forId+'">'+label+'</label>'+input+'</div>'; }
  function formEnd(){
    return '<p class="field-err" id="hbf-err" role="alert" hidden></p>'+
      '<div class="form-actions"><button type="submit" class="btn-primary">บันทึก</button>'+
      '<button type="button" class="btn-sec" data-action="hb-cancel">ยกเลิก</button></div></form>';
  }
  function timeRowHTML(i, v){
    return '<div class="time-row"><label for="hbf-t'+i+'">เวลาที่ '+(i + 1)+'</label>'+
      '<input class="text-in" type="time" id="hbf-t'+i+'" step="60" value="'+esc(v || '')+'" aria-describedby="hbf-times-hint hbf-err">'+
      '<button type="button" class="mini-btn" data-action="time-del" aria-label="ลบเวลาที่ '+(i + 1)+'">'+icon('i-trash')+'ลบ</button></div>';
  }
  function syncTimeRows(){
    var rows = $$('#hbf-time-list .time-row');
    rows.forEach(function(r, i){
      var lab = r.querySelector('label'), inp = r.querySelector('input'), del = r.querySelector('button');
      inp.id = 'hbf-t' + i; lab.setAttribute('for', inp.id); lab.textContent = 'เวลาที่ ' + (i + 1);
      del.setAttribute('aria-label', 'ลบเวลาที่ ' + (i + 1)); del.hidden = rows.length < 2;
    });
    var add = $('[data-action="time-add"]'); if (add) add.hidden = rows.length >= MAX_TIMES;
  }
  function medFormHTML(p, e){
    var today = todayISO(), times = e ? e.times : [''];
    return '<form class="hb-form" data-kind="med" novalidate aria-labelledby="hbf-h">'+
      '<h3 id="hbf-h">'+(e ? 'แก้ไข' : 'เพิ่ม')+'บันทึกยา</h3>'+
      formRow('hbf-name', 'ชื่อยา <span class="req">(จำเป็น)</span>', '<input class="text-in" type="text" id="hbf-name" maxlength="60" autocomplete="off" placeholder="ชื่อตามฉลากยา" value="'+esc(e ? e.name : '')+'" required aria-describedby="hbf-err">')+
      formRow('hbf-instr', 'วิธีให้ / ขนาดตามที่สัตวแพทย์สั่ง', '<textarea class="fb-text" id="hbf-instr" maxlength="200" placeholder="เช่น ครึ่งเม็ด หลังอาหาร" aria-describedby="hbf-instr-hint">'+esc(e ? e.instructions : '')+'</textarea>'+
        '<p class="hint" id="hbf-instr-hint">ใส่ตามฉลากหรือที่สัตวแพทย์สั่งเท่านั้น</p>')+
      '<fieldset class="form-row hb-times"><legend>เวลาให้ยา <span class="req">(จำเป็น 1–'+MAX_TIMES+' เวลา)</span></legend>'+
        '<div id="hbf-time-list">'+times.map(function(t, i){ return timeRowHTML(i, t); }).join('')+'</div>'+
        '<button type="button" class="mini-btn" data-action="time-add">'+icon('i-plus')+'เพิ่มเวลา</button>'+
        '<p class="hint" id="hbf-times-hint">ใส่เวลาตามที่สัตวแพทย์สั่ง</p></fieldset>'+
      '<div class="hb-two">'+
        formRow('hbf-start', 'วันเริ่ม', '<input class="text-in" type="date" id="hbf-start" value="'+esc(e ? e.start : today)+'" required aria-describedby="hbf-err">')+
        formRow('hbf-end', 'วันสิ้นสุด (ไม่บังคับ)', '<input class="text-in" type="date" id="hbf-end" value="'+esc(e ? e.end : '')+'" aria-describedby="hbf-end-hint hbf-err"><p class="hint" id="hbf-end-hint">เว้นว่าง = ให้ต่อเนื่อง</p>')+
      '</div>'+
      formRow('hbf-refill', 'วันรับยาครั้งถัดไป (ไม่บังคับ)', '<input class="text-in" type="date" id="hbf-refill" value="'+esc(e ? e.refillDate : '')+'" aria-describedby="hbf-refill-hint hbf-err"><p class="hint" id="hbf-refill-hint">นัดรับยา หรือวันที่ยาจะหมด</p>')+
      formRow('hbf-note', 'หมายเหตุ (ไม่บังคับ)', '<textarea class="fb-text" id="hbf-note" maxlength="200">'+esc(e ? e.note : '')+'</textarea>')+
      formEnd();
  }
  function apptFormHTML(p, e){
    return '<form class="hb-form" data-kind="appt" novalidate aria-labelledby="hbf-h">'+
      '<h3 id="hbf-h">'+(e ? 'แก้ไข' : 'เพิ่ม')+'นัดหมอ</h3>'+
      '<div class="hb-two">'+
        formRow('hbf-date', 'วันนัด <span class="req">(จำเป็น)</span>', '<input class="text-in" type="date" id="hbf-date" value="'+esc(e ? e.date : '')+'" required aria-describedby="hbf-err">')+
        formRow('hbf-time', 'เวลา (ไม่บังคับ)', '<input class="text-in" type="time" id="hbf-time" step="60" value="'+esc(e ? e.time : '')+'" aria-describedby="hbf-err">')+
      '</div>'+
      '<label class="check" for="hbf-done"><input type="checkbox" id="hbf-done"'+(e && e.done ? ' checked' : '')+'>ไปแล้ว</label>'+
      formRow('hbf-clinic', 'คลินิก / โรงพยาบาล (ไม่บังคับ)', '<input class="text-in" type="text" id="hbf-clinic" maxlength="80" autocomplete="off" value="'+esc(e ? e.clinic : '')+'">')+
      formRow('hbf-reason', 'เรื่องที่นัด (ไม่บังคับ)', '<input class="text-in" type="text" id="hbf-reason" maxlength="60" autocomplete="off" list="appt-list" placeholder="เลือกหรือพิมพ์ เช่น ตรวจติดตาม" value="'+esc(e ? e.reason : '')+'">'+
        '<datalist id="appt-list">'+APPT_SUGGEST.map(function(v){ return '<option value="'+esc(v)+'">'; }).join('')+'</datalist>')+
      formRow('hbf-note', 'หมายเหตุ (ไม่บังคับ)', '<textarea class="fb-text" id="hbf-note" maxlength="200" placeholder="เช่น งดอาหารก่อนมา">'+esc(e ? e.note : '')+'</textarea>')+
      formEnd();
  }
  function entryFormHTML(p, kind, id){
    var e = id ? (p[HB_LIST[kind]] || []).filter(function(x){ return x.id === id; })[0] : null;
    if (kind === 'med') return medFormHTML(p, e);
    if (kind === 'appt') return apptFormHTML(p, e);
    var today = todayISO(), row = formRow;
    var html = '<form class="hb-form" data-kind="'+kind+'" novalidate aria-labelledby="hbf-h">'+
      '<h3 id="hbf-h">'+(e ? 'แก้ไข' : 'เพิ่ม')+'บันทึก'+HB_NAME[kind]+'</h3>'+
      row('hbf-date', kind === 'weight' ? 'วันที่ชั่ง' : kind === 'vaccine' ? 'วันที่ฉีด' : 'วันที่ให้',
        '<input class="text-in" type="date" id="hbf-date" max="'+today+'" value="'+esc(e ? e.date : today)+'" required aria-describedby="hbf-err">');
    if (kind === 'weight'){
      html += row('hbf-kg', 'น้ำหนัก (กิโลกรัม)', '<input class="text-in" type="text" inputmode="decimal" id="hbf-kg" placeholder="เช่น 4.5" value="'+(e ? kgFmt(e.kg) : '')+'" required aria-describedby="hbf-err">');
    } else {
      var nm = e ? (kind === 'vaccine' ? e.name : e.product) : '';
      html += row('hbf-name', kind === 'vaccine' ? 'ชื่อวัคซีน' : 'ชื่อยาหรือผลิตภัณฑ์',
        '<input class="text-in" type="text" id="hbf-name" maxlength="60" autocomplete="off" value="'+esc(nm)+'" required aria-describedby="hbf-err"'+
        (kind === 'vaccine' ? ' list="vax-list" placeholder="เลือกหรือพิมพ์ชื่อวัคซีน">'+
          '<datalist id="vax-list">'+VAX_SUGGEST.map(function(v){ return '<option value="'+esc(v)+'">'; }).join('')+'</datalist>' : ' placeholder="ชื่อตามฉลาก">'));
      html += row('hbf-due', 'วันนัดครั้งถัดไป (ไม่บังคับ)',
        '<input class="text-in" type="date" id="hbf-due" value="'+esc(e ? e.nextDue : '')+'" aria-describedby="hbf-due-hint hbf-err">'+
        '<p class="hint" id="hbf-due-hint">ใส่ตามที่สัตวแพทย์นัด</p>');
      html += row('hbf-note', 'หมายเหตุ (ไม่บังคับ)', '<textarea class="fb-text" id="hbf-note" maxlength="200">'+esc(e ? e.note : '')+'</textarea>');
    }
    return html + formEnd();
  }
  function bookHTML(p){
    var tabs = '<div class="hb-tabs" role="tablist" aria-label="บันทึกสุขภาพของ '+esc(p.name)+'">'+HB_TABS.map(function(t){
      var on = t.k === hbTab;
      return '<button type="button" role="tab" id="tab-'+t.k+'" aria-controls="panel-'+t.k+'" aria-selected="'+on+'" tabindex="'+(on ? 0 : -1)+'" data-action="hb-tab" data-k="'+t.k+'">'+t.t+'</button>';
    }).join('')+'</div>';
    var panels = HB_TABS.map(function(t){
      var on = t.k === hbTab, open = on && hbForm && hbForm.kind === t.k;
      return '<div class="hb-panel" role="tabpanel" id="panel-'+t.k+'" aria-labelledby="tab-'+t.k+'"'+(on ? '' : ' hidden')+'>'+
        (on ? (open ? entryFormHTML(p, t.k, hbForm.id) :
          '<button type="button" class="btn-sec hb-add" data-action="hb-add" data-kind="'+t.k+'">'+icon('i-plus')+'เพิ่มบันทึก<span class="sr-only">'+HB_NAME[t.k]+'</span></button>') +
          listHTML(p, t.k) : '')+'</div>';
    }).join('');
    return '<h2 class="hb-book-h" id="book-h">บันทึกสุขภาพ</h2>' + tabs + panels;
  }
  function backupHTML(){
    return '<section class="hb-backup" aria-labelledby="bk-h"><h2 id="bk-h">'+icon('i-lock')+'สำรองและกู้คืนข้อมูล</h2>'+
      '<p class="small">ข้อมูลอยู่ในเครื่องนี้เท่านั้น ถ้าลบแอปหรือล้างข้อมูลเบราว์เซอร์จะหาย ควรสำรองเป็นระยะ ไฟล์สำรองจะบันทึกไว้ในที่ที่คุณเลือก แอปไม่ส่งไปที่ไหน</p>'+
      '<div class="bk-row"><button type="button" class="btn-sec" data-action="backup"'+(book.pets.length ? '' : ' disabled')+'>'+icon('i-download')+'สำรองข้อมูล</button>'+
      '<label class="btn-sec file-btn">'+icon('i-upload')+'กู้คืนข้อมูล<input type="file" id="restore-file" class="file-in" accept=".json,application/json"></label></div>'+
      '<p class="field-err" id="restore-err" role="alert" hidden></p><div id="restore-host"></div></section>';
  }
  function renderProfile(){
    closeConfirm();
    $('#prof-h').textContent = 'สมุดสุขภาพน้อง';
    var p = activePet(), html = storeNoteHTML();
    if (p) book.activeId = p.id;
    if (!p){
      html += '<div class="card hb-empty"><div class="hb-empty-ph"><img class="pet-ph" src="icons/pet-dog.jpg" alt="" width="72" height="72"><img class="pet-ph" src="icons/pet-cat.jpg" alt="" width="72" height="72"></div>'+
        '<h2>ยังไม่มีน้องในสมุดสุขภาพ</h2><p>จดน้ำหนัก วัคซีน การถ่ายพยาธิ ยา และนัดหมอของน้องไว้ในที่เดียว พร้อมเตือนในแอป</p>'+
        '<button type="button" class="btn-primary" data-action="pet-new">'+icon('i-plus')+'เพิ่มน้องตัวแรก</button></div>';
    } else {
      var td = todayDosesHTML('td-h');
      html += switcherHTML(p) + (td ? '<section class="hb-due hb-today" aria-labelledby="td-h">' + td + '</section>' : '') + upcomingHTML() + summaryHTML(p) + bookHTML(p);
    }
    $('#hb-root').innerHTML = html + backupHTML();
    if ($('#hbf-time-list')) syncTimeRows();
  }
  function rerenderKeep(sel){
    renderProfile();
    var el = sel && $(sel);
    if (el){ try { el.focus({preventScroll:true}); } catch(e){ el.focus(); } if (el.scrollIntoView) el.scrollIntoView({block:'nearest'}); }
  }
  function openEntryForm(kind, id){
    hbTab = kind; hbForm = {kind:kind, id:id || null};
    rerenderKeep('#hbf-' + (kind === 'weight' && !id ? 'kg' : kind === 'med' ? 'name' : 'date'));
    var f = $('.hb-form'); if (f && f.scrollIntoView) f.scrollIntoView({block:'start'});
  }
  function saveEntry(form){
    var kind = form.getAttribute('data-kind'), p = activePet(), today = todayISO(), err = $('#hbf-err');
    if (!p) return;
    $$('[aria-invalid]', form).forEach(function(el){ el.removeAttribute('aria-invalid'); });
    function fail(sel, msg){ var el = $(sel); el.setAttribute('aria-invalid', 'true'); err.hidden = false; err.textContent = msg; el.focus(); }
    if (kind === 'med' || kind === 'appt'){
      var r = kind === 'med' ? readMedForm(fail) : readApptForm(fail);
      if (r) upsertEntry(p, kind, r, fail, kind === 'med' ? '#hbf-name' : '#hbf-date');
      return;
    }
    var date = $('#hbf-date').value;
    if (!validISO(date)) return fail('#hbf-date', 'กรุณาใส่วันที่');
    if (date > today) return fail('#hbf-date', 'วันที่ต้องไม่เกินวันนี้');
    var rec;
    if (kind === 'weight'){
      var raw = $('#hbf-kg').value.replace(',', '.').trim(), kg = parseFloat(raw);
      if (!/^\d+(\.\d+)?$/.test(raw) || !(kg >= 0.1 && kg <= 150)) return fail('#hbf-kg', 'น้ำหนักต้องเป็นตัวเลข 0.1–150 กิโลกรัม เช่น 4.5');
      rec = {date:date, kg:Math.round(kg * 10) / 10};
    } else {
      var name = cleanStr($('#hbf-name').value, 60), due = $('#hbf-due').value;
      if (!name) return fail('#hbf-name', kind === 'vaccine' ? 'กรุณาใส่ชื่อวัคซีน' : 'กรุณาใส่ชื่อยาหรือผลิตภัณฑ์');
      if (due && !validISO(due)) return fail('#hbf-due', 'วันนัดไม่ถูกต้อง');
      if (due && due < date) return fail('#hbf-due', 'วันนัดครั้งถัดไปต้องไม่ก่อนวันที่ให้');
      rec = {date:date, nextDue:due || '', note:cleanStr($('#hbf-note').value, 200)};
      rec[kind === 'vaccine' ? 'name' : 'product'] = name;
    }
    upsertEntry(p, kind, rec, fail, '#hbf-date');
  }
  function upsertEntry(p, kind, rec, fail, capSel){
    var list = p[HB_LIST[kind]];
    var old = hbForm && hbForm.id ? list.filter(function(x){ return x.id === hbForm.id; })[0] : null;
    if (old) Object.keys(rec).forEach(function(k){ old[k] = rec[k]; });
    else {
      if (list.length >= HB_CAP[kind]) return fail(capSel, 'บันทึกครบ ' + HB_CAP[kind] + ' รายการแล้ว ลบรายการเก่าก่อน');
      if (kind === 'med') rec.doses = [];
      rec.id = newId(kind.charAt(0)); list.push(rec);
    }
    saveBook(); hbForm = null;
    rerenderKeep('.hb-add');
    savedToast('บันทึก' + HB_NAME[kind] + 'แล้ว');
  }
  function readMedForm(fail){
    var name = cleanStr($('#hbf-name').value, 60);
    if (!name) return fail('#hbf-name', 'กรุณาใส่ชื่อยา');
    var inputs = $$('#hbf-time-list input'), times = [];
    for (var i = 0; i < inputs.length; i++){
      var v = inputs[i].value.trim();
      if (!v && inputs.length > 1) continue;
      if (!TIME_RE.test(v)) return fail('#' + inputs[i].id, v ? 'เวลาไม่ถูกต้อง ใช้รูปแบบ ชั่วโมง:นาที เช่น 08:00' : 'กรุณาใส่เวลาให้ยาอย่างน้อย 1 เวลา');
      if (times.indexOf(v) !== -1) return fail('#' + inputs[i].id, 'มีเวลา ' + v + ' ซ้ำกัน');
      times.push(v);
    }
    if (!times.length) return fail('#' + inputs[0].id, 'กรุณาใส่เวลาให้ยาอย่างน้อย 1 เวลา');
    if (times.length > MAX_TIMES) return fail('#' + inputs[0].id, 'ใส่ได้สูงสุด ' + MAX_TIMES + ' เวลาต่อวัน');
    var start = $('#hbf-start').value, end = $('#hbf-end').value, refill = $('#hbf-refill').value;
    if (!validISO(start)) return fail('#hbf-start', 'กรุณาใส่วันเริ่ม');
    if (end && !validISO(end)) return fail('#hbf-end', 'วันสิ้นสุดไม่ถูกต้อง');
    if (end && end < start) return fail('#hbf-end', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    if (refill && !validISO(refill)) return fail('#hbf-refill', 'วันรับยาไม่ถูกต้อง');
    return {name:name, instructions:cleanStr($('#hbf-instr').value, 200), times:times.sort(), start:start, end:end || '',
      refillDate:refill || '', note:cleanStr($('#hbf-note').value, 200)};
  }
  function readApptForm(fail){
    var date = $('#hbf-date').value, time = $('#hbf-time').value.trim();
    if (!validISO(date)) return fail('#hbf-date', 'กรุณาใส่วันนัด');
    if (time && !TIME_RE.test(time)) return fail('#hbf-time', 'เวลาไม่ถูกต้อง ใช้รูปแบบ ชั่วโมง:นาที เช่น 14:30');
    return {date:date, time:time, clinic:cleanStr($('#hbf-clinic').value, 80), reason:cleanStr($('#hbf-reason').value, 60),
      note:cleanStr($('#hbf-note').value, 200), done:$('#hbf-done').checked};
  }
  function deleteEntry(btn){
    var kind = btn.getAttribute('data-kind'), id = btn.getAttribute('data-id'), p = activePet();
    if (!p) return;
    askInline(btn.closest('.hb-item'), 'ลบบันทึกนี้? ลบแล้วกู้คืนไม่ได้', 'ลบบันทึก', function(){
      p[HB_LIST[kind]] = p[HB_LIST[kind]].filter(function(x){ return x.id !== id; });
      if (hbForm && hbForm.id === id) hbForm = null;
      saveBook(); rerenderKeep('.hb-add'); savedToast('ลบบันทึกแล้ว');
    });
  }

  /* ---------- add / edit pet form ---------- */
  function optRadios(name, opts, val){
    return opts.map(function(o){
      return '<label class="opt"><input type="radio" name="'+name+'" value="'+o[0]+'"'+(o[0] === val ? ' checked' : '')+'><span>'+o[1]+'</span></label>';
    }).join('');
  }
  function renderPetForm(){
    closeConfirm();
    var p = pfEditId ? petById(pfEditId) : null, today = todayISO();
    $('#prof-h').textContent = p ? 'แก้ไขข้อมูล ' + p.name : 'เพิ่มน้อง';
    var m = p ? ageMonthsOf(p) : null, approx = !!(p && !p.birthDate && m != null);
    var html = storeNoteHTML() + '<form id="pet-form" novalidate>'+
      '<div class="form-row"><label for="pf-name">ชื่อน้อง <span class="req">(จำเป็น)</span></label>'+
        '<input class="text-in" id="pf-name" type="text" maxlength="30" autocomplete="off" required value="'+esc(p ? p.name : '')+'" aria-describedby="pf-err"></div>'+
      '<fieldset class="form-row" id="pf-sp-row"><legend>น้องหมา หรือ น้องแมว <span class="req">(จำเป็น)</span></legend><div class="opt-grid two">'+
        ['dog', 'cat'].map(function(s){
          return '<label class="opt sp-opt sp-'+s+'"><input type="radio" name="pf-sp" value="'+s+'"'+(p && p.species === s ? ' checked' : '')+'>'+
            '<span><img class="pet-ph" src="'+SPECIES[s].icon+'" alt="" width="64" height="64">'+SPECIES[s].name+'</span></label>';
        }).join('')+'</div></fieldset>'+
      '<fieldset class="form-row"><legend>อายุ (ไม่บังคับ)</legend>'+
        '<div class="opt-grid two">'+optRadios('pf-agemode', [['birth', 'รู้วันเกิด'], ['approx', 'อายุโดยประมาณ']], approx ? 'approx' : 'birth')+'</div>'+
        '<div class="age-box" id="pf-birth-box"><label for="pf-birth">วันเกิด</label>'+
          '<input class="text-in" type="date" id="pf-birth" min="1980-01-01" max="'+today+'" value="'+esc(p ? p.birthDate : '')+'" aria-describedby="pf-age-out"></div>'+
        '<div class="age-box hb-approx" id="pf-approx-box">'+
          '<div><label for="pf-ay">ปี</label><input class="text-in" type="number" id="pf-ay" min="0" max="40" step="1" inputmode="numeric" value="'+(approx ? Math.floor(m / 12) : '')+'" aria-describedby="pf-age-out"></div>'+
          '<div><label for="pf-am">เดือน</label><input class="text-in" type="number" id="pf-am" min="0" max="11" step="1" inputmode="numeric" value="'+(approx ? m % 12 : '')+'" aria-describedby="pf-age-out"></div></div>'+
        '<p class="hint" id="pf-age-out" aria-live="polite"></p></fieldset>'+
      '<fieldset class="form-row"><legend>เพศ</legend><div class="opt-grid">'+optRadios('pf-sex', [['male', 'ผู้'], ['female', 'เมีย'], ['', 'ไม่ระบุ']], p ? p.sex : '')+'</div></fieldset>'+
      '<fieldset class="form-row"><legend>ทำหมัน</legend><div class="opt-grid">'+optRadios('pf-ster', [['yes', 'ทำแล้ว'], ['no', 'ยังไม่ทำ'], ['', 'ไม่ทราบ']], p ? p.sterilized : '')+'</div></fieldset>'+
      '<fieldset class="form-row" aria-describedby="pf-stage-hint"><legend>ช่วงวัย</legend><div class="opt-grid">'+
        optRadios('pf-stage', [['young', 'ลูก'], ['adult', 'โต'], ['senior', 'สูงวัย']], p ? p.lifeStage : 'adult')+'</div>'+
        '<p class="hint" id="pf-stage-hint"></p></fieldset>'+
      '<fieldset class="form-row"><legend>ภาวะพิเศษ</legend>'+
        '<label class="check"><input type="checkbox" id="pf-over"'+(p && p.flags.overweight ? ' checked' : '')+'>น้ำหนักเกิน</label>'+
        '<label class="check"><input type="checkbox" id="pf-kidney"'+(p && p.flags.kidney ? ' checked' : '')+'>โรคไต</label></fieldset>'+
      (p ? '' : '<div class="form-row"><label for="pf-kg">น้ำหนักวันนี้ (กิโลกรัม, ไม่บังคับ)</label>'+
        '<input class="text-in" id="pf-kg" type="text" inputmode="decimal" placeholder="เช่น 4.5" aria-describedby="pf-kg-hint pf-err">'+
        '<p class="hint" id="pf-kg-hint">จะเป็นบันทึกน้ำหนักแรกในสมุด ใช้คำนวณปริมาณขนมโดยประมาณ</p></div>')+
      '<p class="field-err" id="pf-err" role="alert" hidden></p>'+
      '<div class="form-actions"><button type="submit" class="btn-primary">บันทึก</button>'+
        '<button type="button" class="btn-sec" data-action="pet-cancel">ยกเลิก</button></div>'+
      (p ? '<div class="del-host" id="pf-del-host"><button type="button" class="btn-del-outline" data-action="pet-delete">'+icon('i-trash')+'ลบ '+esc(p.name)+' ออกจากสมุด</button></div>' : '')+
      '</form>';
    $('#hb-root').innerHTML = html;
    petFormAge();
  }
  function formAgeMonths(){
    if (radioVal('pf-agemode') === 'birth'){
      var b = $('#pf-birth').value;
      return (validISO(b) && b <= todayISO()) ? ageMonthsOf({birthDate:b}) : null;
    }
    var y = $('#pf-ay').value.trim(), mo = $('#pf-am').value.trim();
    if (y === '' && mo === '') return null;
    var yi = y === '' ? 0 : Number(y), mi = mo === '' ? 0 : Number(mo);
    if (!(yi >= 0 && yi <= 40 && yi % 1 === 0 && mi >= 0 && mi <= 11 && mi % 1 === 0)) return null;
    return yi * 12 + mi;
  }
  function petFormAge(){
    var mode = radioVal('pf-agemode');
    $('#pf-birth-box').hidden = mode !== 'birth';
    $('#pf-approx-box').hidden = mode !== 'approx';
    var m = formAgeMonths(), young = m != null && m < 12;
    $('#pf-age-out').textContent = m == null ? '' : 'อายุตอนนี้: ' + ageText(m);
    $$('input[name="pf-stage"]').forEach(function(r){
      if (young){ r.checked = r.value === 'young'; r.disabled = r.value !== 'young'; }
      else r.disabled = false;
    });
    $('#pf-stage-hint').textContent = young ? 'อายุน้อยกว่า 1 ปี จึงตั้งเป็น “ลูก” ให้อัตโนมัติ' : '';
  }
  function savePet(){
    var p = pfEditId ? petById(pfEditId) : null, err = $('#pf-err'), today = todayISO();
    $$('#pet-form [aria-invalid]').forEach(function(el){ el.removeAttribute('aria-invalid'); });
    function fail(sel, msg){ var el = $(sel); el.setAttribute('aria-invalid', 'true'); err.hidden = false; err.textContent = msg; el.focus(); return false; }
    var name = cleanStr($('#pf-name').value, 30);
    if (!name) return fail('#pf-name', 'กรุณาใส่ชื่อน้อง');
    var sp = radioVal('pf-sp');
    if (!SPECIES[sp]) return fail('input[name="pf-sp"]', 'กรุณาเลือกว่าเป็นน้องหมาหรือน้องแมว');
    var mode = radioVal('pf-agemode'), birth = '', ay = null, am = null, setAt = '';
    if (mode === 'birth'){
      birth = $('#pf-birth').value;
      if (birth && (!validISO(birth) || birth > today)) return fail('#pf-birth', 'วันเกิดไม่ถูกต้อง ต้องไม่เกินวันนี้');
    } else {
      var y = $('#pf-ay').value.trim(), mo = $('#pf-am').value.trim();
      if (y !== '' || mo !== ''){
        ay = y === '' ? 0 : Number(y); am = mo === '' ? 0 : Number(mo);
        if (!(ay >= 0 && ay <= 40 && ay % 1 === 0)) return fail('#pf-ay', 'ปีต้องเป็นจำนวนเต็ม 0–40');
        if (!(am >= 0 && am <= 11 && am % 1 === 0)) return fail('#pf-am', 'เดือนต้องเป็นจำนวนเต็ม 0–11');
        setAt = today;
      }
    }
    var kg = null;
    if (!p && $('#pf-kg').value.trim()){
      var raw = $('#pf-kg').value.replace(',', '.').trim(); kg = parseFloat(raw);
      if (!/^\d+(\.\d+)?$/.test(raw) || !(kg >= 0.1 && kg <= 150)) return fail('#pf-kg', 'น้ำหนักต้องเป็นตัวเลข 0.1–150 กิโลกรัม เช่น 4.5');
    }
    if (!p && book.pets.length >= MAX_PETS) return fail('#pf-name', 'เพิ่มน้องได้สูงสุด ' + MAX_PETS + ' ตัว');
    var m = formAgeMonths();
    var data = {
      name:name, species:sp, birthDate:birth, ageYears:ay, ageMonths:am, ageSetAt:setAt,
      sex:radioVal('pf-sex') || '', sterilized:radioVal('pf-ster') || '',
      lifeStage:(m != null && m < 12) ? 'young' : (radioVal('pf-stage') || 'adult'),
      flags:{overweight:$('#pf-over').checked, kidney:$('#pf-kidney').checked}
    };
    if (p) Object.keys(data).forEach(function(k){ p[k] = data[k]; });
    else {
      p = data; p.id = newId('p'); p.createdAt = new Date().toISOString();
      p.weights = kg ? [{id:newId('w'), date:today, kg:Math.round(kg * 10) / 10}] : [];
      p.vaccines = []; p.deworm = []; p.meds = []; p.appts = [];
      book.pets.push(p);
    }
    setActive(p.id);
    hbForm = null; hbTab = 'weight';
    savedToast('บันทึกข้อมูล ' + p.name + ' แล้ว');
    return true;
  }
  function deletePet(){
    var p = petById(pfEditId); if (!p) return;
    askInline($('#pf-del-host'), 'ลบ ' + p.name + ' และบันทึกสุขภาพทั้งหมดของน้อง? ลบแล้วกู้คืนไม่ได้ ถ้าไม่มีไฟล์สำรอง', 'ลบน้อง', function(){
      book.pets = book.pets.filter(function(x){ return x.id !== p.id; });
      book.activeId = book.pets[0] ? book.pets[0].id : null;
      if (book.pets[0]) setSpecies(book.pets[0].species);
      saveBook(); hbForm = null; pfEditId = null;
      savedToast('ลบ ' + p.name + ' แล้ว');
      go('profile', {replace:true});
    });
  }

  /* ---------- backup / restore ---------- */
  function doBackup(){
    var data = {app:'kindaimai', type:'health-book-backup', version:1, exportedAt:new Date().toISOString(), data:book};
    if (downloadFile(JSON.stringify(data, null, 2), 'kindaimai-backup-' + todayISO() + '.json', 'application/json'))
      toast('ดาวน์โหลดไฟล์สำรองแล้ว เก็บไฟล์ไว้ในที่ปลอดภัย');
  }
  function onRestoreFile(input){
    var f = input.files && input.files[0], err = $('#restore-err');
    function fail(m){ err.hidden = false; err.textContent = m; input.value = ''; }
    err.hidden = true; closeConfirm();
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return fail('ไฟล์ใหญ่เกินไป ไม่ใช่ไฟล์สำรองของแอปนี้');
    var r = new FileReader();
    r.onerror = function(){ fail('อ่านไฟล์ไม่ได้ ลองเลือกไฟล์อีกครั้ง'); };
    r.onload = function(){
      var obj, nb;
      try { obj = JSON.parse(String(r.result)); } catch(e){ return fail('อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์สำรอง .json จากแอปนี้'); }
      if (!obj || typeof obj !== 'object' || obj.app !== 'kindaimai' || obj.type !== 'health-book-backup' || obj.version !== 1)
        return fail('ไฟล์นี้ไม่ใช่ไฟล์สำรองสมุดสุขภาพของแอป กินได้ไหม?');
      try { nb = validateBook(obj.data); } catch(e){ return fail('ไฟล์สำรองไม่ถูกต้อง: ' + e.message + ' จึงไม่ได้นำเข้า'); }
      input.value = '';
      askInline($('#restore-host'), 'แทนที่ข้อมูลในเครื่องนี้ด้วยไฟล์สำรอง? ไฟล์มีน้อง ' + nb.pets.length + ' ตัว ข้อมูลเดิมในเครื่องจะถูกแทนที่ทั้งหมด', 'แทนที่ข้อมูล', function(){
        book = nb; hbForm = null; hbTab = 'weight';
        var a = activePet(); if (a) setSpecies(a.species);
        saveBook(); renderProfile(); focusMain($('#prof-h'));
        savedToast('กู้คืนข้อมูลแล้ว');
      });
    };
    r.readAsText(f);
  }

  function updateHomeProfileLabel(){
    var p = activePet(), w = latestWeight(p), n = book.pets.length;
    $('#home-profile-label').textContent = p
      ? 'สมุดสุขภาพ: ' + p.name + (w ? ' · ' + kgFmt(w.kg) + ' กก.' : '') + (n > 1 ? ' และอีก ' + (n - 1) + ' ตัว' : '')
      : 'สมุดสุขภาพน้อง (ไม่บังคับ)';
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
    if (token === 'profile'){ renderProfile(); show('profile'); focusMain($('#prof-h')); return; }
    if (token === 'pet-new' || token === 'pet-edit'){
      var ep = token === 'pet-edit' ? activePet() : null;
      pfEditId = ep ? ep.id : null;
      renderPetForm(); show('profile'); focusMain($('#prof-h')); return;
    }
    if (token === 'about'){ renderAbout(); show('about'); focusMain($('#about-h')); return; }
    if (token === 'feedback'){ renderFeedback(); show('feedback'); focusMain($('#fb-h')); return; }
    if (token === 'nearby'){ renderNearby(); show('nearby'); focusMain($('#near-h')); return; }
    if (token === 'adopt'){ renderAdopt(); show('adopt'); focusMain($('#adopt-h')); return; }
    if (!dataReady){ show(dataFailed ? 'error' : 'loading'); return; }
    if (!species || token === '' || token === 'pet' || !needsSpecies(token)){
      if (needsSpecies(token)) pendingToken = token;
      updateHomeProfileLabel(); renderHomeMeds(); renderHomeDue();
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
      case 'adopt': go('adopt'); break;
      case 'rh-interest': {
        var pid = t.getAttribute('data-id');
        rhOpen[pid] = !rhOpen[pid];
        if (rhOpen[pid]) sendAuto('adopt-interest', {food: 'หาบ้าน:' + pid});
        renderRehome();
        var c = $('#rh-c-' + pid); if (c) c.scrollIntoView({block:'nearest'});
        break;
      }
      case 'rh-report': {
        var rid = t.getAttribute('data-id'), rname = t.getAttribute('data-name') || '';
        if (remoteConfigured()){
          postForm({type:'report', food:'หาบ้าน:' + rid, comment:'แจ้งโพสต์: ' + rname}).then(function(ok){
            toast(ok ? 'ส่งเรื่องให้ผู้ดูแลแอปแล้ว ขอบคุณค่ะ' : 'ยังส่งไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
          });
        } else toast('ยังแจ้งผ่านแอปไม่ได้ กรุณาติดต่อผู้ดูแลแอป');
        break;
      }
      case 'tab-home': go('pet'); break;
      case 'tab-eat': if (species) goSearch(false); else go('pet'); break;
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
      case 'clear-local':
        askInline($('#clear-host'), 'ลบสมุดสุขภาพน้องทุกตัว รายการที่บันทึก ประวัติการค้นหา และการตั้งค่าทั้งหมดในเครื่องนี้? ถ้ายังไม่ได้สำรองข้อมูล จะกู้คืนไม่ได้', 'ลบทั้งหมด', function(){
          Object.keys(LS).forEach(function(k){ if (k !== 'notice') lsDel(LS[k]); });
          book = emptyBook(); species = null; helpedThisVisit = {}; hbForm = null;
          renderPrivacyBox(); toast('ลบข้อมูลในเครื่องนี้แล้ว');
          var b = $('[data-action="clear-local"]'); if (b) b.focus();
        });
        break;
      case 'confirm-yes': {
        var pc = pendingConfirm; pendingConfirm = null; closeConfirm();
        if (pc && pc.fn) pc.fn();
        break;
      }
      case 'confirm-no': {
        var pb = pendingConfirm; pendingConfirm = null; closeConfirm();
        if (pb && pb.back && document.contains(pb.back)) pb.back.focus();
        break;
      }
      case 'pet-new': go('pet-new'); break;
      case 'pet-edit': go('pet-edit'); break;
      case 'pet-cancel': go('profile', {replace:true}); break;
      case 'pet-delete': deletePet(); break;
      case 'pet-pick': {
        var pid2 = t.getAttribute('data-id'), pp = petById(pid2);
        if (!pp) break;
        setActive(pid2); hbForm = null;
        rerenderKeep('.pet-chip[data-id="' + pid2 + '"]');
        toast('กำลังดูสมุดของ ' + pp.name);
        break;
      }
      case 'hb-tab': hbTab = t.getAttribute('data-k'); hbForm = null; rerenderKeep('#tab-' + hbTab); break;
      case 'hb-add': openEntryForm(t.getAttribute('data-kind'), null); break;
      case 'hb-add-weight': openEntryForm('weight', null); break;
      case 'quick-weight': go('profile'); if (activePet()) openEntryForm('weight', null); break;
      case 'hb-edit': openEntryForm(t.getAttribute('data-kind'), t.getAttribute('data-id')); break;
      case 'hb-cancel': hbForm = null; rerenderKeep('.hb-add'); break;
      case 'hb-del': deleteEntry(t); break;
      case 'ics': downloadIcs(t.getAttribute('data-pet'), t.getAttribute('data-kind'), t.getAttribute('data-id')); break;
      case 'ics-med': downloadMedIcs(t.getAttribute('data-pet'), t.getAttribute('data-id')); break;
      case 'dose-give': giveDoseFromCard(t); break;
      case 'time-add': {
        var tl = $('#hbf-time-list'); if (!tl || tl.children.length >= MAX_TIMES) break;
        var tmp = document.createElement('div'); tmp.innerHTML = timeRowHTML(tl.children.length, '');
        tl.appendChild(tmp.firstChild); syncTimeRows();
        tl.lastChild.querySelector('input').focus();
        break;
      }
      case 'time-del': {
        var tr = t.closest('.time-row'), tl2 = $('#hbf-time-list');
        if (!tr || !tl2 || tl2.children.length < 2) break;
        var idx = Array.prototype.indexOf.call(tl2.children, tr);
        tl2.removeChild(tr); syncTimeRows();
        tl2.children[Math.max(0, idx - 1)].querySelector('input').focus();
        break;
      }
      case 'due-open': {
        setActive(t.getAttribute('data-pet'));
        hbTab = t.getAttribute('data-kind'); hbForm = null;
        if (current !== 'profile') go('profile'); else renderProfile();
        var tb = $('#tab-' + hbTab);
        if (tb){ tb.focus({preventScroll:true}); tb.scrollIntoView({block:'start'}); }
        break;
      }
      case 'backup': doBackup(); break;
      case 'clear-recent': lsDel(LS.recent); renderSaved(); toast('ล้างประวัติแล้ว'); break;
    }
  });
  // "ให้แล้ว" on the today card (home or profile): record, re-render, keep focus in the card
  function giveDoseFromCard(btn){
    var inHome = !!btn.closest('#home-meds'), what = btn.getAttribute('aria-label').replace(/^ให้แล้ว: /, '');
    var list = btn.closest('.dose-list'), rows = list ? $$('.dr-give', list) : [], idx = rows.indexOf(btn);
    if (!setDose(btn.getAttribute('data-pet'), btn.getAttribute('data-med'), btn.getAttribute('data-time'), true)) return;
    var cardSel = inHome ? '#home-meds' : '.hb-today';
    if (inHome){ renderHomeMeds(); renderHomeDue(); } else renderProfile();
    var next = $$(cardSel + ' .dr-give');
    var el = next[Math.min(idx, next.length - 1)] || (inHome ? $('#pet-h') : $('#prof-h'));
    if (!next.length) focusMain(el); else { try { el.focus({preventScroll:true}); } catch(e){ el.focus(); } }
    savedToast('บันทึกแล้ว: ให้ ' + what);
  }
  // reminders are computed when the app is open: refresh the home cards when it comes back to the front
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible' && !$('#view-pet').hidden){ renderHomeMeds(); renderHomeDue(); }
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
  // health book forms are re-rendered, so their events are delegated
  document.addEventListener('submit', function(e){
    var f = e.target;
    if (f.id === 'pet-form'){ e.preventDefault(); if (savePet()) go('profile', {replace:true}); }
    else if (f.classList && f.classList.contains('hb-form')){ e.preventDefault(); saveEntry(f); }
  });
  document.addEventListener('change', function(e){
    var el = e.target;
    if (el.id === 'restore-file') onRestoreFile(el);
    else if (el.hasAttribute && el.hasAttribute('data-dose')){
      var ok = setDose(el.getAttribute('data-pet'), el.getAttribute('data-med'), el.getAttribute('data-time'), el.checked);
      rerenderKeep('#' + el.id);
      if (ok) savedToast(el.checked ? 'บันทึกว่าให้ยาเวลา ' + el.getAttribute('data-time') + ' แล้ว' : 'ยกเลิกการบันทึกให้ยาเวลา ' + el.getAttribute('data-time'));
    }
    else if (el.hasAttribute && el.hasAttribute('data-appt-done')){
      var ap = activePet(), aid = el.getAttribute('data-id'), a = ap && ap.appts.filter(function(x){ return x.id === aid; })[0];
      if (a){ a.done = el.checked; saveBook(); }
      rerenderKeep('#' + el.id);
      // a done appointment moves into the collapsed "นัดที่ไปแล้ว" list: keep focus on its summary
      var moved = $('#' + el.id), det = moved && moved.closest('details');
      if (det && !det.open) det.querySelector('summary').focus();
      if (a) savedToast(el.checked ? 'บันทึกว่าไปตามนัดแล้ว' : 'ย้ายกลับไปเป็นนัดที่รออยู่');
    }
    else if (el.closest && el.closest('#pet-form')) petFormAge();
  });
  document.addEventListener('input', function(e){
    if (e.target.closest && e.target.closest('#pet-form') && /^pf-(birth|ay|am)$/.test(e.target.id)) petFormAge();
  });
  // tablist keyboard: arrows / Home / End move between tabs
  document.addEventListener('keydown', function(e){
    var tb = e.target.closest && e.target.closest('.hb-tabs [role="tab"]'); if (!tb) return;
    var ks = HB_TABS.map(function(x){ return x.k; }), i = ks.indexOf(tb.getAttribute('data-k')), n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % ks.length;
    else if (e.key === 'ArrowLeft') n = (i + ks.length - 1) % ks.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = ks.length - 1;
    if (n < 0) return;
    e.preventDefault(); hbTab = ks[n]; hbForm = null; rerenderKeep('#tab-' + hbTab);
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
  var noticeClosedThisVisit = null;   // in-memory fallback when storage is blocked
  function noticeOK(){
    var seen = noticeSeen() || noticeClosedThisVisit;
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
    noticeClosedThisVisit = neededNotice();
    lsSet(LS.notice, noticeClosedThisVisit);
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
  // screens that do not need data/foods.json (health book screens included)
  var STATIC_SCREENS = ['profile', 'pet-new', 'pet-edit', 'about', 'feedback', 'nearby', 'adopt'];
  function isStatic(t){ return STATIC_SCREENS.indexOf(t) !== -1; }
  function loadFoods(){
    dataFailed = false;
    if (current !== 'emergency' && !isStatic(current)) show('loading');
    return fetch(DATA_URL, {cache:'no-cache'}).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(list){
      setFoods(list);
      if (!FOODS.length) throw new Error('empty food list');
      dataReady = true;
      renderCategories();
      if (current === 'emergency') renderEmergency();          // keep focus where the user is
      else if (isStatic(current)) { /* static screens */ }
      else render(current === '' && species ? 'search' : current);
    }).catch(function(err){
      console.error('โหลด data/foods.json ไม่สำเร็จ', err);
      dataFailed = true;
      if (current !== 'emergency' && !isStatic(current)) show('error');
    });
  }

  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-rh-sp]');
    if (b){ rhSp = b.getAttribute('data-rh-sp'); renderRehome(); }
  });
  (function(){ var rq = $('#rh-q'), tm; if (rq) rq.addEventListener('input', function(){ clearTimeout(tm); tm = setTimeout(renderRehome, 200); }); })();

  /* ---------- init ---------- */
  $('#legend').innerHTML = legendHTML();
  var start = tokenFromLocation();
  try { history.replaceState({t:start, q:nfQuery}, '', location.hash || location.pathname + location.search); } catch(e){}
  current = start;
  if (start === 'emergency' || isStatic(start)) render(start);
  else show('loading');
  loadFoods();
  registerSW();
})();
