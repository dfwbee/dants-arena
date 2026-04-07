const token = getToken();
const user = getUser();
let currentQrValue = '';
let currentQrDataUrl = '';
let adminScanStream = null;
let adminScanTimer = null;
let adminEventsLoaded = false;
let adminBookingsLoaded = false;
let adminUsersLoaded = false;
let adminCheckinsLoaded = false;
let currentAdminEvents = [];
let rescheduleSelectedTime = '';
const DEFAULT_NOTIFICATION_PREFERENCES = {
  bookingConfirmations: true,
  eventReminders: true,
  membershipRenewal: true,
  promotionalMessages: false
};

if (!token || !user) {
  window.location.replace('login.html?next=' + encodeURIComponent('dashboard.html'));
}

function getMembershipLabel(plan) {
  if (!plan || plan === 'none') return 'No Membership';
  const icons = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
  return icons[plan] || plan;
}

function getMemberId(userData) {
  const raw = (userData && userData.id ? String(userData.id) : '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return raw ? `#DA-${raw}` : '--';
}

function isAdminUser(userData) {
  return !!(userData && userData.role === 'admin');
}

function normalizeNotificationPreferences(preferences) {
  return {
    bookingConfirmations: preferences?.bookingConfirmations !== false,
    eventReminders: preferences?.eventReminders !== false,
    membershipRenewal: preferences?.membershipRenewal !== false,
    promotionalMessages: !!preferences?.promotionalMessages
  };
}

function setToggleState(element, enabled) {
  if (!element) return;
  element.classList.toggle('on', !!enabled);
  element.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function getNotificationPreferencesFromForm() {
  return {
    bookingConfirmations: document.getElementById('pref-booking-confirmations')?.classList.contains('on') ?? true,
    eventReminders: document.getElementById('pref-event-reminders')?.classList.contains('on') ?? true,
    membershipRenewal: document.getElementById('pref-membership-renewal')?.classList.contains('on') ?? true,
    promotionalMessages: document.getElementById('pref-promotional-messages')?.classList.contains('on') ?? false
  };
}

function applyNotificationPreferences(preferences) {
  const normalized = normalizeNotificationPreferences(preferences || DEFAULT_NOTIFICATION_PREFERENCES);
  setToggleState(document.getElementById('pref-booking-confirmations'), normalized.bookingConfirmations);
  setToggleState(document.getElementById('pref-event-reminders'), normalized.eventReminders);
  setToggleState(document.getElementById('pref-membership-renewal'), normalized.membershipRenewal);
  setToggleState(document.getElementById('pref-promotional-messages'), normalized.promotionalMessages);
}

function initProfileToggleButtons() {
  [
    'pref-booking-confirmations',
    'pref-event-reminders',
    'pref-membership-renewal',
    'pref-promotional-messages'
  ].forEach((id) => {
    const button = document.getElementById(id);
    if (!button || button.dataset.ready === 'true') return;
    button.addEventListener('click', () => {
      const nextState = !button.classList.contains('on');
      setToggleState(button, nextState);
    });
    button.dataset.ready = 'true';
  });
}

function initRescheduleModal() {
  const dateField = document.getElementById('reschedule-date');
  const confirmBtn = document.getElementById('confirm-reschedule-btn');
  const overlay = document.getElementById('reschedule-modal');

  if (dateField && dateField.dataset.ready !== 'true') {
    dateField.addEventListener('change', () => loadRescheduleSlots(dateField.value));
    dateField.dataset.ready = 'true';
  }

  if (confirmBtn && confirmBtn.dataset.ready !== 'true') {
    confirmBtn.addEventListener('click', confirmReschedule);
    confirmBtn.dataset.ready = 'true';
  }

  if (overlay && overlay.dataset.ready !== 'true') {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeRescheduleModal();
    });
    overlay.dataset.ready = 'true';
  }
}

function getQrImageSource() {
  const qrRender = document.getElementById('qr-render');
  if (!qrRender) return '';

  const canvas = qrRender.querySelector('canvas');
  if (canvas) return canvas.toDataURL('image/png');

  const image = qrRender.querySelector('img');
  return image ? image.src : '';
}

function renderQrCode(qrValue) {
  const qrRender = document.getElementById('qr-render');
  const qrFallback = document.getElementById('qr-fallback');
  const qrScanLabel = document.getElementById('qr-scan-label');
  if (!qrRender) return;

  qrRender.innerHTML = '';
  currentQrValue = qrValue || '';
  currentQrDataUrl = '';

  if (window.QRCode && qrValue) {
    new window.QRCode(qrRender, {
      text: qrValue,
      width: 176,
      height: 176,
      colorDark: '#0d130f',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.M
    });

    setTimeout(() => {
      currentQrDataUrl = getQrImageSource();
    }, 0);

    if (qrFallback) qrFallback.hidden = true;
    if (qrScanLabel) qrScanLabel.textContent = 'Scan to verify entry';
    return;
  }

  if (qrFallback) {
    qrFallback.hidden = false;
    qrFallback.textContent = qrValue
      ? `Secure entry token: ${qrValue}`
      : 'Unable to generate QR code right now.';
  }
  if (qrScanLabel) qrScanLabel.textContent = 'Secure code unavailable';
}

async function loadQrCode() {
  const data = await getMyQrCode();
  if (!data || !data.success) {
    renderQrCode('');
    return;
  }

  renderQrCode(data.qrValue);

  const qrIdEl = document.getElementById('qr-detail-id');
  if (qrIdEl && data.memberId) qrIdEl.textContent = `#${data.memberId}`;

  const currentBookingCard = document.getElementById('current-booking-qr');
  const currentBookingTitle = document.getElementById('current-booking-title');
  const currentBookingMeta = document.getElementById('current-booking-meta');
  const currentBookingStatus = document.getElementById('current-booking-status');

  if (data.booking) {
    const bookingDate = new Date(`${data.booking.date}T12:00:00`);
    const dateLabel = bookingDate.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' });
    const durationLabel = data.booking.duration >= 60
      ? `${Math.round(data.booking.duration / 60)} Hour${data.booking.duration > 60 ? 's' : ''}`
      : `${data.booking.duration} mins`;

    if (currentBookingCard) currentBookingCard.style.display = 'block';
    if (currentBookingTitle) currentBookingTitle.textContent = data.booking.facility;
    if (currentBookingMeta) currentBookingMeta.textContent = `${dateLabel} · ${data.booking.timeSlot} · ${durationLabel} · #${data.booking.bookingId}`;
    if (currentBookingStatus) currentBookingStatus.textContent = data.booking.status === 'pending' ? 'Pending' : 'Confirmed';
  }
}

async function saveQrCode() {
  const imageSrc = currentQrDataUrl || getQrImageSource();
  if (!imageSrc) {
    showToast('QR code is still loading. Please try again.');
    return;
  }

  const link = document.createElement('a');
  link.href = imageSrc;
  link.download = 'dants-arena-qr.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('QR code saved to your device.');
}

async function shareQrCode() {
  if (!currentQrValue) {
    showToast('QR code is still loading. Please try again.');
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Dants Arena Access QR',
        text: `Use this secure Dants Arena QR code for entry verification:\n\n${currentQrValue}`
      });
      return;
    } catch (error) {}
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(currentQrValue);
    showToast('Secure QR token copied to your clipboard.');
    return;
  }

  showToast('Sharing is not available in this browser.');
}

function printQrCode() {
  const imageSrc = currentQrDataUrl || getQrImageSource();
  if (!imageSrc) {
    showToast('QR code is still loading. Please try again.');
    return;
  }

  const qrName = document.getElementById('qr-detail-name')?.textContent || 'Dants Arena Member';
  const qrPlan = document.getElementById('qr-detail-plan')?.textContent || 'No Membership';
  const qrId = document.getElementById('qr-detail-id')?.textContent || '--';
  const printWindow = window.open('', '_blank', 'width=480,height=640');
  if (!printWindow) {
    showToast('Allow pop-ups to print the QR code.');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Dants Arena QR</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; text-align: center; color: #0d130f; }
          img { width: 240px; height: 240px; }
          h1 { margin-bottom: 8px; }
          p { margin: 6px 0; }
        </style>
      </head>
      <body>
        <h1>Dants Arena</h1>
        <img src="${imageSrc}" alt="Dants Arena QR Code" />
        <p><strong>${qrName}</strong></p>
        <p>${qrId}</p>
        <p>${qrPlan}</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function initQrActions() {
  document.getElementById('save-qr-btn')?.addEventListener('click', saveQrCode);
  document.getElementById('share-qr-btn')?.addEventListener('click', shareQrCode);
  document.getElementById('print-qr-btn')?.addEventListener('click', printQrCode);
}

function setAdminVerifyResult(message, type = '') {
  const resultIds = ['admin-verify-result', 'admin-verify-result-main'];
  resultIds.forEach((id) => {
    const resultEl = document.getElementById(id);
    if (!resultEl) return;
    resultEl.className = type ? `admin-verify-result ${type}` : 'admin-verify-result';
    resultEl.textContent = message;
  });
}

async function handleAdminQrVerification() {
  const input = document.getElementById('admin-qr-input-main') || document.getElementById('admin-qr-input');
  const button = document.getElementById('verify-qr-btn-main') || document.getElementById('verify-qr-btn');
  if (!input || !button) return;

  const tokenValue = input.value.trim();
  if (!tokenValue) {
    setAdminVerifyResult('Paste a QR token before verifying.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'Verifying...';

  const result = await verifyQrCode(tokenValue);

  button.disabled = false;
  button.textContent = 'Verify QR Code';

  if (!result || !result.success || !result.valid) {
    setAdminVerifyResult(result?.message || 'QR code is invalid or expired.', 'error');
    return;
  }

  const verifiedUser = result.user || {};
  const verifiedQr = result.qr || {};
  const displayName = `${verifiedUser.firstName || ''} ${verifiedUser.lastName || ''}`.trim() || verifiedUser.email || 'Unknown member';
  const bookingLine = verifiedQr.bookingId
    ? `Booking: #${verifiedQr.bookingId} ${verifiedQr.bookingFacility ? `for ${verifiedQr.bookingFacility} ` : ''}on ${verifiedQr.bookingDate || '--'} at ${verifiedQr.bookingTime || '--'}`
    : 'Booking: No active booking attached';
  const memberInfo = [
    `Verified: ${displayName}`,
    `Member ID: ${verifiedQr.memberId || 'Member'}`,
    `Email: ${verifiedUser.email || '--'}`,
    `Email verified: ${verifiedUser.emailVerified ? 'Yes' : 'No'}`,
    `Role: ${verifiedUser.role || 'user'}`,
    `Membership: ${verifiedQr.membership || verifiedUser.membership || 'none'}`,
    bookingLine
  ].join(' | ');

  setAdminVerifyResult(memberInfo, 'success');
  adminCheckinsLoaded = false;
  loadAdminCheckins(true);
}

function stopAdminScanner() {
  if (adminScanTimer) {
    clearInterval(adminScanTimer);
    adminScanTimer = null;
  }
  if (adminScanStream) {
    adminScanStream.getTracks().forEach((track) => track.stop());
    adminScanStream = null;
  }

  const scanner = document.getElementById('admin-scanner');
  const video = document.getElementById('admin-scan-video');
  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');
  if (scanner) scanner.hidden = true;
  if (video) video.srcObject = null;
  if (startBtn) startBtn.hidden = false;
  if (stopBtn) stopBtn.hidden = true;
}

async function startAdminScanner() {
  const scanner = document.getElementById('admin-scanner');
  const video = document.getElementById('admin-scan-video');
  const note = document.getElementById('admin-scanner-note');
  const input = document.getElementById('admin-qr-input-main');
  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');
  if (!scanner || !video || !input) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    setAdminVerifyResult('Camera scanning is not supported in this browser. Paste the QR token manually.', 'error');
    return;
  }

  if (!('BarcodeDetector' in window)) {
    setAdminVerifyResult('Camera access is available, but QR scanning is not supported here. Paste the QR token manually.', 'error');
    return;
  }

  try {
    adminScanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });

    video.srcObject = adminScanStream;
    scanner.hidden = false;
    if (startBtn) startBtn.hidden = true;
    if (stopBtn) stopBtn.hidden = false;
    if (note) note.textContent = 'Point the camera at a Dants Arena QR code.';

    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    adminScanTimer = setInterval(async () => {
      if (!video.videoWidth || !video.videoHeight) return;
      try {
        const codes = await detector.detect(video);
        if (!codes.length) return;
        const rawValue = codes[0].rawValue || '';
        if (!rawValue) return;
        input.value = rawValue;
        if (note) note.textContent = 'QR detected. Verifying now...';
        stopAdminScanner();
        await handleAdminQrVerification();
      } catch (_error) {}
    }, 700);
  } catch (error) {
    setAdminVerifyResult('Could not access the camera. Check browser permissions or paste the token manually.', 'error');
  }
}

function formatAdminEventMeta(event) {
  const spotsLeft = Number(event.total_spots || 0) - Number(event.registered_count || 0);
  return `${event.date || '--'} · ${event.time || '--'} · ${event.type || 'event'} · ${event.price || 'FREE'} · ${Math.max(spotsLeft, 0)} spots left`;
}

function resetAdminEventForm() {
  const form = document.getElementById('admin-event-form');
  if (!form) return;
  form.reset();
  const idField = document.getElementById('admin-event-id');
  const submitBtn = document.getElementById('admin-event-submit');
  const spotsField = document.getElementById('admin-event-spots');
  if (idField) idField.value = '';
  if (spotsField && !spotsField.value) spotsField.value = '16';
  if (submitBtn) submitBtn.textContent = 'Create Event';
}

function populateAdminEventForm(event) {
  document.getElementById('admin-event-id').value = event.id || '';
  document.getElementById('admin-event-title').value = event.title || '';
  document.getElementById('admin-event-type').value = event.type || 'tournament';
  document.getElementById('admin-event-date').value = event.date || '';
  document.getElementById('admin-event-time').value = event.time || '';
  document.getElementById('admin-event-price').value = event.price || '';
  document.getElementById('admin-event-spots').value = event.total_spots || 16;
  document.getElementById('admin-event-prize').value = event.prize || '';
  document.getElementById('admin-event-description').value = event.description || '';
  document.getElementById('admin-event-submit').textContent = 'Update Event';
  switchTab('admin');
}

function renderAdminEvents(events) {
  const list = document.getElementById('admin-events-list');
  const count = document.getElementById('admin-events-count');
  if (!list) return;

  count.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;

  if (!events.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No events available yet.</p>';
    return;
  }

  list.innerHTML = events.map((event) => `
    <div class="admin-event-card">
      <div>
        <div class="admin-event-title">${event.title}</div>
        <div class="admin-event-meta">${formatAdminEventMeta(event)}</div>
        <div class="admin-event-tag-row">
          <span class="admin-event-chip">${event.type || 'event'}</span>
          <span class="admin-event-chip">${Number(event.registered_count || 0)} registered</span>
          <span class="admin-event-chip">${Number(event.total_spots || 0)} total spots</span>
        </div>
        <div class="admin-event-description">${event.description || 'No description added yet.'}</div>
      </div>
      <div class="admin-event-actions">
        <button class="btn btn-ghost" data-admin-edit-event="${event.id}">Edit</button>
        <button class="btn btn-ghost" data-admin-delete-event="${event.id}">Cancel Event</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-admin-edit-event]').forEach((button) => {
    button.addEventListener('click', () => {
      const event = events.find((item) => String(item.id) === button.dataset.adminEditEvent);
      if (event) populateAdminEventForm(event);
    });
  });

  list.querySelectorAll('[data-admin-delete-event]').forEach((button) => {
    button.addEventListener('click', async () => {
      const event = events.find((item) => String(item.id) === button.dataset.adminDeleteEvent);
      if (!event) return;
      if (!confirm(`Cancel "${event.title}"? This will remove the event.`)) return;

      const result = await deleteEvent(event.id);
      if (result && result.success) {
        showToast(result.message || 'Event cancelled.');
        await loadAdminEvents(true);
      }
    });
  });
}

async function loadAdminEvents(force = false) {
  if (!force && adminEventsLoaded) return;
  const result = await getAllEvents();
  if (!result || !result.success) return;

  const sortedEvents = [...(result.events || [])].sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date);
    if (dateDiff !== 0) return dateDiff;
    return String(a.time || '').localeCompare(String(b.time || ''));
  });

  currentAdminEvents = sortedEvents;
  renderAdminEvents(sortedEvents);
  const attendeeSelect = document.getElementById('admin-attendees-event-select');
  if (attendeeSelect) {
    const currentValue = attendeeSelect.value;
    attendeeSelect.innerHTML = '<option value="">Select an event</option>' + sortedEvents.map((event) => (
      `<option value="${event.id}">${event.title} · ${event.date}</option>`
    )).join('');
    if (currentValue) attendeeSelect.value = currentValue;
  }
  adminEventsLoaded = true;
}

function renderOverviewEvents(events) {
  const container = document.getElementById('overview-events-list');
  if (!container) return;

  if (!events.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No upcoming events right now.</p>';
    return;
  }

  container.innerHTML = events.slice(0, 3).map((event) => {
    const eventDate = new Date(`${event.date}T12:00:00`);
    const priceLabel = event.price && String(event.price).trim() ? String(event.price) : 'FREE';
    return `
      <div class="mini-event">
        <div class="mini-event-date"><div class="me-day">${eventDate.getDate()}</div><div class="me-month">${eventDate.toLocaleDateString('en-NG', { month: 'short' })}</div></div>
        <div class="mini-event-info">
          <div class="mini-event-title">${event.title}</div>
          <div class="mini-event-time">${event.time || 'Time TBA'} · ${priceLabel}</div>
        </div>
        <div class="mini-event-tag type-${event.type || 'tournament'}">${(event.type || 'event').replace(/(^\w)/, (match) => match.toUpperCase())}</div>
      </div>
    `;
  }).join('');
}

async function loadOverviewEvents() {
  const result = await getAllEvents();
  if (!result || !result.success) {
    renderOverviewEvents([]);
    return;
  }

  const sortedEvents = [...(result.events || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  renderOverviewEvents(sortedEvents);
}

function renderAdminUsers(users) {
  const list = document.getElementById('admin-users-list');
  const count = document.getElementById('admin-users-count');
  if (!list || !count) return;

  count.textContent = `${users.length} user${users.length === 1 ? '' : 's'}`;

  if (!users.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No users found.</p>';
    return;
  }

  list.innerHTML = users.map((member) => {
    const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email;
    return `
      <div class="admin-user-card">
        <div>
          <div class="admin-booking-title">${fullName}</div>
          <div class="admin-booking-meta">${member.email}${member.username ? ` · ${member.username}` : ''}${member.phone ? ` · ${member.phone}` : ''}</div>
          <div class="admin-booking-chips">
            <span class="admin-booking-chip">${member.role || 'user'}</span>
            <span class="admin-booking-chip">${member.membership || 'none'}</span>
            <span class="admin-booking-chip">${member.city || 'No city'}</span>
          </div>
        </div>
        <div class="admin-user-actions">
          <button class="btn btn-ghost" data-admin-role-user="${member.id}">Make User</button>
          <button class="btn btn-ghost" data-admin-role-admin="${member.id}">Make Admin</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-admin-role-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      const result = await updateUserAdmin(button.dataset.adminRoleUser, { role: 'user' });
      if (result && result.success) {
        showToast('User role updated.');
        adminUsersLoaded = false;
        loadAdminUsers(true);
      }
    });
  });

  list.querySelectorAll('[data-admin-role-admin]').forEach((button) => {
    button.addEventListener('click', async () => {
      const result = await updateUserAdmin(button.dataset.adminRoleAdmin, { role: 'admin' });
      if (result && result.success) {
        showToast('Admin role updated.');
        adminUsersLoaded = false;
        loadAdminUsers(true);
      }
    });
  });
}

async function loadAdminUsers(force = false) {
  if (!force && adminUsersLoaded) return;
  const search = (document.getElementById('admin-users-search')?.value || '').trim();
  const result = await getAllUsersAdmin(search);
  if (!result || !result.success) return;
  renderAdminUsers(result.users || []);
  adminUsersLoaded = true;
}

function renderAdminAttendees(registrations) {
  const list = document.getElementById('admin-attendees-list');
  const count = document.getElementById('admin-attendees-count');
  if (!list || !count) return;

  count.textContent = `${registrations.length} attendee${registrations.length === 1 ? '' : 's'}`;

  if (!registrations.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No attendees registered yet.</p>';
    return;
  }

  list.innerHTML = registrations.map((registration) => {
    const fullName = `${registration.user?.firstName || ''} ${registration.user?.lastName || ''}`.trim() || registration.user?.email || 'Unknown attendee';
    return `
      <div class="admin-attendee-card">
        <div>
          <div class="admin-booking-title">${fullName}</div>
          <div class="admin-booking-meta">${registration.user?.email || '--'}${registration.user?.username ? ` · ${registration.user.username}` : ''}${registration.user?.phone ? ` · ${registration.user.phone}` : ''}</div>
          <div class="admin-booking-chips">
            <span class="admin-booking-chip">${registration.attended ? 'attended' : 'registered'}</span>
            <span class="admin-booking-chip">${registration.checkedInAt ? new Date(registration.checkedInAt).toLocaleString('en-NG') : 'not checked in'}</span>
          </div>
        </div>
        <div class="admin-attendee-actions">
          <button class="btn btn-ghost" data-admin-attendance="${registration.id}">${registration.attended ? 'Mark Not Attended' : 'Mark Attended'}</button>
          <button class="btn btn-ghost" data-admin-remove-attendee="${registration.id}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-admin-attendance]').forEach((button) => {
    button.addEventListener('click', async () => {
      const registration = registrations.find((item) => String(item.id) === button.dataset.adminAttendance);
      if (!registration) return;
      const result = await updateEventRegistrationAdmin(registration.id, { attended: !registration.attended });
      if (result && result.success) {
        showToast('Attendance updated.');
        loadAdminAttendees();
      }
    });
  });

  list.querySelectorAll('[data-admin-remove-attendee]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Remove this attendee from the event?')) return;
      const result = await removeEventRegistrationAdmin(button.dataset.adminRemoveAttendee);
      if (result && result.success) {
        showToast('Attendee removed.');
        loadAdminAttendees();
        loadAdminEvents(true);
      }
    });
  });
}

async function loadAdminAttendees() {
  const eventId = document.getElementById('admin-attendees-event-select')?.value;
  if (!eventId) {
    renderAdminAttendees([]);
    const count = document.getElementById('admin-attendees-count');
    if (count) count.textContent = 'Choose event';
    return;
  }
  const result = await getEventRegistrationsAdmin(eventId);
  if (!result || !result.success) return;
  renderAdminAttendees(result.registrations || []);
}

function renderAdminCheckins(checkins) {
  const list = document.getElementById('admin-checkins-list');
  const count = document.getElementById('admin-checkins-count');
  if (!list || !count) return;
  count.textContent = `${checkins.length} check-in${checkins.length === 1 ? '' : 's'}`;

  if (!checkins.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No QR check-ins yet.</p>';
    return;
  }

  list.innerHTML = checkins.map((checkin) => `
    <div class="admin-checkin-card">
      <div class="admin-booking-title">Member ${checkin.member_user_id}${checkin.booking_id ? ` · Booking #${checkin.booking_id}` : ''}</div>
      <div class="admin-booking-meta">${checkin.booking_facility || 'No facility linked'}${checkin.booking_date ? ` · ${checkin.booking_date}` : ''}${checkin.booking_time ? ` · ${checkin.booking_time}` : ''}</div>
      <div class="admin-booking-chips">
        <span class="admin-booking-chip">${checkin.membership || 'none'}</span>
        <span class="admin-booking-chip">${new Date(checkin.checked_in_at).toLocaleString('en-NG')}</span>
        <span class="admin-booking-chip">admin ${String(checkin.admin_user_id || '').slice(0, 8)}</span>
      </div>
    </div>
  `).join('');
}

async function loadAdminCheckins(force = false) {
  if (!force && adminCheckinsLoaded) return;
  const result = await getQrCheckinsAdmin();
  if (!result || !result.success) return;
  renderAdminCheckins(result.checkins || []);
  adminCheckinsLoaded = true;
}

function getAdminBookingStatusClass(status) {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

function formatAdminBookingMeta(booking) {
  const durationLabel = booking.duration >= 60
    ? `${Math.round(booking.duration / 60)} Hour${booking.duration > 60 ? 's' : ''}`
    : `${booking.duration} mins`;
  return `${booking.date || '--'} · ${booking.timeSlot || '--'} · ${durationLabel} · ${booking.facility || 'Facility TBD'}`;
}

function bookingMatchesSearch(booking, searchTerm) {
  if (!searchTerm) return true;
  const haystack = [
    booking.bookingId,
    booking.facility,
    booking.teamName,
    booking.user?.firstName,
    booking.user?.lastName,
    booking.user?.email,
    booking.user?.username
  ].join(' ').toLowerCase();
  return haystack.includes(searchTerm);
}

function renderAdminBookings(bookings) {
  const list = document.getElementById('admin-bookings-list');
  const count = document.getElementById('admin-bookings-count');
  if (!list || !count) return;

  count.textContent = `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`;

  if (!bookings.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No bookings match these filters.</p>';
    return;
  }

  list.innerHTML = bookings.map((booking) => {
    const ownerName = `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}`.trim() || booking.user?.email || 'Unknown user';
    const statusClass = getAdminBookingStatusClass(booking.status);
    const paymentLabel = booking.paymentStatus || 'pending';
    return `
      <div class="admin-booking-card">
        <div>
          <div class="admin-booking-title">${ownerName} · #${booking.bookingId}</div>
          <div class="admin-booking-meta">${formatAdminBookingMeta(booking)}</div>
          <div class="admin-booking-chips">
            <span class="admin-booking-chip">${booking.status || 'pending'}</span>
            <span class="admin-booking-chip">${paymentLabel}</span>
            <span class="admin-booking-chip">${booking.user?.role || 'user'}</span>
          </div>
          <div class="admin-booking-meta" style="margin-top:10px;">
            Email: ${booking.user?.email || '--'}${booking.user?.username ? ` · Username: ${booking.user.username}` : ''}${booking.user?.phone ? ` · Phone: ${booking.user.phone}` : ''}
          </div>
          ${booking.specialRequests ? `<div class="admin-booking-requests">Special requests: ${booking.specialRequests}</div>` : ''}
        </div>
        <div class="admin-booking-actions">
          <div class="status-badge ${statusClass}">${booking.status || 'pending'}</div>
          <div class="bk-price">₦${Number(booking.totalAmount || 0).toLocaleString()}</div>
          ${booking.status !== 'cancelled' ? `<button class="btn btn-ghost" data-admin-cancel-booking="${booking.id}">Cancel Booking</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-admin-cancel-booking]').forEach((button) => {
    button.addEventListener('click', async () => {
      const booking = bookings.find((item) => String(item.id) === button.dataset.adminCancelBooking);
      if (!booking) return;
      if (!confirm(`Cancel booking #${booking.bookingId}?`)) return;

      const result = await cancelBooking(booking.id);
      if (result && result.success) {
        showToast(result.message || 'Booking cancelled.');
        await loadAdminBookings(true);
        loadBookings();
      }
    });
  });
}

async function loadAdminBookings(force = false) {
  if (!force && adminBookingsLoaded) return;

  const status = document.getElementById('admin-booking-status-filter')?.value || '';
  const date = document.getElementById('admin-booking-date-filter')?.value || '';
  const search = (document.getElementById('admin-booking-search')?.value || '').trim().toLowerCase();

  const result = await getAllBookingsAdmin({ status, date });
  if (!result || !result.success) return;

  const bookings = (result.bookings || [])
    .filter((booking) => bookingMatchesSearch(booking, search))
    .sort((a, b) => {
      const dateDiff = new Date(`${b.date}T12:00:00`) - new Date(`${a.date}T12:00:00`);
      if (dateDiff !== 0) return dateDiff;
      return String(b.timeSlot || '').localeCompare(String(a.timeSlot || ''));
    });

  renderAdminBookings(bookings);
  adminBookingsLoaded = true;
}

async function handleAdminEventSubmit(event) {
  event.preventDefault();
  const submitBtn = document.getElementById('admin-event-submit');
  const eventId = document.getElementById('admin-event-id').value.trim();
  const payload = {
    title: document.getElementById('admin-event-title').value.trim(),
    type: document.getElementById('admin-event-type').value,
    date: document.getElementById('admin-event-date').value,
    time: document.getElementById('admin-event-time').value.trim(),
    price: document.getElementById('admin-event-price').value.trim(),
    totalSpots: Number(document.getElementById('admin-event-spots').value || 16),
    prize: document.getElementById('admin-event-prize').value.trim(),
    description: document.getElementById('admin-event-description').value.trim()
  };

  if (!payload.title || !payload.date || !payload.time) {
    showToast('Title, date, and time are required.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = eventId ? 'Updating...' : 'Creating...';

  const result = eventId
    ? await updateEvent(eventId, payload)
    : await createEvent(payload);

  submitBtn.disabled = false;
  submitBtn.textContent = eventId ? 'Update Event' : 'Create Event';

  if (result && result.success) {
    showToast(result.message || (eventId ? 'Event updated.' : 'Event created.'));
    resetAdminEventForm();
    await loadAdminEvents(true);
  }
}

function initAdminTools(userData) {
  const roleBadge = document.getElementById('role-badge');
  const adminSidebarLink = document.getElementById('admin-sidebar-link');
  const adminTabPanel = document.getElementById('tab-admin');
  const profileRoleGroup = document.getElementById('profile-role-group');
  const isAdmin = isAdminUser(userData);

  if (roleBadge) {
    roleBadge.hidden = !isAdmin;
    roleBadge.textContent = isAdmin ? 'Admin Access' : '';
  }

  if (adminTabPanel) {
    adminTabPanel.hidden = !isAdmin;
    if (!isAdmin) adminTabPanel.classList.remove('active');
  }

  if (adminSidebarLink) {
    adminSidebarLink.hidden = !isAdmin;
  }

  if (profileRoleGroup) {
    profileRoleGroup.hidden = !isAdmin;
  }

  if (isAdmin) {
    const verifyButtons = ['verify-qr-btn', 'verify-qr-btn-main'];
    verifyButtons.forEach((id) => {
      const verifyButton = document.getElementById(id);
      if (verifyButton && verifyButton.dataset.ready !== 'true') {
        verifyButton.addEventListener('click', handleAdminQrVerification);
        verifyButton.dataset.ready = 'true';
      }
    });

    const startScanBtn = document.getElementById('start-scan-btn');
    const stopScanBtn = document.getElementById('stop-scan-btn');
    if (startScanBtn && startScanBtn.dataset.ready !== 'true') {
      startScanBtn.addEventListener('click', startAdminScanner);
      startScanBtn.dataset.ready = 'true';
    }
    if (stopScanBtn && stopScanBtn.dataset.ready !== 'true') {
      stopScanBtn.addEventListener('click', stopAdminScanner);
      stopScanBtn.dataset.ready = 'true';
    }

    const form = document.getElementById('admin-event-form');
    if (form && form.dataset.ready !== 'true') {
      form.addEventListener('submit', handleAdminEventSubmit);
      form.dataset.ready = 'true';
    }

    const resetBtn = document.getElementById('admin-event-reset');
    if (resetBtn && resetBtn.dataset.ready !== 'true') {
      resetBtn.addEventListener('click', resetAdminEventForm);
      resetBtn.dataset.ready = 'true';
    }

    const bookingApplyBtn = document.getElementById('admin-booking-apply');
    if (bookingApplyBtn && bookingApplyBtn.dataset.ready !== 'true') {
      bookingApplyBtn.addEventListener('click', () => {
        adminBookingsLoaded = false;
        loadAdminBookings(true);
      });
      bookingApplyBtn.dataset.ready = 'true';
    }

    const bookingSearch = document.getElementById('admin-booking-search');
    if (bookingSearch && bookingSearch.dataset.ready !== 'true') {
      bookingSearch.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        adminBookingsLoaded = false;
        loadAdminBookings(true);
      });
      bookingSearch.dataset.ready = 'true';
    }

    const usersApplyBtn = document.getElementById('admin-users-apply');
    if (usersApplyBtn && usersApplyBtn.dataset.ready !== 'true') {
      usersApplyBtn.addEventListener('click', () => {
        adminUsersLoaded = false;
        loadAdminUsers(true);
      });
      usersApplyBtn.dataset.ready = 'true';
    }

    const attendeesLoadBtn = document.getElementById('admin-attendees-load');
    if (attendeesLoadBtn && attendeesLoadBtn.dataset.ready !== 'true') {
      attendeesLoadBtn.addEventListener('click', loadAdminAttendees);
      attendeesLoadBtn.dataset.ready = 'true';
    }

    loadAdminEvents();
    loadAdminBookings();
    loadAdminUsers();
    loadAdminCheckins();
  } else {
    stopAdminScanner();
    if (document.getElementById('tab-admin')?.classList.contains('active')) {
      switchTab('overview');
    }
  }
}

function switchTab(tabName) {
  if (tabName === 'admin' && !isAdminUser(getUser())) {
    tabName = 'overview';
  }

  document.querySelectorAll('.sidebar-link').forEach((link) => link.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    const onclick = link.getAttribute('onclick') || '';
    if (onclick.includes(`'${tabName}'`)) link.classList.add('active');
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
  const target = document.getElementById(`tab-${tabName}`);
  if (target && !target.hidden) target.classList.add('active');

  if (tabName === 'bookings') loadBookings();
  if (tabName === 'membership') loadMembershipStatus();
  if (tabName === 'admin' && isAdminUser(getUser())) {
    loadAdminEvents();
    loadAdminBookings();
    loadAdminUsers();
    loadAdminCheckins();
  }
}

function switchSubtab(el, targetId) {
  el.closest('.subtabs').querySelectorAll('.subtab').forEach((tab) => tab.classList.remove('active'));
  el.classList.add('active');
  ['upcoming-bookings', 'past-bookings'].forEach((id) => {
    const section = document.getElementById(id);
    if (section) section.style.display = 'none';
  });
  const target = document.getElementById(targetId);
  if (target) target.style.display = 'block';
}

function populateDashboard(userData) {
  const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email || 'Member';

  const nameEl = document.querySelector('.profile-name');
  if (nameEl) nameEl.textContent = fullName;

  const greetEl = document.getElementById('greeting');
  if (greetEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    greetEl.textContent = `${greeting}, ${userData.firstName || 'there'}!`;
  }

  const dateEl = document.getElementById('today-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-NG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  const emailEl = document.querySelector('.profile-email');
  if (emailEl) emailEl.textContent = userData.email || '';

  const badgeEl = document.querySelector('.profile-badge');
  if (badgeEl) {
    if (isAdminUser(userData)) {
      badgeEl.textContent = 'Administrator';
    } else {
      const plan = userData.membership || 'none';
      badgeEl.textContent = plan === 'none' ? 'No Membership' : `${getMembershipLabel(plan)} Member`;
    }
  }

  const initials = `${(userData.firstName || '')[0] || ''}${(userData.lastName || '')[0] || ''}`.toUpperCase() || 'DA';
  document.querySelectorAll('.avatar').forEach((avatar) => { avatar.textContent = initials; });

  const sinceEl = document.querySelector('.profile-member-since');
  if (sinceEl && userData.createdAt) {
    sinceEl.textContent = 'Member since ' + new Date(userData.createdAt).toLocaleDateString('en-NG', {
      month: 'long', year: 'numeric'
    });
  }

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  setVal('profile-firstname', userData.firstName);
  setVal('profile-lastname', userData.lastName);
  setVal('profile-email-input', userData.email);
  setVal('profile-phone', userData.phone);
  setVal('profile-city', userData.city);
  setVal('profile-role', isAdminUser(userData) ? 'Administrator' : 'Member');
  applyNotificationPreferences(userData.notificationPreferences);

  const qrNameEl = document.getElementById('qr-detail-name');
  if (qrNameEl) qrNameEl.textContent = fullName;

  const qrIdEl = document.getElementById('qr-detail-id');
  if (qrIdEl) qrIdEl.textContent = getMemberId(userData);

  const qrPlanEl = document.getElementById('qr-detail-plan');
  if (qrPlanEl) qrPlanEl.textContent = getMembershipLabel(userData.membership);

  const qrBadgeEl = document.getElementById('qr-member-badge');
  if (qrBadgeEl) qrBadgeEl.textContent = getMembershipLabel(userData.membership);

  const qrStatusEl = document.getElementById('qr-detail-status');
  if (qrStatusEl) qrStatusEl.textContent = userData.membership && userData.membership !== 'none' ? 'Active' : 'Inactive';

  const qrValidEl = document.getElementById('qr-detail-valid');
  if (qrValidEl) {
    qrValidEl.textContent = userData.membershipExpiry
      ? new Date(userData.membershipExpiry).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
      : '--';
  }

  if (userData.favouritePosition) {
    const posEl = document.getElementById('profile-position');
    if (posEl) {
      Array.from(posEl.options).forEach((opt) => {
        opt.selected = opt.value === userData.favouritePosition || opt.text === userData.favouritePosition;
      });
    }
  }

  initAdminTools(userData);
}

function buildBookingCard(booking, isPast) {
  const date = new Date(booking.date + 'T12:00:00');
  const day = date.toLocaleDateString('en-NG', { day: 'numeric' });
  const month = date.toLocaleDateString('en-NG', { month: 'short' });
  const statusMap = { confirmed: 'confirmed', cancelled: 'cancelled', pending: 'pending' };
  const statusCls = statusMap[booking.status] || 'pending';
  const statusText = booking.status === 'confirmed'
    ? 'Confirmed'
    : booking.status === 'cancelled'
      ? 'Cancelled'
      : 'Pending';
  const durationLabel = booking.duration >= 60
    ? `${Math.round(booking.duration / 60)} Hour${booking.duration > 60 ? 's' : ''}`
    : `${booking.duration} mins`;

  const actionBtn = isPast
    ? ''
    : booking.status === 'confirmed'
      ? `<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-ghost bk-btn" onclick="openRescheduleModal('${booking.id}')">Reschedule</button>
          <button class="btn btn-ghost bk-btn" onclick="handleCancelBooking('${booking.id}')">Cancel</button>
        </div>`
      : '';

  return `
    <div class="booking-card">
      <div class="bk-date-box${isPast ? ' past' : ''}">
        <div class="bk-day">${day}</div>
        <div class="bk-month">${month}</div>
      </div>
      <div class="bk-info">
        <div class="bk-title">${booking.facility}</div>
        <div class="bk-meta">${booking.timeSlot} · ${durationLabel} · Dants Arena, Abeokuta</div>
        <div class="bk-id">ID: #${booking.bookingId}</div>
      </div>
      <div class="bk-right">
        <div class="status-badge ${statusCls}">${statusText}</div>
        <div class="bk-price">₦${Number(booking.totalAmount).toLocaleString()}</div>
        ${actionBtn}
      </div>
    </div>`;
}

async function loadBookings() {
  const upcomingEl = document.getElementById('upcoming-bookings');
  const pastEl = document.getElementById('past-bookings');
  if (!upcomingEl && !pastEl) return;

  if (upcomingEl) {
    upcomingEl.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">Loading bookings...</p>';
  }

  const data = await getMyBookings();
  const nbContainer = document.getElementById('next-booking-container');
  const actContainer = document.getElementById('recent-activity');
  const currentBookingCard = document.getElementById('current-booking-qr');
  const currentBookingTitle = document.getElementById('current-booking-title');
  const currentBookingMeta = document.getElementById('current-booking-meta');
  const currentBookingStatus = document.getElementById('current-booking-status');

  if (!data || !data.bookings || data.bookings.length === 0) {
    if (upcomingEl) {
      upcomingEl.innerHTML = `
        <div class="empty-state" style="padding:32px 0;text-align:center;color:var(--muted);">
          <p>No bookings yet.</p>
          <a href="booking.html" class="btn btn-green" style="margin-top:12px;display:inline-block;">Book a Pitch -></a>
        </div>`;
    }
    if (pastEl) pastEl.innerHTML = '';
    if (nbContainer) {
      nbContainer.innerHTML = `
        <p style="color:var(--muted);font-size:0.85rem;">No upcoming bookings.
          <a href="booking.html" style="color:var(--green);">Book a pitch -></a>
        </p>`;
    }
    if (actContainer) actContainer.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No recent activity.</p>';
    if (currentBookingCard) currentBookingCard.style.display = 'none';

    const statEl = document.getElementById('stat-total-sessions');
    if (statEl) statEl.textContent = '0';
    return;
  }

  const now = new Date();
  const upcoming = data.bookings.filter((booking) => new Date(booking.date + 'T23:59:59') >= now && booking.status !== 'cancelled');
  const past = data.bookings.filter((booking) => new Date(booking.date + 'T23:59:59') < now || booking.status === 'cancelled');

  if (upcomingEl) {
    upcomingEl.innerHTML = upcoming.length
      ? upcoming.map((booking) => buildBookingCard(booking, false)).join('')
      : '<p style="color:var(--muted);font-size:0.85rem;padding:16px 0;">No upcoming bookings.</p>';
  }

  if (pastEl) {
    pastEl.innerHTML = past.length
      ? past.map((booking) => buildBookingCard(booking, true)).join('')
      : '<p style="color:var(--muted);font-size:0.85rem;padding:16px 0;">No past bookings.</p>';
  }

  if (nbContainer) {
    const next = upcoming[0];
    if (next) {
      const date = new Date(next.date + 'T12:00:00');
      const dateLabel = date.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' });
      const durLabel = next.duration >= 60 ? `${Math.round(next.duration / 60)} Hour${next.duration > 60 ? 's' : ''}` : `${next.duration} mins`;
      nbContainer.innerHTML = `
        <div class="next-booking-card">
          <div class="nb-left">
            <div class="nb-icon">⚽</div>
            <div>
              <div class="nb-title">${next.facility}</div>
              <div class="nb-meta">${dateLabel} · ${next.timeSlot} · ${durLabel}</div>
              <div class="nb-id">Booking ID: #${next.bookingId}</div>
            </div>
          </div>
          <div class="nb-right">
            <div class="status-badge confirmed">Confirmed</div>
          </div>
        </div>`;

      if (currentBookingCard) currentBookingCard.style.display = 'block';
      if (currentBookingTitle) currentBookingTitle.textContent = next.facility;
      if (currentBookingMeta) currentBookingMeta.textContent = `${dateLabel} · ${next.timeSlot} · ${durLabel}`;
      if (currentBookingStatus) currentBookingStatus.textContent = 'Confirmed';
    } else {
      nbContainer.innerHTML = `
        <p style="color:var(--muted);font-size:0.85rem;">No upcoming bookings.
          <a href="booking.html" style="color:var(--green);">Book a pitch -></a>
        </p>`;
      if (currentBookingCard) currentBookingCard.style.display = 'none';
    }
  }

  if (actContainer) {
    const recent = data.bookings.slice(0, 5);
    actContainer.innerHTML = recent.map((booking) => {
      const createdAt = new Date(booking.createdAt);
      const timeStr = createdAt.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }) + ', ' +
        createdAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
      const dot = booking.status === 'confirmed' ? 'green' : '';
      const label = booking.status === 'confirmed'
        ? `Booking confirmed - ${booking.facility}`
        : booking.status === 'cancelled'
          ? `Booking cancelled - ${booking.facility}`
          : `Booking pending - ${booking.facility}`;
      return `
        <div class="activity-item">
          <div class="activity-dot ${dot}"></div>
          <div class="activity-info">
            <div class="activity-title">${label}</div>
            <div class="activity-time">${timeStr}</div>
          </div>
        </div>`;
    }).join('');
  }

  const statSessions = document.getElementById('stat-total-sessions');
  if (statSessions) statSessions.textContent = data.total;
}

async function handleCancelBooking(id) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  const data = await cancelBooking(id);
  if (data && data.success) loadBookings();
}

function closeRescheduleModal() {
  document.getElementById('reschedule-modal')?.classList.remove('open');
}

async function loadRescheduleSlots(date, preselectedTime = '') {
  const container = document.getElementById('reschedule-slots');
  if (!container || !date) return;
  container.innerHTML = '<p style="grid-column:1/-1;color:var(--muted);font-size:0.85rem;">Loading slots...</p>';

  const data = await getAvailableSlots(date, 'Football Pitch (5-A-Side)');
  if (!data || !data.slots) {
    container.innerHTML = '<p style="grid-column:1/-1;color:var(--muted);font-size:0.85rem;">Could not load slots.</p>';
    return;
  }

  rescheduleSelectedTime = '';
  container.innerHTML = data.slots.map((slot) => {
    const disabled = !slot.available;
    const selected = slot.available && preselectedTime && slot.time === preselectedTime;
    return `
      <button type="button" class="btn ${selected || !disabled ? (selected ? 'btn-green' : 'btn-ghost') : 'btn-ghost'}" style="opacity:${disabled ? '0.45' : '1'};pointer-events:${disabled ? 'none' : 'auto'};" data-reschedule-time="${slot.time}">
        ${slot.time}
      </button>
    `;
  }).join('');

  container.querySelectorAll('[data-reschedule-time]').forEach((button) => {
    button.addEventListener('click', () => {
      container.querySelectorAll('[data-reschedule-time]').forEach((item) => item.classList.remove('btn-green'));
      container.querySelectorAll('[data-reschedule-time]').forEach((item) => item.classList.add('btn-ghost'));
      button.classList.remove('btn-ghost');
      button.classList.add('btn-green');
      rescheduleSelectedTime = button.dataset.rescheduleTime;
    });
  });

  if (preselectedTime) {
    const preselectedButton = container.querySelector(`[data-reschedule-time="${preselectedTime}"]`);
    if (preselectedButton && preselectedButton.style.pointerEvents !== 'none') {
      preselectedButton.classList.remove('btn-ghost');
      preselectedButton.classList.add('btn-green');
      rescheduleSelectedTime = preselectedTime;
    }
  }
}

async function openRescheduleModal(bookingId) {
  const bookingsData = await getMyBookings();
  const booking = bookingsData?.bookings?.find((item) => String(item.id) === String(bookingId));
  if (!booking) {
    showToast('Booking not found.');
    return;
  }

  const modal = document.getElementById('reschedule-modal');
  const bookingIdField = document.getElementById('reschedule-booking-id');
  const dateField = document.getElementById('reschedule-date');
  const durationField = document.getElementById('reschedule-duration');
  if (!modal || !bookingIdField || !dateField || !durationField) return;

  bookingIdField.value = booking.id;
  dateField.value = booking.date;
  dateField.min = new Date().toISOString().split('T')[0];
  durationField.value = String(booking.duration || 60);
  modal.classList.add('open');
  await loadRescheduleSlots(booking.date, booking.timeSlot || '');
}

async function confirmReschedule() {
  const bookingId = document.getElementById('reschedule-booking-id')?.value;
  const date = document.getElementById('reschedule-date')?.value;
  const duration = Number(document.getElementById('reschedule-duration')?.value || 60);
  const button = document.getElementById('confirm-reschedule-btn');

  if (!bookingId || !date || !rescheduleSelectedTime) {
    showToast('Choose a new date and time first.');
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Rescheduling...';
  }

  const result = await rescheduleBooking(bookingId, {
    date,
    timeSlot: rescheduleSelectedTime,
    duration
  });

  if (button) {
    button.disabled = false;
    button.textContent = 'Confirm Reschedule';
  }

  if (result && result.success) {
    showToast(result.message || 'Booking rescheduled.');
    closeRescheduleModal();
    loadBookings();
  }
}

async function loadMembershipStatus() {
  const data = await getMembershipStatus();
  if (!data || !data.membership) return;

  const membership = data.membership;
  const bookingsLeftEl = document.getElementById('stat-bookings-left');
  const daysRenewalEl = document.getElementById('stat-days-renewal');
  const planNameEl = document.querySelector('.mem-plan-name');
  const planPriceEl = document.querySelector('.mem-price');
  const planPeriod = document.querySelector('.mem-period');
  const renewalEl = document.querySelector('.mem-renewal');
  const statusBadge = document.getElementById('membership-status-badge');
  const billingSummaryEl = document.getElementById('billing-history-summary');
  const cancelMembershipBtn = document.getElementById('cancel-membership-btn');

  if (bookingsLeftEl) {
    bookingsLeftEl.textContent = membership.bookingsLimit === 'Unlimited'
      ? '∞'
      : Math.max(0, (membership.bookingsLimit || 0) - (membership.bookingsUsed || 0));
  }

  if (daysRenewalEl && membership.expiry) {
    const days = Math.max(0, Math.ceil((new Date(membership.expiry) - new Date()) / (1000 * 60 * 60 * 24)));
    daysRenewalEl.textContent = membership.isActive ? days : '--';
  }

  const planPrices = { bronze: 5000, silver: 12000, gold: 25000 };

  if (!membership.isActive || membership.plan === 'none') {
    if (planNameEl) planNameEl.textContent = 'No Plan';
    if (planPriceEl) planPriceEl.textContent = '--';
    if (planPeriod) planPeriod.textContent = '';
    if (renewalEl) renewalEl.textContent = 'No active membership yet';
    if (statusBadge) {
      statusBadge.textContent = 'Inactive';
      statusBadge.className = 'status-badge completed';
    }
    if (billingSummaryEl) billingSummaryEl.textContent = 'You have not activated a membership yet.';
    if (cancelMembershipBtn) cancelMembershipBtn.style.display = 'none';
    return;
  }

  if (planNameEl) planNameEl.textContent = getMembershipLabel(membership.plan);
  if (planPriceEl) planPriceEl.textContent = `₦${(planPrices[membership.plan] || 0).toLocaleString()}`;
  if (planPeriod) planPeriod.textContent = '/ month';
  if (statusBadge) {
    statusBadge.textContent = 'Active';
    statusBadge.className = 'status-badge confirmed';
  }
  if (billingSummaryEl) {
    billingSummaryEl.textContent = `${getMembershipLabel(membership.plan)} membership is active and renews automatically.`;
  }
  if (cancelMembershipBtn) cancelMembershipBtn.style.display = 'block';

  const memStatEls = document.querySelectorAll('.mem-stat-num');
  if (memStatEls.length >= 3) {
    const bookingsLeft = membership.bookingsLimit === 'Unlimited'
      ? '∞'
      : Math.max(0, (membership.bookingsLimit || 0) - (membership.bookingsUsed || 0));
    memStatEls[0].textContent = bookingsLeft;
    memStatEls[1].textContent = membership.bookingsLimit === 'Unlimited' ? '∞' : (membership.bookingsLimit || 0);
    if (membership.expiry) {
      const days = Math.max(0, Math.ceil((new Date(membership.expiry) - new Date()) / (1000 * 60 * 60 * 24)));
      memStatEls[2].textContent = days;
    }
  }

  if (renewalEl && membership.expiry) {
    renewalEl.innerHTML = `Renews on <strong>${new Date(membership.expiry).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>`;
  }
}

async function handleCancelMembership() {
  if (!confirm('Cancel your membership? You will lose access at the end of the current period.')) return;
  const data = await cancelMembership();
  if (data && data.success) {
    loadMembershipStatus();
    const fresh = await getMyProfile();
    if (fresh && fresh.user) {
      saveUser(fresh.user);
      populateDashboard(fresh.user);
    }
  }
}

async function saveProfile() {
  const firstName = document.getElementById('profile-firstname')?.value.trim();
  const lastName = document.getElementById('profile-lastname')?.value.trim();
  const phone = document.getElementById('profile-phone')?.value.trim();
  const city = document.getElementById('profile-city')?.value.trim();
  const favouritePosition = document.getElementById('profile-position')?.value;
  const notificationPreferences = getNotificationPreferencesFromForm();
  const currentPassword = document.getElementById('profile-current-password')?.value;
  const newPassword = document.getElementById('profile-new-password')?.value;
  const confirmPassword = document.getElementById('profile-confirm-password')?.value;

  if (newPassword && newPassword !== confirmPassword) {
    showToast('New passwords do not match.');
    return;
  }

  const updates = { firstName, lastName, phone, city, favouritePosition, notificationPreferences };
  if (newPassword) {
    updates.currentPassword = currentPassword;
    updates.newPassword = newPassword;
  }

  const btn = document.querySelector('#tab-profile .btn-green');
  if (btn) {
    btn.textContent = 'Saving...';
    btn.disabled = true;
  }

  const data = await updateProfile(updates);

  if (btn) {
    btn.textContent = 'Save Changes';
    btn.disabled = false;
  }

  if (data && data.success) {
    populateDashboard(data.user);
    ['profile-current-password', 'profile-new-password', 'profile-confirm-password'].forEach((id) => {
      const field = document.getElementById(id);
      if (field) field.value = '';
    });
  }
}

async function initDashboard() {
  if (typeof syncAuthUI === 'function') syncAuthUI();
  initQrActions();
  initProfileToggleButtons();
  initRescheduleModal();

  if (user) populateDashboard({ ...user, role: 'user' });

  const fresh = await getMyProfile();
  if (fresh && fresh.user) {
    saveUser(fresh.user);
    populateDashboard(fresh.user);
  }

  loadBookings();
  loadMembershipStatus();
  loadQrCode();
  loadOverviewEvents();
}

window.addEventListener('load', initDashboard);
