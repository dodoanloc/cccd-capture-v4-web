const ids = [
  'full_name','id_number','old_id_number','date_of_birth','gender','issue_date','expiry_date','issue_place','place_of_origin','place_of_residence','current_address'
];

const els = {
  apiBase: document.getElementById('apiBase'),
  qrInput: document.getElementById('qrInput'),
  frontPreview: document.getElementById('frontPreview'),
  backPreview: document.getElementById('backPreview'),
  qrPreview: document.getElementById('qrPreview'),
  statusBanner: document.getElementById('statusBanner'),
  copyJsonBtn: document.getElementById('copyJsonBtn'),
  copyResidenceBtn: document.getElementById('copyResidenceBtn'),
  debugOutput: document.getElementById('debugOutput'),
  startCameraBtn: document.getElementById('startCameraBtn'),
  switchCameraBtn: document.getElementById('switchCameraBtn'),
  captureFrontBtn: document.getElementById('captureFrontBtn'),
  captureBackBtn: document.getElementById('captureBackBtn'),
  captureQrBtn: document.getElementById('captureQrBtn'),
  runFallbackOcrBtn: document.getElementById('runFallbackOcrBtn'),
  multiImageInput: document.getElementById('multiImageInput'),
  video: document.getElementById('video'),
  captureCanvas: document.getElementById('captureCanvas'),
  guideFrame: document.getElementById('guideFrame'),
  cameraStateLabel: document.getElementById('cameraStateLabel'),
  cameraStateHint: document.getElementById('cameraStateHint'),
};

let latestResponse = null;
let latestQrText = '';
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
    setCameraState('state-idle', 'Đã bật camera', 'Đưa QR CCCD vào trong khung vuông rồi bấm Quét / Chụp QR.');
    startFrameCheck();
  } catch (err) {
    console.error(err);
    setStatus('Không bật được camera.', 'error');
  }
}

function startFrameCheck() {
  if (frameCheckTimer) clearInterval(frameCheckTimer);
  frameCheckTimer = setInterval(() => {
    if (!els.video.videoWidth || !els.video.videoHeight) return;
    const canvas = els.captureCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = 420;
    canvas.height = 320;
    ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let brightness = 0;
    let contrast = 0;
    for (let i = 0; i < data.length; i += 4 * 12) {
      const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
      brightness += gray;
    }
    for (let y = 2; y < height - 2; y += 5) {
      for (let x = 2; x < width - 2; x += 5) {
        const idx = (y * width + x) * 4;
        contrast += Math.abs(data[idx] - data[idx + 4]) + Math.abs(data[idx] - data[idx + width * 4]);
      }
    }

    const avgBrightness = brightness / (data.length / (4 * 12));
    if (contrast > 80000 && avgBrightness > 60 && avgBrightness < 230) {
      setCameraState('state-ready', 'Đã thấy QR khá rõ', 'Có thể bấm Quét / Chụp QR.');
    } else if (contrast > 40000) {
      setCameraState('state-warning', 'Đã thấy QR nhưng chưa rõ', 'Giữ điện thoại chắc hơn hoặc đưa gần hơn.');
    } else {
      setCameraState('state-idle', 'Chưa thấy QR rõ', 'Đưa mã QR vào giữa khung vuông.');
    }
  }, 700);
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

function captureFrameDataUrl() {
  if (!els.video.videoWidth || !els.video.videoHeight) return '';
  const canvas = els.captureCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = els.video.videoWidth;
  canvas.height = els.video.videoHeight;
  ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.96);
}

function decodeQrFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = window.jsQR(imageData.data, canvas.width, canvas.height);
      resolve(result?.data || '');
    };
    img.src = dataUrl;
  });
}

function parseQrText(raw) {
  const parts = (raw || '').split('|');
  const mapping = {
    id_number: parts[0] || '',
    old_id_number: parts[1] || '',
    full_name: parts[2] || '',
    date_of_birth: formatCompactDate(parts[3] || ''),
    gender: normalizeGender(parts[4] || ''),
    place_of_residence: parts[5] || '',
    issue_date: formatCompactDate(parts[6] || ''),
  };

  Object.entries(mapping).forEach(([key, val]) => {
    const el = document.getElementById(key);
    if (el && val) el.value = val;
  });

  if (!document.getElementById('current_address').value && mapping.place_of_residence) {
    document.getElementById('current_address').value = mapping.place_of_residence;
  }

  if (!document.getElementById('issue_place').value) {
    document.getElementById('issue_place').value = 'Cục Cảnh sát QLHC về TTXH';
  }
}

function formatCompactDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
  return value || '';
}

function normalizeGender(value) {
  const x = String(value || '').toLowerCase();
  if (x.includes('nam')) return 'Nam';
  if (x.includes('nữ') || x.includes('nu')) return 'Nữ';
  return value || '';
}

function fillForm(data) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = data?.[id]?.value || el.value || '';
    if (data?.[id]?.requires_review) {
      el.style.borderColor = '#F59E0B';
      el.style.background = '#FFFBEB';
    } else {
      el.style.borderColor = '#E2E8F0';
      el.style.background = '#FFFFFF';
    }
  });
}

async function handleQrImage(dataUrl) {
  els.qrPreview.src = dataUrl;
  latestQrText = await decodeQrFromDataUrl(dataUrl);
  if (!latestQrText) {
    setStatus('Chưa đọc được QR. Anh/chị có thể chụp lại hoặc dùng OCR fallback sau.', 'error');
    return;
  }
  parseQrText(latestQrText);
  latestResponse = { qr_text: latestQrText };
  els.debugOutput.textContent = JSON.stringify({ qr_text: latestQrText }, null, 2);
  setStatus('Đã đọc QR và điền dữ liệu chính từ QR.', 'success');
}

async function runFallbackOcr() {
  const frontSrc = els.frontPreview.src;
  const backSrc = els.backPreview.src;
  if (!frontSrc || !backSrc || !frontSrc.startsWith('data:') && !frontSrc.startsWith('blob:') || !backSrc) {
    setStatus('Cần có ảnh mặt trước và mặt sau để chạy OCR fallback.', 'error');
    return;
  }

  const frontFile = frontSrc.startsWith('data:') ? dataUrlToFile(frontSrc, 'front.jpg') : null;
  const backFile = backSrc.startsWith('data:') ? dataUrlToFile(backSrc, 'back.jpg') : null;
  if (!frontFile || !backFile) {
    setStatus('Hiện fallback OCR chỉ chạy chắc chắn với ảnh chụp trực tiếp từ camera.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('front', frontFile);
  formData.append('back', backFile);
  if (latestQrText) formData.append('qr', dataUrlToFile(els.qrPreview.src, 'qr.jpg'));

  setStatus('Đang chạy OCR fallback từ ảnh mặt trước/mặt sau...', 'info');
  try {
    const res = await fetch(`${els.apiBase.value.replace(/\/$/, '')}/api/cccd/recognize`, {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();
    latestResponse = json;
    fillForm(json.data || {});
    els.debugOutput.textContent = JSON.stringify(json, null, 2);
    setStatus('Đã chạy OCR fallback. Vui lòng review các field tô vàng.', 'success');
  } catch (err) {
    console.error(err);
    setStatus('Không gọi được backend OCR fallback.', 'error');
  }
}

els.startCameraBtn.addEventListener('click', startCamera);
els.switchCameraBtn.addEventListener('click', () => {
  useEnvironment = !useEnvironment;
  startCamera();
});
els.captureQrBtn.addEventListener('click', async () => {
  const dataUrl = captureFrameDataUrl();
  if (!dataUrl) {
    setStatus('Camera chưa sẵn sàng.', 'error');
    return;
  }
  await handleQrImage(dataUrl);
});
els.qrInput.addEventListener('change', async () => {
  const file = els.qrInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => await handleQrImage(reader.result);
  reader.readAsDataURL(file);
});
els.captureFrontBtn.addEventListener('click', () => {
  const dataUrl = captureFrameDataUrl();
  if (!dataUrl) return setStatus('Camera chưa sẵn sàng.', 'error');
  els.frontPreview.src = dataUrl;
  setStatus('Đã chụp mặt trước.', 'success');
});
els.captureBackBtn.addEventListener('click', () => {
  const dataUrl = captureFrameDataUrl();
  if (!dataUrl) return setStatus('Camera chưa sẵn sàng.', 'error');
  els.backPreview.src = dataUrl;
  setStatus('Đã chụp mặt sau.', 'success');
});
els.multiImageInput.addEventListener('change', () => {
  const files = Array.from(els.multiImageInput.files || []);
  if (files[0]) els.frontPreview.src = URL.createObjectURL(files[0]);
  if (files[1]) els.backPreview.src = URL.createObjectURL(files[1]);
  setStatus('Đã nạp ảnh mặt trước/mặt sau.', 'success');
});
els.runFallbackOcrBtn.addEventListener('click', runFallbackOcr);
els.copyJsonBtn.addEventListener('click', async () => {
  if (!latestResponse) return setStatus('Chưa có dữ liệu JSON để copy.', 'error');
  await navigator.clipboard.writeText(JSON.stringify(latestResponse, null, 2));
  setStatus('Đã copy JSON.', 'success');
});
els.copyResidenceBtn.addEventListener('click', () => {
  const residence = document.getElementById('place_of_residence').value.trim();
  if (!residence) return setStatus('Chưa có nơi thường trú để copy.', 'error');
  document.getElementById('current_address').value = residence;
  setStatus('Đã copy nơi thường trú sang địa chỉ hiện tại.', 'success');
});
