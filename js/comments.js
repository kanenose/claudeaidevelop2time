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
        document.getElementById('comments-title').textContent = `댓글 ${comments.length}개`;
        renderComments(comments);
      },
      err => {
        console.error('댓글 로드 오류:', err);
        if (err.code === 'failed-precondition') {
          document.getElementById('comments-container').innerHTML =
            '<p class="error-msg">Firestore 복합 인덱스가 필요합니다.<br>' +
            '브라우저 콘솔(F12 → Console)에서 Firebase가 제공하는 링크를 클릭해 인덱스를 생성하세요.</p>';
        }
      }
    );
}

function renderComments(comments) {
  const c = document.getElementById('comments-container');
  if (!comments.length) {
    c.innerHTML = '<p class="empty-msg">아직 댓글이 없습니다.</p>';
    return;
  }
  c.innerHTML = comments.map(cm => {
    const mine      = currentUser && currentUser.uid === cm.authorUid;
    const canDelete = mine || isAdmin;
    const reportBtn = !mine && currentUser
      ? `<button class="report-btn" onclick="doReport('comment','${cm.id}')">신고</button>`
      : '';
    const deleteHandler = mine ? `doDeleteComment('${cm.id}')` : `adminDeleteComment('${cm.id}')`;
    return `
      <div class="comment-card">
        <div class="comment-meta">
          <span class="author-link comment-author" onclick="showProfile('${cm.authorUid}','${esc(cm.authorNickname)}')">${esc(cm.authorNickname)}</span>
          <span>${formatDate(cm.createdAt)}</span>
          ${reportBtn}
          ${canDelete ? `<button class="comment-delete-btn" onclick="${deleteHandler}">삭제</button>` : ''}
        </div>
        <div class="comment-content">${esc(cm.content)}</div>
      </div>
    `;
  }).join('');
}

async function doAddComment() {
  if (!currentUser) return alert('로그인이 필요합니다.');
  if (currentUser.isBanned) return showErr('comment-err', '계정이 차단되어 댓글을 작성할 수 없습니다.');
  const input   = document.getElementById('comment-input');
  const content = (input?.value || '').trim();
  clearErr('comment-err');

  if (!content) return showErr('comment-err', '댓글 내용을 입력해주세요.');
  if (containsBannedWord(content))
    return showErr('comment-err', '금지어가 포함된 댓글은 작성할 수 없습니다.');

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
