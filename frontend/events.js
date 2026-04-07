const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let calDate = new Date();
calDate = new Date(calDate.getFullYear(), calDate.getMonth(), 1);
let selectedDay = null;
let activeFilter = 'all';
let activeEventId = null;
let loadedEvents = [];

function formatEventPrice(value) {
  if (value === null || value === undefined || value === '') return 'FREE';
  if (typeof value === 'string' && value.trim()) return value.trim();
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 'FREE';
  return `₦${numberValue.toLocaleString()}`;
}

function getSpotsLeft(event) {
  const total = Number(event.total_spots || 0);
  const registered = Number(event.registered_count || 0);
  return Math.max(total - registered, 0);
}

function formatSpots(event) {
  const left = getSpotsLeft(event);
  return left === 0 ? 'Full' : `${left} spot${left === 1 ? '' : 's'} left`;
}

function isLowSpots(event) {
  const left = getSpotsLeft(event);
  return left > 0 && left <= 5;
}

function titleCase(value) {
  return String(value || 'event')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderCalendar() {
  const monthLabel = document.getElementById('cal-month-label');
  const grid = document.getElementById('cal-grid');
  if (!monthLabel || !grid) return;

  monthLabel.textContent = `${months[calDate.getMonth()]} ${calDate.getFullYear()}`;
  grid.innerHTML = '';

  const firstDay = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();
  const today = new Date();
  const eventDays = new Set(
    loadedEvents
      .map((event) => new Date(`${event.date}T12:00:00`))
      .filter((date) => date.getMonth() === calDate.getMonth() && date.getFullYear() === calDate.getFullYear())
      .map((date) => date.getDate())
  );

  for (let i = 0; i < firstDay; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = day;

    if (eventDays.has(day)) cell.classList.add('has-event');
    if (selectedDay === day) cell.classList.add('selected');
    if (
      today.getFullYear() === calDate.getFullYear() &&
      today.getMonth() === calDate.getMonth() &&
      today.getDate() === day
    ) {
      cell.classList.add('today');
    }

    cell.addEventListener('click', () => {
      selectedDay = day;
      renderCalendar();
      renderEvents();
    });
    grid.appendChild(cell);
  }
}

function renderEvents() {
  const list = document.getElementById('events-list');
  const title = document.getElementById('events-list-title');
  const counter = document.getElementById('events-count');
  if (!list || !title || !counter) return;

  let filtered = loadedEvents.filter((event) => {
    const eventDate = new Date(`${event.date}T12:00:00`);
    return eventDate.getMonth() === calDate.getMonth() && eventDate.getFullYear() === calDate.getFullYear();
  });

  if (selectedDay) {
    filtered = filtered.filter((event) => new Date(`${event.date}T12:00:00`).getDate() === selectedDay);
    title.textContent = `Events on ${monthsShort[calDate.getMonth()]} ${selectedDay}`;
  } else {
    title.textContent = `All Events — ${months[calDate.getMonth()]}`;
  }

  if (activeFilter !== 'all') {
    filtered = filtered.filter((event) => event.type === activeFilter);
  }

  filtered.sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date);
    if (dateDiff !== 0) return dateDiff;
    return String(a.time || '').localeCompare(String(b.time || ''));
  });

  counter.textContent = `${filtered.length} event${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="no-events">
        <div class="no-icon">📭</div>
        <p>No events found for this selection.<br/>Try a different date or filter.</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((event) => {
    const eventDate = new Date(`${event.date}T12:00:00`);
    return `
      <div class="event-card" onclick="openEventModal('${event.id}')">
        <div class="event-date-box">
          <div class="event-day">${eventDate.getDate()}</div>
          <div class="event-month">${monthsShort[eventDate.getMonth()]}</div>
        </div>
        <div class="event-info">
          <h4>${event.title}</h4>
          <p>${event.time || 'Time TBA'}</p>
          <div class="event-tags">
            <span class="event-tag type-${event.type || 'tournament'}">${titleCase(event.type)}</span>
            ${event.prize ? `<span class="event-tag">🏆 ${event.prize}</span>` : ''}
          </div>
        </div>
        <div class="event-price">
          <div class="price ${formatEventPrice(event.price) === 'FREE' ? 'free' : ''}">${formatEventPrice(event.price)}</div>
          <div class="spots ${isLowSpots(event) ? 'low' : ''}">${isLowSpots(event) ? '🔴 ' : ''}${formatSpots(event)}</div>
        </div>
      </div>`;
  }).join('');
}

function renderFeaturedEvent() {
  const banner = document.querySelector('.featured-banner');
  if (!banner) return;

  const featured = loadedEvents.find((event) => event.type === 'tournament') || loadedEvents[0];
  if (!featured) {
    banner.style.display = 'none';
    return;
  }

  const eventDate = new Date(`${featured.date}T12:00:00`);
  banner.style.display = '';
  const badge = banner.querySelector('.featured-badge');
  const title = banner.querySelector('h2');
  const desc = banner.querySelector('p');
  const meta = banner.querySelector('.featured-meta');
  const button = banner.querySelector('.btn');
  const art = banner.querySelector('.featured-art');

  if (badge) badge.textContent = `🔥 Featured ${titleCase(featured.type)}`;
  if (title) title.innerHTML = `${featured.title.split(' ').slice(0, -1).join(' ') || featured.title} <span class="green-text">${featured.title.split(' ').slice(-1).join(' ')}</span>`;
  if (desc) desc.textContent = featured.description || 'Join us for one of the biggest events at Dants Arena.';
  if (meta) {
    meta.innerHTML = `
      <span>📅 ${months[eventDate.getMonth()]} ${eventDate.getDate()}, ${eventDate.getFullYear()}</span>
      <span>🕐 ${featured.time || 'Time TBA'}</span>
      <span>📍 Dants Arena, Abeokuta</span>
      <span>${featured.prize ? `🏆 Prize: ${featured.prize}` : `🎟️ ${formatEventPrice(featured.price)}`}</span>
    `;
  }
  if (button) {
    button.onclick = () => openEventModal(featured.id);
    button.textContent = 'Register Now ->';
  }
  if (art) art.textContent = featured.type === 'viewing' ? '📺' : featured.type === 'training' ? '🎯' : '🏆';
}

function monthHasEvents(date) {
  return loadedEvents.some((event) => {
    const eventDate = new Date(`${event.date}T12:00:00`);
    return eventDate.getMonth() === date.getMonth() && eventDate.getFullYear() === date.getFullYear();
  });
}

async function loadEvents() {
  const result = await getAllEvents();
  loadedEvents = result && result.success ? (result.events || []) : [];

  if (loadedEvents.length && !monthHasEvents(calDate)) {
    const firstEventDate = new Date(`${loadedEvents[0].date}T12:00:00`);
    calDate = new Date(firstEventDate.getFullYear(), firstEventDate.getMonth(), 1);
    selectedDay = null;
  }

  renderCalendar();
  renderEvents();
  renderFeaturedEvent();
}

function changeMonth(direction) {
  calDate.setMonth(calDate.getMonth() + direction);
  selectedDay = null;
  loadEvents();
}

function filterEvents(element, type) {
  document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
  element.classList.add('active');
  activeFilter = type;
  renderEvents();
}

function openEventModal(id) {
  const event = loadedEvents.find((item) => String(item.id) === String(id));
  if (!event) return;

  activeEventId = event.id;
  const eventDate = new Date(`${event.date}T12:00:00`);
  document.getElementById('em-tag').textContent = titleCase(event.type);
  document.getElementById('em-title').textContent = event.title;
  document.getElementById('em-desc').textContent = event.description || 'Event details coming soon.';
  document.getElementById('em-date').textContent = `${monthsShort[eventDate.getMonth()]} ${eventDate.getDate()}, ${eventDate.getFullYear()}`;
  document.getElementById('em-time').textContent = event.time || 'Time TBA';
  document.getElementById('em-price').textContent = formatEventPrice(event.price);
  document.getElementById('em-spots').textContent = formatSpots(event);
  document.getElementById('event-modal-overlay').classList.add('open');
}

function closeEventModal() {
  document.getElementById('event-modal-overlay')?.classList.remove('open');
}

async function registerEvent() {
  if (!activeEventId) return;

  if (!isLoggedIn()) {
    closeEventModal();
    showToast('Please log in or sign up to register for events.');
    if (typeof openModal === 'function') openModal('signup');
    return;
  }

  const result = await registerForEvent(activeEventId);
  if (result && result.success) {
    closeEventModal();
    await loadEvents();
  }
}

document.getElementById('event-modal-overlay')?.addEventListener('click', function onOverlayClick(event) {
  if (event.target === this) closeEventModal();
});

const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (!entry.isIntersecting) return;
    setTimeout(() => entry.target.classList.add('visible'), index * 80);
    observer.unobserve(entry.target);
  });
}, { threshold: 0.1 });
reveals.forEach((element) => observer.observe(element));

loadEvents();
