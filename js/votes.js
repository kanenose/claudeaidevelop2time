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
          if (voteType === 1) likes--; else dislikes--;
          tx.delete(voteRef);
        } else {
          if (voteType === 1) { likes++; dislikes--; }
          else                { likes--; dislikes++; }
          tx.set(voteRef, {
            postId, userUid: currentUser.uid, voteType,
            createdAt: FieldValue.serverTimestamp()
          });
        }
      } else {
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
