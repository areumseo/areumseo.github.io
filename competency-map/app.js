/* Technical Competency Map
 * - No network calls except loading ./sample-data.json from this site.
 * - Personal content data is read from a local file the viewer picks, never uploaded.
 * - Self-assessment lives in localStorage only, separate from content data.
 */
(function () {
  'use strict';

  var CONTENT_KEY = 'tcm.content.v1';
  var ASSESS_KEY = 'tcm.assessment.v1';

  var STATUS = {
    'implemented': 'Implemented',
    'designed': 'Designed',
    'planned': 'Planned',
    'needs-clarification': 'Needs Clarification'
  };
  var STATUS_DESC = {
    'implemented': '구현·실행했다고 설명됨',
    'designed': '설계 산출물이 있다고 설명됨',
    'planned': '앞으로 할 작업',
    'needs-clarification': '범위나 상태 확인 필요'
  };
  var EVIDENCE = { 'described': '설명 기록 있음', 'linked': '자료 연결됨', 'reproduced': '재현 확인됨' };
  var LINK = { 'direct': '직접 설명된 사용', 'related': '관련 개념', 'unconfirmed': '추가 확인 필요' };
  var ANSWERS = [
    ['unassessed', '미평가'],
    ['hard', '아직 어려움'],
    ['assisted', '도움받아 가능'],
    ['independent', '직접 가능']
  ];
  var ANSWER_LABEL = {}; ANSWERS.forEach(function (a) { ANSWER_LABEL[a[0]] = a[1]; });
  var MARKS = {
    '●': '제공된 구현·수행 설명에 연결됨',
    '△': '설계 또는 이전 대화 요약 수준으로 확인',
    '?': '상세 확인 필요',
    '—': '현재 기록 없음'
  };
  var KIND = { ai: 'AI 처리', rule: '규칙 기반 처리', human: '사람의 검토', data: '데이터', app: '애플리케이션' };
  var DEFAULT_AXES = [
    { id: 'conceptual', name: 'Conceptual Understanding', items: ['개념을 내 말로 설명할 수 있다.', '비슷한 개념과 차이를 설명할 수 있다.', '사용 조건과 한계를 설명할 수 있다.'] },
    { id: 'design', name: 'Design & Reasoning', items: ['문제와 제약을 구조화할 수 있다.', '선택한 설계와 대안을 비교할 수 있다.', '결과를 검증할 방법을 정할 수 있다.'] },
    { id: 'ai-assisted', name: 'AI-assisted Implementation', items: ['AI에 필요한 맥락과 제약을 전달할 수 있다.', '생성된 코드의 핵심 흐름을 설명할 수 있다.', '오류를 재현하고 결과를 수용·거절할 수 있다.'] },
    { id: 'independent', name: 'Independent Coding', items: ['작은 단위를 빈 파일에서 구현할 수 있다.', '공식 문서를 참고해 수정할 수 있다.', '실패 사례를 직접 추적하고 검증할 수 있다.'] }
  ];

  var D = null;          // content data
  var IDX = {};          // lookup maps
  var dataSource = 'sample';
  var state = { q: '', filters: {}, matrixView: window.matchMedia('(max-width: 860px)').matches ? 'cards' : 'table' };
  var assess = { version: 1, records: {} };
  var storageOk = true;

  // ── helpers ──────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFKC'); }
  function list(items, cls) {
    items = arr(items);
    if (!items.length) return '';
    return '<ul' + (cls ? ' class="' + cls + '"' : '') + '>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }
  function badge(kind, key, label) { return '<span class="badge ' + kind + '-' + esc(key) + '">' + esc(label) + '</span>'; }
  function statusBadge(s) { return s ? badge('st', s, STATUS[s] || s) : ''; }
  function evBadge(e) { return e ? '<span class="badge ev ev-' + esc(e) + '">근거: ' + esc(EVIDENCE[e] || e) + '</span>' : ''; }
  function linkBadge(l) { return l ? badge('lk', l, LINK[l] || l) : ''; }
  function nameOf(map, id) { var o = map[id]; return o ? (o.name || o.title) : id; }
  function tagLinks(ids, map, hrefFn) {
    ids = arr(ids).filter(function (id) { return map[id]; });
    if (!ids.length) return '';
    return '<ul class="tags">' + ids.map(function (id) {
      return '<li><a class="tag" href="' + hrefFn(id) + '">' + esc(nameOf(map, id)) + '</a></li>';
    }).join('') + '</ul>';
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ── data loading ─────────────────────────────────────────
  function validate(data) {
    if (!data || typeof data !== 'object') throw new Error('JSON 객체가 아닙니다.');
    if (!Array.isArray(data.projects)) throw new Error('projects 배열이 없습니다.');
    ['claims', 'outcomes', 'stack', 'capabilities', 'concepts', 'evidence', 'architectures', 'gaps', 'learningTasks', 'sources', 'areas'].forEach(function (k) {
      if (data[k] != null && !Array.isArray(data[k])) throw new Error(k + '는 배열이어야 합니다.');
      data[k] = arr(data[k]);
    });
    data.meta = data.meta || {};
    return data;
  }

  function buildIndex() {
    IDX = {};
    ['projects', 'claims', 'outcomes', 'stack', 'capabilities', 'concepts', 'evidence', 'architectures', 'gaps', 'learningTasks', 'sources', 'areas'].forEach(function (k) {
      IDX[k] = {};
      D[k].forEach(function (o) { IDX[k][o.id] = o; });
    });
    // derived reverse links
    D.capabilities.forEach(function (c) { c._projects = []; c._stack = []; });
    D.concepts.forEach(function (c) { c._stack = []; });
    D.projects.forEach(function (p) {
      p._claims = D.claims.filter(function (c) { return c.projectId === p.id; });
      p._concepts = D.concepts.filter(function (c) { return arr(c.projectLinks).some(function (l) { return l.projectId === p.id; }); });
      arr(p.capabilityIds).forEach(function (cid) { if (IDX.capabilities[cid]) IDX.capabilities[cid]._projects.push(p.id); });
    });
    D.stack.forEach(function (s) {
      arr(s.capabilityIds).forEach(function (cid) { if (IDX.capabilities[cid]) IDX.capabilities[cid]._stack.push(s.id); });
      arr(s.conceptIds).forEach(function (cid) { if (IDX.concepts[cid]) IDX.concepts[cid]._stack.push(s.id); });
      s._projects = uniq(arr(s.projectIds).concat(D.projects.filter(function (p) { return arr(p.stackIds).indexOf(s.id) >= 0; }).map(function (p) { return p.id; })));
    });
    D.claims.forEach(function (c) { c._outcomes = D.outcomes.filter(function (o) { return o.claimId === c.id; }); });
  }

  function loadContent(data, source) {
    D = validate(data);
    dataSource = source;
    buildIndex();
    state.filters = {};
    renderAll();
    route();
  }

  function setDataStatus() {
    var el = $('#data-status');
    var label = D.meta.dataKind === 'sample' || dataSource === 'sample'
      ? '<strong>예시 데이터</strong>를 보고 있습니다. 실제 프로젝트 내용이 아닙니다.'
      : '<strong>개인 데이터</strong>를 보고 있습니다' + (dataSource === 'stored' ? ' (이 브라우저에 기억됨).' : ' (이 탭에서만 열림).');
    el.innerHTML = label + (D.meta.title ? ' · ' + esc(D.meta.title) : '');
    $('#clear-content').hidden = dataSource === 'sample';
  }

  function initDataControls() {
    var remember = $('#remember-content');
    $('#content-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result);
          loadContent(data, remember.checked ? 'stored' : 'file');
          if (remember.checked) {
            try { localStorage.setItem(CONTENT_KEY, r.result); }
            catch (err) { $('#data-status').insertAdjacentHTML('beforeend', ' 브라우저 저장소를 쓸 수 없어 기억하지 못했습니다.'); dataSource = 'file'; }
          }
        } catch (err) {
          $('#data-status').textContent = '파일을 읽지 못했습니다: ' + err.message;
        }
        e.target.value = '';
      };
      r.readAsText(f);
    });
    $('#clear-content').addEventListener('click', function () {
      try { localStorage.removeItem(CONTENT_KEY); } catch (err) { /* ignore */ }
      loadSample();
    });
  }

  function loadSample() {
    fetch('sample-data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { loadContent(d, 'sample'); })
      .catch(function () {
        $('#data-status').textContent = '예시 데이터를 불러오지 못했습니다. 개인 데이터 파일을 열어 주세요.';
      });
  }

  // ── search & filters ────────────────────────────────────
  var FILTER_GROUPS = [
    { id: 'project', label: '프로젝트' },
    { id: 'area', label: '역량 영역' },
    { id: 'status', label: '구현 상태' },
    { id: 'evidence', label: '근거 수준' },
    { id: 'link', label: '사용 확인 수준' },
    { id: 'assess', label: '자기 평가 상태' }
  ];

  function filterOptions(g) {
    switch (g) {
      case 'project': return D.projects.map(function (p) { return [p.id, p.title]; });
      case 'area': return D.areas.map(function (a) { return [a.id, a.name]; });
      case 'status': return Object.keys(STATUS).map(function (k) { return [k, STATUS[k]]; });
      case 'evidence': return Object.keys(EVIDENCE).map(function (k) { return [k, EVIDENCE[k]]; });
      case 'link': return Object.keys(LINK).map(function (k) { return [k, LINK[k]]; });
      case 'assess': return [['unassessed', '미평가'], ['in-progress', '일부 평가'], ['assessed', '모두 평가']];
    }
    return [];
  }

  function assessState(targetId) {
    var rec = assess.records[targetId];
    var axes = D.assessmentAxes || DEFAULT_AXES;
    var total = 0, done = 0;
    axes.forEach(function (ax) {
      ax.items.forEach(function (_, i) {
        total++;
        var v = rec && rec.answers && rec.answers[ax.id] && rec.answers[ax.id][i];
        if (v && v !== 'unassessed') done++;
      });
    });
    return done === 0 ? 'unassessed' : (done === total ? 'assessed' : 'in-progress');
  }

  function areasOfCaps(capIds) {
    return uniq(arr(capIds).map(function (c) { return IDX.capabilities[c] && IDX.capabilities[c].areaId; }).filter(Boolean));
  }

  // Facets per entity: a filter group with no values on an entity means "does not match" while that group is active.
  function facets(type, o) {
    var f = { project: [], area: [], status: [], evidence: [], link: [], assess: [] };
    if (type === 'project') {
      f.project = [o.id];
      f.area = uniq(areasOfCaps(o.capabilityIds).concat(Object.keys(o.areaMarks || {}).filter(function (a) { var m = o.areaMarks[a]; return m && (m.mark === '●' || m.mark === '△'); })));
      f.status = uniq(o._claims.map(function (c) { return c.implementationStatus; }));
      f.evidence = uniq(o._claims.map(function (c) { return c.evidenceLevel; }));
      f.link = uniq(o._concepts.map(function (c) { var l = arr(c.projectLinks).filter(function (x) { return x.projectId === o.id; })[0]; return l && l.level; }).filter(Boolean));
    } else if (type === 'stack') {
      f.project = o._projects;
      f.area = areasOfCaps(o.capabilityIds);
      f.link = ['direct'];
      o._projects.forEach(function (pid) { var p = IDX.projects[pid]; if (p) { f.status = f.status.concat(p._claims.map(function (c) { return c.implementationStatus; })); f.evidence = f.evidence.concat(p._claims.map(function (c) { return c.evidenceLevel; })); } });
      f.status = uniq(f.status); f.evidence = uniq(f.evidence);
    } else if (type === 'concept') {
      f.project = arr(o.projectLinks).map(function (l) { return l.projectId; });
      f.area = arr(o.areaIds);
      f.link = uniq(arr(o.projectLinks).map(function (l) { return l.level; }));
      f.assess = [assessState(o.id)];
    } else if (type === 'claim') {
      f.project = [o.projectId];
      var p = IDX.projects[o.projectId];
      f.area = p ? areasOfCaps(p.capabilityIds) : [];
      f.status = [o.implementationStatus];
      f.evidence = [o.evidenceLevel];
    }
    return f;
  }

  function searchText(type, o) {
    var parts = [o.title, o.name, o.summary, o.text, o.definitionKo, o.usageContext, o.category, o.problem, o.capability, o.note];
    parts = parts.concat(arr(o.aliases));
    if (type === 'project') {
      arr(o.work).forEach(function (g) { parts.push(g.heading); parts = parts.concat(arr(g.items)); });
      arr(o.capabilityIds).forEach(function (c) { parts.push(nameOf(IDX.capabilities, c)); });
      arr(o.stackIds).forEach(function (s) { var x = IDX.stack[s]; if (x) { parts.push(x.name); parts = parts.concat(arr(x.aliases)); } });
      o._concepts.forEach(function (c) { parts.push(c.name); parts = parts.concat(arr(c.aliases)); });
    }
    if (type === 'stack') {
      arr(o.capabilityIds).forEach(function (c) { parts.push(nameOf(IDX.capabilities, c)); });
      arr(o.conceptIds).forEach(function (c) { var x = IDX.concepts[c]; if (x) { parts.push(x.name); parts = parts.concat(arr(x.aliases)); } });
      o._projects.forEach(function (p) { parts.push(nameOf(IDX.projects, p)); });
    }
    if (type === 'concept') {
      arr(o.projectLinks).forEach(function (l) { parts.push(nameOf(IDX.projects, l.projectId)); parts.push(l.note); });
      arr(o.relatedIds).forEach(function (r) { parts.push(nameOf(IDX.concepts, r)); });
      parts = parts.concat(arr(o.checklist)); parts.push(o.exercise);
      o._stack.forEach(function (s) { parts.push(nameOf(IDX.stack, s)); });
    }
    if (type === 'claim') { parts.push(nameOf(IDX.projects, o.projectId)); o._outcomes.forEach(function (x) { parts.push(x.value + ' ' + (x.unit || '')); }); }
    return norm(parts.filter(Boolean).join(' \u0001 '));
  }

  function matches(type, o) {
    var q = norm(state.q).trim();
    if (q) {
      var text = o._search || (o._search = searchText(type, o));
      var terms = q.split(/\s+/);
      for (var i = 0; i < terms.length; i++) if (text.indexOf(terms[i]) < 0) return false;
    }
    var f = facets(type, o);
    for (var g in state.filters) {
      var sel = state.filters[g];
      if (!sel || !sel.length) continue;
      if (!f[g].some(function (v) { return sel.indexOf(v) >= 0; })) return false; // OR within group, AND across groups
    }
    return true;
  }

  function anyFilter() {
    if (state.q.trim()) return true;
    for (var g in state.filters) if (state.filters[g] && state.filters[g].length) return true;
    return false;
  }

  function renderFilters() {
    $('#filters').innerHTML = FILTER_GROUPS.map(function (g) {
      return '<fieldset><legend>' + esc(g.label) + '</legend>' + filterOptions(g.id).map(function (o) {
        var checked = (state.filters[g.id] || []).indexOf(o[0]) >= 0 ? ' checked' : '';
        return '<label><input type="checkbox" data-group="' + g.id + '" value="' + esc(o[0]) + '"' + checked + '> ' + esc(o[1]) + '</label>';
      }).join('') + '</fieldset>';
    }).join('');
  }

  function initFinder() {
    var t;
    $('#q').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { state.q = e.target.value; renderFiltered(); }, 120); });
    $('#filter-toggle').addEventListener('click', function () {
      var open = this.getAttribute('aria-expanded') !== 'true';
      this.setAttribute('aria-expanded', String(open));
      $('#filters').hidden = !open;
    });
    $('#filters').addEventListener('change', function (e) {
      var cb = e.target; if (!cb.dataset.group) return;
      var g = cb.dataset.group; var s = state.filters[g] || [];
      if (cb.checked) s.push(cb.value); else s = s.filter(function (v) { return v !== cb.value; });
      state.filters[g] = s; renderFiltered();
    });
    $('#filter-reset').addEventListener('click', resetFilters);
  }

  function resetFilters() {
    state.q = ''; state.filters = {}; $('#q').value = ''; renderFilters(); renderFiltered();
  }

  function emptyBox() {
    return '<div class="empty"><p>해당 조건의 항목이 없습니다. 검색어나 필터를 바꿔보세요.</p><button type="button" class="btn btn-ghost" data-reset>필터 초기화</button></div>';
  }

  // ── renderers ────────────────────────────────────────────
  function renderOverview() {
    var m = D.meta;
    $('#intro').innerHTML = arr(m.intro).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    $('#disclaimer').textContent = m.disclaimer || '';
    $('#area-summary').innerHTML = D.areas.map(function (a) {
      var n = D.projects.filter(function (p) { var mk = p.areaMarks && p.areaMarks[a.id]; return mk && mk.mark === '●'; }).length;
      return '<div class="area-card"><h3>' + esc(a.name) + '</h3><p>' + esc(a.summary || '') + '</p><p class="hint">구현 설명과 연결된 프로젝트 ' + n + '개</p></div>';
    }).join('');
    $('#footer-meta').textContent = '페이지 데이터 수정일: ' + (m.updatedAt || '미기재') + ' · 성과 수치의 측정 시점은 각 항목에 따로 표시합니다.';
  }

  function projectCard(p) {
    var statuses = uniq(p._claims.map(function (c) { return c.implementationStatus; }));
    var evs = uniq(p._claims.map(function (c) { return c.evidenceLevel; }));
    var firstWork = [];
    arr(p.work).forEach(function (g) { firstWork = firstWork.concat(arr(g.items)); });
    return '<article class="card">' +
      '<div class="card-num">' + esc(p.num || '') + (p.kind === 'foundation' ? ' <span class="kind-tag">공통 기반</span>' : '') + '</div>' +
      '<h3>' + esc(p.title) + '</h3>' +
      '<p class="one-line">' + esc(p.summary) + '</p>' +
      list(firstWork.slice(0, 3)) +
      tagLinks(p.capabilityIds, IDX.capabilities, function (id) { return '#/capability/' + encodeURIComponent(id); }) +
      '<div class="badges">' + statuses.map(statusBadge).join('') + evs.map(evBadge).join('') + '</div>' +
      (p.statusText ? '<p class="hint">' + esc(p.statusText) + '</p>' : '') +
      '<a class="more" href="#/project/' + encodeURIComponent(p.id) + '">상세 보기 →</a>' +
      '</article>';
  }

  function renderMatrixLegend() {
    $('#matrix-legend').innerHTML = Object.keys(MARKS).map(function (k) { return '<li><strong>' + k + '</strong> ' + esc(MARKS[k]) + '</li>'; }).join('');
  }

  function renderMatrix(projects) {
    var body = $('#matrix-body');
    if (!projects.length) { body.innerHTML = emptyBox(); return; }
    if (state.matrixView === 'table') {
      var head = '<tr><th scope="col">프로젝트</th>' + D.areas.map(function (a) { return '<th scope="col">' + esc(a.name) + '</th>'; }).join('') + '</tr>';
      var rows = projects.map(function (p) {
        return '<tr data-row="' + esc(p.id) + '"><th scope="row"><a href="#/project/' + encodeURIComponent(p.id) + '">' + esc(p.title) + '</a></th>' +
          D.areas.map(function (a) {
            var m = (p.areaMarks || {})[a.id] || { mark: '—' };
            var label = p.title + ', ' + a.name + ': ' + (MARKS[m.mark] || m.mark);
            if (!m.note) return '<td class="mark"><span class="mark-none" aria-label="' + esc(label) + '" title="' + esc(MARKS[m.mark] || '') + '">' + esc(m.mark) + '</span></td>';
            return '<td class="mark"><button type="button" class="mark-btn" aria-expanded="false" data-p="' + esc(p.id) + '" data-a="' + esc(a.id) + '" aria-label="' + esc(label + '. 근거 보기') + '">' + esc(m.mark) + '</button></td>';
          }).join('') + '</tr>';
      }).join('');
      body.innerHTML = '<div class="table-wrap"><table class="matrix"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
    } else {
      body.innerHTML = projects.map(function (p) {
        return '<div class="mcard"><h3><a href="#/project/' + encodeURIComponent(p.id) + '">' + esc(p.title) + '</a></h3><dl>' +
          D.areas.map(function (a) {
            var m = (p.areaMarks || {})[a.id] || { mark: '—' };
            return '<dt>' + esc(a.name) + '</dt><dd><strong>' + esc(m.mark) + '</strong> ' + esc(MARKS[m.mark] || '') + (m.note ? '<br>' + esc(m.note) : '') + '</dd>';
          }).join('') + '</dl></div>';
      }).join('');
    }
  }

  function initMatrix() {
    $all('[data-matrix-view]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.matrixView === state.matrixView));
      b.addEventListener('click', function () {
        state.matrixView = b.dataset.matrixView;
        $all('[data-matrix-view]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        renderFiltered();
      });
    });
    $('#matrix-body').addEventListener('click', function (e) {
      var b = e.target.closest('.mark-btn'); if (!b) return;
      var tr = b.closest('tr');
      var next = tr.nextElementSibling;
      var open = b.getAttribute('aria-expanded') === 'true';
      $all('.mark-btn[aria-expanded="true"]', tr).forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
      if (next && next.classList.contains('matrix-note-row')) next.remove();
      if (open) return;
      var p = IDX.projects[b.dataset.p], a = IDX.areas[b.dataset.a];
      var m = p.areaMarks[a.id];
      b.setAttribute('aria-expanded', 'true');
      tr.insertAdjacentHTML('afterend', '<tr class="matrix-note-row"><td colspan="' + (D.areas.length + 1) + '"><strong>' + esc(p.title) + ' · ' + esc(a.name) + ' ' + esc(m.mark) + '</strong> — ' + esc(m.note) + '</td></tr>');
    });
  }

  function stackItem(s) {
    return '<details class="stack-item" id="stack-' + esc(s.id) + '"><summary><span class="stack-name">' + esc(s.name) + '</span>' +
      ((s.capability || arr(s.capabilityIds).length) ? '<span class="hint">→ ' + esc(s.capability || arr(s.capabilityIds).map(function (c) { return nameOf(IDX.capabilities, c); }).join(', ')) + '</span>' : '') +
      '<span class="stack-ctx">' + esc(s.usageContext || '') + '</span></summary><div class="stack-body">' +
      (arr(s.aliases).length ? '<div class="kv"><span>별칭</span><span>' + esc(s.aliases.join(', ')) + '</span></div>' : '') +
      '<div class="kv"><span>프로젝트</span><span>' + (tagLinks(s._projects, IDX.projects, function (id) { return '#/project/' + encodeURIComponent(id); }) || '—') + '</span></div>' +
      '<div class="kv"><span>역량</span><span>' + (tagLinks(s.capabilityIds, IDX.capabilities, function (id) { return '#/capability/' + encodeURIComponent(id); }) || '—') + '</span></div>' +
      '<div class="kv"><span>연결 개념</span><span>' + (tagLinks(s.conceptIds, IDX.concepts, function (id) { return '#/concept/' + encodeURIComponent(id); }) || '—') + '</span></div>' +
      (s.note ? '<div class="kv"><span>주의</span><span>' + esc(s.note) + '</span></div>' : '') +
      '</div></details>';
  }

  function renderArch() {
    $('#arch-legend').innerHTML = Object.keys(KIND).map(function (k) { return '<li><span class="node k-' + k + '">' + esc(KIND[k]) + '</span></li>'; }).join('');
    $('#arch-list').innerHTML = D.architectures.map(function (a) {
      var rel = a.relationshipType === 'conceptual'
        ? '<span class="badge lk-related">개념 비교 · 물리적 연결 아님</span>'
        : '<span class="badge st-implemented">확인된 실제 연결</span>';
      var body = arr(a.lanes).map(function (l) {
        return '<div class="lane">' + (l.label ? '<p class="lane-label">' + esc(l.label) + '</p>' : '') +
          '<ol class="flow">' + arr(l.steps).map(function (s) {
            var k = KIND[s.kind] ? s.kind : 'app';
            return '<li><span class="node k-' + k + '"><small>' + esc(KIND[k]) + '</small>' + esc(s.label) + '</span></li>';
          }).join('') + '</ol></div>';
      }).join('');
      if (arr(a.comparisons).length) {
        body += '<ul class="compare">' + a.comparisons.map(function (c) { return '<li><strong>' + esc(c.pair) + '</strong> — ' + esc(c.concepts) + (c.note ? ' <span class="hint">(' + esc(c.note) + ')</span>' : '') + '</li>'; }).join('') + '</ul>';
      }
      return '<article class="arch" id="arch-' + esc(a.id) + '"><h3>' + esc(a.title) + '</h3><div class="rel">' + rel + '</div>' +
        (a.description ? '<p class="section-lead">' + esc(a.description) + '</p>' : '') + body +
        (arr(a.notes).length ? '<div class="arch-notes">' + list(a.notes) + '</div>' : '') + '</article>';
    }).join('');
  }

  function conceptCard(c) {
    return '<article class="card"><div class="card-num">' + esc(c.category || '') + '</div><h3>' + esc(c.name) + '</h3>' +
      '<p class="one-line">' + esc(c.definitionKo) + '</p>' +
      '<div class="badges">' + uniq(arr(c.projectLinks).map(function (l) { return l.level; })).map(linkBadge).join('') +
      '<span class="badge ev">자기 평가: ' + esc({ unassessed: '미평가', 'in-progress': '일부 평가', assessed: '모두 평가' }[assessState(c.id)]) + '</span></div>' +
      '<a class="more" href="#/concept/' + encodeURIComponent(c.id) + '">상세 보기 →</a></article>';
  }

  function claimRow(c) {
    return '<div class="claim"><span class="claim-project"><a href="#/project/' + encodeURIComponent(c.projectId) + '">' + esc(nameOf(IDX.projects, c.projectId)) + '</a></span>' +
      '<p class="claim-text">' + esc(c.text) + '</p><div class="badges">' + statusBadge(c.implementationStatus) + evBadge(c.evidenceLevel) + '</div>' +
      c._outcomes.map(outcomeBox).join('') +
      evidenceFor(c) + '</div>';
  }

  function outcomeBox(o) {
    var who = { self: '본인 보고', verified: '별도 자료로 확인' }[o.reportedBy] || o.reportedBy || '';
    return '<div class="outcome"><strong>' + esc(o.value) + (o.unit ? ' ' + esc(o.unit) : '') + '</strong>' +
      (who ? ' · ' + esc(who) : '') + (o.period ? ' · 기간: ' + esc(o.period) : ' · 기간: 미기재') +
      (o.measuredAt ? ' · 측정 시점: ' + esc(o.measuredAt) : '') +
      (o.measurementDefinition ? '<br><span class="hint">정의: ' + esc(o.measurementDefinition) + '</span>' : '') +
      (o.caution ? '<br><span class="hint">주의: ' + esc(o.caution) + '</span>' : '') + '</div>';
  }

  function evidenceFor(c) {
    var ev = D.evidence.filter(function (e) { return e.claimId === c.id; });
    if (!ev.length) return '';
    return '<p class="hint">연결할 자료: ' + esc(ev.map(function (e) { return e.description + (e.verifiedAt ? ' (확인 ' + e.verifiedAt + ')' : ''); }).join(' · ')) + '</p>';
  }

  function renderEvidenceLegend() {
    $('#evidence-legend').innerHTML =
      '<div class="badges">' + Object.keys(STATUS).map(function (k) { return statusBadge(k) + ' <span class="hint">' + esc(STATUS_DESC[k]) + '</span>'; }).join(' ') + '</div>' +
      '<div class="badges">' + Object.keys(EVIDENCE).map(function (k) { return evBadge(k); }).join(' ') + '</div>' +
      '<p class="hint">상태는 프로젝트 전체가 아니라 기능·주장 단위에 붙습니다. 대화에서 로그나 테스트를 언급했다고 자료가 연결된 것으로 표시하지 않습니다.</p>';
  }

  function renderGaps() {
    $('#gap-list').innerHTML = D.gaps.map(function (g) {
      return '<div class="gap"><div class="kv"><span>현재 경험</span><span>' + esc(g.current) + '</span></div>' +
        '<div class="kv"><span>다음 확인</span><span>' + esc(g.next) + '</span></div>' +
        '<div class="kv"><span>작은 과제</span><span>' + esc(g.task) + '</span></div>' +
        (arr(g.conceptIds).length ? '<div class="kv"><span>개념</span><span>' + tagLinks(g.conceptIds, IDX.concepts, function (id) { return '#/concept/' + encodeURIComponent(id); }) + '</span></div>' : '') +
        (g.learningTaskId && IDX.learningTasks[g.learningTaskId] ? '<div class="kv"><span>로드맵</span><span><a href="#lt-' + esc(g.learningTaskId) + '">Priority ' + esc(IDX.learningTasks[g.learningTaskId].priority) + '</a></span></div>' : '') +
        '</div>';
    }).join('') || '<p class="hint">기록 없음</p>';
  }

  function renderRoadmap() {
    var tasks = D.learningTasks.slice().sort(function (a, b) { return (a.priority || 99) - (b.priority || 99); });
    $('#roadmap-list').innerHTML = (D.meta.roadmapIntro ? '<p class="section-lead">' + esc(D.meta.roadmapIntro) + '</p>' : '') + tasks.map(function (t) {
      return '<article class="prio" id="lt-' + esc(t.id) + '"><p class="prio-n">PRIORITY ' + esc(t.priority) + '</p><h3>' + esc(t.title) + '</h3>' +
        (t.description ? '<p>' + esc(t.description) + '</p>' : '') +
        (arr(t.topics).length ? '<p><strong>학습:</strong> ' + esc(t.topics.join(', ')) + '</p>' : '') +
        (t.exercise ? '<p><strong>실습:</strong> ' + esc(t.exercise) + '</p>' : '') +
        (t.completionCriteria ? '<p><strong>결과물:</strong> ' + esc(t.completionCriteria) + '</p>' : '') +
        (arr(t.prerequisites).length ? '<p><strong>선행:</strong> ' + esc(t.prerequisites.join(', ')) + '</p>' : '') +
        tagLinks(t.conceptIds, IDX.concepts, function (id) { return '#/concept/' + encodeURIComponent(id); }) +
        '</article>';
    }).join('') + (D.meta.roadmapNote ? '<p class="hint">' + esc(D.meta.roadmapNote) + '</p>' : '');
  }

  function renderFiltered() {
    var projects = D.projects.filter(function (p) { return matches('project', p); });
    var stack = D.stack.filter(function (s) { return matches('stack', s); });
    var concepts = D.concepts.filter(function (c) { return matches('concept', c); });
    var claims = D.claims.filter(function (c) { return matches('claim', c); });

    $('#project-list').innerHTML = projects.length ? projects.map(projectCard).join('') : emptyBox();
    renderMatrix(projects);
    $('#stack-list').innerHTML = stack.length ? stack.map(stackItem).join('') : emptyBox();
    $('#concept-list').innerHTML = concepts.length ? concepts.map(conceptCard).join('') : emptyBox();
    $('#evidence-list').innerHTML = claims.length ? claims.map(claimRow).join('') : emptyBox();

    var total = projects.length + stack.length + concepts.length + claims.length;
    $('#result-count').textContent = anyFilter()
      ? (total ? '검색 결과: 프로젝트 ' + projects.length + ' · 기술 ' + stack.length + ' · 개념 ' + concepts.length + ' · 주장 ' + claims.length
               : '해당 조건의 항목이 없습니다. 검색어나 필터를 바꿔보세요.')
      : '전체: 프로젝트 ' + projects.length + ' · 기술 ' + stack.length + ' · 개념 ' + concepts.length + ' · 주장 ' + claims.length;
  }

  // ── detail views ─────────────────────────────────────────
  function sec(title, html) { return html ? '<section><h2>' + esc(title) + '</h2>' + html + '</section>' : ''; }

  function projectDetail(p) {
    var work = arr(p.work).map(function (g) { return (g.heading ? '<p><strong>' + esc(g.heading) + '</strong></p>' : '') + list(g.items); }).join('');
    var claims = p._claims.map(claimRow).join('');
    var concepts = p._concepts.map(function (c) {
      var l = arr(c.projectLinks).filter(function (x) { return x.projectId === p.id; })[0] || {};
      return '<li><a href="#/concept/' + encodeURIComponent(c.id) + '">' + esc(c.name) + '</a> ' + linkBadge(l.level) + (l.note ? ' <span class="hint">' + esc(l.note) + '</span>' : '') + '</li>';
    }).join('');
    var tasks = D.learningTasks.filter(function (t) { return arr(t.projectIds).indexOf(p.id) >= 0; });
    var assessLinks = p._concepts.map(function (c) { return '<li><a href="#assess:' + encodeURIComponent(c.id) + '">' + esc(c.name) + '</a> — ' + esc({ unassessed: '미평가', 'in-progress': '일부 평가', assessed: '모두 평가' }[assessState(c.id)]) + '</li>'; }).join('');
    return '<article class="detail"><a class="detail-back" href="#projects">← Project Inventory</a>' +
      '<p class="card-num">' + esc(p.num || '') + (p.kind === 'foundation' ? ' · 여러 프로젝트를 연결하는 공통 기반' : '') + '</p>' +
      '<h1>' + esc(p.title) + '</h1><p class="one-line">' + esc(p.summary) + '</p>' +
      (p.statusText ? '<p class="hint mt">' + esc(p.statusText) + '</p>' : '') +
      sec('1. 해결하려던 문제', p.problem ? '<p>' + esc(p.problem) + '</p>' : '<p class="hint">기록 없음</p>') +
      sec('2. 실제 구현·설계 내용', work || '<p class="hint">기록 없음</p>') +
      sec('3. 기술 선택과 판단', list(p.decisions) || '<p class="hint">기록 없음</p>') +
      sec('4. 기술 스택과 역량',
        '<p class="field-label">Stack</p>' + (tagLinks(p.stackIds, IDX.stack, function (id) { return '#stack-' + encodeURIComponent(id); }) || '<p class="hint">기록 없음</p>') +
        '<p class="field-label">Capabilities</p>' + (tagLinks(p.capabilityIds, IDX.capabilities, function (id) { return '#/capability/' + encodeURIComponent(id); }) || '<p class="hint">기록 없음</p>') +
        (concepts ? '<p class="field-label">Concepts</p><ul>' + concepts + '</ul>' : '')) +
      sec('5. 기록된 결과 (주장별 상태·근거)', claims || '<p class="hint">기록 없음</p>') +
      sec('6. 주의할 해석', arr(p.cautions).map(function (c) { return '<p class="caution">' + esc(c) + '</p>'; }).join('') || '<p class="hint">기록 없음</p>') +
      sec('7. 연결 가능한 증빙', list(p.evidenceCandidates) || '<p class="hint">기록 없음</p>') +
      sec('8. 자기 점검과 다음 실습',
        (assessLinks ? '<ul>' + assessLinks + '</ul>' : '') +
        (arr(p.followUps).length ? '<p class="field-label">추가 확인</p>' + list(p.followUps) : '') +
        (tasks.length ? '<p class="field-label">학습 과제</p><ul>' + tasks.map(function (t) { return '<li><a href="#lt-' + esc(t.id) + '">Priority ' + esc(t.priority) + ' — ' + esc(t.title) + '</a></li>'; }).join('') + '</ul>' : '')) +
      '</article>';
  }

  function conceptDetail(c) {
    var links = arr(c.projectLinks).map(function (l) { return '<li><a href="#/project/' + encodeURIComponent(l.projectId) + '">' + esc(nameOf(IDX.projects, l.projectId)) + '</a> ' + linkBadge(l.level) + (l.note ? ' <span class="hint">' + esc(l.note) + '</span>' : '') + '</li>'; }).join('');
    var tasks = D.learningTasks.filter(function (t) { return arr(t.conceptIds).indexOf(c.id) >= 0; });
    return '<article class="detail"><a class="detail-back" href="#concepts">← Technical Concepts</a><p class="card-num">' + esc(c.category || '') + '</p>' +
      '<h1>' + esc(c.name) + '</h1>' + (arr(c.aliases).length ? '<p class="hint">별칭: ' + esc(c.aliases.join(', ')) + '</p>' : '') +
      sec('정의', '<p>' + esc(c.definitionKo) + '</p>') +
      sec('프로젝트 연결', links ? '<ul>' + links + '</ul>' : '<p class="hint">기록 없음</p>') +
      sec('사용한 기술', tagLinks(c._stack, IDX.stack, function (id) { return '#stack-' + encodeURIComponent(id); })) +
      sec('관련 개념', tagLinks(c.relatedIds, IDX.concepts, function (id) { return '#/concept/' + encodeURIComponent(id); }) + (arr(c.relatedTerms).length ? '<p class="hint">' + esc(c.relatedTerms.join(', ')) + '</p>' : '')) +
      sec('자기 점검', list(c.checklist) + '<p><a href="#assess:' + encodeURIComponent(c.id) + '">이 개념 점검하기 →</a> <span class="hint">현재: ' + esc({ unassessed: '미평가', 'in-progress': '일부 평가', assessed: '모두 평가' }[assessState(c.id)]) + '</span></p>') +
      sec('다음 실습', (c.exercise ? '<p>' + esc(c.exercise) + '</p>' : '') + (tasks.length ? '<ul>' + tasks.map(function (t) { return '<li><a href="#lt-' + esc(t.id) + '">Priority ' + esc(t.priority) + ' — ' + esc(t.title) + '</a></li>'; }).join('') + '</ul>' : '')) +
      '</article>';
  }

  function capabilityDetail(c) {
    return '<article class="detail"><a class="detail-back" href="#projects">← Project Inventory</a><p class="card-num">' + esc(nameOf(IDX.areas, c.areaId)) + '</p>' +
      '<h1>' + esc(c.name) + '</h1>' + (c.description ? '<p class="one-line">' + esc(c.description) + '</p>' : '') +
      sec('연결된 프로젝트', tagLinks(c._projects, IDX.projects, function (id) { return '#/project/' + encodeURIComponent(id); }) || '<p class="hint">기록 없음</p>') +
      sec('연결된 기술', tagLinks(c._stack, IDX.stack, function (id) { return '#stack-' + encodeURIComponent(id); }) || '<p class="hint">기록 없음</p>') +
      sec('자기 점검', '<p><a href="#assess:' + encodeURIComponent(c.id) + '">이 역량 점검하기 →</a></p>') +
      '<p class="hint mt">프로젝트와 연결된 역량은 경험의 연결이며, 숙련도 평가가 아닙니다.</p></article>';
  }

  function route() {
    if (!D) return;
    var h = decodeURIComponent(location.hash || '');
    var m = h.match(/^#\/(project|concept|capability)\/(.+)$/);
    var home = $('#view-home'), det = $('#view-detail');
    if (m) {
      var map = { project: IDX.projects, concept: IDX.concepts, capability: IDX.capabilities }[m[1]];
      var o = map[m[2]];
      det.innerHTML = o ? { project: projectDetail, concept: conceptDetail, capability: capabilityDetail }[m[1]](o)
                        : '<div class="detail"><a class="detail-back" href="#overview">← 처음으로</a><p>항목을 찾을 수 없습니다.</p></div>';
      home.hidden = true; det.hidden = false;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      var h1 = $('h1', det); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
      return;
    }
    det.hidden = true; home.hidden = false;
    var a = h.match(/^#assess:(.+)$/);
    if (a) { selectAssessTarget(a[1]); var s = $('#assessment'); s.scrollIntoView(); $('#assess-target').focus({ preventScroll: true }); return; }
    var sm = h.match(/^#stack-(.+)$/);
    if (sm) { var d = document.getElementById('stack-' + sm[1]); if (d) { d.open = true; d.scrollIntoView(); $('summary', d).focus({ preventScroll: true }); } return; }
    if (h.length > 1) { var t = document.getElementById(h.slice(1)); if (t) t.scrollIntoView(); }
  }

  // ── self-assessment ──────────────────────────────────────
  function loadAssess() {
    try {
      var k = '__tcm_test__'; localStorage.setItem(k, '1'); localStorage.removeItem(k);
      var raw = localStorage.getItem(ASSESS_KEY);
      if (raw) { var parsed = JSON.parse(raw); if (parsed && parsed.records) assess = parsed; }
    } catch (e) { storageOk = false; }
    setSaveStatus(storageOk ? (Object.keys(assess.records).length ? '저장된 기록을 불러왔습니다.' : '아직 기록이 없습니다. 입력하면 자동 저장됩니다.') : null);
  }

  function setSaveStatus(msg) {
    var el = $('#save-status');
    if (!storageOk) {
      el.className = 'save-status warn';
      el.textContent = '이 브라우저에서 저장소를 쓸 수 없어 기록이 자동 저장되지 않습니다. 페이지를 닫기 전에 JSON 내보내기로 보관하세요.';
      return;
    }
    el.className = 'save-status';
    el.textContent = msg;
  }

  var saveTimer;
  function saveAssess() {
    clearTimeout(saveTimer);
    setSaveStatus('저장 중…');
    saveTimer = setTimeout(function () {
      if (!storageOk) { setSaveStatus(); return; }
      try {
        localStorage.setItem(ASSESS_KEY, JSON.stringify(assess));
        var d = new Date();
        setSaveStatus('이 브라우저에 저장됨 · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
      } catch (e) { storageOk = false; setSaveStatus(); }
    }, 300);
  }

  function assessTargets() {
    return D.concepts.map(function (c) { return { id: c.id, name: c.name, group: '개념' }; })
      .concat(D.capabilities.map(function (c) { return { id: c.id, name: c.name, group: '역량' }; }));
  }

  function renderAssessTargets() {
    var sel = $('#assess-target');
    var cur = sel.value;
    var t = assessTargets();
    sel.innerHTML = ['개념', '역량'].map(function (g) {
      return '<optgroup label="' + g + '">' + t.filter(function (x) { return x.group === g; }).map(function (x) {
        return '<option value="' + esc(x.id) + '">' + esc(x.name) + ' — ' + esc({ unassessed: '미평가', 'in-progress': '일부 평가', assessed: '모두 평가' }[assessState(x.id)]) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    if (cur && t.some(function (x) { return x.id === cur; })) sel.value = cur;
  }

  function selectAssessTarget(id) {
    var sel = $('#assess-target');
    if (assessTargets().some(function (x) { return x.id === id; })) { sel.value = id; renderAssessForm(); }
  }

  function renderAssessForm() {
    var id = $('#assess-target').value;
    var rec = assess.records[id] || {};
    var axes = D.assessmentAxes || DEFAULT_AXES;
    var html = axes.map(function (ax) {
      return '<fieldset class="axis"><legend>' + esc(ax.name) + '</legend>' + ax.items.map(function (q, i) {
        var cur = (rec.answers && rec.answers[ax.id] && rec.answers[ax.id][i]) || 'unassessed';
        var name = 'a-' + ax.id + '-' + i;
        return '<div class="q" role="radiogroup" aria-label="' + esc(q) + '"><span class="q-text">' + esc(q) + '</span><span class="choices">' + ANSWERS.map(function (a) {
          return '<label><input type="radio" name="' + name + '" value="' + a[0] + '" data-axis="' + esc(ax.id) + '" data-i="' + i + '"' + (cur === a[0] ? ' checked' : '') + '> ' + esc(a[1]) + '</label>';
        }).join('') + '</span></div>';
      }).join('') + '</fieldset>';
    }).join('');
    html += '<div class="assess-fields">' +
      '<label class="field-label" for="f-task">수행한 작은 과제</label><textarea id="f-task" data-field="task">' + esc(rec.task || '') + '</textarea>' +
      '<label class="field-label" for="f-notes">근거 메모</label><textarea id="f-notes" data-field="notes">' + esc(rec.notes || '') + '</textarea>' +
      '<label class="field-label" for="f-date">평가일</label><input type="date" id="f-date" data-field="assessedAt" value="' + esc(rec.assessedAt || '') + '">' +
      '<label class="field-label" for="f-next">다음에 확인할 부분</label><textarea id="f-next" data-field="next">' + esc(rec.next || '') + '</textarea>' +
      '</div>';
    $('#assess-form').innerHTML = html;
  }

  function currentRecord() {
    var id = $('#assess-target').value;
    if (!assess.records[id]) assess.records[id] = { targetId: id, answers: {}, task: '', notes: '', assessedAt: null, next: '' };
    return assess.records[id];
  }

  function renderAssessSummary() {
    var axes = D.assessmentAxes || DEFAULT_AXES;
    var ids = Object.keys(assess.records).filter(function (id) { return assessState(id) !== 'unassessed' || assess.records[id].notes || assess.records[id].task; });
    if (!ids.length) { $('#assess-summary').innerHTML = '<p class="hint">아직 기록이 없습니다.</p>'; return; }
    $('#assess-summary').innerHTML = ids.map(function (id) {
      var r = assess.records[id];
      var name = (IDX.concepts[id] || IDX.capabilities[id] || { name: id + ' (현재 데이터에 없음)' }).name;
      var counts = axes.map(function (ax) {
        var c = {}; ANSWERS.forEach(function (a) { c[a[0]] = 0; });
        ax.items.forEach(function (_, i) { var v = (r.answers[ax.id] && r.answers[ax.id][i]) || 'unassessed'; c[v]++; });
        return ax.name + ': ' + ANSWERS.filter(function (a) { return c[a[0]]; }).map(function (a) { return a[1] + ' ' + c[a[0]]; }).join(', ');
      });
      return '<div class="assess-row"><a href="#assess:' + encodeURIComponent(id) + '"><strong>' + esc(name) + '</strong></a>' +
        '<span class="counts">' + esc(counts.join(' · ')) + '</span>' +
        (r.assessedAt ? '<span class="hint">평가일 ' + esc(r.assessedAt) + '</span>' : '<span class="hint">평가일 미기재</span>') +
        (r.next ? '<span class="hint">다음: ' + esc(r.next) + '</span>' : '') + '</div>';
    }).join('');
  }

  function initAssess() {
    $('#assess-target').addEventListener('change', renderAssessForm);
    $('#assess-form').addEventListener('change', function (e) {
      var t = e.target, r = currentRecord();
      if (t.type === 'radio') {
        r.answers[t.dataset.axis] = r.answers[t.dataset.axis] || {};
        r.answers[t.dataset.axis][t.dataset.i] = t.value;
        if (!r.assessedAt && t.value !== 'unassessed') { r.assessedAt = today(); var dEl = $('#f-date'); if (dEl) dEl.value = r.assessedAt; }
      } else if (t.dataset.field) {
        r[t.dataset.field] = t.value || (t.dataset.field === 'assessedAt' ? null : '');
      }
      r.updatedAt = new Date().toISOString();
      saveAssess(); afterAssessChange();
    });
    $('#assess-form').addEventListener('input', function (e) {
      var t = e.target; if (t.tagName !== 'TEXTAREA') return;
      currentRecord()[t.dataset.field] = t.value; saveAssess();
    });
    $('#assess-export').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify({ kind: 'tcm-self-assessment', exportedAt: new Date().toISOString(), version: 1, records: assess.records }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'competency-self-assessment-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    $('#assess-import').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result);
          if (!d || typeof d.records !== 'object') throw new Error('records가 없습니다.');
          var n = 0;
          Object.keys(d.records).forEach(function (k) { var r = d.records[k]; if (r && typeof r === 'object') { r.answers = r.answers || {}; assess.records[k] = r; n++; } });
          saveAssess(); afterAssessChange(); renderAssessForm();
          setTimeout(function () { setSaveStatus(n + '개 기록을 가져와 저장했습니다.'); }, 350);
        } catch (err) { setSaveStatus('가져오기 실패: ' + err.message); }
        e.target.value = '';
      };
      rd.readAsText(f);
    });
    $('#assess-reset').addEventListener('click', function () { $('#reset-confirm').hidden = false; $('#reset-no').focus(); });
    $('#reset-no').addEventListener('click', function () { $('#reset-confirm').hidden = true; $('#assess-reset').focus(); });
    $('#reset-yes').addEventListener('click', function () {
      assess = { version: 1, records: {} };
      try { localStorage.removeItem(ASSESS_KEY); } catch (e) { /* ignore */ }
      $('#reset-confirm').hidden = true;
      afterAssessChange(); renderAssessForm();
      setSaveStatus('자기 평가 기록을 초기화했습니다.');
    });
  }

  function afterAssessChange() {
    renderAssessTargets(); renderAssessSummary();
    D.concepts.forEach(function (c) { delete c._search; });
    renderFiltered();
  }

  // ── TOC highlight & mobile collapse ─────────────────────
  function initToc() {
    var toc = $('#toc');
    var mq = window.matchMedia('(max-width: 860px)');
    function sync() { toc.open = !mq.matches; }
    sync(); mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync);
    $all('.toc-list a').forEach(function (a) { a.addEventListener('click', function () { if (mq.matches) toc.open = false; }); });
    if ('IntersectionObserver' in window) {
      var links = {}; $all('.toc-list a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && links[en.target.id]) {
            $all('.toc-list a').forEach(function (x) { x.removeAttribute('aria-current'); });
            links[en.target.id].setAttribute('aria-current', 'true');
          }
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      Object.keys(links).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
    }
  }

  function renderAll() {
    setDataStatus();
    renderOverview();
    renderFilters();
    renderMatrixLegend();
    renderArch();
    renderEvidenceLegend();
    renderGaps();
    renderRoadmap();
    renderAssessTargets();
    renderAssessForm();
    renderAssessSummary();
    renderFiltered();
  }

  // ── boot ─────────────────────────────────────────────────
  document.addEventListener('click', function (e) { if (e.target.closest('[data-reset]')) resetFilters(); });
  window.addEventListener('hashchange', route);
  initDataControls(); initFinder(); initMatrix(); initAssess(); initToc(); loadAssess();

  var stored = null;
  try { stored = localStorage.getItem(CONTENT_KEY); } catch (e) { /* ignore */ }
  if (stored) {
    try { $('#remember-content').checked = true; loadContent(JSON.parse(stored), 'stored'); }
    catch (e) { loadSample(); }
  } else {
    loadSample();
  }
})();
