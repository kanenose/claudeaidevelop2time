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
    default:
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
    <div class="post-card" onclick="handlePostClick('${p.id}')">
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

function handlePostClick(postId) {
  if (!currentUser) {
    showSection('auth');
    showErr('login-err', '게시글을 보려면 로그인이 필요합니다.');
    return;
  }
  showPostDetail(postId);
}

function changeSort(btn) {
  currentSort = btn.dataset.sort;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPosts();
}

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

async function showPostDetail(postId) {
  if (!currentUser) {
    showSection('auth');
    showErr('login-err', '게시글을 보려면 로그인이 필요합니다.');
    return;
  }

  currentPostId = postId;
  showSection('detail');

  const docSnap = await db.collection('posts').doc(postId).get();
  if (!docSnap.exists) {
    document.getElementById('post-detail-content').innerHTML = '<p class="empty-msg">삭제된 게시글입니다.</p>';
    return;
  }
  const post = { id: docSnap.id, ...docSnap.data() };

  let userVote = null;
  const vd = await db.collection('votes').doc(`${postId}_${currentUser.uid}`).get();
  if (vd.exists) userVote = vd.data().voteType;

  renderPostDetail(post, userVote);
  loadComments(postId);
}

function renderPostDetail(post, userVote) {
  const isAuthor   = currentUser && currentUser.uid === post.authorUid;
  const likedCls   = userVote === 1  ? 'liked'    : '';
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
