import { refreshPublicNews, renderHistory, renderHome, renderReport } from './report-view.mjs';

const SESSION_PASSWORD_KEY = 'korea-report-session-password';
const FAILURE_COUNT_KEY = 'korea-report-failure-count';
const LOCK_UNTIL_KEY = 'korea-report-lock-until';
const MAX_FAILURES = 5;
const LOCK_DURATION_MS = 30_000;
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function fromBase64(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid encrypted report envelope');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validateEnvelope(envelope) {
  if (envelope?.version !== 1 || envelope.algorithm !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-HMAC-SHA-256' || envelope.iterations !== ITERATIONS) {
    throw new Error('Unsupported encrypted report envelope');
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new Error('Invalid encrypted report envelope');
  }
  return { salt, iv, ciphertext };
}

export async function unlockEnvelope(envelope, password) {
  if (typeof password !== 'string' || password.length < 12) throw new Error('Invalid password');
  const { salt, iv, ciphertext } = validateEnvelope(envelope);
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}

function showPayload(root, payload) {
  if (payload.kind === 'report') {
    renderReport(root, payload.report);
    void refreshPublicNews(root);
  }
  else if (payload.kind === 'home') renderHome(root, payload);
  else if (payload.kind === 'history') renderHistory(root, payload);
  else throw new Error('Unsupported encrypted content');
}

async function start() {
  const form = document.getElementById('unlock-form');
  const input = document.getElementById('site-password');
  const error = document.getElementById('unlock-error');
  const panel = document.getElementById('unlock-panel');
  const content = document.getElementById('content');
  const button = form.querySelector('button[type="submit"]');
  const payloadUrl = document.body.dataset.payload;
  const response = await fetch(payloadUrl, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Encrypted content unavailable');
  const envelope = await response.json();

  const updateLock = () => {
    const remaining = Number(sessionStorage.getItem(LOCK_UNTIL_KEY) ?? 0) - Date.now();
    button.disabled = remaining > 0;
    if (remaining > 0) error.textContent = `请等待 ${Math.ceil(remaining / 1000)} 秒后重试`;
    return remaining;
  };

  const unlock = async (password) => {
    const payload = await unlockEnvelope(envelope, password);
    sessionStorage.setItem(SESSION_PASSWORD_KEY, password);
    sessionStorage.removeItem(FAILURE_COUNT_KEY);
    sessionStorage.removeItem(LOCK_UNTIL_KEY);
    panel.hidden = true;
    content.hidden = false;
    showPayload(content, payload);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (updateLock() > 0) return;
    error.textContent = '';
    button.disabled = true;
    try {
      await unlock(input.value);
    } catch {
      sessionStorage.removeItem(SESSION_PASSWORD_KEY);
      const failures = Number(sessionStorage.getItem(FAILURE_COUNT_KEY) ?? 0) + 1;
      sessionStorage.setItem(FAILURE_COUNT_KEY, String(failures));
      if (failures >= MAX_FAILURES) {
        sessionStorage.setItem(FAILURE_COUNT_KEY, '0');
        sessionStorage.setItem(LOCK_UNTIL_KEY, String(Date.now() + LOCK_DURATION_MS));
      }
      error.textContent = '密码错误或内容已损坏';
      input.select();
    } finally {
      button.disabled = false;
      updateLock();
    }
  });

  const cachedPassword = sessionStorage.getItem(SESSION_PASSWORD_KEY);
  if (cachedPassword) {
    try {
      await unlock(cachedPassword);
      return;
    } catch {
      sessionStorage.removeItem(SESSION_PASSWORD_KEY);
    }
  }
  updateLock();
  input.focus();
  const timer = window.setInterval(() => {
    if (updateLock() <= 0) window.clearInterval(timer);
  }, 1000);
}

if (typeof document !== 'undefined') {
  start().catch(() => {
    const error = document.getElementById('unlock-error');
    if (error) error.textContent = '加密内容加载失败，请稍后重试';
  });
}
