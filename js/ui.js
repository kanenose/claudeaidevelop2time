function showSection(name) {
  ['auth', 'write', 'list', 'detail', 'profile', 'settings'].forEach(s => {
    document.getElementById(`section-${s}`).classList.toggle('hidden', s !== name);
  });
  if (name === 'settings') {
    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) toggle.checked = localStorage.getItem('darkMode') === '1';
    if (typeof renderSettingsForm === 'function') renderSettingsForm();
  }
}

function goToList() {
  if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
  currentPostId = null;
  showSection('list');
}

function switchTab(tab) {
  document.getElementById('form-login').classList.toggle('hidden',  tab !== 'login');
  document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tab-login').classList.toggle('active',   tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active',  tab === 'signup');
  clearErr('login-err');
  clearErr('signup-err');
}

function updateAuthUI() {
  const ok = !!currentUser;
  document.getElementById('user-nickname').textContent = ok ? `${currentUser.nickname}님` : '';
  document.getElementById('btn-write').classList.toggle('hidden',    !ok);
  document.getElementById('btn-settings').classList.toggle('hidden', !ok);
  document.getElementById('btn-login').classList.toggle('hidden',     ok);
  document.getElementById('btn-logout').classList.toggle('hidden',   !ok);
  if (currentPostId) updateCommentWriteArea();
}
