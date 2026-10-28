(function () {
  'use strict';
  var cfg = window.PLOTDESK || {};
  var form = document.getElementById('wl');
  var formView = document.getElementById('form-view');
  var doneView = document.getElementById('done-view');
  var note = document.getElementById('form-note');
  var submit = document.getElementById('submit');
  var renderedAt = Date.now();

  // Text from config.js
  var opening = document.querySelector('[data-opening]');
  if (opening && cfg.openingText) {
    opening.textContent = window.matchMedia('(max-width: 767px)').matches && cfg.openingTextShort
      ? cfg.openingTextShort : cfg.openingText;
  }

  var fields = ['name', 'email', 'phone', 'city', 'consent'];

  function setError(id, msg) {
    var err = document.getElementById(id + '-err');
    var input = document.getElementById(id);
    if (!err || !input) return;
    err.textContent = msg || '';
    var wrap = input.closest('.field');
    if (wrap) wrap.classList.toggle('invalid', !!msg);
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function clearErrors() {
    fields.forEach(function (f) { setError(f, ''); });
    note.hidden = true;
    note.textContent = '';
    note.className = 'note warn';
  }
  function showNote(msg, kind) {
    note.textContent = msg;
    note.className = 'note ' + (kind || 'warn');
    note.hidden = false;
  }

  function normalisePhone(raw) {
    var d = String(raw || '').replace(/[^\d]/g, '');
    if (!d) return '';
    if (d.indexOf('234') === 0 && d.length >= 13) d = d.slice(3);
    if (d.charAt(0) === '0') d = d.slice(1);
    return d;
  }

  function validate(v) {
    var errs = {};
    if (v.name.length < 2) errs.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errs.email = 'Please enter a valid email address.';
    if (v.phone && !/^\d{10}$/.test(v.phone)) errs.phone = 'Enter the 10 digits after +234, for example 803 000 0000.';
    if (v.city.length < 2) errs.city = 'Please enter your city.';
    if (!v.consent) errs.consent = 'Please tick the box so we can email you.';
    return errs;
  }

  function values() {
    var role = form.querySelector('input[name="role"]:checked');
    return {
      role: role ? role.value : 'agency',
      name: form.name.value.trim().replace(/\s+/g, ' '),
      email: form.email.value.trim().toLowerCase(),
      phone: normalisePhone(form.phone.value),
      city: form.city.value.trim().replace(/\s+/g, ' '),
      consent: form.consent.checked,
      company: form.company.value, // honeypot
      ts: renderedAt
    };
  }

  function focusFirstError(errs) {
    for (var i = 0; i < fields.length; i++) {
      if (errs[fields[i]]) { document.getElementById(fields[i]).focus(); return; }
    }
  }

  function showDone(email) {
    document.getElementById('done-email').textContent = email;
    formView.hidden = true;
    doneView.hidden = false;
    var h = document.getElementById('done-title');
    h.setAttribute('role', 'status');
    h.focus();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }

  function setBusy(busy) {
    submit.disabled = busy;
    submit.querySelector('.label').textContent = busy ? 'Sending…' : 'Join early access';
    submit.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  form.addEventListener('input', function (e) {
    var id = e.target && e.target.id;
    if (id && fields.indexOf(id) > -1) setError(id, '');
  });
  form.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'consent') setError('consent', '');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var v = values();
    var errs = validate(v);
    var keys = Object.keys(errs);
    if (keys.length) {
      keys.forEach(function (k) { setError(k, errs[k]); });
      focusFirstError(errs);
      return;
    }
    setBusy(true);
    var payload = {
      role: v.role, name: v.name, email: v.email, phone: v.phone ? '+234' + v.phone : '',
      city: v.city, consent: true, company: v.company, ts: v.ts
    };
    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok) { showDone(v.email); return; }
      setBusy(false);
      if (r.status === 429) {
        showNote('Too many tries right now. Please try again in a few minutes.', 'warn');
      } else if (r.status === 400 && r.data && r.data.errors) {
        var sErrs = r.data.errors;
        Object.keys(sErrs).forEach(function (k) { if (fields.indexOf(k) > -1) setError(k, sErrs[k]); });
        focusFirstError(sErrs);
        if (!Object.keys(sErrs).some(function (k) { return fields.indexOf(k) > -1; })) showNote('Please check your details and try again.', 'bad');
      } else {
        showNote("We couldn't save your details. Please try again in a moment.", 'bad');
      }
    }).catch(function () {
      setBusy(false);
      showNote("We couldn't reach the server. Check your connection and try again.", 'bad');
    });
  });

  // The "Join early access" pill in the header jumps to the form and focuses the first field.
  var jump = document.querySelector('.top .pill');
  if (jump) jump.addEventListener('click', function () {
    setTimeout(function () { var n = document.getElementById('name'); if (n && !formView.hidden) n.focus({ preventScroll: true }); }, 350);
  });
})();
