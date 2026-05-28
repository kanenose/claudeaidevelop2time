let profileUid = null;

function showOwnProfile() {
  if (currentUser) showProfile(currentUser.uid, currentUser.nickname);
}

async function showProfile(uid, nickname) {
  profileUid = uid;
  showSection('profile');

  const color  = avatarColor(nickname);
  const avatar = document.getElementById('profile-avatar');
  avatar.style.background = color;
  avatar.textContent = (nickname || '?').charAt(0).toUpperCase();
  document.getElementById('profile-nickname').textContent = nickname;

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data().createdAt) {
      document.getElementById('profile-joined').textContent =
        '가입일 ' + formatDate(userDoc.data().createdAt).split(' ')[0];
    }
  } catch {}

  document.getElementById('profile-edit-area').innerHTML = '';

  document.getElementById('ptab-posts').classList.add('active');
  document.getElementById('ptab-comments').classList.remove('active');
  document.getElementById('profile-posts-area').classList.remove('hidden');
  document.getElementById('profile-comments-area').classList.add('hidden');
  loadProfilePosts(uid);
}

function avatarColor(nickname) {
  const colors = ['#4f46e5','#7c3aed','#db2777','#059669','#d97706','#0284c7'];
  return colors[(nickname ? nickname.charCodeAt(0) : 0) % colors.length];
}

function switchProfileTab(tab) {
  const isPosts = tab === 'posts';
  document.getElementById('profile-posts-area').classList.toggle('hidden', !isPosts);
  document.getElementById('profile-comments-area').classList.toggle('hidden', isPosts);
  document.getElementById('ptab-posts').classList.toggle('active', isPosts);
  document.getElementById('ptab-comments').classList.toggle('active', !isPosts);
  if (!isPosts && profileUid) loadProfileComments(profileUid);
}

async function loadProfilePosts(uid) {
  const area = document.getElementById('profile-posts-area');
  area.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  const isOwnProfile = currentUser && currentUser.uid === uid;

  const snap = await db.collection('posts').where('authorUid', '==', uid).get();
  let posts  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  if (!isOwnProfile) posts = posts.filter(p => !p.isAnonymous);

  if (!posts.length) { area.innerHTML = '<p class="empty-msg">작성한 글이 없습니다.</p>'; return; }
  area.innerHTML = posts.map(p => `
    <div class="post-card" onclick="handlePostClick('${p.id}')">
      <div class="post-card-title">
        ${esc(p.title)}
        ${p.isAnonymous ? '<span class="anon-badge">익명</span>' : ''}
      </div>
      <div class="post-card-meta">
        <span>${formatDate(p.createdAt)}</span>
        <span>👍 ${p.likes||0}</span>
        <span>💬 ${p.commentCount||0}</span>
      </div>
    </div>
  `).join('');
}

async function loadProfileComments(uid) {
  const area = document.getElementById('profile-comments-area');
  area.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  const snap     = await db.collection('comments').where('authorUid', '==', uid).get();
  const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  if (!comments.length) { area.innerHTML = '<p class="empty-msg">작성한 댓글이 없습니다.</p>'; return; }
  area.innerHTML = comments.map(c => `
    <div class="card" style="margin-bottom:8px;padding:16px 20px">
      <div class="comment-content">${esc(c.content)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">${formatDate(c.createdAt)}</div>
    </div>
  `).join('');
}
