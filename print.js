const API_BASE = 'http://192.168.1.161:8010';
const statusEl = document.getElementById('printStatus');
const rootEl = document.getElementById('printRoot');

function api(path){return `${API_BASE}${path}`;}
function esc(v){return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function formatDateTime(v){if(!v) return ''; return String(v).replace('T',' ').slice(0,16);}
function qs(name){return new URLSearchParams(location.search).get(name) || '';}

function loadImage(url){
  return new Promise((resolve,reject)=>{
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.blob();
      })
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => reject(new Error(`Image decode failed: ${url}`));
        img.src = objectUrl;
      })
      .catch(reject);
  });
}

function enhanceCardImage(img, mode='card'){
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  canvas.width = mode === 'card' ? 1100 : 900;
  canvas.height = mode === 'card' ? 700 : 900;
  ctx.drawImage(img, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const contrast = mode === 'card' ? 1.28 : 1.18;
  const brightness = mode === 'card' ? 10 : 8;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, ((d[i] - 128) * contrast) + 128 + brightness));
    d[i+1] = Math.max(0, Math.min(255, ((d[i+1] - 128) * contrast) + 128 + brightness));
    d[i+2] = Math.max(0, Math.min(255, ((d[i+2] - 128) * contrast) + 128 + brightness));
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function waitForImages(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map((img) => new Promise((resolve) => {
    if (img.complete && img.naturalWidth > 0) return resolve(true);
    const done = () => resolve(true);
    img.onload = done;
    img.onerror = done;
  })));
}

async function boot(){
  const recordId = qs('id');
  if (!recordId) {
    statusEl.textContent = 'Thiếu mã hồ sơ để in.';
    return;
  }
  try {
    const res = await fetch(api(`/api/cccd/records/${encodeURIComponent(recordId)}`));
    const json = await res.json();
    if (!res.ok || !json.success || !json.item) throw new Error(json?.detail || 'Không tải được hồ sơ.');
    const item = json.item;
    const errors = [];
    const [frontSrc, backSrc, qrSrc] = await Promise.all([
      item.front_image_url ? loadImage(item.front_image_url).then(img => enhanceCardImage(img, 'card')).catch((e)=>{ errors.push(`Mặt trước: ${e.message}`); return item.front_image_url; }) : Promise.resolve(''),
      item.back_image_url ? loadImage(item.back_image_url).then(img => enhanceCardImage(img, 'card')).catch((e)=>{ errors.push(`Mặt sau: ${e.message}`); return item.back_image_url; }) : Promise.resolve(''),
      (item.generated_qr_image_url || item.qr_image_url) ? Promise.resolve(item.generated_qr_image_url || item.qr_image_url) : Promise.resolve('')
    ]);
    if (!frontSrc && !backSrc && !qrSrc) throw new Error(`Không chuẩn bị được ảnh để in A4. ${errors.join(' | ')}`.trim());
    rootEl.innerHTML = `
      <div class="print-root">
        <div class="print-sheet">
          <div class="print-header">
            <div class="print-meta">
              <h1>Thông tin khách hàng</h1>
              <div><strong>Họ tên:</strong> ${esc(item.full_name)}</div>
              <div><strong>CCCD:</strong> ${esc(item.id_number)}</div>
              <div><strong>Ngày sinh:</strong> ${esc(item.date_of_birth)}</div>
              <div><strong>Giới tính:</strong> ${esc(item.gender)}</div>
              <div><strong>Ngày cấp CCCD:</strong> ${esc(item.issue_date || '')}</div>
              <div><strong>Ngày thu thập:</strong> ${esc(formatDateTime(item.created_at))}</div>
            </div>
            <div class="print-qr-top">${qrSrc ? `<img src="${qrSrc}">` : '<div class="muted">Không có ảnh QR</div>'}</div>
          </div>
          <div class="print-grid">
            <div class="print-card">${frontSrc ? `<img src="${frontSrc}">` : '<div class="muted">Không có ảnh mặt trước</div>'}</div>
            <div class="print-card">${backSrc ? `<img src="${backSrc}">` : '<div class="muted">Không có ảnh mặt sau</div>'}</div>
          </div>
        </div>
      </div>
    `;
    await waitForImages(rootEl);
    statusEl.remove();
    window.addEventListener('load', () => setTimeout(() => window.print(), 50));
    setTimeout(() => window.print(), 150);
  } catch (e) {
    statusEl.textContent = String(e);
  }
}

boot();
