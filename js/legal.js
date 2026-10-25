/* หน้าเอกสาร (privacy / terms ทั้งภาษาไทยและอังกฤษ): เติมชื่อสัตวแพทย์ผู้ตรวจทานจาก js/config.js
   ถ้ายังไม่ได้ใส่ใน config.js จะคงข้อความ [ชื่อสัตวแพทย์] / [veterinarian's name] ไว้ */
(function(){
  'use strict';
  var cfg = window.APP_CONFIG || {};
  var r = cfg.REVIEW || {};
  var name = String(r.reviewer || '').trim(), date = String(r.date || '').trim();
  if (!name) return;
  var en = /^en/i.test(document.documentElement.lang || '');
  Array.prototype.forEach.call(document.querySelectorAll('.js-reviewer'), function(el){
    el.textContent = en ? 'veterinarian ' + name + (date ? ' (reviewed on ' + date + ')' : '')
                        : 'สพ.' + name + (date ? ' (ตรวจทานเมื่อ ' + date + ')' : '');
    el.classList.remove('ph');
  });
  Array.prototype.forEach.call(document.querySelectorAll('.js-draft-only'), function(el){ el.hidden = true; });
})();
