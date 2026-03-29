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
  stepTitle: document.getElementById('stepTitle'),
  stepQr: document.getElementById('stepQr'),
  stepImages: document.getElementById('stepImages'),
  stepReview: document.getElementById('stepReview'),
  qrActions: document.getElementById('qrActions'),
};

let latestResponse = null;
let latestQrText = '';
let stream = null;
let useEnvironment = true;
let scanLoopId = null;
let lastQrFrameDataUrl = '';
let currentStep = 'qr';
let lastScanAt = 0;
let lastState = 'idle';
let qrStableHits = 0;
let lastQrCandidate = '';

function setStatus(text, type='info') {
  els.statusBanner.className = `status ${type}`;
  els.statusBanner.textContent = text;
}

function setCameraState(state, label, hint) {
  if (lastState === state && els.cameraStateLabel.textContent === label && els.cameraStateHint.textContent === hint) return;
  lastState = state;
  els.guideFrame.classList.remove('state-idle', 'state-warning', 'state-ready');
  els.guideFrame.classList.add(state);
  els.cameraStateLabel.textContent = label;
  els.cameraStateHint.textContent = hint;
}

function setStep(step) {
  currentStep = step;
  els.stepQr.classList.toggle('active', step === 'qr');
  els.stepImages.classList.toggle('active', step === 'images');
  els.stepReview.classList.toggle('active', step === 'review');
  els.stepTitle.textContent = step === 'qr' ? 'Quét QR CCCD' : step === 'images' ? 'Chụp mặt trước / mặt sau' : 'Review dữ liệu';
  els.qrActions.style.display = step === 'qr' ? 'grid' : 'none';
}

async function startCamera() {
  try {
    stopCamera();
    latestQrText = '';
    lastQrFrameDataUrl = '';
    qrStableHits = 0;
    lastQrCandidate = '';

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

    if (currentStep === 'qr') {
      setCameraState('state-idle', 'Đưa QR vào khung', 'Hệ thống đang scan nhiều biến thể trong vùng khung.');
      startLiveQrDetection();
    } else {
      setCameraState('state-warning', 'Sẵn sàng chụp ảnh CCCD', 'Đưa CCCD vào khung rồi bấm chụp mặt trước hoặc mặt sau.');
    }
  } catch (err) {
    console.error(err);
    setStatus('Không bật được camera.', 'error');
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

function startLiveQrDetection() {
  const scan = async () => {
    if (currentStep !== 'qr' || !els.video.videoWidth) {
      scanLoopId = requestAnimationFrame(scan);
      return;
    }

    const now = performance.now();
    if (now - lastScanAt > 45) {
      lastScanAt = now;
      const qr = await scanQrFromVideoROI();
      if (qr?.text) {
        if (qr.text === lastQrCandidate) qrStableHits += 1;
        else {
          lastQrCandidate = qr.text;
          qrStableHits = 1;
        }

        setCameraState('state-ready', 'Đã bắt được QR', 'Đang xác nhận dữ liệu QR...');
        if (qrStableHits >= 1) {
          latestQrText = qr.text;
          lastQrFrameDataUrl = qr.dataUrl;
          await finalizeQrSuccess();
          return;
        }
      } else {
        qrStableHits = 0;
        lastQrCandidate = '';
        if (qr?.visualHint) {
          setCameraState('state-warning', 'Đã thấy QR nhưng chưa bắt được', 'Giữ QR ổn định hơn, gần hơn, tránh lóa.');
        } else {
          setCameraState('state-idle', 'Đang tìm QR', 'Đưa mã QR vào giữa khung vuông.');
        }
      }
    }
    scanLoopId = requestAnimationFrame(scan);
  };
  if (scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = requestAnimationFrame(scan);
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

async function scanQrFromVideoROI() {
  const video = els.video;
  const canvas = els.captureCanvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const roiRatios = [0.34, 0.42, 0.5];
  const scales = [260, 340, 420];
  const passes = [
    { mode: 'raw' },
    { mode: 'threshold', threshold: 135 },
    { mode: 'threshold', threshold: 155 },
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
        return {
          text: decoded,
          dataUrl: canvas.toDataURL('image/jpeg', 0.8),
          visualHint: true,
        };
      }
    }
  }

  canvas.width = 260;
  canvas.height = 260;
  const fallbackRoi = Math.round(Math.min(vw, vh) * 0.42);
  ctx.drawImage(video, Math.round((vw - fallbackRoi) / 2), Math.round((vh - fallbackRoi) / 2), fallbackRoi, fallbackRoi, 0, 0, 260, 260);
  const imageData = ctx.getImageData(0, 0, 260, 260);
  let contrast = 0;
  const d = imageData.data;
  for (let y = 2; y < 258; y += 12) {
    for (let x = 2; x < 258; x += 12) {
      const idx = (y * 260 + x) * 4;
      contrast += Math.abs(d[idx] - d[idx + 4]) + Math.abs(d[idx] - d[idx + 260 * 4]);
    }
  }
  return { text: '', dataUrl: '', visualHint: contrast > 9000 };
}

async function finalizeQrSuccess() {
  if (!latestQrText) return;
  if (scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = null;
  els.qrPreview.src = lastQrFrameDataUrl;
  parseQrText(latestQrText);
  latestResponse = { qr_text: latestQrText, source: 'live-scan' };
  els.debugOutput.textContent = JSON.stringify({ qr_text: latestQrText, source: 'live-scan' }, null, 2);
  setCameraState('state-ready', 'Đã nhận QR', 'Dữ liệu đã được điền. Chuyển sang chụp mặt trước/mặt sau.');
  setStatus('Đã đọc QR thành công. Mời chụp mặt trước/mặt sau CCCD.', 'success');
  setStep('images');
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

function decodeQrFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 560;
      const scale = Math.min(1, max / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const decoded = tryDecodeVariants(ctx, canvas, [
        { mode: 'raw' },
        { mode: 'threshold', threshold: 140 },
        { mode: 'threshold', threshold: 160 },
        { mode: 'contrast' },
      ]);
      resolve(decoded || '');
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
    setStatus('Chưa đọc được QR. Thử lại với QR rõ hơn.', 'error');
    setCameraState('state-warning', 'Ảnh QR chưa đọc được', 'Thử lại với QR lớn hơn, nét hơn, ít lóa hơn.');
    return;
  }
  lastQrFrameDataUrl = dataUrl;
  await finalizeQrSuccess();
}

async function runFallbackOcr() {
  const frontSrc = els.frontPreview.src;
  const backSrc = els.backPreview.src;
  if (!frontSrc || !backSrc || !frontSrc.startsWith('data:') || !backSrc.startsWith('data:')) {
    setStatus('Cần có ảnh mặt trước và mặt sau chụp từ camera để chạy OCR fallback.', 'error');
    return;
  }
  const frontFile = dataUrlToFile(frontSrc, 'front.jpg');
  const backFile = dataUrlToFile(backSrc, 'back.jpg');
  const formData = new FormData();
  formData.append('front', frontFile);
  formData.append('back', backFile);
  if (els.qrPreview.src?.startsWith('data:')) {
    formData.append('qr', dataUrlToFile(els.qrPreview.src, 'qr.jpg'));
  }
  setStatus('Đang chạy OCR fallback...', 'info');
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
    setStep('review');
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
  if (latestQrText && lastQrFrameDataUrl) return finalizeQrSuccess();
  const dataUrl = captureFullFrameDataUrl(900);
  if (!dataUrl) return setStatus('Camera chưa sẵn sàng.', 'error');
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
  const dataUrl = captureFullFrameDataUrl();
  if (!dataUrl) return setStatus('Camera chưa sẵn sàng.', 'error');
  els.frontPreview.src = dataUrl;
  setStatus('Đã chụp mặt trước.', 'success');
});
els.captureBackBtn.addEventListener('click', () => {
  const dataUrl = captureFullFrameDataUrl();
  if (!dataUrl) return setStatus('Camera chưa sẵn sàng.', 'error');
  els.backPreview.src = dataUrl;
  setStatus('Đã chụp mặt sau.', 'success');
});
els.multiImageInput.addEventListener('change', () => {
  const files = Array.from(els.multiImageInput.files || []);
  if (files[0]) els.frontPreview.src = URL.createObjectURL(files[0]);
  if (files[1]) els.backPreview.src = URL.createObjectURL(files[1]);
  setStatus('Đã nạp ảnh mặt trước/mặt sau.', 'success');
  setStep('images');
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

setStep('qr');
