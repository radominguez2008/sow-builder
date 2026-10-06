/* RD Scope of Work Builder — no storage, no backend, no dependencies. */
(function () {
  'use strict';

  var C = window.RD_CONTENT;
  var B = C.brand;

  // in-memory state only (storage APIs are unavailable in sandboxed frames)
  var S = {
    step: 0,
    fields: {},
    ticks: {},      // "b0-3" -> true
    custom: {},     // "b0" -> [strings]
    resp: {},       // item index -> option string
    allow: {},      // index -> {on, amt, covers, deadline, needed}
    excl: {},       // index -> true
    gates: {},      // index -> {on, pct, label, categories, edited}
    rules: {}       // index -> true
  };
  var drawCount = C.gates.items.length;
  var lastStrategy = '';

  var STEPS = ['Start', 'Project', 'Buckets', 'Who does what', 'Allowances',
    'Exclusions', 'Milestones & rules', 'Your scope'];

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  var el = function (tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ---------------------------------------------------------------- build */

  $('#the-rule').textContent = B.rule;

  // ---- step 1: fields
  (function () {
    var wrap = $('#fields');
    C.project_fields.forEach(function (f) {
      var d = el('div', 'f' + (f.id === 'address' ? ' wide' : ''));
      var id = 'fld-' + f.id;
      d.appendChild(el('label', null, esc(f.label))).setAttribute('for', id);
      var input;
      if (f.type === 'select') {
        input = document.createElement('select');
        var o0 = document.createElement('option');
        o0.value = ''; o0.textContent = 'Choose one';
        input.appendChild(o0);
        f.options.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o; op.textContent = o;
          input.appendChild(op);
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = f.placeholder || '';
      }
      input.id = id;
      input.setAttribute('data-testid', 'input-' + f.id);
      input.addEventListener('input', function () { S.fields[f.id] = input.value; tally(); });
      input.addEventListener('change', function () {
        S.fields[f.id] = input.value;
        if (f.id === 'exit') { applyStrategy(); }
        tally();
      });
      d.appendChild(input);
      wrap.appendChild(d);
    });
  })();

  // ---- step 2: buckets
  (function () {
    var wrap = $('#buckets');
    C.buckets.forEach(function (bk, bi) {
      var card = el('div', 'bkt' + (bi === 0 ? ' open' : ''));

      var head = el('button', 'bkt-h');
      head.type = 'button';
      head.setAttribute('data-testid', 'button-bucket-' + bi);
      head.innerHTML = '<span class="bkt-n">' + bk.n + '</span>' +
        '<span class="bkt-name">' + esc(bk.name) + '</span>' +
        '<span class="bkt-tally" data-tally="' + bi + '">0 of ' + bk.lines.length + '</span>' +
        '<span class="chev">\u25BC</span>';
      head.addEventListener('click', function () { card.classList.toggle('open'); });
      card.appendChild(head);

      var body = el('div', 'bkt-b');
      body.appendChild(el('div', 'bkt-hint', esc(bk.hint)));

      var tools = el('div', 'bkt-tools');
      var all = el('button', 'tinybtn', 'Check all');
      all.type = 'button';
      all.addEventListener('click', function () { setBucket(bi, true); });
      var none = el('button', 'tinybtn', 'Clear');
      none.type = 'button';
      none.addEventListener('click', function () { setBucket(bi, false); });
      tools.appendChild(all); tools.appendChild(none);
      body.appendChild(tools);

      var list = el('div', null);
      list.setAttribute('data-list', bi);
      bk.lines.forEach(function (line, li) {
        var key = 'b' + bi + '-' + li;
        var lab = el('label', 'tick');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-testid', 'checkbox-' + key);
        cb.addEventListener('change', function () {
          if (cb.checked) { S.ticks[key] = true; } else { delete S.ticks[key]; }
          tally();
        });
        lab.appendChild(cb);
        lab.appendChild(el('span', null, esc(line)));
        list.appendChild(lab);
      });
      body.appendChild(list);

      var own = el('div', 'own');
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = 'Add your own line for this bucket';
      inp.setAttribute('data-testid', 'input-own-' + bi);
      var add = el('button', null, 'Add');
      add.type = 'button';
      add.setAttribute('data-testid', 'button-add-' + bi);
      function doAdd() {
        var v = inp.value.trim();
        if (!v) { return; }
        if (!S.custom[bi]) { S.custom[bi] = []; }
        S.custom[bi].push(v);
        inp.value = '';
        renderCustom(bi);
        tally();
      }
      add.addEventListener('click', doAdd);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
      });
      own.appendChild(inp); own.appendChild(add);

      var customWrap = el('div', null);
      customWrap.setAttribute('data-custom', bi);
      body.appendChild(customWrap);
      body.appendChild(own);

      card.appendChild(body);
      wrap.appendChild(card);
    });
  })();

  function setBucket(bi, on) {
    var list = document.querySelector('[data-list="' + bi + '"]');
    var boxes = list.querySelectorAll('input[type=checkbox]');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = on;
      var key = 'b' + bi + '-' + i;
      if (on) { S.ticks[key] = true; } else { delete S.ticks[key]; }
    }
    tally();
  }

  function renderCustom(bi) {
    var w = document.querySelector('[data-custom="' + bi + '"]');
    w.innerHTML = '';
    (S.custom[bi] || []).forEach(function (t, idx) {
      var row = el('div', 'custom');
      row.appendChild(el('span', 'mark', '\u2713'));
      row.appendChild(el('span', null, esc(t)));
      var x = el('button', null, '\u00D7');
      x.type = 'button';
      x.title = 'Remove';
      x.addEventListener('click', function () {
        S.custom[bi].splice(idx, 1);
        renderCustom(bi);
        tally();
      });
      row.appendChild(x);
      w.appendChild(row);
    });
  }

  // ---- step 3: responsibility
  (function () {
    var R = C.responsibility;
    $('#resp-hint').textContent = R.hint;
    $('#furnish-definition').textContent = R.definition;
    var card = el('div', 'card');
    var t = document.createElement('table');
    t.className = 'rtable';
    var thead = '<tr><th>Item</th>';
    R.options.forEach(function (o) { thead += '<th>' + esc(o) + '</th>'; });
    thead += '</tr>';
    t.innerHTML = '<thead>' + thead + '</thead>';
    var tb = document.createElement('tbody');
    R.items.forEach(function (item, ri) {
      var tr = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.className = 'unset';
      td0.textContent = item;
      tr.appendChild(td0);
      R.options.forEach(function (o) {
        var td = document.createElement('td');
        var rb = document.createElement('input');
        rb.type = 'radio';
        rb.name = 'resp-' + ri;
        rb.setAttribute('data-testid', 'radio-resp-' + ri + '-' + o);
        rb.addEventListener('change', function () {
          S.resp[ri] = o;
          td0.classList.remove('unset');
          tally();
        });
        td.appendChild(rb);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    card.appendChild(t);
    $('#resp').appendChild(card);
  })();

  // ---- step 4: allowances
  (function () {
    var A = C.allowances;
    $('#allow-hint').textContent = A.hint;
    A.terms.forEach(function (term) { $('#allow-terms').appendChild(el('p', null, esc(term))); });
    var card = el('div', 'card');
    A.items.forEach(function (item, ai) {
      var row = el('div', 'arow');
      var lab = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-testid', 'checkbox-allow-' + ai);
      var amt = document.createElement('input');
      amt.type = 'text';
      amt.placeholder = '0';
      amt.disabled = true;
      amt.setAttribute('data-testid', 'input-allow-' + ai);
      amt.setAttribute('aria-label', item + ': total allowance including tax, freight, and labor');
      var detail = el('div', 'allow-details fields');
      var detailInputs = {};
      [
        ['covers', 'Included items / scope', 'text', item],
        ['deadline', 'Selection deadline', 'date', ''],
        ['needed', 'Needed on site by', 'date', '']
      ].forEach(function (spec) {
        var wrap = el('div', 'f' + (spec[0] === 'covers' ? ' wide' : ''));
        var id = 'allow-' + spec[0] + '-' + ai;
        var label = el('label', null, spec[1]);
        label.setAttribute('for', id);
        var field = document.createElement('input');
        field.id = id; field.type = spec[2]; field.placeholder = spec[3];
        field.disabled = true;
        field.setAttribute('data-testid', 'input-allow-' + spec[0] + '-' + ai);
        field.addEventListener('input', function () {
          S.allow[ai][spec[0]] = field.value;
        });
        wrap.appendChild(label); wrap.appendChild(field); detail.appendChild(wrap);
        detailInputs[spec[0]] = field;
      });
      cb.addEventListener('change', function () {
        amt.disabled = !cb.checked;
        if (!S.allow[ai]) { S.allow[ai] = { on: false, amt: '' }; }
        S.allow[ai].on = cb.checked;
        Object.keys(detailInputs).forEach(function (key) {
          detailInputs[key].disabled = !cb.checked;
          if (!cb.checked) { detailInputs[key].value = ''; S.allow[ai][key] = ''; }
        });
        detail.hidden = !cb.checked;
        if (!cb.checked) { amt.value = ''; S.allow[ai].amt = ''; }
        tally();
      });
      amt.addEventListener('input', function () {
        if (!S.allow[ai]) { S.allow[ai] = { on: true, amt: '' }; }
        S.allow[ai].amt = amt.value;
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, esc(item)));
      row.appendChild(lab);
      var money = el('div', 'money');
      money.appendChild(el('span', null, '$'));
      money.appendChild(amt);
      row.appendChild(money);
      detail.hidden = true;
      row.appendChild(detail);
      card.appendChild(row);
    });
    $('#allow').appendChild(card);
  })();

  // ---- step 5: exclusions
  (function () {
    var E = C.exclusions;
    $('#excl-hint').textContent = E.hint;
    var card = el('div', 'card');
    E.lines.forEach(function (line, ei) {
      var lab = el('label', 'tick');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-testid', 'checkbox-excl-' + ei);
      cb.addEventListener('change', function () {
        if (cb.checked) { S.excl[ei] = true; } else { delete S.excl[ei]; }
        tally();
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, esc(line)));
      card.appendChild(lab);
    });
    $('#excl').appendChild(card);
  })();

  // ---- step 6: gates + rules
  (function () {
    var G = C.gates;
    $('#gate-hint').textContent = G.hint;
    renderMilestones();
    $('#add-draw').addEventListener('click', function () {
      var insertAt = drawCount;
      for (var i = drawCount - 1; i >= 0; i--) {
        if (S.gates[i].categories.indexOf(C.buckets.length - 1) >= 0) { insertAt = i; break; }
      }
      for (var j = drawCount; j > insertAt; j--) { S.gates[j] = S.gates[j - 1]; }
      S.gates[insertAt] = {on: false, pct: '', label: '', categories: [], suggested: '', edited: true};
      drawCount++;
      renderMilestones();
      $('#draw-' + insertAt).scrollIntoView({behavior: 'smooth', block: 'center'});
    });

    var RU = C.rules;
    $('#rule-hint').textContent = RU.hint;
    var card2 = el('div', 'card');
    RU.lines.forEach(function (line, ri) {
      var lab = el('label', 'tick');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-testid', 'checkbox-rule-' + ri);
      cb.addEventListener('change', function () {
        if (cb.checked) { S.rules[ri] = true; } else { delete S.rules[ri]; }
        tally();
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, esc(line)));
      card2.appendChild(lab);
    });
    $('#rules').appendChild(card2);
  })();

  function drawDefault(gi) {
    var base = C.gates.items[gi];
    var strategy = S.fields.exit || '';
    var wholesale = strategy === 'Wholesale / assign';
    var g = {
      on: false, pct: '', edited: false,
      label: base && !wholesale ? base.label : '',
      categories: base && !wholesale ? base.categories.slice() : [],
      suggested: base && !wholesale ? base.percent : ''
    };
    if (gi === 6 && !wholesale) {
      var readiness = {
        'Flip / resale': 'Resale-ready closeout',
        'Rental hold': 'Rental-ready closeout',
        'BRRRR — refinance and hold': 'Rental-ready rehab closeout; work documentation delivered for refinance review',
        'Owner occupy': 'Owner move-in closeout'
      };
      if (readiness[strategy]) { g.label = readiness[strategy] + ': ' + base.label; }
    }
    return g;
  }

  function applyStrategy() {
    if (lastStrategy === (S.fields.exit || '')) { return; }
    lastStrategy = S.fields.exit || '';
    Object.keys(S.gates).forEach(function (key) {
      var old = S.gates[key];
      if (!old.edited && !old.on) { S.gates[key] = drawDefault(Number(key)); }
    });
    renderMilestones();
  }

  function categorySummary(g) {
    return g.categories.length ? g.categories.map(function (i) { return C.buckets[i].name; }).join(' + ')
      : 'Choose one or more categories';
  }

  function renderMilestones() {
    var root = $('#gates');
    root.innerHTML = '';
    var strategy = S.fields.exit || '';
    $('#strategy-note').textContent = strategy === 'Wholesale / assign'
      ? 'Wholesale / assign: no construction draws are assumed. Add only work you are actually funding before assignment. Checked or customized draws are kept when strategy changes.'
      : (strategy ? strategy + ': suggested rehab milestones. ' : 'Choose a strategy on the Project page for suggested rehab milestones. ') +
        'Group one or more categories per draw and edit the completion requirement. Checked or customized draws are kept when strategy changes.';
    var card = el('div', 'card');
    for (var gi = 0; gi < drawCount; gi++) { buildDraw(gi); }
    function buildDraw(gi) {
      var g = S.gates[gi] || (S.gates[gi] = drawDefault(gi));
      var shell = el('div', 'draw-item'); shell.id = 'draw-' + gi;
      var row = el('div', 'grow');
      var lab = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = g.on;
      cb.setAttribute('data-testid', 'checkbox-gate-' + gi);
      var pct = document.createElement('input');
      pct.type = 'number'; pct.min = '0'; pct.max = '100'; pct.step = '0.1';
      pct.placeholder = String(g.suggested || '0');
      pct.disabled = !g.on; pct.value = g.pct;
      pct.setAttribute('data-testid', 'input-gate-' + gi);
      pct.setAttribute('aria-label', 'Draw ' + (gi + 1) + ' percentage');
      var fields = document.createElement('fieldset');
      fields.className = 'draw-fields'; fields.disabled = !g.on;
      var details = document.createElement('details');
      details.className = 'category-picker';
      var summary = el('summary', null, esc(categorySummary(g)));
      summary.setAttribute('data-testid', 'dropdown-categories-' + gi);
      details.appendChild(summary);
      var choices = el('div', 'category-options');
      C.buckets.forEach(function (bk, bi) {
        var label = el('label', 'tick');
        var choice = document.createElement('input');
        choice.type = 'checkbox'; choice.checked = g.categories.indexOf(bi) >= 0;
        choice.setAttribute('data-testid', 'checkbox-gate-' + gi + '-category-' + bi);
        choice.addEventListener('change', function () {
          g.edited = true;
          g.categories = g.categories.filter(function (x) { return x !== bi; });
          if (choice.checked) { g.categories.push(bi); g.categories.sort(function (a,b) { return a-b; }); }
          summary.textContent = categorySummary(g);
        });
        label.appendChild(choice); label.appendChild(el('span', null, esc(bk.name)));
        choices.appendChild(label);
      });
      details.appendChild(choices);
      var pickerLabel = el('p', 'field-caption', 'Categories in this draw');
      fields.appendChild(pickerLabel); fields.appendChild(details);
      var requirement = document.createElement('textarea');
      requirement.rows = 2; requirement.value = g.label;
      requirement.id = 'milestone-' + gi;
      requirement.placeholder = 'Describe the completed work that must be inspected and approved';
      requirement.setAttribute('data-testid', 'input-gate-label-' + gi);
      var reqLabel = el('label', 'field-caption', 'Completion requirement');
      reqLabel.setAttribute('for', requirement.id);
      requirement.addEventListener('input', function () { g.label = requirement.value; g.edited = true; });
      fields.appendChild(reqLabel); fields.appendChild(requirement);
      cb.addEventListener('change', function () {
        pct.disabled = !cb.checked;
        fields.disabled = !cb.checked;
        g.on = cb.checked;
        if (cb.checked && !g.pct) { g.pct = String(g.suggested || ''); pct.value = g.pct; }
        if (!cb.checked) { pct.value = ''; g.pct = ''; }
        pctTotal(); tally();
      });
      pct.addEventListener('input', function () {
        g.pct = pct.value; g.edited = true;
        pctTotal();
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', 'gcode', 'D' + (gi + 1)));
      lab.appendChild(el('span', null, 'Draw ' + (gi + 1)));
      row.appendChild(lab);
      var p = el('div', 'pct');
      p.appendChild(pct);
      p.appendChild(el('span', null, '%'));
      row.appendChild(p);
      shell.appendChild(row); shell.appendChild(fields); card.appendChild(shell);
    }
    var tot = el('div', 'pcttotal');
    tot.id = 'pcttotal';
    tot.innerHTML = '<span>Draw percentages assigned</span><b>0%</b>';
    card.appendChild(tot);
    root.appendChild(card);
    pctTotal();
  }

  function pctTotal() {
    var sum = 0;
    Object.keys(S.gates).forEach(function (k) {
      var g = S.gates[k];
      if (g && g.on) { sum += parseFloat(g.pct) || 0; }
    });
    var n = $('#pcttotal');
    var rounded = Math.round(sum * 10) / 10;
    n.querySelector('b').textContent = rounded + '%';
    n.classList.toggle('bad', rounded > 100);
    n.querySelector('span').textContent = rounded > 100
      ? 'Over 100 percent — fix before you send this'
      : 'Draw percentages assigned';
  }

  /* ------------------------------------------------------------- assemble */

  function ul(items) {
    if (!items.length) { return '<p class="empty">Nothing checked in this section.</p>'; }
    return '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }

  function assignedResponsibilities() {
    return C.responsibility.items.map(function (item, ri) {
      return {item: item, who: S.resp[ri]};
    }).filter(function (r) { return r.who && r.who !== 'TBD'; });
  }

  function allowanceLines() {
    var lines = [];
    C.allowances.items.forEach(function (item, ai) {
      var a = S.allow[ai];
      if (!a || !a.on) { return; }
      lines.push(item + (a.amt.trim() ? ' — $' + a.amt.trim() : ' — amount not set') +
        '; includes: ' + ((a.covers || '').trim() || item) +
        '; selection deadline: ' + (a.deadline || 'NOT SET') +
        '; needed on site by: ' + (a.needed || 'NOT SET'));
    });
    return lines;
  }

  function milestoneLines() {
    var lines = [];
    for (var i = 0; i < drawCount; i++) {
      var g = S.gates[i];
      if (!g || !g.on) { continue; }
      lines.push('D' + (i + 1) + ' — ' + (g.categories.length ? categorySummary(g) : 'CATEGORIES NOT SET') +
        ': ' + (g.label.trim() || 'COMPLETION REQUIREMENT NOT SET') +
        (g.pct ? ' (' + g.pct + '%)' : ' (PERCENTAGE NOT SET)'));
    }
    return lines;
  }

  // Screen-only presentation. Print and plain-text output retain their layout.
  function allowanceCards() {
    var h = '';
    C.allowances.items.forEach(function (item, ai) {
      var a = S.allow[ai];
      if (!a || !a.on) { return; }
      h += '<article class="scope-allowance">' +
        '<div class="scope-card-top"><h4>' + esc(item) + '</h4><b class="scope-amount">' +
        esc(a.amt.trim() ? '$' + a.amt.trim() : 'Amount not set') + '</b></div>' +
        '<dl class="scope-facts"><div class="scope-includes"><dt>Includes</dt><dd>' +
        esc((a.covers || '').trim() || item) + '</dd></div>' +
        '<div><dt>Selection deadline</dt><dd>' + esc(a.deadline || 'NOT SET') + '</dd></div>' +
        '<div><dt>Needed on site by</dt><dd>' + esc(a.needed || 'NOT SET') + '</dd></div></dl></article>';
    });
    return h || ul([]);
  }

  function milestoneCards() {
    var h = '';
    for (var i = 0; i < drawCount; i++) {
      var g = S.gates[i];
      if (!g || !g.on) { continue; }
      h += '<article class="scope-milestone"><div class="scope-card-top"><h4>D' + (i + 1) + ' — ' +
        esc(g.categories.length ? categorySummary(g) : 'CATEGORIES NOT SET') +
        '</h4><b class="scope-percent">' + esc(g.pct ? g.pct + '%' : 'PERCENTAGE NOT SET') +
        '</b></div><p>' + esc(g.label.trim() || 'COMPLETION REQUIREMENT NOT SET') + '</p></article>';
    }
    return h || ul([]);
  }

  function buildHTML(isPrint) {
    var h = '';
    var f = S.fields;

    // header facts
    var metas = C.project_fields.filter(function (x) { return (f[x.id] || '').trim(); });
    h += '<h3>Project</h3>';
    if (metas.length) {
      h += '<div class="meta">' + metas.map(function (x) {
        return '<div><b>' + esc(x.label) + '</b>' + esc(f[x.id]) + '</div>';
      }).join('') + '</div>';
    } else {
      h += '<p class="empty">No project details entered.</p>';
    }

    // buckets
    h += '<h3>Scope of work</h3>';
    var any = false;
    C.buckets.forEach(function (bk, bi) {
      var picked = bk.lines.filter(function (_, li) { return S.ticks['b' + bi + '-' + li]; });
      picked = picked.concat(S.custom[bi] || []);
      if (!picked.length) { return; }
      any = true;
      h += (isPrint ? '' : '<section class="scope-category">') +
        '<h4>' + bk.n + '. ' + esc(bk.name) + '</h4>' + ul(picked) +
        (isPrint ? '' : '</section>');
    });
    if (!any) { h += '<p class="empty">No scope lines checked yet.</p>'; }

    // responsibility
    var assigned = assignedResponsibilities();
    if (assigned.length) {
      h += '<h3>Who does what</h3><p' + (isPrint ? '' : ' class="scope-definition"') + '>' + esc(C.responsibility.definition) + '</p>';
      h += '<ul class="respout">' + assigned.map(function (r) {
        return '<li>' + (isPrint ? esc(r.item) : '<span>' + esc(r.item) + '</span>') + '<em>' + esc(r.who) + '</em></li>';
      }).join('') + '</ul>';
    }

    // allowances
    h += '<h3>Allowances</h3>';
    var alFull = allowanceLines();
    h += isPrint ? ul(alFull) : allowanceCards();
    if (alFull.length) {
      if (!isPrint) { h += '<div class="scope-terms">'; }
      h += C.allowances.terms.map(function (term) { return '<p>' + esc(term) + '</p>'; }).join('');
      if (!isPrint) { h += '</div>'; }
    }

    // exclusions
    h += '<h3>Exclusions</h3>';
    h += ul(C.exclusions.lines.filter(function (_, ei) { return S.excl[ei]; }));

    // gates
    h += '<h3>Milestones</h3>';
    var gl = milestoneLines();
    h += isPrint ? ul(gl) : milestoneCards();

    // rules
    h += '<h3>Rules</h3>';
    h += ul(C.rules.lines.filter(function (_, ri) { return S.rules[ri]; }));

    h += '<div class="docfoot"><span class="tag">\u201C' + esc(B.tagline) + '\u201D</span>' +
      esc(B.owner) + ' \u00B7 ' + esc(B.company) + ' \u00B7 ' + esc(B.license) + '</div>';

    h += '<div class="doccta">' +
      '<img src="qr-rd.png" alt="Scan for therdcompany.com">' +
      '<div class="doccta-t">' +
        '<b>Built with the end in mind.</b>' +
        '<span>Scope coaching for investors who are done guessing.</span>' +
        '<span>therdcompany.com \u00B7 @dominguezrobert</span>' +
      '</div></div>';
    return h;
  }

  function buildText() {
    var L = [];
    var f = S.fields;
    L.push('SCOPE OF WORK');
    L.push('=============');
    L.push('');
    C.project_fields.forEach(function (x) {
      if ((f[x.id] || '').trim()) { L.push(x.label + ': ' + f[x.id]); }
    });
    L.push('');
    L.push('SCOPE OF WORK');
    L.push('-------------');
    C.buckets.forEach(function (bk, bi) {
      var picked = bk.lines.filter(function (_, li) { return S.ticks['b' + bi + '-' + li]; });
      picked = picked.concat(S.custom[bi] || []);
      if (!picked.length) { return; }
      L.push('');
      L.push(bk.n + '. ' + bk.name.toUpperCase());
      picked.forEach(function (p) { L.push('  - ' + p); });
    });
    var assigned = assignedResponsibilities();
    if (assigned.length) {
      L.push(''); L.push('WHO DOES WHAT'); L.push('-------------');
      L.push(C.responsibility.definition);
      assigned.forEach(function (r) { L.push('  ' + r.who + ' :: ' + r.item); });
    }
    var alFull = allowanceLines();
    if (alFull.length) {
      L.push('');
      L.push('ALLOWANCES');
      L.push('----------');
      alFull.forEach(function (a) { L.push('  - ' + a); });
      C.allowances.terms.forEach(function (term) { L.push(term); });
    }
    var ex = C.exclusions.lines.filter(function (_, ei) { return S.excl[ei]; });
    if (ex.length) {
      L.push(''); L.push('EXCLUSIONS'); L.push('----------');
      ex.forEach(function (e) { L.push('  - ' + e); });
    }
    var gl = milestoneLines();
    if (gl.length) {
      L.push(''); L.push('MILESTONES'); L.push('----------');
      gl.forEach(function (g) { L.push('  - ' + g); });
    }
    var ru = C.rules.lines.filter(function (_, ri) { return S.rules[ri]; });
    if (ru.length) {
      L.push(''); L.push('RULES'); L.push('-----');
      ru.forEach(function (r) { L.push('  - ' + r); });
    }
    L.push('');
    L.push('"' + B.tagline + '"');
    L.push(B.owner + ' | ' + B.company + ' | ' + B.license);
    L.push('');
    L.push('Built with the end in mind.');
    L.push('Scope coaching for investors who are done guessing.');
    L.push('therdcompany.com | @dominguezrobert');
    return L.join('\n');
  }

  function refreshOutput() {
    var html = buildHTML();
    $('#output').innerHTML = html;
    $('#printdoc').innerHTML =
      '<div class="p-head"><img src="rd-logo-white.png" alt="The RD Company"></div>' +
      '<div class="p-rule"></div>' +
      '<h1>Scope of Work</h1>' +
      '<p class="p-sub">' + esc((S.fields.address || '').trim() || 'Property address not entered') + '</p>' +
      '<p class="p-rulel">' + esc(B.rule) + '</p>' +
      buildHTML(true);
  }

  /* ------------------------------------------------------------ nav/tally */

  function tickCount() {
    var n = Object.keys(S.ticks).length;
    Object.keys(S.custom).forEach(function (k) { n += S.custom[k].length; });
    return n;
  }

  function tally() {
    C.buckets.forEach(function (bk, bi) {
      var c = 0;
      bk.lines.forEach(function (_, li) { if (S.ticks['b' + bi + '-' + li]) { c++; } });
      c += (S.custom[bi] || []).length;
      var t = document.querySelector('[data-tally="' + bi + '"]');
      t.textContent = c + ' of ' + bk.lines.length;
      t.classList.toggle('has', c > 0);
    });
    var unassigned = C.responsibility.items.length - assignedResponsibilities().length;
    var total = tickCount() + Object.keys(S.excl).length + Object.keys(S.rules).length;
    var msg = '<b>' + total + '</b> lines in your scope';
    if (unassigned > 0) {
      msg += ' \u00B7 <b>' + unassigned + '</b> responsibility row' +
        (unassigned === 1 ? '' : 's') + ' unassigned';
    }
    $('#count').innerHTML = msg;
    if (S.step === STEPS.length - 1) { refreshOutput(); }
  }

  function go(n) {
    S.step = Math.max(0, Math.min(STEPS.length - 1, n));
    var secs = document.querySelectorAll('.step');
    for (var i = 0; i < secs.length; i++) {
      secs[i].classList.toggle('on', Number(secs[i].getAttribute('data-step')) === S.step);
    }
    var btns = document.querySelectorAll('.stepbtn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].setAttribute('aria-current', j === S.step ? 'true' : 'false');
      btns[j].classList.toggle('done', j < S.step);
    }
    $('#barfill').style.width = ((S.step / (STEPS.length - 1)) * 100) + '%';
    $('#btn-back').disabled = S.step === 0;
    $('#btn-back').style.visibility = S.step === 0 ? 'hidden' : 'visible';
    $('#btn-next').textContent = S.step === STEPS.length - 2 ? 'Build my scope'
      : (S.step === STEPS.length - 1 ? 'Done' : 'Next');
    $('#btn-next').style.visibility = S.step === STEPS.length - 1 ? 'hidden' : 'visible';
    if (S.step === STEPS.length - 1) { refreshOutput(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  (function () {
    var rail = $('#steprail');
    STEPS.forEach(function (name, i) {
      var b = el('button', 'stepbtn');
      b.type = 'button';
      b.setAttribute('data-testid', 'button-step-' + i);
      b.innerHTML = '<span class="dot"><span>' + (i + 1) + '</span></span>' + esc(name);
      b.addEventListener('click', function () { go(i); });
      rail.appendChild(b);
    });
  })();

  $('#btn-next').addEventListener('click', function () { go(S.step + 1); });
  $('#btn-back').addEventListener('click', function () { go(S.step - 1); });
  $('#btn-print').addEventListener('click', function () { refreshOutput(); window.print(); });

  $('#btn-copy').addEventListener('click', function () {
    var txt = buildText();
    var done = function () {
      var c = $('#copied');
      c.hidden = false;
      setTimeout(function () { c.hidden = true; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
    } else {
      fallbackCopy(txt, done);
    }
  });

  function fallbackCopy(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }

  $('#btn-dl').addEventListener('click', function () {
    var blob = new Blob([buildText()], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var addr = (S.fields.address || 'scope-of-work').trim()
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    a.download = 'RD-Scope-of-Work-' + (addr || 'draft') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  $('#btn-reset').addEventListener('click', function () {
    if (!window.confirm('Clear every check and start over?')) { return; }
    S.fields = {}; S.ticks = {}; S.custom = {}; S.resp = {};
    S.allow = {}; S.excl = {}; S.gates = {}; S.rules = {};
    drawCount = C.gates.items.length; lastStrategy = '';
    var inputs = document.querySelectorAll('#main input, #main select');
    for (var i = 0; i < inputs.length; i++) {
      var n = inputs[i];
      if (n.type === 'checkbox' || n.type === 'radio') { n.checked = false; }
      else { n.value = ''; if (n.hasAttribute('data-testid') &&
        /input-(allow|gate)-/.test(n.getAttribute('data-testid'))) { n.disabled = true; } }
    }
    var tds = document.querySelectorAll('.rtable td:first-child');
    for (var k = 0; k < tds.length; k++) { tds[k].classList.add('unset'); }
    C.buckets.forEach(function (_, bi) { renderCustom(bi); });
    document.querySelectorAll('.allow-details').forEach(function (d) { d.hidden = true; });
    renderMilestones();
    pctTotal();
    tally();
    go(0);
  });

  tally();
  go(0);
})();
