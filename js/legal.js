/* หน้าเอกสาร (privacy.html, terms.html): เติมชื่อสัตวแพทย์ผู้ตรวจทานจาก js/config.js
   ถ้ายังไม่ได้ใส่ใน config.js จะคงข้อความ [ชื่อสัตวแพทย์] ไว้ */
(function(){
  'use strict';
  var cfg = window.APP_CONFIG || {};
  var r = cfg.REVIEW || {};
  var name = String(r.reviewer || '').trim(), date = String(r.date || '').trim();
  if (!name) return;
  Array.prototype.forEach.call(document.querySelectorAll('.js-reviewer'), function(el){
    el.textContent = 'สพ.' + name + (date ? ' (ตรวจทานเมื่อ ' + date + ')' : '');
    el.classList.remove('ph');
  });
  Array.prototype.forEach.call(document.querySelectorAll('.js-draft-only'), function(el){ el.hidden = true; });
})();
