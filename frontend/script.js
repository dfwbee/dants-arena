const cursorDot = document.querySelector('.cursor, .cursor-dot');
const cursorRing = document.querySelector('.cursor-ring');

if (cursorDot && cursorRing) {
  document.body.classList.add('has-custom-cursor');
} else {
  document.body.classList.remove('has-custom-cursor');
}

window.addEventListener('mousemove', (e) => {
  if (cursorDot) {
    cursorDot.style.left = e.clientX + 'px';
    cursorDot.style.top = e.clientY + 'px';
  }
  if (cursorRing) {
    cursorRing.style.left = e.clientX + 'px';
    cursorRing.style.top = e.clientY + 'px';
  }
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');
if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => navMenu.classList.toggle('open'));
}

function openModal(type) {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('open');
  showForm(type);
}

function closeModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('open');
}

function showForm(type) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const legacyLogin = document.getElementById('modal-login');
  const legacySignup = document.getElementById('modal-signup');
  const loginTab = document.querySelector('[data-tab="login"]');
  const signupTab = document.querySelector('[data-tab="signup"]');
  if (type === 'login') {
    if (loginForm) loginForm.style.display = 'flex';
    if (signupForm) signupForm.style.display = 'none';
    if (legacyLogin) legacyLogin.style.display = 'block';
    if (legacySignup) legacySignup.style.display = 'none';
    if (loginTab) loginTab.classList.add('active');
    if (signupTab) signupTab.classList.remove('active');
  } else {
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'flex';
    if (legacyLogin) legacyLogin.style.display = 'none';
    if (legacySignup) legacySignup.style.display = 'block';
    if (loginTab) loginTab.classList.remove('active');
    if (signupTab) signupTab.classList.add('active');
  }
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('auth-modal');
  if (modal && e.target === modal) closeModal();
});

document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => showForm(tab.dataset.tab));
});

function initPasswordToggles() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.passwordToggleReady === 'true') return;

    const wrapper = document.createElement('div');
    wrapper.className = 'password-field';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.dataset.passwordToggle = 'true';
    button.setAttribute('aria-label', 'Show password');
    button.textContent = 'Show';
    button.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show' : 'Hide';
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });

    wrapper.appendChild(button);
    input.dataset.passwordToggleReady = 'true';
  });
}

initPasswordToggles();

function setupLegacyAuthModal() {
  const legacyOverlay = document.getElementById('modal-overlay');
  const legacyLogin = document.getElementById('modal-login');
  const legacySignup = document.getElementById('modal-signup');
  const modernOverlay = document.getElementById('auth-modal');

  if (!legacyOverlay || !legacyLogin || !legacySignup || modernOverlay) return;

  legacyOverlay.id = 'auth-modal';

  const loginLabels = legacyLogin.querySelectorAll('label');
  const loginInputs = legacyLogin.querySelectorAll('input');
  const loginButton = legacyLogin.querySelector('button.btn');
  if (loginLabels[0]) loginLabels[0].textContent = 'Username or Email';
  if (loginInputs[0]) {
    loginInputs[0].id = 'login-email';
    loginInputs[0].type = 'text';
    loginInputs[0].placeholder = 'yourname or you@email.com';
    loginInputs[0].required = true;
  }
  if (loginInputs[1]) {
    loginInputs[1].id = 'login-password';
    loginInputs[1].required = true;
  }
  if (loginButton) {
    loginButton.onclick = null;
    loginButton.addEventListener('click', (e) => handleLogin({
      preventDefault() {},
      target: legacyLogin
    }));
  }

  const signupRows = legacySignup.querySelectorAll('.form-row');
  const signupInputs = legacySignup.querySelectorAll('input');
  const signupButton = legacySignup.querySelector('button.btn');

  if (signupInputs[0]) signupInputs[0].id = 'signup-firstname';
  if (signupInputs[1]) signupInputs[1].id = 'signup-lastname';
  if (signupInputs[2]) signupInputs[2].id = 'signup-email';
  if (signupInputs[3]) signupInputs[3].id = 'signup-phone';
  if (signupInputs[4]) signupInputs[4].id = 'signup-password';
  signupInputs.forEach((input) => { input.required = true; });
  if (signupInputs[3]) signupInputs[3].required = false;

  if (!legacySignup.querySelector('#signup-username') && signupRows[0]) {
    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = 'Username';
    const usernameInput = document.createElement('input');
    usernameInput.id = 'signup-username';
    usernameInput.type = 'text';
    usernameInput.placeholder = 'tunde.ade';
    usernameInput.required = true;
    signupRows[0].insertAdjacentElement('afterend', usernameLabel);
    usernameLabel.insertAdjacentElement('afterend', usernameInput);
  }

  if (!legacySignup.querySelector('#signup-confirm') && signupInputs[4]) {
    const confirmLabel = document.createElement('label');
    confirmLabel.textContent = 'Confirm Password';
    const confirmInput = document.createElement('input');
    confirmInput.id = 'signup-confirm';
    confirmInput.type = 'password';
    confirmInput.placeholder = 'Repeat your password';
    confirmInput.required = true;
    signupInputs[4].insertAdjacentElement('afterend', confirmLabel);
    confirmLabel.insertAdjacentElement('afterend', confirmInput);
  }

  if (signupButton) {
    signupButton.onclick = null;
    signupButton.addEventListener('click', () => handleSignup({
      preventDefault() {},
      target: legacySignup
    }));
  }

  initPasswordToggles();
}

setupLegacyAuthModal();

function showToast(message, duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

async function handleResendVerification(email) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    showToast('Enter your email address first so we can resend the verification link.');
    return;
  }

  const result = await resendVerificationEmail(normalizedEmail);
  if (result && result.success) {
    showToast(result.message || 'Verification email sent.');
  }
}

async function handleLogin(e) {
  if (!e || typeof e.preventDefault !== 'function' || !e.target) {
    openModal('login');
    return;
  }
  e.preventDefault();
  const identifier = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button.btn');
  if (!identifier || !password) {
    showToast('Please enter your username or email and password.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  const result = await loginUser(identifier, password);
  btn.disabled = false;
  btn.textContent = 'Log In ->';
  if (result && result.success) {
    closeModal();
    if (typeof syncAuthUI === 'function') syncAuthUI();
    else updateNav();
    showToast(`Welcome back, ${result.user.firstName}!`);
    setTimeout(() => {
      if (typeof redirectAfterAuth === 'function') redirectAfterAuth();
      else window.location.href = 'dashboard.html';
    }, 1200);
    return;
  }

  if (result && result.requiresVerification && result.email) {
    const resendLink = document.getElementById('resend-verification-link');
    if (resendLink) resendLink.dataset.email = result.email;
  }
}

async function handleSignup(e) {
  if (!e || typeof e.preventDefault !== 'function' || !e.target) {
    openModal('signup');
    return;
  }
  e.preventDefault();
  const firstName = document.getElementById('signup-firstname').value.trim();
  const lastName = document.getElementById('signup-lastname').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  const btn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('button.btn');

  if (!firstName || !lastName || !username || !email || !password) {
    showToast('Please fill in all required fields.');
    return;
  }
  if (!/^[a-z0-9._-]{3,20}$/i.test(username)) {
    showToast('Username must be 3-20 characters and use only letters, numbers, dots, underscores, or hyphens.');
    return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showToast('Passwords do not match.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  const result = await registerUser(firstName, lastName, username, email, phone, password);
  btn.disabled = false;
  btn.textContent = 'Create Account ->';
  if (result && result.success) {
    const resendLink = document.getElementById('resend-verification-link');
    if (resendLink && result.email) resendLink.dataset.email = result.email;

    const loginIdentifier = document.getElementById('login-email');
    if (loginIdentifier) loginIdentifier.value = result.email || email;

    showForm('login');
    closeModal();
    showToast(result.message || `Verification email sent to ${email}.`);
  }
}

const loginFormEl = document.getElementById('login-form');
const signupFormEl = document.getElementById('signup-form');
if (loginFormEl) loginFormEl.addEventListener('submit', handleLogin);
if (signupFormEl) signupFormEl.addEventListener('submit', handleSignup);

document.querySelectorAll('[data-resend-verification]').forEach((link) => {
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    const storedEmail = link.dataset.email;
    const currentIdentifier = document.getElementById('login-email')?.value || '';
    await handleResendVerification(storedEmail || currentIdentifier);
  });
});
