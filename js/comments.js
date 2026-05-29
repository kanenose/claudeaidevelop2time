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

function loadComments(postId) {
  if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
  updateCommentWriteArea();

  unsubscribeComments = db.collection('comments')
    .where('postId', '==', postId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(
      snap => {
        const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const topLevel = comments.filter(c => !c.parentId);
        document.getElementById('comments-title').textContent = `댓글 ${topLevel.length}개`;
        renderComments(comments);
      },
      err => {
        console.error('댓글 로드 오류:', err);
        if (err.code === 'failed-precondition') {
          document.getElementById('comments-container').innerHTML =
            '<p class="error-msg">Firestore 복합 인덱스가 필요합니다.<br>' +
            '브라우저 콘솔(F12)에서 Firebase가 제공하는 링크를 클릭해 인덱스를 생성하세요.</p>';
        }
      }
    );
}

function renderComments(comments) {
  const c = document.getElementById('comments-container');
  const topLevel = comments.filter(cm => !cm.parentId);
  const replies  = comments.filter(cm => cm.parentId);

  if (!topLevel.length) {
    c.innerHTML = '<p class="empty-msg">아직 댓글이 없습니다.</p>';
    return;
  }

  c.innerHTML = topLevel.map(cm => {
    const myReplies  = replies.filter(r => r.parentId === cm.id);
    const repliesHtml = myReplies.map(r => renderCommentCard(r, true)).join('');
    return renderCommentCard(cm, false) + (repliesHtml ? `<div class="replies-wrap">${repliesHtml}</div>` : '');
  }).join('');
}

function renderCommentCard(cm, isReply) {
  const mine      = currentUser && currentUser.uid === cm.authorUid;
  const canDelete = mine || isAdmin;
  const reportBtn = !mine && currentUser
    ? `<button class="report-btn" data-report-type="comment" data-report-id="${cm.id}">신고</button>`
    : '';
  const replyBtn = !isReply && currentUser
    ? `<button class="reply-btn" data-reply-to="${cm.id}" data-reply-nick="${esc(cm.authorNickname)}">답글</button>`
    : '';
  const deleteAttr = mine
    ? `data-delete-comment="${cm.id}"`
    : `data-admin-delete-comment="${cm.id}"`;

  return `
    <div class="comment-card${isReply ? ' reply-card' : ''}" data-comment-id="${cm.id}">
      <div class="comment-meta">
        ${isReply ? '<span class="reply-arrow">↳</span>' : ''}
        <span class="author-link comment-author" data-uid="${cm.authorUid}" data-nick="${esc(cm.authorNickname)}">${esc(cm.authorNickname)}</span>
        <span>${formatDate(cm.createdAt)}</span>
        ${replyBtn}
        ${reportBtn}
        ${canDelete ? `<button class="comment-delete-btn" ${deleteAttr}>삭제</button>` : ''}
      </div>
      <div class="comment-content">${esc(cm.content)}</div>
      <div id="reply-form-${cm.id}"></div>
    </div>
  `;
}

// 이벤트 위임 — 댓글 컨테이너
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('comments-container');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const authorEl = e.target.closest('.author-link[data-uid]');
    if (authorEl) { showProfile(authorEl.dataset.uid, authorEl.dataset.nick); return; }

    const reportEl = e.target.closest('[data-report-type]');
    if (reportEl) { doReport(reportEl.dataset.reportType, reportEl.dataset.reportId); return; }

    const replyBtn = e.target.closest('.reply-btn');
    if (replyBtn) { toggleReplyForm(replyBtn.dataset.replyTo, replyBtn.dataset.replyNick); return; }

    const delBtn = e.target.closest('[data-delete-comment]');
    if (delBtn) { doDeleteComment(delBtn.dataset.deleteComment); return; }

    const adminDelBtn = e.target.closest('[data-admin-delete-comment]');
    if (adminDelBtn) { adminDeleteComment(adminDelBtn.dataset.adminDeleteComment); return; }
  });
});

function toggleReplyForm(parentId, parentNick) {
  const wrap = document.getElementById(`reply-form-${parentId}`);
  if (!wrap) return;
  if (wrap.innerHTML) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div class="reply-input-area">
      <textarea class="input" id="reply-input-${parentId}"
        placeholder="@${parentNick}에게 답글 작성..." style="min-height:60px;resize:vertical"></textarea>
      <div class="reply-btn-row">
        <button class="btn btn-primary btn-sm" onclick="doAddReply('${parentId}')">답글 작성</button>
        <button class="btn btn-sm" onclick="document.getElementById('reply-form-${parentId}').innerHTML=''">취소</button>
      </div>
      <p class="error-msg" id="reply-err-${parentId}"></p>
    </div>
  `;
  document.getElementById(`reply-input-${parentId}`)?.focus();
}

async function doAddReply(parentId) {
  if (!currentUser) return alert('로그인이 필요합니다.');
  if (currentUser.isBanned) return;
  const input   = document.getElementById(`reply-input-${parentId}`);
  const content = (input?.value || '').trim();
  const errEl   = `reply-err-${parentId}`;
  clearErr(errEl);

  if (!content) return showErr(errEl, '내용을 입력해주세요.');
  if (containsBannedWord(content)) return showErr(errEl, '금지어가 포함되어 있습니다.');

  try {
    await db.collection('comments').add({
      postId:         currentPostId,
      parentId,
      authorUid:      currentUser.uid,
      authorNickname: currentUser.nickname,
      content,
      createdAt: FieldValue.serverTimestamp()
    });
    const wrap = document.getElementById(`reply-form-${parentId}`);
    if (wrap) wrap.innerHTML = '';
  } catch (e) {
    showErr(errEl, '답글 작성 중 오류: ' + e.message);
  }
}

async function doAddComment() {
  if (!currentUser) return alert('로그인이 필요합니다.');
  if (currentUser.isBanned) return showErr('comment-err', '계정이 차단되어 댓글을 작성할 수 없습니다.');
  const input   = document.getElementById('comment-input');
  const content = (input?.value || '').trim();
  clearErr('comment-err');

  if (!content) return showErr('comment-err', '댓글 내용을 입력해주세요.');
  if (containsBannedWord(content)) return showErr('comment-err', '금지어가 포함된 댓글은 작성할 수 없습니다.');

  try {
    const batch = db.batch();
    const ref   = db.collection('comments').doc();
    batch.set(ref, {
      postId:         currentPostId,
      parentId:       null,
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
