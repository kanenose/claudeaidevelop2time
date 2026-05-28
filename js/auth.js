auth.onAuthStateChanged(async user => {
  if (user) {
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      const nickname = doc.exists ? doc.data().nickname : user.email;
      currentUser = { uid: user.uid, email: user.email, nickname };
    } catch {
      currentUser = { uid: user.uid, email: user.email, nickname: user.email };
    }
    updateAuthUI();
    if (currentPostId) await showPostDetail(currentPostId);
  } else {
    currentUser = null;
    updateAuthUI();
    if (currentPostId) {
      if (unsubscribeComments) { unsubscribeComments(); unsubscribeComments = null; }
      currentPostId = null;
      showSection('list');
    }
  }
});

async function doSignup() {
  const email     = document.getElementById('signup-email').value.trim();
  const pw        = document.getElementById('signup-password').value;
  const pwConfirm = document.getElementById('signup-password-confirm').value;
  const nickname  = document.getElementById('signup-nickname').value.trim();
  clearErr('signup-err');

  if (!email || !pw || !pwConfirm || !nickname) return showErr('signup-err', '모든 항목을 입력해주세요.');
  if (pw !== pwConfirm)       return showErr('signup-err', '비밀번호가 일치하지 않습니다.');
  if (nickname.length < 2)    return showErr('signup-err', '닉네임은 2자 이상이어야 합니다.');

  try {
    const { user } = await auth.createUserWithEmailAndPassword(email, pw);
    await db.collection('users').doc(user.uid).set({
      uid: user.uid, email, nickname,
      createdAt: FieldValue.serverTimestamp()
    });
    ['signup-email', 'signup-password', 'signup-password-confirm', 'signup-nickname']
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
      'auth/user-not-found':     '존재하지 않는 계정입니다.',
      'auth/wrong-password':     '비밀번호가 틀렸습니다.',
      'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
      'auth/too-many-requests':  '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    };
    showErr('login-err', msgs[e.code] || e.message);
  }
}

async function doLogout() {
  await auth.signOut();
  showSection('list');
}
