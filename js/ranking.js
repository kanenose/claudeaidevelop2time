async function renderRanking() {
  const el = document.getElementById('ranking-content');
  if (!el) return;
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [weeklySnap, allTimeSnap] = await Promise.all([
      db.collection('posts')
        .where('createdAt', '>=', weekAgo)
        .orderBy('createdAt', 'desc')
        .limit(100).get(),
      db.collection('posts')
        .orderBy('likes', 'desc')
        .limit(5).get()
    ]);

    const weeklyPosts = weeklySnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => isAdmin || p.category !== 'test')
      .sort((a, b) => (b.viewCount||0) - (a.viewCount||0))
      .slice(0, 5);

    const allTimePosts = allTimeSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => isAdmin || p.category !== 'test');

    el.innerHTML = `
      <div class="ranking-section card">
        <h2 class="ranking-title">🔥 이번 주 인기글 <span class="ranking-sub">조회수 기준</span></h2>
        ${renderRankingList(weeklyPosts, 'views')}
      </div>
      <div class="ranking-section card">
        <h2 class="ranking-title">👑 명예의 전당 <span class="ranking-sub">전체 추천 기준</span></h2>
        ${renderRankingList(allTimePosts, 'likes')}
      </div>
    `;

    // 이벤트 위임
    el.onclick = (e) => {
      const item = e.target.closest('[data-ranking-post-id]');
      if (item) handlePostClick(item.dataset.rankingPostId);
    };
  } catch (e) {
    el.innerHTML = `<p class="error-msg">불러오기 실패: ${e.message}</p>`;
  }
}

function renderRankingList(posts, type) {
  if (!posts.length) return '<p class="empty-msg">아직 데이터가 없습니다.</p>';

  const medals = ['🥇', '🥈', '🥉', '4', '5'];
  return posts.map((p, i) => {
    const cat     = CATEGORIES.find(c => c.id === p.category);
    const catBadge = cat && cat.id !== 'all'
      ? `<span class="badge-category" style="background:${cat.color}">${cat.label}</span>` : '';
    const score   = type === 'views' ? `👁 ${p.viewCount||0}` : `👍 ${p.likes||0}`;
    const author  = p.isAnonymous ? '익명' : esc(p.authorNickname || '-');
    return `
      <div class="ranking-item" data-ranking-post-id="${p.id}">
        <span class="ranking-medal">${medals[i]}</span>
        <div class="ranking-info">
          <div class="ranking-item-title">${catBadge} ${esc(p.title)}</div>
          <div class="ranking-item-meta">
            <span>${author}</span>
            <span>${score}</span>
            <span>💬 ${p.commentCount||0}</span>
            <span>${formatDate(p.createdAt)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
