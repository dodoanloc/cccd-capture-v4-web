const ids = [
  'full_name','id_number','old_id_number','date_of_birth','gender','issue_date','expiry_date','issue_place','place_of_origin','place_of_residence','current_address'
];

const els = {
  apiBase: document.getElementById('apiBase'),
  frontInput: document.getElementById('frontInput'),
  backInput: document.getElementById('backInput'),
  qrInput: document.getElementById('qrInput'),
  frontPreview: document.getElementById('frontPreview'),
  backPreview: document.getElementById('backPreview'),
  qrPreview: document.getElementById('qrPreview'),
  statusBanner: document.getElementById('statusBanner'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  copyJsonBtn: document.getElementById('copyJsonBtn'),
  debugOutput: document.getElementById('debugOutput'),
  startCameraBtn: document.getElementById('startCameraBtn'),
  switchCameraBtn: document.getElementById('switchCameraBtn'),
  captureFrontBtn: document.getElementById('captureFrontBtn'),
  captureBackBtn: document.getElementById('captureBackBtn'),
  captureQrBtn: document.getElementById('captureQrBtn'),
  video: document.getElementById('video'),
  captureCanvas: document.getElementById('captureCanvas'),
  guideFrame: document.getElementById('guideFrame'),
  cameraStateLabel: document.getElementById('cameraStateLabel'),
  cameraStateHint: document.getElementById('cameraStateHint'),
};

let latestResponse = null;
let stream = null;
let useEnvironment = true;
let frameCheckTimer = null;

function setStatus(text, type='info') {
  els.statusBanner.className = `status ${type}`;
  els.statusBanner.textContent = text;
}

function setCameraState(state, label, hint) {
  els.guideFrame.classList.remove('state-idle', 'state-warning', 'state-ready');
  els.guideFrame.classList.add(state);
  els.cameraStateLabel.textContent = label;
  els.cameraStateHint.textContent = hint;
}

function bindPreview(input, img) {
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    img.src = URL.createObjectURL(file);
  });
}

bindPreview(els.frontInput, els.frontPreview);
bindPreview(els.backInput, els.backPreview);
bindPreview(els.qrInput, els.qrPreview);

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: useEnvironment ? { ideal: 'environment' } : 'user',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    els.video.srcObject = stream;
    setCameraState('state-idle', 'Đã bật camera', 'Đưa CCCD vào giữa khung. Khi khung xanh thì bấm chụp.');
    startFrameCheck();
  } catch (err) {
    console.error(err);
    setStatus('Không bật được camera.', 'error');
    setCameraState('state-idle', 'Không bật được camera', 'Có thể dùng chức năng tải ảnh thay thế.');
  }
}

function startFrameCheck() {
  if (frameCheckTimer) clearInterval(frameCheckTimer);
  frameCheckTimer = setInterval(() => {
    if (!els.video.videoWidth || !els.video.videoHeight) return;
    const canvas = els.captureCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = 480;
    canvas.height = 300;
    ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let brightness = 0;
    let edgeScore = 0;
    for (let i = 0; i < data.length; i += 4 * 10) {
      brightness += data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
    }
    for (let y = 2; y < height - 2; y += 4) {
      for (let x = 2; x < width - 2; x += 4) {
        const idx = (y * width + x) * 4;
        edgeScore += Math.abs(data[idx] - data[idx + 4]) + Math.abs(data[idx] - data[idx + width * 4]);
      }
    }

    const avgBrightness = brightness / (data.length / (4 * 10));
    if (edgeScore > 180000 && avgBrightness > 70 && avgBrightness < 220) {
      setCameraState('state-ready', 'Đã thấy CCCD khá rõ', 'Khung đã đủ tốt. Anh/chị có thể bấm chụp.');
    } else if (edgeScore > 110000) {
      setCameraState('state-warning', 'Đã thấy CCCD nhưng chưa tối ưu', 'Giữ thẻ ngay ngắn hơn hoặc gần hơn một chút.');
    } else {
      setCameraState('state-idle', 'Chưa thấy CCCD rõ trong khung', 'Đưa thẻ vào giữa khung, tránh rung và lóa sáng.');
    }
  }, 700);
}

function captureToPreview(target) {
  if (!els.video.videoWidth || !els.video.videoHeight) {
    setStatus('Camera chưa sẵn sàng để chụp.', 'error');
    return;
  }
  const canvas = els.captureCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = els.video.videoWidth;
  canvas.height = els.video.videoHeight;
  ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
  target.src = dataUrl;
  setStatus('Đã chụp ảnh từ camera vào preview.', 'success');
}

function dataUrlToFile(dataUrl, filename) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

function ensureFileFromPreview(imgEl, inputEl, filename) {
  if (inputEl.files?.[0]) return inputEl.files[0];
  if (imgEl.src?.startsWith('data:image/')) return dataUrlToFile(imgEl.src, filename);
  return null;
}

function fillForm(data) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = data?.[id]?.value || '';
    if (data?.[id]?.requires_review) {
      el.style.borderColor = '#F59E0B';
      el.style.background = '#FFFBEB';
    } else {
      el.style.borderColor = '#E2E8F0';
      el.style.background = '#FFFFFF';
    }
  });
}

els.startCameraBtn.addEventListener('click', startCamera);
els.switchCameraBtn.addEventListener('click', () => {
  useEnvironment = !useEnvironment;
  startCamera();
});
els.captureFrontBtn.addEventListener('click', () => captureToPreview(els.frontPreview));
els.captureBackBtn.addEventListener('click', () => captureToPreview(els.backPreview));
els.captureQrBtn.addEventListener('click', () => captureToPreview(els.qrPreview));

els.analyzeBtn.addEventListener('click', async () => {
  const front = ensureFileFromPreview(els.frontPreview, els.frontInput, 'front.jpg');
  const back = ensureFileFromPreview(els.backPreview, els.backInput, 'back.jpg');
  const qr = ensureFileFromPreview(els.qrPreview, els.qrInput, 'qr.jpg');

  if (!front || !back) {
    setStatus('Cần có ảnh mặt trước và mặt sau.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('front', front);
  formData.append('back', back);
  if (qr) formData.append('qr', qr);

  setStatus('Đang gửi ảnh sang backend V4 để nhận dạng...', 'info');
  try {
    const res = await fetch(`${els.apiBase.value.replace(/\/$/, '')}/api/cccd/recognize`, {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();
    latestResponse = json;
    fillForm(json.data || {});
    els.debugOutput.textContent = JSON.stringify(json, null, 2);
    setStatus(json.meta?.review_required ? 'OCR xong. Nhiều field cần review.' : 'OCR xong. Dữ liệu có vẻ khá ổn.', json.meta?.review_required ? 'info' : 'success');
  } catch (err) {
    console.error(err);
    setStatus('Không gọi được backend API.', 'error');
  }
});

els.copyJsonBtn.addEventListener('click', async () => {
  if (!latestResponse) {
    setStatus('Chưa có JSON để copy.', 'error');
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(latestResponse, null, 2));
  setStatus('Đã copy JSON OCR.', 'success');
});
