async function loadBannedWords() {
  try {
    const doc = await db.collection('settings').doc('bannedWords').get();
    bannedWords = doc.exists ? (doc.data().words || []) : [];
  } catch { bannedWords = []; }
}

async function logAdminAction(action, targetType, targetId, detail) {
  if (!currentUser) return;
  try {
    await db.collection('adminLogs').add({
      adminUid:      currentUser.uid,
      adminNickname: currentUser.nickname,
      action, targetType, targetId,
      detail: detail || '',
      createdAt: FieldValue.serverTimestamp()
    });
  } catch {}
}

function switchAdminTab(tab) {
  ['dashboard', 'users', 'posts', 'reports', 'banned-words', 'logs'].forEach(t => {
    document.getElementById(`admin-tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`admin-panel-${t}`).classList.toggle('hidden', t !== tab);
  });
  switch (tab) {
    case 'dashboard':    renderAdminDashboard();  break;
    case 'users':        renderAdminUsers();       break;
    case 'posts':        renderAdminPosts();       break;
    case 'reports':      renderAdminReports();     break;
    case 'banned-words': renderAdminBannedWords(); break;
    case 'logs':         renderAdminLogs();        break;
  }
}

// ── 대시보드 ──────────────────────────────────────────────────────
async function renderAdminDashboard() {
  const el = document.getElementById('admin-dashboard');
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  try {
    const [users, posts, comments, reports] = await Promise.all([
      db.collection('users').get(),
      db.collection('posts').get(),
      db.collection('comments').get(),
      db.collection('reports').where('status', '==', 'pending').get()
    ]);
    el.innerHTML = `
      <div class="admin-stats-grid">
        <div class="admin-stat-card">
          <div class="admin-stat-num">${users.size}</div>
          <div class="admin-stat-label">전체 회원</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-num">${posts.size}</div>
          <div class="admin-stat-label">전체 게시글</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-num">${comments.size}</div>
          <div class="admin-stat-label">전체 댓글</div>
        </div>
        <div class="admin-stat-card ${reports.size > 0 ? 'admin-stat-warn' : ''}">
          <div class="admin-stat-num">${reports.size}</div>
          <div class="admin-stat-label">미처리 신고</div>
        </div>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:8px">
        💡 첫 관리자 설정: Firebase Console → Firestore → users 컬렉션 → 본인 문서에 <code>role: "admin"</code> 필드를 추가하세요.
      </p>
    `;
  } catch (e) {
    el.innerHTML = `<p class="error-msg">불러오기 실패: ${e.message}</p>`;
  }
}

// ── 사용자 관리 ───────────────────────────────────────────────────
async function renderAdminUsers() {
  const el = document.getElementById('admin-users');
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  try {
    const snap = await db.collection('users').get();
    if (!snap.size) { el.innerHTML = '<p class="empty-msg">회원이 없습니다.</p>'; return; }
    const rows = snap.docs.map(d => {
      const u         = d.data();
      const adminUser = u.role === 'admin';
      const banned    = u.isBanned === true;
      const isSelf    = d.id === currentUser.uid;
      return `
        <tr>
          <td>${esc(u.nickname || '-')}</td>
          <td style="font-size:12px;color:var(--muted)">${esc(u.email || '-')}</td>
          <td><span class="role-badge ${adminUser ? 'role-admin' : ''}">${adminUser ? '관리자' : '일반'}</span></td>
          <td><span class="status-badge ${banned ? 'status-banned' : 'status-ok'}">${banned ? '차단' : '정상'}</span></td>
          <td style="font-size:12px">${formatDate(u.createdAt)}</td>
          <td class="admin-action-cell">
            ${isSelf
              ? '<span style="font-size:12px;color:var(--muted)">본인</span>'
              : `
                ${banned
                  ? `<button class="btn btn-sm" onclick="adminUnbanUser('${d.id}')">차단해제</button>`
                  : `<button class="btn btn-sm btn-danger" onclick="adminBanUser('${d.id}','${esc(u.nickname||'')}')">차단</button>`
                }
                ${adminUser
                  ? `<button class="btn btn-sm" onclick="adminSetRole('${d.id}','user','${esc(u.nickname||'')}')">권한해제</button>`
                  : `<button class="btn btn-sm btn-primary" onclick="adminSetRole('${d.id}','admin','${esc(u.nickname||'')}')">관리자지정</button>`
                }
              `
            }
          </td>
        </tr>
      `;
    }).join('');
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>닉네임</th><th>이메일</th><th>역할</th><th>상태</th><th>가입일</th><th>관리</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<p class="error-msg">불러오기 실패: ${e.message}</p>`;
  }
}

async function adminBanUser(uid, nickname) {
  if (!confirm(`"${nickname}" 회원을 차단할까요?`)) return;
  try {
    await db.collection('users').doc(uid).update({ isBanned: true });
    await logAdminAction('ban_user', 'user', uid, nickname);
    renderAdminUsers();
  } catch (e) { alert('오류: ' + e.message); }
}

async function adminUnbanUser(uid) {
  try {
    await db.collection('users').doc(uid).update({ isBanned: false });
    await logAdminAction('unban_user', 'user', uid, '');
    renderAdminUsers();
  } catch (e) { alert('오류: ' + e.message); }
}

async function adminSetRole(uid, role, nickname) {
  const msg = role === 'admin'
    ? `"${nickname}"을 관리자로 지정할까요?`
    : `"${nickname}"의 관리자 권한을 해제할까요?`;
  if (!confirm(msg)) return;
  try {
    await db.collection('users').doc(uid).update({ role });
    await logAdminAction('set_role', 'user', uid, `${nickname} → ${role}`);
    renderAdminUsers();
  } catch (e) { alert('오류: ' + e.message); }
}

// ── 게시물 관리 ───────────────────────────────────────────────────
async function renderAdminPosts() {
  const el = document.getElementById('admin-posts');
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  try {
    const snap = await db.collection('posts').orderBy('createdAt', 'desc').get();
    if (!snap.size) { el.innerHTML = '<p class="empty-msg">게시글이 없습니다.</p>'; return; }
    const rows = snap.docs.map(d => {
      const p = d.data();
      const badges = [
        p.isNotice ? '<span class="badge-notice">공지</span>' : '',
        p.isPinned ? '<span class="badge-pin">고정</span>'   : ''
      ].filter(Boolean).join(' ') || '-';
      return `
        <tr>
          <td class="post-title-cell">${esc(p.title)}</td>
          <td>${p.isAnonymous ? '<span style="color:var(--muted)">익명</span>' : esc(p.authorNickname || '-')}</td>
          <td style="font-size:12px">${formatDate(p.createdAt)}</td>
          <td>${badges}</td>
          <td class="admin-action-cell">
            <button class="btn btn-sm ${p.isNotice ? 'btn-primary' : ''}" onclick="adminToggleNotice('${d.id}',${!p.isNotice})">${p.isNotice ? '공지해제' : '공지'}</button>
            <button class="btn btn-sm ${p.isPinned ? 'btn-primary' : ''}" onclick="adminTogglePin('${d.id}',${!p.isPinned})">${p.isPinned ? '고정해제' : '고정'}</button>
            <button class="btn btn-sm btn-danger" onclick="adminDeletePostFromPanel('${d.id}','${esc(p.title)}')">삭제</button>
          </td>
        </tr>
      `;
    }).join('');
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>제목</th><th>작성자</th><th>날짜</th><th>상태</th><th>관리</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<p class="error-msg">불러오기 실패: ${e.message}</p>`;
  }
}

async function adminToggleNotice(postId, value) {
  try {
    await db.collection('posts').doc(postId).update({ isNotice: value });
    await logAdminAction(value ? 'set_notice' : 'unset_notice', 'post', postId, '');
    renderAdminPosts();
  } catch (e) { alert('오류: ' + e.message); }
}

async function adminTogglePin(postId, value) {
  try {
    await db.collection('posts').doc(postId).update({ isPinned: value });
    await logAdminAction(value ? 'pin_post' : 'unpin_post', 'post', postId, '');
    renderAdminPosts();
  } catch (e) { alert('오류: ' + e.message); }
}

async function adminDeletePostFromPanel(postId, title) {
  if (!confirm(`"${title}" 게시글을 삭제할까요?`)) return;
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
    await logAdminAction('delete_post', 'post', postId, title);
    renderAdminPosts();
  } catch (e) { alert('오류: ' + e.message); }
}

async function adminToggleNoticeFromDetail(postId, value) {
  try {
    await db.collection('posts').doc(postId).update({ isNotice: value });
    await logAdminAction(value ? 'set_notice' : 'unset_notice', 'post', postId, '');
    showPostDetail(postId);
  } catch (e) { alert('오류: ' + e.message); }
}

async function adminTogglePinFromDetail(postId, value) {
  try {
    await db.collection('posts').doc(postId).update({ isPinned: value });
    await logAdminAction(value ? 'pin_post' : 'unpin_post', 'post', postId, '');
    showPostDetail(postId);
  } catch (e) { alert('오류: ' + e.message); }
}

async function adminDeleteComment(commentId) {
  if (!confirm('이 댓글을 삭제할까요?')) return;
  try {
    const cm = await db.collection('comments').doc(commentId).get();
    if (!cm.exists) return;
    const batch = db.batch();
    batch.delete(db.collection('comments').doc(commentId));
    batch.update(db.collection('posts').doc(cm.data().postId), {
      commentCount: FieldValue.increment(-1)
    });
    await batch.commit();
    await logAdminAction('admin_delete_comment', 'comment', commentId, '');
  } catch (e) { alert('오류: ' + e.message); }
}

// ── 신고 처리 ─────────────────────────────────────────────────────
async function renderAdminReports() {
  const el     = document.getElementById('admin-reports');
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  const filter = document.getElementById('admin-report-filter')?.value || 'pending';
  try {
    let query = db.collection('reports').orderBy('createdAt', 'desc').limit(200);
    if (filter !== 'all') query = query.where('status', '==', filter);
    const snap = await query.get();
    const docs = snap.docs;
    if (!docs.length) { el.innerHTML = '<p class="empty-msg">신고 내역이 없습니다.</p>'; return; }
    const statusLabel = { pending: '대기', accepted: '처리됨', ignored: '무시됨' };
    const rows = docs.map(d => {
      const r       = d.data();
      const pending = r.status === 'pending';
      return `
        <tr>
          <td><span class="badge-type">${r.targetType === 'post' ? '게시글' : '댓글'}</span></td>
          <td>${esc(r.reporterNickname || '-')}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.reason || '-')}</td>
          <td style="font-size:12px">${formatDate(r.createdAt)}</td>
          <td><span class="status-badge ${pending ? 'status-warn' : 'status-ok'}">${statusLabel[r.status] || r.status}</span></td>
          <td class="admin-action-cell">
            ${pending ? `
              <button class="btn btn-sm btn-danger" onclick="resolveReport('${d.id}','accepted','${r.targetType}','${r.targetId}')">삭제처리</button>
              <button class="btn btn-sm" onclick="resolveReport('${d.id}','ignored','${r.targetType}','${r.targetId}')">무시</button>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join('');
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>유형</th><th>신고자</th><th>사유</th><th>일시</th><th>상태</th><th>관리</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<p class="error-msg">불러오기 실패: ${e.message}</p>`;
  }
}

async function resolveReport(reportId, action, targetType, targetId) {
  try {
    await db.collection('reports').doc(reportId).update({
      status: action,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: currentUser.uid
    });
    if (action === 'accepted') {
      if (targetType === 'post') {
        const [cs, vs] = await Promise.all([
          db.collection('comments').where('postId', '==', targetId).get(),
          db.collection('votes').where('postId', '==', targetId).get()
        ]);
        const allRefs = [...cs.docs.map(d => d.ref), ...vs.docs.map(d => d.ref), db.collection('posts').doc(targetId)];
        for (let i = 0; i < allRefs.length; i += 499) {
          const b = db.batch();
          allRefs.slice(i, i + 499).forEach(ref => b.delete(ref));
          await b.commit();
        }
      } else if (targetType === 'comment') {
        const cm = await db.collection('comments').doc(targetId).get();
        if (cm.exists) {
          const batch = db.batch();
          batch.delete(db.collection('comments').doc(targetId));
          batch.update(db.collection('posts').doc(cm.data().postId), {
            commentCount: FieldValue.increment(-1)
          });
          await batch.commit();
        }
      }
    }
    await logAdminAction(`report_${action}`, targetType, targetId, '');
    renderAdminReports();
  } catch (e) { alert('오류: ' + e.message); }
}

async function doReport(targetType, targetId) {
  if (!currentUser) return alert('로그인이 필요합니다.');
  try {
    const existing = await db.collection('reports')
      .where('targetId', '==', targetId)
      .where('reporterUid', '==', currentUser.uid)
      .limit(1).get();
    if (!existing.empty) return alert('이미 신고한 게시물입니다.');
  } catch {}

  const reason = prompt('신고 사유를 입력해주세요:');
  if (!reason || !reason.trim()) return;
  try {
    await db.collection('reports').add({
      targetType, targetId,
      reporterUid:      currentUser.uid,
      reporterNickname: currentUser.nickname,
      reason:           reason.trim(),
      status:           'pending',
      createdAt:        FieldValue.serverTimestamp()
    });
    alert('신고가 접수되었습니다.');
  } catch (e) {
    alert('신고 중 오류: ' + e.message);
  }
}

// ── 금지어 관리 ───────────────────────────────────────────────────
async function renderAdminBannedWords() {
  const el = document.getElementById('admin-banned-words');
  try {
    const doc   = await db.collection('settings').doc('bannedWords').get();
    const words = doc.exists ? (doc.data().words || []) : [];
    const chips = words.length
      ? words.map(w => `
          <span class="banned-word-chip">
            ${esc(w)}
            <button class="chip-remove" onclick="removeBannedWord('${esc(w)}')">×</button>
          </span>`).join('')
      : '<p class="empty-msg" style="padding:16px 0">등록된 금지어가 없습니다.</p>';
    el.innerHTML = `
      <div class="banned-word-input-row">
        <input class="input" type="text" id="new-banned-word" placeholder="추가할 금지어 입력" style="max-width:220px;margin-bottom:0" />
        <button class="btn btn-primary" onclick="addBannedWord()">추가</button>
      </div>
      <div class="banned-word-list">${chips}</div>
    `;
  } catch (e) {
    el.innerHTML = `<p class="error-msg">불러오기 실패: ${e.message}</p>`;
  }
}

async function addBannedWord() {
  const word = (document.getElementById('new-banned-word')?.value || '').trim();
  if (!word) return;
  if (word.length < 2) return alert('2자 이상 입력해주세요.');
  try {
    const doc   = await db.collection('settings').doc('bannedWords').get();
    const words = doc.exists ? (doc.data().words || []) : [];
    if (words.includes(word)) return alert('이미 등록된 금지어입니다.');
    words.push(word);
    await db.collection('settings').doc('bannedWords').set({ words });
    bannedWords = [...words];
    await logAdminAction('add_banned_word', 'settings', 'bannedWords', word);
    renderAdminBannedWords();
  } catch (e) { alert('오류: ' + e.message); }
}

async function removeBannedWord(word) {
  try {
    const doc     = await db.collection('settings').doc('bannedWords').get();
    const words   = doc.exists ? (doc.data().words || []) : [];
    const updated = words.filter(w => w !== word);
    await db.collection('settings').doc('bannedWords').set({ words: updated });
    bannedWords = [...updated];
    await logAdminAction('remove_banned_word', 'settings', 'bannedWords', word);
    renderAdminBannedWords();
  } catch (e) { alert('오류: ' + e.message); }
}

// ── 활동 로그 ─────────────────────────────────────────────────────
async function renderAdminLogs() {
  const el = document.getElementById('admin-logs');
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  try {
    const snap = await db.collection('adminLogs').orderBy('createdAt', 'desc').limit(100).get();
    if (!snap.size) { el.innerHTML = '<p class="empty-msg">로그가 없습니다.</p>'; return; }
    const labels = {
      ban_user: '사용자 차단', unban_user: '차단 해제', set_role: '역할 변경',
      delete_post: '게시글 삭제', set_notice: '공지 설정', unset_notice: '공지 해제',
      pin_post: '게시글 고정', unpin_post: '고정 해제',
      report_accepted: '신고 삭제처리', report_ignored: '신고 무시',
      add_banned_word: '금지어 추가', remove_banned_word: '금지어 제거',
      admin_delete_comment: '댓글 삭제'
    };
    const rows = snap.docs.map(d => {
      const l = d.data();
      return `
        <tr>
          <td>${esc(l.adminNickname || '-')}</td>
          <td>${labels[l.action] || esc(l.action)}</td>
          <td style="font-size:12px;color:var(--muted)">${esc(l.targetType || '-')}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.detail || '-')}</td>
          <td style="font-size:12px">${formatDate(l.createdAt)}</td>
        </tr>
      `;
    }).join('');
    el.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>관리자</th><th>작업</th><th>대상</th><th>상세</th><th>일시</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<p class="error-msg">불러오기 실패: ${e.message}</p>`;
  }
}
