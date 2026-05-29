/* ── 검색 ── */
function handleSearch(value) {
  searchQuery = value.trim();
  renderPosts();
}

/* ── 카테고리 탭 렌더링 ── */
function renderCategoryTabs() {
  const wrap = document.getElementById('category-tabs');
  if (!wrap) return;
  wrap.innerHTML = CATEGORIES
    .filter(c => !c.adminOnly || isAdmin)
    .map(c => `
      <button class="category-tab${currentCategory === c.id ? ' active' : ''}${c.adminOnly ? ' admin-only-tab' : ''}"
        data-cat="${c.id}" onclick="changeCategory('${c.id}')"
        ${c.color ? `style="--cat-color:${c.color}"` : ''}>
        ${c.label}${c.adminOnly ? ' 🔒' : ''}
      </button>
    `).join('');
}

function changeCategory(cat) {
  currentCategory = cat;
  renderCategoryTabs();
  renderPosts();
}

/* ── 게시글 로드 ── */
function loadPosts() {
  if (unsubscribePosts) unsubscribePosts();
  renderCategoryTabs();
  unsubscribePosts = db.collection('posts').onSnapshot(snap => {
    allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPosts();
  });
}

function sortedPosts() {
  let pool = allPosts;

  // 일반 유저에게 테스트 게시글 숨김
  if (!isAdmin) {
    pool = pool.filter(p => p.category !== 'test');
  }

  // 카테고리 필터
  if (currentCategory !== 'all') {
    pool = pool.filter(p => p.category === currentCategory);
  }

  // 검색 필터
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    pool = pool.filter(p =>
      (p.title   || '').toLowerCase().includes(q) ||
      (p.content || '').toLowerCase().includes(q)
    );
  }

  const notices = pool.filter(p =>  p.isNotice).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  const pinned  = pool.filter(p =>  p.isPinned && !p.isNotice).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  const regular = pool.filter(p => !p.isNotice && !p.isPinned);

  let sorted;
  switch (currentSort) {
    case 'popular':
      sorted = [...regular].sort((a, b) => ((b.score||0) - (a.score||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    case 'hot':
      sorted = [...regular].sort((a, b) => ((b.reactionCount||0) - (a.reactionCount||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    case 'likes':
      sorted = [...regular].sort((a, b) => ((b.likes||0) - (a.likes||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    case 'views':
      sorted = [...regular].sort((a, b) => ((b.viewCount||0) - (a.viewCount||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    case 'comments':
      sorted = [...regular].sort((a, b) => ((b.commentCount||0) - (a.commentCount||0)) || (tsMs(b.createdAt) - tsMs(a.createdAt)));
      break;
    default:
      sorted = [...regular].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  }
  return [...notices, ...pinned, ...sorted];
}

function renderPosts() {
  const container = document.getElementById('posts-container');
  const list = sortedPosts();

  if (searchQuery && !list.length) {
    container.innerHTML = `<p class="empty-msg">"${esc(searchQuery)}" 검색 결과가 없습니다.</p>`;
    return;
  }
  if (!list.length) {
    container.innerHTML = '<p class="empty-msg">아직 게시글이 없습니다. 첫 글을 작성해보세요!</p>';
    return;
  }

  container.innerHTML = list.map(p => {
    const cat      = CATEGORIES.find(c => c.id === p.category);
    const catBadge = cat && cat.id !== 'all'
      ? `<span class="badge-category" style="background:${cat.color}">${cat.label}</span> `
      : '';
    const authorHtml = p.isAnonymous
      ? `<span class="author-anon">익명</span>`
      : `<span class="author-link" data-uid="${p.authorUid}" data-nick="${esc(p.authorNickname)}">${esc(p.authorNickname)}</span>`;
    const noticeBadge = p.isNotice ? '<span class="badge-notice">공지</span> ' : '';
    const pinBadge    = p.isPinned && !p.isNotice ? '<span class="badge-pin">고정</span> ' : '';
    const extraCls    = p.isNotice ? ' post-notice' : p.isPinned ? ' post-pinned' : '';
    const hasImage    = p.imageUrl ? ' has-image' : '';
    return `
    <div class="post-card${extraCls}${hasImage}" data-post-id="${p.id}">
      <div class="post-card-title">${noticeBadge}${pinBadge}${catBadge}${esc(p.title)}</div>
      <div class="post-card-meta">
        ${authorHtml}
        <span>${formatDate(p.createdAt)}</span>
        <span>👁 ${p.viewCount||0}</span>
        <span>👍 ${p.likes||0}</span>
        <span>💬 ${p.commentCount||0}</span>
      </div>
    </div>`;
  }).join('');

  // 이벤트 위임으로 클릭 처리
  container.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const authorEl = e.target.closest('.author-link');
      if (authorEl) {
        e.stopPropagation();
        showProfile(authorEl.dataset.uid, authorEl.dataset.nick);
        return;
      }
      handlePostClick(card.dataset.postId);
    });
  });
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

/* ── 게시글 작성 ── */
async function doCreatePost() {
  if (!currentUser) return alert('로그인이 필요합니다.');
  if (currentUser.isBanned) return showErr('write-err', '계정이 차단되어 게시글을 작성할 수 없습니다.');

  const category    = document.getElementById('post-category').value;
  const title       = document.getElementById('post-title').value.trim();
  const content     = document.getElementById('post-content').value.trim();
  const isAnonymous = document.getElementById('post-anon').checked;
  const imageFile   = document.getElementById('post-image').files[0];
  clearErr('write-err');

  if (!title)   return showErr('write-err', '제목을 입력해주세요.');
  if (!content) return showErr('write-err', '내용을 입력해주세요.');
  if (containsBannedWord(title) || containsBannedWord(content))
    return showErr('write-err', '금지어가 포함되어 있습니다.');

  try {
    let imageUrl = '';
    if (imageFile) {
      imageUrl = await uploadImage(imageFile, pct => {
        showErr('write-err', `이미지 업로드 중... ${pct}%`);
      });
      clearErr('write-err');
    }

    await db.collection('posts').add({
      title, content, category, imageUrl,
      authorUid:      currentUser.uid,
      authorNickname: isAnonymous ? '익명' : currentUser.nickname,
      isAnonymous,
      likes: 0, dislikes: 0, score: 0, reactionCount: 0,
      commentCount: 0, viewCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    document.getElementById('post-title').value   = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-anon').checked  = false;
    removeImage();
    goToList();
  } catch (e) {
    showErr('write-err', '작성 중 오류가 발생했습니다: ' + e.message);
  }
}

/* ── 게시글 상세 ── */
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

  // 조회수 증가 (작성자 본인 제외)
  if (post.authorUid !== currentUser.uid) {
    db.collection('posts').doc(postId).update({ viewCount: FieldValue.increment(1) });
    post.viewCount = (post.viewCount || 0) + 1;
  }

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
  const cat        = CATEGORIES.find(c => c.id === post.category);

  const authorHtml = post.isAnonymous
    ? `<span class="author-anon">익명</span>`
    : `<span class="author-link" data-uid="${post.authorUid}" data-nick="${esc(post.authorNickname)}">${esc(post.authorNickname)}</span>`;

  const noticeBadge = post.isNotice ? '<span class="badge-notice">공지</span> ' : '';
  const pinBadge    = post.isPinned && !post.isNotice ? '<span class="badge-pin">고정</span> ' : '';
  const catBadge    = cat && cat.id !== 'all'
    ? `<span class="badge-category" style="background:${cat.color}">${cat.label}</span> ` : '';

  const reportBtn = !isAuthor && currentUser
    ? `<button class="report-btn" data-report-type="post" data-report-id="${post.id}">신고</button>`
    : '';

  const adminControls = isAdmin ? `
    <div class="admin-post-controls">
      <button class="btn btn-sm ${post.isNotice ? 'btn-primary' : ''}" onclick="adminToggleNoticeFromDetail('${post.id}',${!post.isNotice})">${post.isNotice ? '공지 해제' : '공지 설정'}</button>
      <button class="btn btn-sm ${post.isPinned ? 'btn-primary' : ''}" onclick="adminTogglePinFromDetail('${post.id}',${!post.isPinned})">${post.isPinned ? '고정 해제' : '상단 고정'}</button>
    </div>
  ` : '';

  const imageHtml = post.imageUrl
    ? `<div class="detail-image-wrap"><img class="detail-image" src="${esc(post.imageUrl)}" alt="첨부 이미지" /></div>`
    : '';

  const detailEl = document.getElementById('post-detail-content');
  detailEl.innerHTML = `
    <div class="detail-title">${noticeBadge}${pinBadge}${catBadge}${esc(post.title)}</div>
    <div class="detail-meta">
      ${authorHtml}
      <span>${formatDate(post.createdAt)}</span>
      <span>👁 ${post.viewCount||0}</span>
      <span>점수 ${post.score||0} | 💬 ${post.commentCount||0}</span>
    </div>
    <div class="detail-content">${esc(post.content)}</div>
    ${imageHtml}
    <div class="vote-area">
      <button class="vote-btn ${likedCls}"   data-vote-id="${post.id}" data-vote-type="1">👍 추천 ${post.likes||0}</button>
      <button class="vote-btn ${dislikeCls}" data-vote-id="${post.id}" data-vote-type="-1">👎 비추천 ${post.dislikes||0}</button>
      ${reportBtn}
      ${isAuthor || isAdmin ? `<button class="btn btn-danger" style="margin-left:auto" data-delete-post="${post.id}">삭제</button>` : ''}
    </div>
    ${adminControls}
  `;

  // onclick 단일 핸들러 (이전 핸들러 자동 교체되어 누적 없음)
  detailEl.onclick = (e) => {
    const authorEl = e.target.closest('.author-link');
    if (authorEl) { showProfile(authorEl.dataset.uid, authorEl.dataset.nick); return; }

    const voteBtn = e.target.closest('[data-vote-id]');
    if (voteBtn) { doVote(voteBtn.dataset.voteId, Number(voteBtn.dataset.voteType)); return; }

    const reportEl = e.target.closest('[data-report-type]');
    if (reportEl) { doReport(reportEl.dataset.reportType, reportEl.dataset.reportId); return; }

    const delBtn = e.target.closest('[data-delete-post]');
    if (delBtn) { doDeletePost(delBtn.dataset.deletePost); return; }
  };
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
