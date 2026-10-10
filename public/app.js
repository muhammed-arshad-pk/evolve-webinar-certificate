// ===== Settings =====
const CONFIG = {
  webinarDate: '10 October 2026',          // <-- fixed date printed on every certificate
  template: 'assets/certificate.jpeg',
  fileName: 'Evolve-Webinar-Certificate',
  scale: 3,                                 // render at 3x the template size for sharper text

  // Positions measured on the 1001 x 713 template (pixels).
  name: { x: 530, y: 329, maxWidth: 296, size: 28, minSize: 13,
          font: 'italic 600 {size}px "Playfair Display", Georgia, serif', color: '#3d1a5c' },
  date: { x: 788, y: 457, maxWidth: 168, size: 17, minSize: 11,
          font: 'bold {size}px Arial, Helvetica, sans-serif', color: '#1f1a24' },
};

// ===== Star ratings =====
const ratings = {};
document.querySelectorAll('.rating-row').forEach((row) => {
  const field = row.dataset.field;
  const box = row.querySelector('.stars');
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star';
    star.textContent = '★';
    star.setAttribute('role', 'radio');
    star.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
    star.addEventListener('click', () => {
      ratings[field] = i;
      row.classList.remove('invalid');
      box.querySelectorAll('.star').forEach((s, idx) => {
        s.classList.toggle('on', idx < i);
        s.setAttribute('aria-checked', String(idx + 1 === i));
      });
    });
    box.appendChild(star);
  }
});

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

// "priya sharma" / "PRIYA SHARMA" -> "Priya Sharma"; mixed-case input is left as typed.
function tidyName(raw) {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

// ===== Feedback submit =====
const form = $('#feedback-form');
const formError = $('#form-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(formError, '');
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));

  const data = Object.fromEntries(new FormData(form));
  data.name = tidyName(data.name || '');
  Object.assign(data, ratings);

  // client-side validation
  let firstBad = null;
  const flag = (el) => { el.classList.add('invalid'); firstBad ??= el; };
  if (data.name.length < 2) flag(form.name);
  if (!form.email.checkValidity() || !data.email) flag(form.email);
  document.querySelectorAll('.rating-row').forEach((row) => { if (!ratings[row.dataset.field]) flag(row); });
  if (!data.recommend) flag(form.querySelector('.recommend'));
  if (firstBad) {
    showError(formError, 'Please fill in the highlighted fields.');
    firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = $('#submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'Something went wrong.');
    await showCertificate(out.name);
  } catch (err) {
    showError(formError, err.message || 'Could not submit. Please check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Submit &amp; Get Certificate';
  }
});

// ===== Returning participant lookup =====
$('#lookup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#lookup-error');
  showError(errEl, '');
  const email = e.target.email.value.trim();
  try {
    const res = await fetch('/api/certificate?email=' + encodeURIComponent(email));
    const out = await res.json();
    if (!out.ok) throw new Error(out.error);
    await showCertificate(out.name);
  } catch (err) {
    showError(errEl, err.message || 'Could not find your certificate.');
  }
});

// ===== Certificate rendering =====
let templateImg = null;
function loadTemplate() {
  if (templateImg) return Promise.resolve(templateImg);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve((templateImg = img));
    img.onerror = () => reject(new Error('Could not load the certificate template.'));
    img.src = CONFIG.template;
  });
}

function drawFitted(ctx, text, spec, s) {
  let size = spec.size;
  const fontAt = (px) => spec.font.replace('{size}', px * s);
  ctx.font = fontAt(size);
  while (ctx.measureText(text).width > spec.maxWidth * s && size > spec.minSize) {
    size -= 0.5;
    ctx.font = fontAt(size);
  }
  ctx.fillStyle = spec.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, spec.x * s, spec.y * s, spec.maxWidth * s);
}

async function renderCertificate(name) {
  const img = await loadTemplate();
  await Promise.all([
    document.fonts.load(CONFIG.name.font.replace('{size}', 40)),
    document.fonts.load(CONFIG.date.font.replace('{size}', 20)),
  ]).catch(() => {});

  const s = CONFIG.scale;
  const canvas = $('#cert-canvas');
  canvas.width = img.naturalWidth * s;
  canvas.height = img.naturalHeight * s;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  drawFitted(ctx, name, CONFIG.name, s);
  drawFitted(ctx, CONFIG.webinarDate, CONFIG.date, s);
  return canvas;
}

let currentName = '';
async function showCertificate(name) {
  currentName = name;
  await renderCertificate(name);
  $('#thanks-name').textContent = name;
  $('#form-section').hidden = true;
  $('#cert-section').hidden = false;
  window.scrollTo({ top: $('#cert-section').offsetTop - 20, behavior: 'smooth' });
}

function safeFileName() {
  const slug = currentName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `${CONFIG.fileName}-${slug || 'Participant'}`;
}

$('#download-pdf').addEventListener('click', () => {
  const canvas = $('#cert-canvas');
  const w = canvas.width / CONFIG.scale;
  const h = canvas.height / CONFIG.scale;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [w, h], hotfixes: ['px_scaling'] });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h);
  pdf.save(safeFileName() + '.pdf');
});

$('#download-png').addEventListener('click', () => {
  $('#cert-canvas').toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeFileName() + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
});
