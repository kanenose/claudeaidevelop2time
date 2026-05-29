function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tsMs(ts) {
  if (!ts) return 0;
  return ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function containsBannedWord(text) {
  if (!bannedWords.length) return false;
  const lower = text.toLowerCase();
  return bannedWords.some(w => w && lower.includes(w.toLowerCase()));
}

function showErr(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.className = 'error-msg'; } }
function showOk(id, msg)  { const el = document.getElementById(id); if (el) { el.textContent = msg; el.className = 'success-msg'; } }
function clearErr(id)     { const el = document.getElementById(id); if (el) { el.textContent = ''; el.className = 'error-msg'; } }
