const ids = [
  'full_name','id_number','old_id_number','date_of_birth','gender','phone_number','occupation','issue_date','expiry_date','issue_place','place_of_origin','place_of_residence','current_address'
];

const els = {
  authSection: document.getElementById('authSection'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  loginBtn: document.getElementById('loginBtn'),
  loginStatus: document.getElementById('loginStatus'),
  userBar: document.getElementById('userBar'),
  currentUserLabel: document.getElementById('currentUserLabel'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminPanel: document.getElementById('adminPanel'),
  newUsername: document.getElementById('newUsername'),
  newPassword: document.getElementById('newPassword'),
  newFullName: document.getElementById('newFullName'),
  createUserBtn: document.getElementById('createUserBtn'),
  adminStatus: document.getElementById('adminStatus'),
  apiBase: document.getElementById('apiBase'),
  toggleConfigBtn: document.getElementById('toggleConfigBtn'),
  configPanel: document.getElementById('configPanel'),
  cameraSection: document.getElementById('cameraSection'),
  reviewSection: document.getElementById('reviewSection'),
  saveOverlay: document.getElementById('saveOverlay'),
  saveOverlayCard: document.getElementById('saveOverlayCard'),
  saveOverlayTitle: document.getElementById('saveOverlayTitle'),
  saveOverlayText: document.getElementById('saveOverlayText'),
  frontPreview: document.getElementById('frontPreview'),
  backPreview: document.getElementById('backPreview'),
  qrPreview: document.getElementById('qrPreview'),
  statusBanner: document.getElementById('statusBanner'),
  saveStatus: document.getElementById('saveStatus'),
  debugOutput: document.getElementById('debugOutput'),
  startCameraBtn: document.getElementById('startCameraBtn'),
  switchCameraBtn: document.getElementById('switchCameraBtn'),
  captureActionBtn: document.getElementById('captureActionBtn'),
  newRecordBtn: document.getElementById('newRecordBtn'),
  saveBtn: document.getElementById('saveBtn'),
  video: document.getElementById('video'),
  captureCanvas: document.getElementById('captureCanvas'),
  guideFrame: document.getElementById('guideFrame'),
  cameraStateLabel: document.getElementById('cameraStateLabel'),
  cameraStateHint: document.getElementById('cameraStateHint'),
  stepTitle: document.getElementById('stepTitle'),
  stepQr: document.getElementById('stepQr'),
  stepFront: document.getElementById('stepFront'),
  stepBack: document.getElementById('stepBack'),
  stepReview: document.getElementById('stepReview'),
};

let stream = null;
let scanLoopId = null;
let currentMode = 'qr';
let lastQrText = '';
let lastQrFrameDataUrl = '';
let useEnvironment = true;
let debugOpen = false;
let isSaving = false;
let currentUser = null;

function setStatus(text, type='info') {
  els.statusBanner.className = `status ${type}`;
  els.statusBanner.textContent = text;
}

function setLoginStatus(text, type='info') {
  els.loginStatus.className = `status ${type}`;
  els.loginStatus.textContent = text;
}

function setAdminStatus(text, type='info') {
  els.adminStatus.className = `status ${type}`;
  els.adminStatus.textContent = text;
}

function applyAuthState() {
  const saved = localStorage.getItem('cccd_current_user');
  currentUser = saved ? JSON.parse(saved) : null;
  const loggedIn = !!currentUser;
  if (loggedIn) {
    els.authSection.classList.add('hidden');
    els.userBar.classList.remove('hidden');
    els.cameraSection.classList.remove('hidden');
    els.reviewSection.classList.remove('hidden');
    els.currentUserLabel.textContent = `Đang đăng nhập: ${currentUser.username}${currentUser.role === 'admin' ? ' (admin)' : ''}`;
    els.adminPanel.classList.toggle('hidden', currentUser.role !== 'admin');
  } else {
    els.authSection.classList.remove('hidden');
    els.userBar.classList.add('hidden');
    els.cameraSection.classList.add('hidden');
    els.reviewSection.classList.add('hidden');
    els.adminPanel.classList.add('hidden');
  }
}

function setSaveStatus(text, type='info') {
  els.saveStatus.className = `status ${type}`;
  els.saveStatus.textContent = text;
}

function showSaveOverlay(title, text, type='info') {
  els.saveOverlayCard.className = `save-overlay-card ${type}`;
  els.saveOverlayTitle.textContent = title;
  els.saveOverlayText.textContent = text;
  els.saveOverlay.classList.remove('hidden');
}

function hideSaveOverlay() {
  els.saveOverlay.classList.add('hidden');
}

function setCameraState(state, label, hint) {
  els.guideFrame.classList.remove('state-idle', 'state-warning', 'state-ready');
  els.guideFrame.classList.add(state);
  els.cameraStateLabel.textContent = label;
  els.cameraStateHint.textContent = hint;
}

function setMode(mode) {
  currentMode = mode;
  els.stepQr.classList.toggle('active', mode === 'qr');
  els.stepFront.classList.toggle('active', mode === 'front');
  els.stepBack.classList.toggle('active', mode === 'back');
  els.stepReview.classList.toggle('active', mode === 'review');

  if (mode === 'qr') {
    els.stepTitle.textContent = 'Quét QR';
    els.captureActionBtn.textContent = 'Quét QR';
    els.guideFrame.classList.remove('card-frame');
    els.guideFrame.classList.add('qr-frame');
    setCameraState('state-idle', 'Đưa QR vào khung', 'Tự nhận diện và chuyển bước khi thành công.');
  } else if (mode === 'front') {
    els.stepTitle.textContent = 'Chụp mặt trước';
    els.captureActionBtn.textContent = 'Chụp mặt trước';
    els.guideFrame.classList.remove('qr-frame');
    els.guideFrame.classList.add('card-frame');
    setCameraState('state-warning', 'Căn CCCD mặt trước', 'Đưa mặt trước vào khung rồi bấm chụp.');
  } else if (mode === 'back') {
    els.stepTitle.textContent = 'Chụp mặt sau';
    els.captureActionBtn.textContent = 'Chụp mặt sau';
    els.guideFrame.classList.remove('qr-frame');
    els.guideFrame.classList.add('card-frame');
    setCameraState('state-warning', 'Căn CCCD mặt sau', 'Đưa mặt sau vào khung rồi bấm chụp.');
  } else {
    els.stepTitle.textContent = 'Review thông tin';
    els.captureActionBtn.textContent = 'Chụp lại';
    setCameraState('state-ready', 'Đã chụp xong', 'Kiểm tra thông tin bên dưới rồi bấm Lưu.');
  }
}

async function startCamera() {
  try {
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: useEnvironment ? { ideal: 'environment' } : 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    els.video.srcObject = stream;
    await els.video.play();
    if (currentMode === 'qr') startQrLoop();
  } catch (err) {
    console.error(err);
    const reason = window.isSecureContext
      ? 'Trình duyệt chưa được cấp quyền camera hoặc camera đang bị app khác chiếm.'
      : 'Trình duyệt đang chặn camera vì trang chưa ở secure context (HTTPS hoặc localhost).';
    setStatus(`Không bật được camera. ${reason}`, 'error');
  }
}

function stopCamera() {
  if (scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = null;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function startQrLoop() {
  const loop = async () => {
    if (currentMode !== 'qr' || !els.video.videoWidth) {
      scanLoopId = requestAnimationFrame(loop);
      return;
    }
    const found = await scanQrFromVideoROI();
    if (found?.text) {
      lastQrText = found.text;
      lastQrFrameDataUrl = found.dataUrl;
      await onQrSuccess();
      return;
    }
    setCameraState(found?.visualHint ? 'state-warning' : 'state-idle', found?.visualHint ? 'Đã thấy QR nhưng chưa bắt được' : 'Đang tìm QR', found?.visualHint ? 'Giữ QR ổn định hơn, gần hơn, tránh lóa.' : 'Đưa mã QR vào giữa khung.');
    scanLoopId = requestAnimationFrame(loop);
  };
  if (scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = requestAnimationFrame(loop);
}

async function scanQrFromVideoROI() {
  const video = els.video;
  const canvas = els.captureCanvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const roiRatios = [0.36, 0.44, 0.52];
  const scales = [280, 360, 440];
  const passes = [
    { mode: 'raw' },
    { mode: 'threshold', threshold: 140 },
    { mode: 'threshold', threshold: 160 },
    { mode: 'contrast' },
  ];

  for (const roiRatio of roiRatios) {
    const roiSize = Math.round(Math.min(vw, vh) * roiRatio);
    const sx = Math.round((vw - roiSize) / 2);
    const sy = Math.round((vh - roiSize) / 2);
    for (const target of scales) {
      canvas.width = target;
      canvas.height = target;
      ctx.drawImage(video, sx, sy, roiSize, roiSize, 0, 0, target, target);
      const decoded = tryDecodeVariants(ctx, canvas, passes);
      if (decoded) {
        return { text: decoded, dataUrl: canvas.toDataURL('image/jpeg', 0.82), visualHint: true };
      }
    }
  }

  canvas.width = 260;
  canvas.height = 260;
  const fallbackRoi = Math.round(Math.min(vw, vh) * 0.44);
  ctx.drawImage(video, Math.round((vw - fallbackRoi) / 2), Math.round((vh - fallbackRoi) / 2), fallbackRoi, fallbackRoi, 0, 0, 260, 260);
  const imageData = ctx.getImageData(0, 0, 260, 260);
  const d = imageData.data;
  let contrast = 0;
  for (let y = 2; y < 258; y += 12) {
    for (let x = 2; x < 258; x += 12) {
      const idx = (y * 260 + x) * 4;
      contrast += Math.abs(d[idx] - d[idx + 4]) + Math.abs(d[idx] - d[idx + 260 * 4]);
    }
  }
  return { text: '', dataUrl: '', visualHint: contrast > 9000 };
}

function tryDecodeVariants(ctx, baseCanvas, passes) {
  for (const pass of passes) {
    const imageData = ctx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
    const data = imageData.data;
    if (pass.mode === 'threshold') {
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const v = gray > pass.threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
    } else if (pass.mode === 'contrast') {
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const v = gray > 180 ? 255 : gray < 70 ? 0 : gray;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
    }
    const result = window.jsQR(data, baseCanvas.width, baseCanvas.height);
    if (result?.data) return result.data;
  }
  return '';
}

async function onQrSuccess() {
  if (scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = null;
  els.qrPreview.src = lastQrFrameDataUrl;
  parseQrText(lastQrText);
  setStatus('Đã đọc QR thành công. Chuyển sang chụp mặt trước CCCD.', 'success');
  els.cameraSection.classList.remove('hidden');
  setMode('front');
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
  els.debugOutput.textContent = JSON.stringify({ qr_text: raw, source: 'qr-live' }, null, 2);
}

function captureFullFrameDataUrl(maxWidth = 1280) {
  if (!els.video.videoWidth || !els.video.videoHeight) return '';
  const scale = Math.min(1, maxWidth / els.video.videoWidth);
  const canvas = els.captureCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = Math.round(els.video.videoWidth * scale);
  canvas.height = Math.round(els.video.videoHeight * scale);
  ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
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

function dataUrlToFile(dataUrl, filename) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

function generateQrDataUrlFromText(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 300, 300);
  ctx.fillStyle = '#111';
  ctx.font = '12px sans-serif';
  ctx.fillText('QR regenerated placeholder', 40, 150);
  ctx.fillText((text || '').slice(0, 28), 20, 170);
  return canvas.toDataURL('image/png');
}

function api(path) {
  return `${els.apiBase.value.replace(/\/$/, '')}${path}`;
}

async function runFallbackOcr() {
  const frontSrc = els.frontPreview.src;
  const backSrc = els.backPreview.src;
  if (!frontSrc || !backSrc || !frontSrc.startsWith('data:') || !backSrc.startsWith('data:')) {
    return setSaveStatus('Cần có đủ ảnh mặt trước và mặt sau để chạy OCR fallback.', 'error');
  }
  const formData = new FormData();
  formData.append('front', dataUrlToFile(frontSrc, 'front.jpg'));
  formData.append('back', dataUrlToFile(backSrc, 'back.jpg'));
  if (els.qrPreview.src?.startsWith('data:')) formData.append('qr', dataUrlToFile(els.qrPreview.src, 'qr.jpg'));

  setSaveStatus('Đang chạy OCR fallback...', 'info');
  try {
    const res = await fetch(api('/api/cccd/recognize'), { method: 'POST', body: formData });
    const json = await res.json();
    fillForm(json.data || {});
    els.debugOutput.textContent = JSON.stringify(json, null, 2);
    setSaveStatus('Đã chạy OCR fallback. Kiểm tra lại các trường rồi bấm Lưu.', 'success');
    setMode('review');
  } catch (err) {
    console.error(err);
    setSaveStatus('Không gọi được OCR fallback.', 'error');
  }
}

function fillForm(data) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = data?.[id]?.value || el.value || '';
    if (data?.[id]?.requires_review) {
      el.style.borderColor = '#F59E0B';
      el.style.background = '#FFFBEB';
    }
  });
}

function maybeCompleteCaptureFlow() {
  const hasQr = !!lastQrText;
  const hasFront = !!els.frontPreview.src;
  const hasBack = !!els.backPreview.src;
  if (hasQr && hasFront && hasBack) {
    setMode('review');
    els.cameraSection.classList.add('hidden');
    document.querySelector('.preview-strip')?.classList.add('hidden');
    els.reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('Đã đủ QR và 2 ảnh CCCD đã crop theo khung camera. Vui lòng xác nhận thông tin và bấm Lưu.', 'success');
    setSaveStatus('Sẵn sàng lưu hồ sơ.', 'success');
    stopCamera();
  }
}

function captureGuideFrameDataUrl(outputWidth = 1600) {
  const video = els.video;
  if (!video.videoWidth || !video.videoHeight) return '';
  const videoRect = video.getBoundingClientRect();
  const guideRect = els.guideFrame.getBoundingClientRect();

  const intrinsicW = video.videoWidth;
  const intrinsicH = video.videoHeight;
  const displayW = videoRect.width;
  const displayH = videoRect.height;

  const scale = Math.max(displayW / intrinsicW, displayH / intrinsicH); // object-fit: cover
  const renderedW = intrinsicW * scale;
  const renderedH = intrinsicH * scale;
  const offsetX = (renderedW - displayW) / 2;
  const offsetY = (renderedH - displayH) / 2;

  const gx = guideRect.left - videoRect.left;
  const gy = guideRect.top - videoRect.top;
  const gw = guideRect.width;
  const gh = guideRect.height;

  const sx = Math.max(0, Math.round((gx + offsetX) / scale));
  const sy = Math.max(0, Math.round((gy + offsetY) / scale));
  const sWidth = Math.min(intrinsicW - sx, Math.round(gw / scale));
  const sHeight = Math.min(intrinsicH - sy, Math.round(gh / scale));
  if (sWidth <= 0 || sHeight <= 0) return '';

  const canvas = els.captureCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = outputWidth;
  canvas.height = Math.round(outputWidth / 1.58);
  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.97);
}

function captureCurrentMode() {
  const dataUrl = currentMode === 'front' || currentMode === 'back' ? captureGuideFrameDataUrl() : captureFullFrameDataUrl();
  if (!dataUrl) return setStatus('Camera chưa sẵn sàng.', 'error');
  if (currentMode === 'front') {
    els.frontPreview.src = dataUrl;
    setStatus('Đã chụp mặt trước theo đúng khung camera.', 'success');
    setMode('back');
    return;
  }
  if (currentMode === 'back') {
    els.backPreview.src = dataUrl;
    setStatus('Đã chụp mặt sau theo đúng khung camera.', 'success');
    maybeCompleteCaptureFlow();
    return;
  }
  if (currentMode === 'review') {
    setMode('front');
    els.cameraSection.classList.remove('hidden');
    startCamera();
  }
}

function resetRecordFlow() {
  stopCamera();
  lastQrText = '';
  lastQrFrameDataUrl = '';
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    el.style.borderColor = '';
    el.style.background = '';
  });
  els.qrPreview.src = '';
  els.frontPreview.src = '';
  els.backPreview.src = '';
  document.querySelector('.preview-strip')?.classList.remove('hidden');
  hideSaveOverlay();
  els.cameraSection.classList.remove('hidden');
  setMode('qr');
  setStatus('Bật camera để bắt đầu.', 'info');
  setSaveStatus('Đã làm mới hồ sơ. Sẵn sàng quét QR mới.', 'info');
  startCamera();
}

async function saveRecord() {
  if (isSaving) return;
  const hasQr = !!lastQrText;
  const frontSrc = els.frontPreview.src;
  const backSrc = els.backPreview.src;
  if (!hasQr || !frontSrc || !backSrc || !frontSrc.startsWith('data:') || !backSrc.startsWith('data:')) {
    setSaveStatus('Cần có QR, ảnh mặt trước và ảnh mặt sau trước khi lưu.', 'error');
    return;
  }
  isSaving = true;

  const formData = new FormData();
  formData.append('full_name', document.getElementById('full_name').value.trim());
  formData.append('id_number', document.getElementById('id_number').value.trim());
  formData.append('old_id_number', document.getElementById('old_id_number').value.trim());
  formData.append('date_of_birth', document.getElementById('date_of_birth').value.trim());
  formData.append('gender', document.getElementById('gender').value.trim());
  formData.append('phone_number', document.getElementById('phone_number').value.trim());
  formData.append('occupation', document.getElementById('occupation').value.trim());
  formData.append('issue_date', document.getElementById('issue_date').value.trim());
  formData.append('expiry_date', document.getElementById('expiry_date').value.trim());
  formData.append('issue_place', document.getElementById('issue_place').value.trim());
  formData.append('place_of_origin', document.getElementById('place_of_origin').value.trim());
  formData.append('place_of_residence', document.getElementById('place_of_residence').value.trim());
  formData.append('current_address', document.getElementById('current_address').value.trim());
  formData.append('qr_text', lastQrText);
  formData.append('data_source', 'qr_first');
  formData.append('created_by', currentUser?.username || '');
  formData.append('front_image', dataUrlToFile(frontSrc, 'front.jpg'));
  formData.append('back_image', dataUrlToFile(backSrc, 'back.jpg'));

  els.saveBtn.disabled = true;
  setSaveStatus('Đang lưu hồ sơ vào database local...', 'info');
  showSaveOverlay('Đang lưu hồ sơ…', 'Vui lòng chờ trong giây lát.', 'info');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const endpoint = api('/api/cccd/save-record');
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-store'
    });
    const rawText = await res.text();
    let json = null;
    try { json = rawText ? JSON.parse(rawText) : null; } catch (_) {}
    els.debugOutput.textContent = JSON.stringify({ endpoint, status: res.status, rawText, save_response: json }, null, 2);
    if (!res.ok) throw new Error(json?.detail || json?.message || rawText || `Lưu hồ sơ thất bại (HTTP ${res.status})`);
    const recordId = json?.record_id || 'N/A';
    setSaveStatus(`Đã lưu hồ sơ thành công. Record ID: ${recordId}`, 'success');
    setStatus('Đã lưu hồ sơ thành công.', 'success');
    showSaveOverlay('Lưu thành công', `Record ID: ${recordId}`, 'success');
    setTimeout(hideSaveOverlay, 2200);
  } catch (err) {
    console.error(err);
    const detail = err?.name === 'AbortError'
      ? 'Request save bị timeout sau 15 giây. Nếu hồ sơ vẫn xuất hiện ở web tra cứu thì backend đã lưu nhưng trình duyệt không nhận được phản hồi.'
      : String(err);
    els.debugOutput.textContent = JSON.stringify({ endpoint: api('/api/cccd/save-record'), error: detail }, null, 2);
    setSaveStatus(`Không lưu được hồ sơ: ${detail}`, 'error');
    showSaveOverlay('Lưu thất bại', detail, 'error');
  } finally {
    clearTimeout(timer);
    els.saveBtn.disabled = false;
    isSaving = false;
  }
}

async function login() {
  try {
    const res = await fetch(api('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: els.loginUsername.value.trim(), password: els.loginPassword.value })
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json?.detail || 'Đăng nhập thất bại');
    localStorage.setItem('cccd_current_user', JSON.stringify(json.user));
    applyAuthState();
    setLoginStatus('Đăng nhập thành công.', 'success');
    startCamera();
  } catch (err) {
    setLoginStatus(String(err), 'error');
  }
}

function logout() {
  localStorage.removeItem('cccd_current_user');
  currentUser = null;
  stopCamera();
  applyAuthState();
  setLoginStatus('Đã đăng xuất.', 'info');
}

async function createUser() {
  try {
    const adminPassword = prompt('Nhập lại mật khẩu admin để tạo user:') || '';
    const res = await fetch(api('/api/auth/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_username: currentUser?.username || '',
        admin_password: adminPassword,
        username: els.newUsername.value.trim(),
        password: els.newPassword.value,
        full_name: els.newFullName.value.trim(),
        role: 'user'
      })
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json?.detail || 'Tạo user thất bại');
    setAdminStatus(`Đã tạo user: ${json.username}`, 'success');
    els.newUsername.value = '';
    els.newPassword.value = '';
    els.newFullName.value = '';
  } catch (err) {
    setAdminStatus(String(err), 'error');
  }
}

els.loginBtn.addEventListener('click', login);
els.logoutBtn.addEventListener('click', logout);
els.createUserBtn.addEventListener('click', createUser);
els.startCameraBtn.addEventListener('click', startCamera);
els.switchCameraBtn.addEventListener('click', () => {
  useEnvironment = !useEnvironment;
  startCamera();
});
els.captureActionBtn.addEventListener('click', captureCurrentMode);
els.toggleConfigBtn.addEventListener('click', () => {
  els.configPanel.style.display = els.configPanel.style.display === 'none' ? 'block' : 'none';
});
els.newRecordBtn.addEventListener('click', resetRecordFlow);
els.saveBtn.addEventListener('click', saveRecord);
window.resetRecordFlow = resetRecordFlow;
window.saveRecord = saveRecord;

setMode('qr');
applyAuthState();
if (currentUser) startCamera();
