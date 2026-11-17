// Signal Sweep board: sorting, filtering, scope toggle and detail view.
// Data arrives as window.RADAR_DATA from ../data.js, written by main.ts from
// the same rows as board.json, so the page never fetches anything.
(function () {
  var D = window.RADAR_DATA;
  if (!D) return;
  var state = { q: '', cat: '', chain: '', watchOnly: false, sort: 'rank', dir: 1, slug: null };

  function $(id) { return document.getElementById(id); }
  function uniq(list) { return Array.from(new Set(list)).sort(); }

  function readRoute() {
    var h = window.location.hash || '';
    var m = h.match(/^#\/protocol\/(.+)$/);
    if (m) state.slug = decodeURIComponent(m[1]);
    var params = new URLSearchParams(window.location.search);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('cat')) state.cat = params.get('cat');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('scope') === 'watchlist') state.watchOnly = true;
  }

  function fillSelect(id, values, current) {
    var sel = $(id);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (v === current) o.selected = true;
      sel.appendChild(o);
    });
  }

  function visible() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.cat && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function sorted(list) {
    var k = state.sort;
    return list.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av === null || av === undefined) av = -Infinity;
      if (bv === null || bv === undefined) bv = -Infinity;
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  function renderStats() {
    var items = [
      [D.board_count, 'pre-token rows ranked'],
      [D.watchlist_count + ' / ' + D.watchlist_count, 'watchlist covered'],
      [D.early_count, 'early rows below $50M'],
      [D.live_count, 'live-token set aside'],
      [D.protocol_count, 'protocols in snapshot'],
    ];
    $('stats').innerHTML = items.map(function (it) {
      return '<div class="stat"><b>' + esc(it[0]) + '</b><span>' + esc(it[1]) + '</span></div>';
    }).join('');
    $('asOf').textContent = D.as_of;
    $('formula').textContent = D.formula;
  }

  function renderBoard() {
    var list = sorted(visible());
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    $('rows').innerHTML = list.map(function (r) {
      var cls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var pct = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.slug === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="sub">' +
          esc(r.category || 'Uncategorised') + ' &middot; ' + esc(r.chains.slice(0, 3).join(', ') || 'no chain listed') + '</span></td>' +
        '<td>' + fmtMoney(r.tvl_usd) + '</td>' +
        '<td class="' + cls + '">' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') + '</td>' +
        '<td>' + fmtYears(r.years_live) + '</td>' +
        '<td><b>' + fmtMoney(r.implied_value_usd) + '</b><div class="bar"><i style="width:' + pct + '%"></i></div></td>' +
        '<td><span class="pill' + (r.watchlist ? '' : ' early') + '">' + (r.watchlist ? 'watchlist' : 'early') + '</span></td></tr>';
    }).join('');
    $('empty').hidden = list.length > 0;
    $('count').textContent = list.length + ' of ' + D.rows.length + ' rows';
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function openDetail(slug) {
    state.slug = slug;
    var r = D.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    if (window.location.hash !== '#/protocol/' + slug) {
      window.history.replaceState(null, '', '#/protocol/' + encodeURIComponent(slug));
    }
    var m = r.model;
    var cells = [
      [fmtMoney(r.implied_value_usd), 'implied value (rank ' + r.rank + ')'],
      [fmtMoney(r.tvl_usd), 'TVL'],
      [fmtChange(r.change_7d), 'momentum input'],
      [fmtYears(r.years_live), 'no token on record'],
      [m.category_multiple.toFixed(2) + 'x category', esc(r.category || 'Uncategorised')],
      [m.growth_factor.toFixed(3) + 'x growth', 'clamped 7d change'],
      [m.longevity_factor.toFixed(3) + 'x longevity', 'years live, capped at 4'],
      [m.breadth_factor.toFixed(3) + 'x breadth', 'live on ' + r.chains.length + ' chain(s)'],
    ];
    $('detail').innerHTML =
      '<button class="close" id="closeDetail" type="button">Close</button>' +
      '<p class="sub">Rank ' + r.rank + ' of ' + D.board_count + (r.watchlist ? ' &middot; watchlist' : ' &middot; early find below the floor') + '</p>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' &middot; listed ' + esc(r.listed_at || 'date unlisted') + ' &middot; records no token (no gecko id, no symbol)</p>' +
      '<div class="grid">' + cells.map(function (c) {
        return '<div class="cell"><b>' + c[0] + '</b><span>' + c[1] + '</span></div>';
      }).join('') + '</div>' +
      '<h3>Farm plan for ' + esc(r.name) + '</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    $('detail').hidden = false;
    $('closeDetail').addEventListener('click', function () {
      $('detail').hidden = true; state.slug = null;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      renderBoard();
    });
    renderBoard();
    $('detail').scrollIntoView({ block: 'start' });
  }

  function bind() {
    $('q').value = state.q;
    $('q').addEventListener('input', function () { state.q = $('q').value; renderBoard(); });
    fillSelect('cat', uniq(D.rows.map(function (r) { return r.category || 'Uncategorised'; })), state.cat);
    fillSelect('chain', uniq(D.rows.reduce(function (a, r) { return a.concat(r.chains); }, [])), state.chain);
    $('cat').addEventListener('change', function () { state.cat = $('cat').value; renderBoard(); });
    $('chain').addEventListener('change', function () { state.chain = $('chain').value; renderBoard(); });
    function scope(watch) {
      state.watchOnly = watch;
      $('scopeAll').className = watch ? '' : 'on';
      $('scopeWatch').className = watch ? 'on' : '';
      renderBoard();
    }
    $('scopeAll').addEventListener('click', function () { scope(false); });
    $('scopeWatch').addEventListener('click', function () { scope(true); });
    if (state.watchOnly) scope(true);
    Array.prototype.forEach.call(document.querySelectorAll('th[data-sort]'), function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === 'name' ? 1 : -1; if (k === 'rank') state.dir = 1; }
        renderBoard();
      });
    });
  }

  readRoute();
  renderStats();
  bind();
  renderBoard();
  if (state.slug) openDetail(state.slug);
})();
