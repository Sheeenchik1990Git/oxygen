let currentRegEmail = '';
let timerId = null;

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = isError ? 'toast error' : 'toast';
  setTimeout(() => toast.classList.add('hidden'), 3800);
}

// Открытие плавного нижнего меню
function openSheet(mode) {
  document.querySelectorAll('.sheet-step').forEach(el => el.classList.add('hidden'));
  if (mode === 'login') {
    document.getElementById('form-login').classList.remove('hidden');
  } else {
    document.getElementById('form-reg-email').classList.remove('hidden');
  }
  const backdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById('bottom-sheet');
  backdrop.classList.remove('hidden');
  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
    sheet.classList.add('open');
  });
}

function closeSheet() {
  const backdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById('bottom-sheet');
  backdrop.classList.remove('visible');
  sheet.classList.remove('open');
  setTimeout(() => backdrop.classList.add('hidden'), 350);
}

function showSheetStep(stepId) {
  document.querySelectorAll('.sheet-step').forEach(el => el.classList.add('hidden'));
  document.getElementById(stepId).classList.remove('hidden');
}

function enterOxygenHome(email) {
  closeSheet();
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('user-email-label').textContent = email;
  document.getElementById('oxygen-home').classList.remove('hidden');
}

// Таймер повторной отправки кода (60 сек)
function startResendTimer() {
  let left = 60;
  const btn = document.getElementById('resend-code-btn');
  btn.disabled = true;
  btn.innerHTML = `Отправить повторно через <span id="resend-timer">${left}</span>с`;

  clearInterval(timerId);
  timerId = setInterval(() => {
    left--;
    const span = document.getElementById('resend-timer');
    if (span) span.textContent = left;
    if (left <= 0) {
      clearInterval(timerId);
      btn.disabled = false;
      btn.textContent = 'Отправить код повторно';
    }
  }, 1000);
}

// Удобный ввод 6-значного кода по ячейкам
const otpCells = document.querySelectorAll('.otp-cell');
otpCells.forEach((cell, idx) => {
  cell.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    if (e.target.value && idx < otpCells.length - 1) {
      otpCells[idx + 1].focus();
    }
  });
  cell.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && idx > 0) {
      otpCells[idx - 1].focus();
    }
  });
  cell.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
    pasted.split('').forEach((digit, i) => {
      if (otpCells[i]) otpCells[i].value = digit;
    });
    if (pasted.length > 0) {
      otpCells[Math.min(pasted.length, 5)].focus();
    }
  });
});

// Индикатор сложности пароля
document.getElementById('reg-password').addEventListener('input', (e) => {
  const val = e.target.value;
  const fill = document.getElementById('strength-fill');
  let score = Math.min(val.length * 10, 100);
  fill.style.width = `${score}%`;
  fill.style.background = val.length < 8 ? '#f43f5e' : val.length < 11 ? '#38bdf8' : '#2dd4bf';
});

// Шаг 1 регистрации: отправка кода на почту
document.getElementById('form-reg-email').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const email = document.getElementById('reg-email').value.trim();
  btn.disabled = true;
  btn.textContent = 'Отправляем код...';

  try {
    const res = await fetch('/api/register/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, true);
    } else {
      currentRegEmail = email;
      document.getElementById('display-reg-email').textContent = email;
      otpCells.forEach(c => (c.value = ''));
      showSheetStep('form-reg-code');
      otpCells[0].focus();
      startResendTimer();
      showToast(data.message);
    }
  } catch {
    showToast('Ошибка связи с сервером', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Получить код';
  }
});

// Повторная отправка кода
document.getElementById('resend-code-btn').addEventListener('click', async () => {
  const btn = document.getElementById('resend-code-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/register/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentRegEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, true);
      btn.disabled = false;
    } else {
      showToast('Новый код отправлен');
      startResendTimer();
    }
  } catch {
    showToast('Ошибка отправки', true);
    btn.disabled = false;
  }
});

// Шаг 2 регистрации: проверка кода
document.getElementById('form-reg-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = Array.from(otpCells).map(c => c.value).join('');
  if (code.length < 6) {
    showToast('Введите все 6 цифр кода', true);
    return;
  }

  try {
    const res = await fetch('/api/register/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentRegEmail, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, true);
    } else {
      clearInterval(timerId);
      showSheetStep('form-reg-password');
      document.getElementById('reg-password').focus();
    }
  } catch {
    showToast('Ошибка связи с сервером', true);
  }
});

// Шаг 3 регистрации: создание пароля и переход в OxyGen
document.getElementById('form-reg-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('reg-password').value;

  try {
    const res = await fetch('/api/register/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentRegEmail, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, true);
    } else {
      enterOxygenHome(data.email);
    }
  } catch {
    showToast('Ошибка при создании аккаунта', true);
  }
});

// Вход в аккаунт
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, true);
    } else {
      enterOxygenHome(data.email);
    }
  } catch {
    showToast('Ошибка связи с сервером', true);
  }
});

// Выход
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  document.getElementById('oxygen-home').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
});

// Проверка сессии при открытии
(async function init() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      enterOxygenHome(data.email);
    }
  } catch {}
})();
