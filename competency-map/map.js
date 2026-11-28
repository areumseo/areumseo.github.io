/* Technical Competency Map — renders ./data.json (publication-safe content only). */
(function () {
  'use strict';

  var MARKS = {
    '●': 'Described as implemented or carried out',
    '△': 'Design level, or partial involvement',
    '?': 'Details still being documented',
    '—': 'No record for this area'
  };
  var KIND = { ai: 'AI step', rule: 'Rule-based step', human: 'Human review', data: 'Data', app: 'Application' };
  var LEVEL = { direct: 'Used in this project', related: 'Related concept', design: 'Considered in design', unconfirmed: 'To be confirmed' };

  var D, P = {}, C = {}, S = {}, K = {}, A = {};
  var areaFilter = 'all';

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function list(items) { items = arr(items); return items.length ? '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : ''; }
  function tags(names) { return names.length ? '<ul class="tags">' + names.map(function (n) { return '<li><span class="tag">' + esc(n) + '</span></li>'; }).join('') + '</ul>' : ''; }
  function norm(s) { return String(s || '').toLowerCase(); }
  function projectAreas(p) {
    var a = {};
    arr(p.capabilityIds).forEach(function (c) { if (C[c]) a[C[c].areaId] = 1; });
    Object.keys(p.areaMarks || {}).forEach(function (k) { if (p.areaMarks[k].mark === '●') a[k] = 1; });
    return Object.keys(a);
  }
  function statusClass(s) { return /design/i.test(s) ? 'designed' : (/scope/i.test(s) ? 'scope' : ''); }

  // 01 ─ capability overview
  function renderAreas() {
    $('#area-grid').innerHTML = D.areas.map(function (a) {
      var caps = D.capabilities.filter(function (c) { return c.areaId === a.id; }).map(function (c) { return c.name; });
      return '<article class="area"><h3>' + esc(a.name) + '</h3><p>' + esc(a.summary) + '</p>' + tags(caps) +
        '<p class="area-projects"><button type="button" class="btn-link" data-area="' + esc(a.id) + '">See examples</button></p></article>';
    }).join('');
  }

  // 02 ─ projects
  function renderProjectFilter() {
    var opts = [['all', 'All']].concat(D.areas.map(function (a) { return [a.id, a.name]; }));
    $('#project-filter').innerHTML = opts.map(function (o) {
      return '<button type="button" class="chip" data-filter="' + esc(o[0]) + '" aria-pressed="' + (areaFilter === o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('');
  }

  function projectCard(p) {
    var caps = arr(p.capabilityIds).filter(function (c) { return C[c]; }).map(function (c) { return C[c].name; });
    var stack = arr(p.stackIds).filter(function (s) { return S[s]; }).map(function (s) { return S[s].name; });
    return '<article class="card" id="project-' + esc(p.id) + '">' +
      '<div class="card-meta"><span class="status ' + statusClass(p.status) + '">' + esc(p.status) + '</span>' +
      (p.kind === 'foundation' ? '<span class="kind">Shared foundation</span>' : '') + '</div>' +
      '<h3>' + esc(p.title) + '</h3><p class="summary">' + esc(p.summary) + '</p>' +
      '<dl><div><dt>Problem</dt><dd>' + esc(p.problem) + '</dd></div><div><dt>My contribution</dt><dd>' + esc(p.contribution) + '</dd></div></dl>' +
      tags(caps) +
      '<details class="more"><summary>' + esc(p.detailsLabel || 'Implementation details') + '</summary><div class="more-body">' +
      '<div><h4>Implementation</h4>' + list(p.implementation) + '</div>' +
      (stack.length ? '<div><h4>Stack</h4>' + tags(stack) + '</div>' : '') +
      arr(p.notes).map(function (n) { return '<div><h4>' + esc(n.label || 'Note') + '</h4><p class="note">' + esc(n.text || n) + '</p></div>'; }).join('') +
      '</div></details></article>';
  }

  function renderProjects() {
    var items = D.projects.filter(function (p) { return areaFilter === 'all' || projectAreas(p).indexOf(areaFilter) >= 0; });
    $('#project-list').innerHTML = items.map(projectCard).join('');
    var n = items.length + ' entr' + (items.length === 1 ? 'y' : 'ies');
    $('#project-count').textContent = areaFilter === 'all' ? 'Showing all ' + n : 'Showing ' + n + ' · ' + A[areaFilter].name;
    $all('#project-filter .chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === areaFilter)); });
  }

  // 03 ─ matrix
  function renderMatrix() {
    $('#matrix-legend').innerHTML = Object.keys(MARKS).map(function (k) { return '<li><strong aria-hidden="true">' + k + '</strong>' + esc(MARKS[k]) + '</li>'; }).join('');
    var head = '<tr><th scope="col">Project</th>' + D.areas.map(function (a) { return '<th scope="col">' + esc(a.name) + '</th>'; }).join('') + '</tr>';
    var rows = D.projects.map(function (p) {
      return '<tr><th scope="row"><button type="button" class="row-btn" aria-expanded="false" data-row="' + esc(p.id) + '">' + esc(p.title) + '</button></th>' +
        D.areas.map(function (a) {
          var m = (p.areaMarks[a.id] || { mark: '—' }).mark;
          return '<td class="mark"><span aria-hidden="true">' + esc(m) + '</span><span class="visually-hidden">' + esc(MARKS[m]) + '</span></td>';
        }).join('') + '</tr>';
    }).join('');
    var cards = D.projects.map(function (p) {
      return '<details class="mcard"><summary><span>' + esc(p.title) + '</span><span class="marks" aria-hidden="true">' +
        D.areas.map(function (a) { return (p.areaMarks[a.id] || { mark: '—' }).mark; }).join('') + '</span></summary>' + basisList(p) + '</details>';
    }).join('');
    $('#matrix-body').innerHTML = '<div class="matrix-wrap"><table><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div><div class="matrix-cards">' + cards + '</div>';
  }

  function basisList(p) {
    return '<dl>' + D.areas.map(function (a) {
      var m = p.areaMarks[a.id] || { mark: '—' };
      return '<dt>' + esc(a.name) + '</dt><dd>' + esc(m.mark) + ' ' + esc(m.note || MARKS[m.mark]) + '</dd>';
    }).join('') + '</dl>';
  }

  // 04 ─ stack
  function stackText(s) {
    var parts = [s.name, s.use, s.capability, s.note].concat(arr(s.aliases));
    arr(s.projectIds).forEach(function (id) { if (P[id]) parts.push(P[id].title); });
    arr(s.conceptIds).forEach(function (id) { if (K[id]) { parts.push(K[id].name); parts = parts.concat(arr(K[id].aliases)); } });
    return norm(parts.join(' '));
  }

  function renderStack() {
    var q = norm($('#stack-q').value).trim();
    var items = D.stack.filter(function (s) {
      if (!q) return true;
      var t = s._t || (s._t = stackText(s));
      return q.split(/\s+/).every(function (w) { return t.indexOf(w) >= 0; });
    });
    $('#stack-count').textContent = q ? items.length + ' of ' + D.stack.length + ' technologies match' : D.stack.length + ' technologies';
    if (!items.length) {
      $('#stack-list').innerHTML = '<div class="empty"><span>Nothing matches that search.</span><button type="button" class="btn-link" id="stack-clear">Clear search</button></div>';
      return;
    }
    $('#stack-list').innerHTML = items.map(function (s) {
      var projs = arr(s.projectIds).filter(function (id) { return P[id]; }).map(function (id) { return P[id].title; });
      var cons = arr(s.conceptIds).filter(function (id) { return K[id]; }).map(function (id) { return K[id].name; });
      return '<details class="stack-item"><summary><span class="stack-name">' + esc(s.name) + '</span><span class="stack-use">' + esc(s.use) + '</span></summary>' +
        '<div class="stack-body"><div><b>Capability</b>' + esc(s.capability) + '</div>' +
        (projs.length ? '<div><b>Projects</b>' + esc(projs.join(', ')) + '</div>' : '') +
        (cons.length ? '<div><b>Concepts</b>' + esc(cons.join(', ')) + '</div>' : '') +
        (s.note ? '<div><b>Note</b>' + esc(s.note) + '</div>' : '') + '</div></details>';
    }).join('');
  }

  // 05 ─ architecture
  function renderArch() {
    $('#arch-legend').innerHTML = Object.keys(KIND).map(function (k) { return '<li><span class="node k-' + k + '">' + esc(KIND[k]) + '</span></li>'; }).join('');
    $('#arch-list').innerHTML = D.architectures.map(function (a, i) {
      var cols = Math.max.apply(null, a.lanes.map(function (l) { return l.steps.length; }));
      return '<details class="arch" style="--cols:' + cols + '"' + (i === 0 ? ' open' : '') + '><summary><h3>' + esc(a.title) + '</h3><span>' + esc(a.description) + '</span></summary><div class="arch-body">' +
        a.lanes.map(function (l) {
          return '<div class="lane">' + (l.label ? '<p class="lane-label">' + esc(l.label) + '</p>' : '') + '<ol class="flow">' +
            l.steps.map(function (s) { var k = KIND[s.kind] ? s.kind : 'app'; return '<li><span class="node k-' + k + '"><small>' + esc(KIND[k]) + '</small>' + esc(s.label) + '</span></li>'; }).join('') +
            '</ol></div>';
        }).join('') + (arr(a.notes).length ? '<div class="arch-notes">' + list(a.notes) + '</div>' : '') + '</div></details>';
    }).join('') +
      (arr(D.patterns).length ? '<div class="patterns"><h3>Shared patterns (conceptual, not system links)</h3><ul>' +
        D.patterns.map(function (p) { return '<li><strong>' + esc(p.pair) + '</strong> — ' + esc(p.concepts) + '</li>'; }).join('') + '</ul></div>' : '');
  }

  // 06 ─ concepts
  function renderConcepts() {
    $('#concept-list').innerHTML = D.concepts.map(function (k) {
      var links = arr(k.projectLinks).filter(function (l) { return P[l.projectId]; }).map(function (l) {
        return '<li><a href="#project-' + esc(l.projectId) + '" data-goto="' + esc(l.projectId) + '">' + esc(P[l.projectId].title) + '</a> <span class="lvl">' + esc(LEVEL[l.level] || l.level) + '</span></li>';
      }).join('');
      var rel = arr(k.relatedIds).filter(function (r) { return K[r]; }).map(function (r) { return K[r].name; });
      return '<details class="concept" id="concept-' + esc(k.id) + '"><summary><h3>' + esc(k.name) + '</h3><span class="def">' + esc(k.definition) + '</span></summary>' +
        '<div class="concept-body"><div><h4>In practice</h4><p>' + esc(k.inPractice) + '</p></div>' +
        (links ? '<div><h4>Where it shows up</h4><ul>' + links + '</ul></div>' : '') +
        (k.question ? '<div><h4>The question I ask</h4><p>' + esc(k.question) + '</p></div>' : '') +
        (rel.length ? '<div><h4>Related</h4>' + tags(rel) + '</div>' : '') + '</div></details>';
    }).join('');
  }

  // events
  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-filter],[data-area],[data-row],#stack-clear,[data-goto]');
      if (!t) return;
      if (t.dataset.filter) { areaFilter = t.dataset.filter; renderProjects(); }
      else if (t.dataset.area) { areaFilter = t.dataset.area; renderProjects(); $('#projects').scrollIntoView(); $('#project-filter .chip[aria-pressed="true"]').focus({ preventScroll: true }); }
      else if (t.dataset.row) { toggleRow(t); }
      else if (t.id === 'stack-clear') { $('#stack-q').value = ''; renderStack(); $('#stack-q').focus(); }
      else if (t.dataset.goto) {
        if (areaFilter !== 'all' && projectAreas(P[t.dataset.goto]).indexOf(areaFilter) < 0) { areaFilter = 'all'; renderProjects(); }
      }
    });
    var timer;
    $('#stack-q').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(renderStack, 100); });
  }

  function toggleRow(btn) {
    var tr = btn.closest('tr'), next = tr.nextElementSibling, open = btn.getAttribute('aria-expanded') === 'true';
    if (next && next.classList.contains('detail-row')) next.remove();
    btn.setAttribute('aria-expanded', String(!open));
    if (open) return;
    var p = P[btn.dataset.row];
    tr.insertAdjacentHTML('afterend', '<tr class="detail-row"><td colspan="' + (D.areas.length + 1) + '">' + basisList(p) +
      '<p><a class="btn-link" href="#project-' + esc(p.id) + '" data-goto="' + esc(p.id) + '">Read the project →</a></p></td></tr>');
  }

  function spy() {
    if (!('IntersectionObserver' in window)) return;
    var links = {}; $all('.subnav-list a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting && links[en.target.id]) {
          $all('.subnav-list a').forEach(function (x) { x.removeAttribute('aria-current'); });
          links[en.target.id].setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    Object.keys(links).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }

  function init(data) {
    D = data;
    D.projects.forEach(function (p) { P[p.id] = p; });
    D.capabilities.forEach(function (c) { C[c.id] = c; });
    D.stack.forEach(function (s) { S[s.id] = s; });
    D.concepts.forEach(function (k) { K[k.id] = k; });
    D.areas.forEach(function (a) { A[a.id] = a; });
    if (D.meta.updatedAt) $('#footer-updated').textContent = 'Seoul · KR · Updated ' + D.meta.updatedAt;
    renderAreas(); renderProjectFilter(); renderProjects(); renderMatrix(); renderStack(); renderArch(); renderConcepts();
    bind(); spy();
    if (location.hash) { var el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
  }

  $('#year').textContent = new Date().getFullYear();
  fetch('data.json?v=20261128b').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(init).catch(function () {
    $('#main').insertAdjacentHTML('afterbegin', '<p class="noscript">The project data could not be loaded. Please refresh the page.</p>');
  });
})();
