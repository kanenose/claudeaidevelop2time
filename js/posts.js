function loadPosts() {
  if (unsubscribePosts) unsubscribePosts();
  unsubscribePosts = db.collection('posts').onSnapshot(snap => {
    allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPosts();
  });
}

function sortedPosts() {
  const notices = allPosts.filter(p =>  p.isNotice).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  const pinned  = allPosts.filter(p =>  p.isPinned && !p.isNotice).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  const regular = allPosts.filter(p => !p.isNotice && !p.isPinned);

  let sorted;
  switch (currentSort) {
    case 'popular':
      sorted = regular.sort((a, b) => ((b.score||0) - (a.score||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    case 'hot':
      sorted = regular.sort((a, b) => ((b.reactionCount||0) - (a.reactionCount||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    case 'likes':
      sorted = regular.sort((a, b) => ((b.likes||0) - (a.likes||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    case 'comments':
      sorted = regular.sort((a, b) => ((b.commentCount||0) - (a.commentCount||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    default:
      sorted = regular.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  }
  return [...notices, ...pinned, ...sorted];
}

function renderPosts() {
  const container = document.getElementById('posts-container');
  const list = sortedPosts();
  if (!list.length) {
    container.innerHTML = '<p class="empty-msg">아직 게시글이 없습니다. 첫 글을 작성해보세요!</p>';
    return;
  }
  container.innerHTML = list.map(p => {
    const authorHtml = p.isAnonymous
      ? `<span class="author-anon">익명</span>`
      : `<span class="author-link" onclick="event.stopPropagation();showProfile('${p.authorUid}','${esc(p.authorNickname)}')">${esc(p.authorNickname)}</span>`;
    const noticeBadge = p.isNotice ? '<span class="badge-notice">공지</span> ' : '';
    const pinBadge    = p.isPinned && !p.isNotice ? '<span class="badge-pin">고정</span> ' : '';
    const extraCls    = p.isNotice ? ' post-notice' : p.isPinned ? ' post-pinned' : '';
    return `
    <div class="post-card${extraCls}" onclick="handlePostClick('${p.id}')">
      <div class="post-card-title">${noticeBadge}${pinBadge}${esc(p.title)}</div>
      <div class="post-card-meta">
        ${authorHtml}
        <span>${formatDate(p.createdAt)}</span>
        <span>👍 ${p.likes||0}</span>
        <span>👎 ${p.dislikes||0}</span>
        <span>점수 ${p.score||0}</span>
        <span>반응 ${p.reactionCount||0}</span>
        <span>💬 ${p.commentCount||0}</span>
      </div>
    </div>
  `;
  }).join('');
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
  if (currentUser.isBanned) return showErr('write-err', '계정이 차단되어 게시글을 작성할 수 없습니다.');
  const title       = document.getElementById('post-title').value.trim();
  const content     = document.getElementById('post-content').value.trim();
  const isAnonymous = document.getElementById('post-anon').checked;
  clearErr('write-err');

  if (!title)   return showErr('write-err', '제목을 입력해주세요.');
  if (!content) return showErr('write-err', '내용을 입력해주세요.');
  if (containsBannedWord(title) || containsBannedWord(content))
    return showErr('write-err', '금지어가 포함되어 있습니다.');

  try {
    await db.collection('posts').add({
      title, content,
      authorUid:      currentUser.uid,
      authorNickname: isAnonymous ? '익명' : currentUser.nickname,
      isAnonymous,
      likes: 0, dislikes: 0, score: 0, reactionCount: 0, commentCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    document.getElementById('post-title').value   = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-anon').checked  = false;
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

  const authorHtml = post.isAnonymous
    ? `<span class="author-anon">익명</span>`
    : `<span class="author-link" onclick="showProfile('${post.authorUid}','${esc(post.authorNickname)}')">${esc(post.authorNickname)}</span>`;

  const noticeBadge = post.isNotice ? '<span class="badge-notice">공지</span> ' : '';
  const pinBadge    = post.isPinned && !post.isNotice ? '<span class="badge-pin">고정</span> ' : '';

  const reportBtn = !isAuthor && currentUser
    ? `<button class="report-btn" onclick="doReport('post','${post.id}')">신고</button>`
    : '';

  const adminControls = isAdmin ? `
    <div class="admin-post-controls">
      <button class="btn btn-sm ${post.isNotice ? 'btn-primary' : ''}" onclick="adminToggleNoticeFromDetail('${post.id}',${!post.isNotice})">${post.isNotice ? '공지 해제' : '공지 설정'}</button>
      <button class="btn btn-sm ${post.isPinned ? 'btn-primary' : ''}" onclick="adminTogglePinFromDetail('${post.id}',${!post.isPinned})">${post.isPinned ? '고정 해제' : '상단 고정'}</button>
    </div>
  ` : '';

  document.getElementById('post-detail-content').innerHTML = `
    <div class="detail-title">${noticeBadge}${pinBadge}${esc(post.title)}</div>
    <div class="detail-meta">
      ${authorHtml}
      <span>${formatDate(post.createdAt)}</span>
      <span>점수 ${post.score||0} &nbsp;|&nbsp; 반응 ${post.reactionCount||0} &nbsp;|&nbsp; 💬 ${post.commentCount||0}</span>
    </div>
    <div class="detail-content">${esc(post.content)}</div>
    <div class="vote-area">
      <button class="vote-btn ${likedCls}"   onclick="doVote('${post.id}', 1)">👍 추천 ${post.likes||0}</button>
      <button class="vote-btn ${dislikeCls}" onclick="doVote('${post.id}', -1)">👎 비추천 ${post.dislikes||0}</button>
      ${reportBtn}
      ${isAuthor || isAdmin ? `<button class="btn btn-danger" style="margin-left:auto" onclick="doDeletePost('${post.id}')">삭제</button>` : ''}
    </div>
    ${adminControls}
  `;
}

async function doDeletePost(postId) {
  if (!confirm('게시글을 삭제할까요? 댓글도 모두 삭제됩니다.')) return;
  try {
    const [cs, vs] = await Promise.all([
      db.collection('comments').where('postId', '==', postId).get(),
      db.collection('votes').where('postId', '==', postId).get()
    ]);
    const allRefs = [...cs.docs.map(d => d.ref), ...vs.docs.map(d => d.ref), db.collection('posts').doc(postId)];
    for (let i = 0; i < allRefs.length; i += 499) {
      const b = db.batch();
      allRefs.slice(i, i + 499).forEach(ref => b.delete(ref));
      await b.commit();
    }
    goToList();
  } catch (e) {
    alert('삭제 중 오류: ' + e.message);
  }
}
