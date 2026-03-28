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
};

let latestResponse = null;

function setStatus(text, type='info') {
  els.statusBanner.className = `status ${type}`;
  els.statusBanner.textContent = text;
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

els.analyzeBtn.addEventListener('click', async () => {
  const front = els.frontInput.files?.[0];
  const back = els.backInput.files?.[0];
  const qr = els.qrInput.files?.[0];
  if (!front || !back) {
    setStatus('Cần chọn ít nhất ảnh mặt trước và mặt sau.', 'error');
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
    setStatus('Không gọi được backend API. Kiểm tra API base và server local.', 'error');
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
