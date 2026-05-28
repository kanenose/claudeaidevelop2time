// ============================================================
//  Firebase 설정
//  Firebase 콘솔 → 프로젝트 설정 → 앱 추가(웹) → 아래 값을
//  본인의 설정값으로 교체하세요.
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyBbyTa-ZIgp1qzS3zfrkEROm43W1QnhaEo",
  authDomain:        "claudewebsite-ff776.firebaseapp.com",
  projectId:         "claudewebsite-ff776",
  storageBucket:     "claudewebsite-ff776.firebasestorage.app",
  messagingSenderId: "271989560910",
  appId:             "1:271989560910:web:bd683463843b03262e551f"
};

firebase.initializeApp(firebaseConfig);
const auth       = firebase.auth();
const db         = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

// ============================================================
//  전역 상태
// ============================================================
let currentUser        = null;
let currentSort        = 'latest';
let currentPostId      = null;
let allPosts           = [];
let unsubscribePosts   = null;
let unsubscribeComments = null;

// ============================================================
//  유틸리티
// ============================================================
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

// XSS 방지
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showErr(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.className = 'error-msg'; } }
function showOk(id, msg)  { const el = document.getElementById(id); if (el) { el.textContent = msg; el.className = 'success-msg'; } }
function clearErr(id)     { const el = document.getElementById(id); if (el) { el.textContent = ''; el.className = 'error-msg'; } }

// ============================================================
//  섹션 전환
// ============================================================
function showSection(name) {
  ['auth', 'write', 'list', 'detail', 'profile', 'settings'].forEach(s => {
    document.getElementById(`section-${s}`).classList.toggle('hidden', s !== name);
  });
  if (name === 'settings') {
    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) toggle.checked = localStorage.getItem('darkMode') === '1';
  }
}

function goToList() {
  if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
  currentPostId = null;
  showSection('list');
}

// ============================================================
//  인증 탭 전환
// ============================================================
function switchTab(tab) {
  document.getElementById('form-login').classList.toggle('hidden',  tab !== 'login');
  document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tab-login').classList.toggle('active',   tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active',  tab === 'signup');
  clearErr('login-err');
  clearErr('signup-err');
}

// ============================================================
//  인증 상태 감시
// ============================================================
auth.onAuthStateChanged(async user => {
  if (user) {
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      const nickname = doc.exists ? doc.data().nickname : user.email;
      currentUser = { uid: user.uid, email: user.email, nickname };
    } catch {
      currentUser = { uid: user.uid, email: user.email, nickname: user.email };
    }
  } else {
    currentUser = null;
  }
  updateAuthUI();
  if (currentPostId) await showPostDetail(currentPostId);
});

function updateAuthUI() {
  const ok = !!currentUser;
  document.getElementById('user-nickname').textContent = ok ? `${currentUser.nickname}님` : '';
  document.getElementById('btn-write').classList.toggle('hidden',    !ok);
  document.getElementById('btn-settings').classList.toggle('hidden', !ok);
  document.getElementById('btn-login').classList.toggle('hidden',     ok);
  document.getElementById('btn-logout').classList.toggle('hidden',   !ok);
  if (currentPostId) updateCommentWriteArea();
}

// ============================================================
//  회원가입
// ============================================================
async function doSignup() {
  const email    = document.getElementById('signup-email').value.trim();
  const pw       = document.getElementById('signup-password').value;
  const nickname = document.getElementById('signup-nickname').value.trim();
  clearErr('signup-err');

  if (!email || !pw || !nickname) return showErr('signup-err', '모든 항목을 입력해주세요.');
  if (nickname.length < 2)        return showErr('signup-err', '닉네임은 2자 이상이어야 합니다.');

  try {
    const { user } = await auth.createUserWithEmailAndPassword(email, pw);
    await db.collection('users').doc(user.uid).set({
      uid: user.uid, email, nickname,
      createdAt: FieldValue.serverTimestamp()
    });
    ['signup-email', 'signup-password', 'signup-nickname']
      .forEach(id => { document.getElementById(id).value = ''; });
    showSection('list');
  } catch (e) {
    const msgs = {
      'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
      'auth/weak-password':        '비밀번호는 6자 이상이어야 합니다.',
      'auth/invalid-email':        '올바른 이메일 형식이 아닙니다.',
    };
    showErr('signup-err', msgs[e.code] || e.message);
  }
}

// ============================================================
//  로그인
// ============================================================
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-password').value;
  clearErr('login-err');

  if (!email || !pw) return showErr('login-err', '이메일과 비밀번호를 입력해주세요.');

  try {
    await auth.signInWithEmailAndPassword(email, pw);
    ['login-email', 'login-password'].forEach(id => { document.getElementById(id).value = ''; });
    showSection('list');
  } catch (e) {
    const msgs = {
      'auth/user-not-found':      '존재하지 않는 계정입니다.',
      'auth/wrong-password':      '비밀번호가 틀렸습니다.',
      'auth/invalid-credential':  '이메일 또는 비밀번호가 올바르지 않습니다.',
      'auth/too-many-requests':   '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    };
    showErr('login-err', msgs[e.code] || e.message);
  }
}

// ============================================================
//  로그아웃
// ============================================================
async function doLogout() {
  await auth.signOut();
  showSection('list');
}

// ============================================================
//  게시글 목록 (실시간)
// ============================================================
function loadPosts() {
  if (unsubscribePosts) unsubscribePosts();
  unsubscribePosts = db.collection('posts').onSnapshot(snap => {
    allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPosts();
  });
}

function sortedPosts() {
  const arr = [...allPosts];
  switch (currentSort) {
    case 'popular':
      return arr.sort((a, b) =>
        ((b.score||0) - (a.score||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
    case 'hot':
      return arr.sort((a, b) =>
        ((b.reactionCount||0) - (a.reactionCount||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
    case 'likes':
      return arr.sort((a, b) =>
        ((b.likes||0) - (a.likes||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
    case 'comments':
      return arr.sort((a, b) =>
        ((b.commentCount||0) - (a.commentCount||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
    default: // latest
      return arr.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  }
}

function renderPosts() {
  const container = document.getElementById('posts-container');
  const list = sortedPosts();
  if (!list.length) {
    container.innerHTML = '<p class="empty-msg">아직 게시글이 없습니다. 첫 글을 작성해보세요!</p>';
    return;
  }
  container.innerHTML = list.map(p => `
    <div class="post-card" onclick="showPostDetail('${p.id}')">
      <div class="post-card-title">${esc(p.title)}</div>
      <div class="post-card-meta">
        <span class="author-link" onclick="event.stopPropagation();showProfile('${p.authorUid}','${esc(p.authorNickname)}')">${esc(p.authorNickname)}</span>
        <span>${formatDate(p.createdAt)}</span>
        <span>👍 ${p.likes||0}</span>
        <span>👎 ${p.dislikes||0}</span>
        <span>점수 ${p.score||0}</span>
        <span>반응 ${p.reactionCount||0}</span>
        <span>💬 ${p.commentCount||0}</span>
      </div>
    </div>
  `).join('');
}

function changeSort(btn) {
  currentSort = btn.dataset.sort;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPosts();
}

// ============================================================
//  글쓰기
// ============================================================
async function doCreatePost() {
  if (!currentUser) return alert('로그인이 필요합니다.');
  const title   = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  clearErr('write-err');

  if (!title)   return showErr('write-err', '제목을 입력해주세요.');
  if (!content) return showErr('write-err', '내용을 입력해주세요.');

  try {
    await db.collection('posts').add({
      title, content,
      authorUid:      currentUser.uid,
      authorNickname: currentUser.nickname,
      likes: 0, dislikes: 0, score: 0, reactionCount: 0, commentCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    document.getElementById('post-title').value   = '';
    document.getElementById('post-content').value = '';
    goToList();
  } catch (e) {
    showErr('write-err', '작성 중 오류가 발생했습니다: ' + e.message);
  }
}

// ============================================================
//  게시글 상세
// ============================================================
async function showPostDetail(postId) {
  currentPostId = postId;
  showSection('detail');

  const docSnap = await db.collection('posts').doc(postId).get();
  if (!docSnap.exists) {
    document.getElementById('post-detail-content').innerHTML = '<p class="empty-msg">삭제된 게시글입니다.</p>';
    return;
  }
  const post = { id: docSnap.id, ...docSnap.data() };

  let userVote = null;
  if (currentUser) {
    const vd = await db.collection('votes').doc(`${postId}_${currentUser.uid}`).get();
    if (vd.exists) userVote = vd.data().voteType;
  }

  renderPostDetail(post, userVote);
  loadComments(postId);
}

function renderPostDetail(post, userVote) {
  const isAuthor  = currentUser && currentUser.uid === post.authorUid;
  const likedCls  = userVote === 1  ? 'liked'    : '';
  const dislikeCls = userVote === -1 ? 'disliked' : '';

  document.getElementById('post-detail-content').innerHTML = `
    <div class="detail-title">${esc(post.title)}</div>
    <div class="detail-meta">
      <span class="author-link" onclick="showProfile('${post.authorUid}','${esc(post.authorNickname)}')">${esc(post.authorNickname)}</span>
      <span>${formatDate(post.createdAt)}</span>
      <span>점수 ${post.score||0} &nbsp;|&nbsp; 반응 ${post.reactionCount||0} &nbsp;|&nbsp; 💬 ${post.commentCount||0}</span>
    </div>
    <div class="detail-content">${esc(post.content)}</div>
    <div class="vote-area">
      <button class="vote-btn ${likedCls}"   onclick="doVote('${post.id}', 1)">👍 추천 ${post.likes||0}</button>
      <button class="vote-btn ${dislikeCls}" onclick="doVote('${post.id}', -1)">👎 비추천 ${post.dislikes||0}</button>
      ${isAuthor ? `<button class="btn btn-danger" style="margin-left:auto" onclick="doDeletePost('${post.id}')">삭제</button>` : ''}
    </div>
  `;
}

// ============================================================
//  게시글 삭제
// ============================================================
async function doDeletePost(postId) {
  if (!confirm('게시글을 삭제할까요? 댓글도 모두 삭제됩니다.')) return;
  try {
    const [cs, vs] = await Promise.all([
      db.collection('comments').where('postId', '==', postId).get(),
      db.collection('votes').where('postId', '==', postId).get()
    ]);
    const batch = db.batch();
    cs.docs.forEach(d => batch.delete(d.ref));
    vs.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('posts').doc(postId));
    await batch.commit();
    goToList();
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
  }
}

// ============================================================
//  추천 / 비추천 (Firestore 트랜잭션)
// ============================================================
async function doVote(postId, voteType) {
  if (!currentUser) return alert('로그인이 필요합니다.');

  const voteRef = db.collection('votes').doc(`${postId}_${currentUser.uid}`);
  const postRef = db.collection('posts').doc(postId);

  try {
    await db.runTransaction(async tx => {
      const [vd, pd] = await Promise.all([tx.get(voteRef), tx.get(postRef)]);
      if (!pd.exists) throw new Error('게시글이 없습니다.');

      let { likes = 0, dislikes = 0 } = pd.data();

      if (vd.exists) {
        const prev = vd.data().voteType;
        if (prev === voteType) {
          // 같은 버튼 재클릭 → 취소
          if (voteType === 1) likes--; else dislikes--;
          tx.delete(voteRef);
        } else {
          // 반대 버튼 클릭 → 전환
          if (voteType === 1) { likes++; dislikes--; }
          else                { likes--; dislikes++; }
          tx.set(voteRef, {
            postId, userUid: currentUser.uid, voteType,
            createdAt: FieldValue.serverTimestamp()
          });
        }
      } else {
        // 새 투표
        if (voteType === 1) likes++; else dislikes++;
        tx.set(voteRef, {
          postId, userUid: currentUser.uid, voteType,
          createdAt: FieldValue.serverTimestamp()
        });
      }

      tx.update(postRef, {
        likes, dislikes,
        score:         likes - dislikes,
        reactionCount: likes + dislikes,
        updatedAt:     FieldValue.serverTimestamp()
      });
    });

    await showPostDetail(postId);
  } catch (e) {
    alert('오류: ' + e.message);
  }
}

// ============================================================
//  댓글 - 작성 영역 렌더
// ============================================================
function updateCommentWriteArea() {
  const area = document.getElementById('comment-write-area');
  if (!area) return;
  if (currentUser) {
    area.innerHTML = `
      <div class="comment-input-area">
        <textarea class="input" id="comment-input"
          placeholder="댓글을 입력하세요" style="min-height:80px;resize:vertical"></textarea>
        <button class="btn btn-primary" onclick="doAddComment()">댓글 작성</button>
        <p class="error-msg" id="comment-err"></p>
      </div>
    `;
  } else {
    area.innerHTML = `<p class="login-prompt">로그인 후 댓글을 작성할 수 있습니다.</p>`;
  }
}

// ============================================================
//  댓글 - 실시간 로드
// ============================================================
function loadComments(postId) {
  if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
  updateCommentWriteArea();

  unsubscribeComments = db.collection('comments')
    .where('postId', '==', postId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(
      snap => {
        const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        document.getElementById('comments-title').textContent = `댓글 ${comments.length}개`;
        renderComments(comments);
      },
      err => {
        console.error('댓글 로드 오류:', err);
        // Firestore 복합 인덱스가 없을 때 안내
        if (err.code === 'failed-precondition') {
          document.getElementById('comments-container').innerHTML =
            '<p class="error-msg">Firestore 복합 인덱스가 필요합니다.<br>' +
            '브라우저 콘솔(F12 → Console)에서 Firebase가 제공하는 링크를 클릭해 인덱스를 생성하세요.</p>';
        }
      }
    );
}

// ============================================================
//  댓글 - 렌더
// ============================================================
function renderComments(comments) {
  const c = document.getElementById('comments-container');
  if (!comments.length) {
    c.innerHTML = '<p class="empty-msg">아직 댓글이 없습니다.</p>';
    return;
  }
  c.innerHTML = comments.map(cm => {
    const mine = currentUser && currentUser.uid === cm.authorUid;
    return `
      <div class="comment-card">
        <div class="comment-meta">
          <span class="author-link comment-author" onclick="showProfile('${cm.authorUid}','${esc(cm.authorNickname)}')">${esc(cm.authorNickname)}</span>
          <span>${formatDate(cm.createdAt)}</span>
          ${mine ? `<button class="comment-delete-btn" onclick="doDeleteComment('${cm.id}')">삭제</button>` : ''}
        </div>
        <div class="comment-content">${esc(cm.content)}</div>
      </div>
    `;
  }).join('');
}

// ============================================================
//  댓글 - 작성
// ============================================================
async function doAddComment() {
  if (!currentUser) return alert('로그인이 필요합니다.');
  const input   = document.getElementById('comment-input');
  const content = (input?.value || '').trim();
  clearErr('comment-err');

  if (!content) return showErr('comment-err', '댓글 내용을 입력해주세요.');

  try {
    const batch = db.batch();
    const ref   = db.collection('comments').doc();
    batch.set(ref, {
      postId:         currentPostId,
      authorUid:      currentUser.uid,
      authorNickname: currentUser.nickname,
      content,
      createdAt: FieldValue.serverTimestamp()
    });
    batch.update(db.collection('posts').doc(currentPostId), {
      commentCount: FieldValue.increment(1)
    });
    await batch.commit();
    if (input) input.value = '';
  } catch (e) {
    showErr('comment-err', '댓글 작성 중 오류: ' + e.message);
  }
}

// ============================================================
//  댓글 - 삭제
// ============================================================
async function doDeleteComment(commentId) {
  if (!confirm('댓글을 삭제할까요?')) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection('comments').doc(commentId));
    batch.update(db.collection('posts').doc(currentPostId), {
      commentCount: FieldValue.increment(-1)
    });
    await batch.commit();
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
  }
}

// ============================================================
//  프로필
// ============================================================
let profileUid = null;

function showOwnProfile() {
  if (currentUser) showProfile(currentUser.uid, currentUser.nickname);
}

async function showProfile(uid, nickname) {
  profileUid = uid;
  showSection('profile');

  const color = avatarColor(nickname);
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

  const editArea = document.getElementById('profile-edit-area');
  if (currentUser && currentUser.uid === uid) {
    editArea.innerHTML = `
      <div class="nickname-edit-row">
        <input class="input" type="text" id="new-nickname"
          placeholder="새 닉네임" value="${esc(currentUser.nickname)}" />
        <button class="btn btn-primary" onclick="doChangeNickname()">닉네임 변경</button>
      </div>
      <p id="nickname-msg" class="error-msg"></p>
    `;
  } else {
    editArea.innerHTML = '';
  }

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
  const snap = await db.collection('posts').where('authorUid', '==', uid).get();
  const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  if (!posts.length) { area.innerHTML = '<p class="empty-msg">작성한 글이 없습니다.</p>'; return; }
  area.innerHTML = posts.map(p => `
    <div class="post-card" onclick="showPostDetail('${p.id}')">
      <div class="post-card-title">${esc(p.title)}</div>
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
  const snap = await db.collection('comments').where('authorUid', '==', uid).get();
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

async function doChangeNickname() {
  if (!currentUser) return;
  const input = document.getElementById('new-nickname');
  const newNickname = (input?.value || '').trim();
  clearErr('nickname-msg');

  if (!newNickname)            return showErr('nickname-msg', '닉네임을 입력해주세요.');
  if (newNickname.length < 2)  return showErr('nickname-msg', '닉네임은 2자 이상이어야 합니다.');
  if (newNickname === currentUser.nickname) return showErr('nickname-msg', '현재 닉네임과 동일합니다.');

  try {
    await db.collection('users').doc(currentUser.uid).update({ nickname: newNickname });

    const [postsSnap, commentsSnap] = await Promise.all([
      db.collection('posts').where('authorUid', '==', currentUser.uid).get(),
      db.collection('comments').where('authorUid', '==', currentUser.uid).get()
    ]);

    let batch = db.batch();
    let count = 0;
    for (const doc of [...postsSnap.docs, ...commentsSnap.docs]) {
      batch.update(doc.ref, { authorNickname: newNickname });
      if (++count >= 499) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();

    currentUser.nickname = newNickname;
    updateAuthUI();
    document.getElementById('profile-nickname').textContent = newNickname;
    document.getElementById('profile-avatar').textContent = newNickname.charAt(0).toUpperCase();
    showOk('nickname-msg', '✓ 닉네임이 변경되었습니다.');
  } catch (e) {
    showErr('nickname-msg', '오류: ' + e.message);
  }
}

// ============================================================
//  다크 모드
// ============================================================
function toggleDarkMode(enabled) {
  document.body.classList.toggle('dark', enabled);
  localStorage.setItem('darkMode', enabled ? '1' : '0');
}

if (localStorage.getItem('darkMode') === '1') {
  document.body.classList.add('dark');
}

// ============================================================
//  초기화
// ============================================================
loadPosts();
