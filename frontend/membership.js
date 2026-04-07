let isAnnual = false;
let selectedPlanKey = '';

function formatPlanPrice(planName) {
  const card = Array.from(document.querySelectorAll('.plan-card')).find((item) => {
    const title = item.querySelector('.plan-name');
    return title && title.textContent.trim().toLowerCase() === planName.toLowerCase();
  });

  if (!card) return '';

  const amount = card.querySelector('.price-amount');
  if (!amount) return '';

  const value = isAnnual ? amount.dataset.annual : amount.dataset.monthly;
  return `₦${value}/${isAnnual ? 'year' : 'month'}`;
}

function getPlanKey(planName) {
  return String(planName || '').trim().toLowerCase();
}

function toggleBilling() {
  isAnnual = !isAnnual;

  const knob = document.getElementById('toggle-knob');
  const monthly = document.getElementById('toggle-monthly');
  const annual = document.getElementById('toggle-annual');
  const amounts = document.querySelectorAll('.price-amount');
  const periods = document.querySelectorAll('.price-period');

  if (knob) knob.classList.toggle('on', isAnnual);
  if (monthly) monthly.classList.toggle('active', !isAnnual);
  if (annual) annual.classList.toggle('active', isAnnual);

  amounts.forEach((el) => {
    el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly;
  });

  periods.forEach((el) => {
    el.textContent = isAnnual ? '/ year' : '/ month';
  });
}

function selectPlan(name) {
  if (!isLoggedIn()) {
    showToast('Please log in or sign up to activate a membership.');
    if (typeof openModal === 'function') openModal('signup');
    return;
  }

  const planNameEl = document.getElementById('plan-modal-name');
  const selectedPlanDisplay = document.getElementById('selected-plan-display');
  const planModal = document.getElementById('plan-modal-overlay');
  selectedPlanKey = getPlanKey(name);

  if (planNameEl) planNameEl.textContent = name;
  if (selectedPlanDisplay) {
    selectedPlanDisplay.textContent = `${name} Plan - ${formatPlanPrice(name)}`;
  }
  if (planModal) planModal.classList.add('open');
}

function closePlanModal() {
  const planModal = document.getElementById('plan-modal-overlay');
  const submitBtn = document.getElementById('plan-modal-submit');
  if (planModal) planModal.classList.remove('open');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Continue to Paystack →';
  }
}

async function startMembershipCheckout() {
  if (!selectedPlanKey) {
    showToast('Select a membership plan first.');
    return;
  }

  const submitBtn = document.getElementById('plan-modal-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Redirecting...';
  }

  const result = await subscribeToPlan(selectedPlanKey);

  if (!result || !result.success) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue to Paystack →';
    }
    return;
  }

  closePlanModal();
}

const planModal = document.getElementById('plan-modal-overlay');
if (planModal) {
  planModal.addEventListener('click', function (e) {
    if (e.target === this) closePlanModal();
  });
}

function toggleFaq(el) {
  const answer = el.nextElementSibling;
  const arrow = el.querySelector('.faq-arrow');
  const isOpen = answer.classList.contains('open');

  document.querySelectorAll('.faq-answer').forEach((item) => item.classList.remove('open'));
  document.querySelectorAll('.faq-arrow').forEach((item) => item.classList.remove('open'));

  if (!isOpen) {
    answer.classList.add('open');
    arrow.classList.add('open');
  }
}

const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), index * 100);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

reveals.forEach((el) => observer.observe(el));
