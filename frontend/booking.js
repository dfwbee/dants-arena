const PITCH_PRICING = { 60: 15000, 90: 20000, 120: 28000, 180: 40000 };

let selectedFacility = 'Football Pitch (5-A-Side)';
let selectedTime     = '';
let currentStep      = 1;


document.addEventListener('DOMContentLoaded', async () => {

  // Handle Paystack callback after payment redirect
  const urlParams = new URLSearchParams(window.location.search);
  const payment   = urlParams.get('payment');
  const reference = urlParams.get('reference') || urlParams.get('trxref');

  if (payment === 'success' && reference && isLoggedIn()) {
    showToast('⏳ Verifying your payment...');
    const result = await verifyBookingPayment(reference);
    if (result && result.success) {
      showToast('🎉 Payment confirmed! Your booking is fully paid.');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
    }
    return; // Stop normal booking form init
  }

  // Pre-fill step-3 details from logged-in user
  const user = getUser();
  if (user) {
    const fnameEl = document.getElementById('fname');
    const lnameEl = document.getElementById('lname');
    const emailEl = document.getElementById('email');
    const phoneEl = document.getElementById('phone');
    if (fnameEl && !fnameEl.value) fnameEl.value = user.firstName || '';
    if (lnameEl && !lnameEl.value) lnameEl.value = user.lastName  || '';
    if (emailEl && !emailEl.value) emailEl.value = user.email     || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = user.phone     || '';
  }

  const dateInput = document.getElementById('booking-date');
  if (dateInput) {
    const today     = new Date();
    dateInput.value = today.toISOString().split('T')[0];
    dateInput.min = today.toISOString().split('T')[0];
    await loadAvailableSlots(dateInput.value);
  }

  if (dateInput) {
    dateInput.addEventListener('change', async () => {
      await loadAvailableSlots(dateInput.value);
      updateSummary();
    });
  }
});


async function loadAvailableSlots(date) {
  if (!date) return;

  const slotsGrid = document.querySelector('.slots-grid');
  if (slotsGrid) {
    slotsGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--muted);
      font-family:var(--font-mono);font-size:0.75rem;letter-spacing:1px;">
        ⏳ Loading available slots...
      </div>`;
  }

  const data = await getAvailableSlots(date, selectedFacility);

  if (!data || !data.slots) {
    if (slotsGrid) {
      slotsGrid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:20px;
        color:var(--muted);font-size:0.85rem;">
          ❌ Could not load slots. Please check your connection.
        </div>`;
    }
    return;
  }

  if (slotsGrid) {
    slotsGrid.innerHTML = data.slots.map(slot => `
      <div class="slot ${!slot.available ? (slot.status === 'passed' ? 'passed' : 'booked') : ''}"
        onclick="${slot.available ? `selectSlot(this, '${slot.time}')` : ''}">
        ${slot.time}
        ${!slot.available ? `<br/><span style="font-size:0.6rem;opacity:0.6;">${slot.status === 'passed' ? 'Passed' : 'Booked'}</span>` : ''}
      </div>
    `).join('');

    const firstAvailable = data.slots.find(s => s.available);
    if (firstAvailable) {
      selectedTime = firstAvailable.time;
      const firstSlotEl = slotsGrid.querySelector('.slot:not(.booked):not(.passed)');
      if (firstSlotEl) firstSlotEl.classList.add('selected');
      const sumTime = document.getElementById('sum-time');
      if (sumTime) sumTime.textContent = firstAvailable.time;
    } else {
      selectedTime = '';
      const sumTime = document.getElementById('sum-time');
      if (sumTime) sumTime.textContent = '—';
    }
  }
}


function goToStep(step) {

  if (step > currentStep) {
    if (currentStep === 2) {
      const dateInput = document.getElementById('booking-date');
      if (!dateInput || !dateInput.value) {
        showToast('⚠️ Please select a date first.');
        return;
      }
      if (!selectedTime) {
        showToast('⚠️ Please select a time slot.');
        return;
      }
    }
    if (currentStep === 3) {
      const fname = document.getElementById('fname')?.value.trim();
      const lname = document.getElementById('lname')?.value.trim();
      const email = document.getElementById('email')?.value.trim();
      const phone = document.getElementById('phone')?.value.trim();
      if (!fname || !lname || !email || !phone) {
        showToast('⚠️ Please fill in all your details.');
        return;
      }
    }
  }

  document.getElementById('step-' + currentStep).classList.remove('active');
  document.getElementById('prog-' + currentStep).classList.remove('active');

  if (step > currentStep) {
    document.getElementById('prog-' + currentStep).classList.add('done');
    const line = document.getElementById('line-' + currentStep);
    if (line) line.classList.add('done');
  } else {
    document.getElementById('prog-' + currentStep).classList.remove('done');
    const line = document.getElementById('line-' + currentStep);
    if (line) line.classList.remove('done');
  }

  currentStep = step;
  document.getElementById('step-' + currentStep).classList.add('active');
  document.getElementById('prog-' + currentStep).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (step === 4) updateSummary();
}


function selectFacility(el, name) {
  document.querySelectorAll('.facility-option').forEach(f => f.classList.remove('selected'));
  el.classList.add('selected');
  selectedFacility = name;
  updateSummary();

  const dateInput = document.getElementById('booking-date');
  if (dateInput && dateInput.value) {
    loadAvailableSlots(dateInput.value);
  }
}

function selectSlot(el, time) {
  document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  selectedTime = time;
  const sumTime = document.getElementById('sum-time');
  if (sumTime) sumTime.textContent = time;
}

function updateSummary() {
  const dateEl     = document.getElementById('booking-date');
  const durationEl = document.getElementById('booking-duration');
  const sumDate    = document.getElementById('sum-date');
  const sumDur     = document.getElementById('sum-duration');
  const sumTotal   = document.getElementById('sum-total');
  const sumFac     = document.getElementById('sum-facility');

  if (dateEl && sumDate) {
    const d = new Date(dateEl.value + 'T12:00:00');
    sumDate.textContent = isNaN(d)
      ? '—'
      : d.toLocaleDateString('en-NG', {
          weekday: 'short', year: 'numeric',
          month: 'short', day: 'numeric'
        });
  }

  if (durationEl && sumDur) {
    const hrs     = parseInt(durationEl.value);
    const minutes = hrs * 60;
    sumDur.textContent = hrs + (hrs === 1 ? ' Hour' : ' Hours');
    if (sumTotal) {
      const price = PITCH_PRICING[minutes] || PITCH_PRICING[60];
      sumTotal.textContent = '₦' + price.toLocaleString();
    }
  }

  if (sumFac) sumFac.textContent = selectedFacility;
}


function selectPayment(el) {
  document.querySelectorAll('.payment-opt').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  const cardFields = document.getElementById('card-fields');
  if (cardFields) {
    cardFields.style.display = el.textContent.toLowerCase().includes('paystack') ? 'block' : 'none';
  }
}


async function confirmBooking() {

  if (!isLoggedIn()) {
    showToast('⚠️ Please log in to complete your booking.');
    openModal('login');
    return;
  }

  const dateEl     = document.getElementById('booking-date');
  const durationEl = document.getElementById('booking-duration');

  // Determine payment method
  const selectedPaymentEl = document.querySelector('.payment-opt.selected');
  const paymentText       = selectedPaymentEl ? selectedPaymentEl.textContent.trim() : '';
  let paymentMethod;
  if (paymentText.toLowerCase().includes('arrival')) {
    paymentMethod = 'pay_on_arrival';
  } else {
    paymentMethod = 'online';
  }

  const durationHours   = parseInt(durationEl?.value || 1);
  const durationMinutes = durationHours * 60;

  const bookingData = {
    facility:        selectedFacility,
    date:            dateEl?.value,
    timeSlot:        selectedTime,
    duration:        durationMinutes,
    teamName:        document.getElementById('team-name')?.value || '',
    specialRequests: document.getElementById('special-requests')?.value || '',
    paymentMethod,
  };

  const confirmBtn = document.querySelector('#step-4 .btn-green');
  if (confirmBtn) {
    confirmBtn.textContent = '⏳ Processing...';
    confirmBtn.disabled    = true;
  }

  const result = await createBooking(bookingData);

  if (confirmBtn) {
    confirmBtn.textContent = '✅ Confirm Booking';
    confirmBtn.disabled    = false;
  }

  if (result && result.success) {
    const booking = result.booking;

    if (paymentMethod === 'online') {
      // Initiate Paystack payment
      if (confirmBtn) { confirmBtn.textContent = '💳 Redirecting to payment...'; confirmBtn.disabled = true; }
      const paymentResult = await initiateBookingPayment(booking.id);
      if (paymentResult && paymentResult.success) {
        showToast('💳 Redirecting to Paystack...');
        setTimeout(() => { window.location.href = paymentResult.authorizationUrl; }, 1200);
      } else {
        if (confirmBtn) { confirmBtn.textContent = '✅ Confirm Booking'; confirmBtn.disabled = false; }
      }
    } else {
      // Pay on arrival — show success screen immediately
      showSuccessScreen(booking);
    }
  }
}

function showSuccessScreen(booking) {
  const successDate  = document.getElementById('success-date');
  const successTime  = document.getElementById('success-time');
  const successTotal = document.getElementById('success-total');
  const successId    = document.getElementById('success-booking-id');
  const successFacility = document.getElementById('success-facility');

  if (successDate) {
    const d = new Date(booking.date + 'T12:00:00');
    successDate.textContent = d.toLocaleDateString('en-NG', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }
  if (successTime)  successTime.textContent  = booking.timeSlot;
  if (successTotal) successTotal.textContent = '₦' + Number(booking.totalAmount).toLocaleString();
  if (successId)    successId.textContent    = '#' + booking.bookingId;
  if (successFacility) successFacility.textContent = booking.facility || selectedFacility;

  const progressBar = document.querySelector('.progress-bar');
  if (progressBar) progressBar.style.display = 'none';

  document.getElementById('step-' + currentStep).classList.remove('active');
  document.getElementById('step-success').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
