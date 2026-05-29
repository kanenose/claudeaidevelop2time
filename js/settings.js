if (localStorage.getItem('darkMode') === '1') {
  document.body.classList.add('dark');
}

function toggleDarkMode(enabled) {
  document.body.classList.toggle('dark', enabled);
  localStorage.setItem('darkMode', enabled ? '1' : '0');
}

function renderSettingsForm() {
  const el = document.getElementById('settings-new-nickname');
  if (el && currentUser) el.value = currentUser.nickname;
  clearErr('settings-nickname-msg');
  clearErr('settings-password-msg');
  clearErr('settings-delete-msg');
  ['settings-current-password', 'settings-new-password', 'settings-new-password-confirm', 'settings-delete-password']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

async function doChangeNickname() {
  if (!currentUser) return;
  const input       = document.getElementById('settings-new-nickname');
  const newNickname = (input?.value || '').trim();
  clearErr('settings-nickname-msg');

  if (!newNickname)           return showErr('settings-nickname-msg', '닉네임을 입력해주세요.');
  if (newNickname.length < 2) return showErr('settings-nickname-msg', '닉네임은 2자 이상이어야 합니다.');
  if (newNickname === currentUser.nickname) return showErr('settings-nickname-msg', '현재 닉네임과 동일합니다.');

  try {
    await db.collection('users').doc(currentUser.uid).update({ nickname: newNickname });

    const [postsSnap, commentsSnap] = await Promise.all([
      db.collection('posts').where('authorUid', '==', currentUser.uid).get(),
      db.collection('comments').where('authorUid', '==', currentUser.uid).get()
    ]);

    const nonAnonPosts = postsSnap.docs.filter(d => !d.data().isAnonymous);

    let batch = db.batch();
    let count = 0;
    for (const doc of [...nonAnonPosts, ...commentsSnap.docs]) {
      batch.update(doc.ref, { authorNickname: newNickname });
      if (++count >= 499) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();

    currentUser.nickname = newNickname;
    updateAuthUI();
    showOk('settings-nickname-msg', '✓ 닉네임이 변경되었습니다.');
  } catch (e) {
    showErr('settings-nickname-msg', '오류: ' + e.message);
  }
}

async function doChangePassword() {
  if (!currentUser) return;
  const currentPw    = document.getElementById('settings-current-password').value;
  const newPw        = document.getElementById('settings-new-password').value;
  const newPwConfirm = document.getElementById('settings-new-password-confirm').value;
  clearErr('settings-password-msg');

  if (!currentPw || !newPw || !newPwConfirm) return showErr('settings-password-msg', '모든 항목을 입력해주세요.');
  if (newPw !== newPwConfirm)  return showErr('settings-password-msg', '새 비밀번호가 일치하지 않습니다.');
  if (newPw.length < 6)        return showErr('settings-password-msg', '새 비밀번호는 6자 이상이어야 합니다.');

  try {
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPw);
    await auth.currentUser.reauthenticateWithCredential(credential);
    await auth.currentUser.updatePassword(newPw);

    ['settings-current-password', 'settings-new-password', 'settings-new-password-confirm']
      .forEach(id => { document.getElementById(id).value = ''; });
    showOk('settings-password-msg', '✓ 비밀번호가 변경되었습니다.');
  } catch (e) {
    const msgs = {
      'auth/wrong-password':     '현재 비밀번호가 올바르지 않습니다.',
      'auth/invalid-credential': '현재 비밀번호가 올바르지 않습니다.',
      'auth/weak-password':      '새 비밀번호는 6자 이상이어야 합니다.',
      'auth/too-many-requests':  '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    };
    showErr('settings-password-msg', msgs[e.code] || e.message);
  }
}

async function doDeleteAccount() {
  if (!currentUser) return;
  const pw = document.getElementById('settings-delete-password').value;
  clearErr('settings-delete-msg');

  if (!pw) return showErr('settings-delete-msg', '비밀번호를 입력해주세요.');
  if (!confirm('정말로 탈퇴하시겠습니까?\n작성한 모든 게시글과 댓글이 삭제되며 복구할 수 없습니다.')) return;

  try {
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
    await auth.currentUser.reauthenticateWithCredential(credential);

    const uid = currentUser.uid;

    const [postsSnap, myCommentsSnap, votesSnap] = await Promise.all([
      db.collection('posts').where('authorUid', '==', uid).get(),
      db.collection('comments').where('authorUid', '==', uid).get(),
      db.collection('votes').where('userUid', '==', uid).get()
    ]);

    const myPostIds = new Set(postsSnap.docs.map(d => d.id));

    // 내 게시글에 달린 댓글/투표도 삭제
    const cascadeResults = await Promise.all(
      [...myPostIds].map(pid => Promise.all([
        db.collection('comments').where('postId', '==', pid).get(),
        db.collection('votes').where('postId', '==', pid).get()
      ]))
    );

    // 다른 사람 게시글에 달린 내 댓글 수 집계 → commentCount 감소에 사용
    const commentCountDelta = {};
    myCommentsSnap.docs.forEach(d => {
      const pid = d.data().postId;
      if (!myPostIds.has(pid)) commentCountDelta[pid] = (commentCountDelta[pid] || 0) + 1;
    });

    const pathsSeen = new Set();
    const allRefs   = [];
    const addRef = ref => {
      if (!pathsSeen.has(ref.path)) { pathsSeen.add(ref.path); allRefs.push(ref); }
    };

    postsSnap.docs.forEach(d => addRef(d.ref));
    myCommentsSnap.docs.forEach(d => addRef(d.ref));
    votesSnap.docs.forEach(d => addRef(d.ref));
    cascadeResults.forEach(([cSnap, vSnap]) => {
      cSnap.docs.forEach(d => addRef(d.ref));
      vSnap.docs.forEach(d => addRef(d.ref));
    });
    addRef(db.collection('users').doc(uid));

    for (let i = 0; i < allRefs.length; i += 499) {
      const b = db.batch();
      allRefs.slice(i, i + 499).forEach(ref => b.delete(ref));
      await b.commit();
    }

    // 다른 사람 게시글의 commentCount 업데이트
    const deltaEntries = Object.entries(commentCountDelta);
    for (let i = 0; i < deltaEntries.length; i += 499) {
      const b = db.batch();
      deltaEntries.slice(i, i + 499).forEach(([pid, cnt]) => {
        b.update(db.collection('posts').doc(pid), { commentCount: FieldValue.increment(-cnt) });
      });
      await b.commit();
    }

    await auth.currentUser.delete();
    goToList();
  } catch (e) {
    const msgs = {
      'auth/wrong-password':     '비밀번호가 올바르지 않습니다.',
      'auth/invalid-credential': '비밀번호가 올바르지 않습니다.',
      'auth/too-many-requests':  '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    };
    showErr('settings-delete-msg', msgs[e.code] || e.message);
  }
}
