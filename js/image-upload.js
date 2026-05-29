const IMAGE_MAX_WIDTH = 1200;
const IMAGE_QUALITY   = 0.82;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB

/* ── 업로드 전 압축 (Canvas API) ── */
async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > IMAGE_MAX_WIDTH) {
        height = Math.round((height * IMAGE_MAX_WIDTH) / width);
        width  = IMAGE_MAX_WIDTH;
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => resolve(blob || file),
        'image/jpeg',
        IMAGE_QUALITY
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ── 미리보기 ── */
function previewImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > IMAGE_MAX_BYTES) {
    alert('파일 크기는 5MB 이하여야 합니다.');
    input.value = '';
    return;
  }
  const wrap = document.getElementById('image-preview-wrap');
  const img  = document.getElementById('image-preview');
  img.src = URL.createObjectURL(file);
  wrap.classList.remove('hidden');
}

function removeImage() {
  document.getElementById('post-image').value = '';
  document.getElementById('image-preview-wrap').classList.add('hidden');
  document.getElementById('image-preview').src = '';
}

/* ── Firebase Storage 업로드 ── */
async function uploadImage(file, onProgress) {
  const compressed = await compressImage(file);
  const fileName   = `${Date.now()}_${file.name.replace(/\.[^.]+$/, '.jpg')}`;
  const ref        = storage.ref(`post-images/${fileName}`);

  return new Promise((resolve, reject) => {
    const task = ref.put(compressed);

    task.on('state_changed',
      snap => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      reject,
      async () => {
        const url = await task.snapshot.ref.getDownloadURL();
        resolve(url);
      }
    );
  });
}
