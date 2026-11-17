// Small formatting helpers shared by the board and the detail view.
function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}
function fmtChange(n) {
  if (n === null || n === undefined) return 'not reported';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '% in 7d';
}
function fmtYears(y) {
  if (y === null || y === undefined) return 'age unlisted';
  if (y < 1) return Math.round(y * 12) + ' months live';
  return y.toFixed(1) + ' years live';
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
