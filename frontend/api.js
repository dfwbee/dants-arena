const API_URL = 'http://localhost:5000/api';
const LOGIN_PAGE = 'login.html';
const PUBLIC_HOME_PAGE = 'index.html';
const DEFAULT_AUTHENTICATED_PAGE = 'dashboard.html';
const AUTH_REQUIRED_PAGES = new Set(['dashboard.html', 'dashboard']);

function saveToken(token) { localStorage.setItem('dantsToken', token); }
function saveUser(user)   { localStorage.setItem('dantsUser', JSON.stringify(user)); }
function getToken()       { return localStorage.getItem('dantsToken'); }
function getUser()        { try { return JSON.parse(localStorage.getItem('dantsUser')); } catch(e) { return null; } }
function clearAuth()      { localStorage.removeItem('dantsToken'); localStorage.removeItem('dantsUser'); }
function isLoggedIn()     { return !!getToken(); }

function getCurrentPage() {
  const path = window.location.pathname.split('/').pop();
  return path || 'index.html';
}

function getPostAuthDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return DEFAULT_AUTHENTICATED_PAGE;
  try {
    const decoded = decodeURIComponent(next);
    if (!decoded || decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('//')) {
      return DEFAULT_AUTHENTICATED_PAGE;
    }
    return decoded;
  } catch (error) {
    return DEFAULT_AUTHENTICATED_PAGE;
  }
}

function redirectToLogin() {
  const currentPage = getCurrentPage();
  if (currentPage === LOGIN_PAGE) return;

  const next = `${currentPage}${window.location.search || ''}${window.location.hash || ''}`;
  window.location.replace(`${LOGIN_PAGE}?next=${encodeURIComponent(next)}`);
}

function redirectAfterAuth() {
  window.location.replace(getPostAuthDestination());
}

function setActionTarget(element, destination, label) {
  if (!element) return;
  if (label) element.textContent = label;
  if (element.tagName === 'A') {
    element.removeAttribute('onclick');
    element.setAttribute('href', destination);
    return;
  }
  element.setAttribute('onclick', `window.location.href='${destination}'`);
}

function updateAuthCtas() {
  const loggedIn = isLoggedIn();

  document.querySelectorAll('button[onclick*="openModal(\'signup\')"], a[onclick*="openModal(\'signup\')"]').forEach((element) => {
    if (!loggedIn) return;

    const text = (element.textContent || '').trim().toLowerCase();
    if (text.includes('book a pitch') || text.includes('get started')) {
      setActionTarget(element, 'booking.html', 'Book a Pitch ->');
      return;
    }

    if (text.includes('join now')) {
      setActionTarget(element, 'dashboard.html', 'My Dashboard');
      return;
    }

    setActionTarget(element, 'dashboard.html', 'Go to Dashboard');
  });

  document.querySelectorAll('button[onclick*="openModal(\'login\')"], a[onclick*="openModal(\'login\')"]').forEach((element) => {
    if (!loggedIn) return;
    setActionTarget(element, 'dashboard.html', 'My Dashboard');
  });

  document.querySelectorAll('.modal-footer-text a').forEach((link) => {
    if (!loggedIn) return;

    const text = (link.textContent || '').trim().toLowerCase();
    if (text.includes('create')) {
      setActionTarget(link, 'dashboard.html', 'Go to dashboard');
    } else if (text.includes('log in')) {
      setActionTarget(link, 'dashboard.html', 'Open dashboard');
    }
  });

  document.querySelectorAll('.btn-group .btn-ghost, .cta-band .btn-ghost').forEach((element) => {
    const text = (element.textContent || '').trim().toLowerCase();
    if (!text.includes('membership')) return;
    setActionTarget(element, 'membership.html');
  });
}

function updateDashboardLinksVisibility() {
  const loggedIn = isLoggedIn();

  document.querySelectorAll('a[href="dashboard.html"]').forEach((link) => {
    const navItem = link.closest('li');

    if (navItem && navItem.parentElement && navItem.parentElement.classList.contains('nav-links')) {
      navItem.style.display = loggedIn ? '' : 'none';
      return;
    }

    if (link.closest('.nav-actions')) {
      return;
    }

    link.style.display = loggedIn ? '' : 'none';
  });
}

function syncAuthUI() {
  updateNav();
  updateAuthCtas();
  updateDashboardLinksVisibility();
}

async function apiRequest(endpoint, method = 'GET', body = null, requiresAuth = false) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (requiresAuth) {
      const token = getToken();
      if (!token) {
        if (typeof openModal === 'function') openModal('login');
        else redirectToLogin();
        return null;
      }
      headers['Authorization'] = `Bearer ${token}`;
    }
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();
    if (!response.ok) {
      if (typeof showToast === 'function') showToast(`❌ ${data.message || 'Something went wrong.'}`);
      return { ...data, success: false };
    }
    return data;
  } catch (error) {
    console.error('API error:', error);
    if (typeof showToast === 'function') showToast('❌ Cannot reach server. Make sure backend is running.');
    return null;
  }
}

async function loginUser(identifier, password) {
  const data = await apiRequest('/auth/login', 'POST', { identifier, password });
  if (data && data.success) { saveToken(data.token); saveUser(data.user); return data; }
  return data;
}

async function registerUser(firstName, lastName, username, email, phone, password) {
  const data = await apiRequest('/auth/register', 'POST', { firstName, lastName, username, email, phone, password });
  if (data && data.success && data.token && data.user) { saveToken(data.token); saveUser(data.user); }
  return data;
}

async function verifyEmailToken(token) {
  return await apiRequest('/auth/verify-email', 'POST', { token });
}

async function resendVerificationEmail(email) {
  return await apiRequest('/auth/resend-verification', 'POST', { email });
}

async function getMyQrCode() {
  return await apiRequest('/auth/qr-code', 'GET', null, true);
}

async function verifyQrCode(token) {
  return await apiRequest('/auth/verify-qr', 'POST', { token }, true);
}

async function getAllUsersAdmin(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return await apiRequest(`/auth/users${query}`, 'GET', null, true);
}

async function updateUserAdmin(userId, updates) {
  return await apiRequest(`/auth/users/${userId}`, 'PUT', updates, true);
}

async function getQrCheckinsAdmin() {
  return await apiRequest('/auth/qr-checkins', 'GET', null, true);
}

function logoutUser() {
  clearAuth();
  if (typeof showToast === 'function') showToast('👋 Logged out successfully.');
  setTimeout(() => { window.location.href = PUBLIC_HOME_PAGE; }, 1000);
}

async function getMyProfile() { return await apiRequest('/auth/me', 'GET', null, true); }

async function updateProfile(updates) {
  const data = await apiRequest('/auth/update', 'PUT', updates, true);
  if (data && data.success) { saveUser(data.user); if (typeof showToast === 'function') showToast('✅ Profile updated!'); }
  return data;
}

async function getAvailableSlots(date, facility) {
  const f = encodeURIComponent(facility || 'Football Pitch (5-A-Side)');
  return await apiRequest(`/bookings/slots?date=${date}&facility=${f}`);
}

async function createBooking(bookingData) {
  const data = await apiRequest('/bookings/create', 'POST', bookingData, true);
  if (data && data.success && typeof showToast === 'function') showToast(`✅ Booking confirmed! ID: ${data.booking.bookingId}`);
  return data;
}

async function getMyBookings() { return await apiRequest('/bookings/my', 'GET', null, true); }

async function getAllBookingsAdmin(filters = {}) {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.status) params.set('status', filters.status);
  if (filters.facility) params.set('facility', filters.facility);
  const query = params.toString();
  return await apiRequest(`/bookings/all${query ? `?${query}` : ''}`, 'GET', null, true);
}

async function rescheduleBooking(bookingId, bookingData) {
  return await apiRequest(`/bookings/reschedule/${bookingId}`, 'PUT', bookingData, true);
}

async function cancelBooking(bookingId) {
  const data = await apiRequest(`/bookings/cancel/${bookingId}`, 'PUT', null, true);
  if (data && data.success && typeof showToast === 'function') showToast('✅ Booking cancelled.');
  return data;
}

async function getMembershipPlans() { return await apiRequest('/membership/plans'); }
async function getMembershipStatus() { return await apiRequest('/membership/status', 'GET', null, true); }

async function subscribeToPlan(plan) {
  const data = await apiRequest('/membership/subscribe', 'POST', { plan }, true);
  if (data && data.success) {
    if (typeof showToast === 'function') showToast('💳 Redirecting to payment...');
    setTimeout(() => { window.location.href = data.authorizationUrl; }, 1500);
  }
  return data;
}

async function verifyMembershipPayment(reference) {
  const data = await apiRequest('/membership/verify-payment', 'POST', { reference }, true);
  if (data && data.success) {
    if (typeof showToast === 'function') showToast('🎉 Membership activated!');
    const user = getUser(); if (user) { user.membership = data.plan; saveUser(user); }
  }
  return data;
}

async function cancelMembership() {
  const data = await apiRequest('/membership/cancel', 'PUT', null, true);
  if (data && data.success && typeof showToast === 'function') showToast('✅ Membership cancelled.');
  return data;
}

async function initiateBookingPayment(bookingId) {
  return await apiRequest('/bookings/initiate-payment', 'POST', { bookingId }, true);
}

async function verifyBookingPayment(reference) {
  const data = await apiRequest('/bookings/verify-payment', 'POST', { reference }, true);
  if (data && data.success && typeof showToast === 'function') showToast('🎉 Payment confirmed! Booking is now paid.');
  return data;
}

async function getAllEvents(month, year) {
  let endpoint = '/events/all';
  if (month && year) endpoint += `?month=${month}&year=${year}`;
  return await apiRequest(endpoint);
}

async function getEvent(id) { return await apiRequest(`/events/${id}`); }

async function getEventRegistrationsAdmin(eventId) {
  return await apiRequest(`/events/${eventId}/registrations`, 'GET', null, true);
}

async function updateEventRegistrationAdmin(registrationId, updates) {
  return await apiRequest(`/events/registrations/${registrationId}`, 'PUT', updates, true);
}

async function removeEventRegistrationAdmin(registrationId) {
  return await apiRequest(`/events/registrations/${registrationId}`, 'DELETE', null, true);
}

async function registerForEvent(eventId) {
  const data = await apiRequest(`/events/register/${eventId}`, 'POST', null, true);
  if (data && data.success && typeof showToast === 'function') showToast('✅ Registered for event!');
  return data;
}

async function createEvent(eventData) {
  return await apiRequest('/events/create', 'POST', eventData, true);
}

async function updateEvent(eventId, updates) {
  return await apiRequest(`/events/update/${eventId}`, 'PUT', updates, true);
}

async function deleteEvent(eventId) {
  return await apiRequest(`/events/delete/${eventId}`, 'DELETE', null, true);
}

function updateNav() {
  const user = getUser();
  const token = getToken();
  const navActions = document.querySelector('.nav-actions');
  if (!navActions) return;
  if (token && user) {
    navActions.innerHTML = `
      <a href="dashboard.html" class="btn btn-ghost">👤 ${user.firstName || 'Account'}</a>
      <button class="btn btn-ghost" onclick="logoutUser()">Log Out</button>
    `;
  } else {
    navActions.innerHTML = `
      <button class="btn btn-ghost" onclick="openModal('login')">Log In</button>
      <button class="btn btn-green" onclick="openModal('signup')">Join Now</button>
    `;
  }
}

window.addEventListener('load', () => {
  const currentPage = getCurrentPage();
  if (AUTH_REQUIRED_PAGES.has(currentPage) && !isLoggedIn()) {
    redirectToLogin();
    return;
  }

  syncAuthUI();
  const params  = new URLSearchParams(window.location.search);
  const ref     = params.get('reference') || params.get('trxref');
  const payment = params.get('payment');
  // membership.html handles membership payment; booking.js handles booking payment
  if (ref && isLoggedIn() && window.location.pathname.includes('membership')) {
    verifyMembershipPayment(ref);
  }
});
