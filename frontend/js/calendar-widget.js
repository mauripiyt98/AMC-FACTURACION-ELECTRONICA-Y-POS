(() => {
const state = { cursor: new Date(), events: [] };
const $ = (id) => document.getElementById(id);
const API_BASE = 'http://localhost:3000/api';
const LOCAL_EVENTS_KEY = 'amc_calendario_eventos_local';
const token = () => { try { return JSON.parse(sessionStorage.getItem('amc_session_v2') || '{}').token; } catch { return null; } };
async function calendarFetch(path) { const response = await fetch(`${API_BASE}${path}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} }); if (!response.ok) throw new Error('API no disponible'); return response.json(); }
const dateKey = (date) => date.toISOString().slice(0, 10);
const label = (date) => new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
const shortDate = (date) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));

function renderCalendar() {
  const month = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const last = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 0);
  $('calendar-widget-month').textContent = label(month);
  const start = (month.getDay() + 6) % 7;
  const eventByDay = state.events.reduce((map, event) => { (map[event.fecha_inicio] ||= []).push(event); return map; }, {});
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < start + last.getDate(); i++) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day';
    if (i < start) { button.disabled = true; button.classList.add('is-empty'); } else {
      const day = i - start + 1; const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const events = eventByDay[key] || []; button.textContent = day; button.dataset.date = key;
      if (key === dateKey(new Date())) button.classList.add('is-today');
      if (events.length) { const dots = document.createElement('i'); dots.className = 'calendar-dot'; dots.style.background = events[0].color; button.append(dots); }
      button.addEventListener('click', () => showDay(key, events));
    } fragment.append(button);
  } $('calendar-widget-days').replaceChildren(fragment);
}

function showDay(date, events) {
  const popover = $('calendar-widget-popover');
  if (!events.length) { popover.hidden = false; popover.textContent = `No hay tareas para ${shortDate(date)}.`; return; }
  popover.hidden = false; popover.replaceChildren(...events.slice(0, 3).map((event) => { const item = document.createElement('span'); item.innerHTML = `<i style="background:${event.color}"></i>${event.titulo}`; return item; }));
}

function daysRemaining(date) { return Math.ceil((new Date(`${date}T12:00:00`) - new Date(new Date().toDateString())) / 86400000); }
function renderUpcoming(events) {
  const list = $('calendar-widget-upcoming');
  if (!events.length) { list.innerHTML = '<p class="calendar-empty">No hay vencimientos pendientes.</p>'; return; }
  list.replaceChildren(...events.map((event) => { const days = daysRemaining(event.fecha_inicio); const item = document.createElement('a'); item.href = 'calendario/calendario.html'; item.className = 'calendar-upcoming-item'; item.innerHTML = `<i style="background:${event.color}"></i><span><b>${event.titulo}</b><small>${shortDate(event.fecha_inicio)}</small></span><em class="${days <= 1 ? 'urgent' : ''}">${days === 0 ? 'Hoy' : `${days} día${days === 1 ? '' : 's'}`}</em>`; return item; }));
}

async function load() {
  const year = state.cursor.getFullYear(), month = state.cursor.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`, to = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  try { const [range, upcoming] = await Promise.all([calendarFetch(`/calendario?desde=${from}&hasta=${to}`), calendarFetch('/calendario/proximos?limit=3')]); state.events = range.eventos; renderCalendar(); renderUpcoming(upcoming.eventos); } catch { const saved = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]'); state.events = saved.filter((event) => event.fecha_inicio >= from && event.fecha_inicio <= to); renderCalendar(); renderUpcoming(saved.filter((event) => event.estado !== 'COMPLETADO' && event.fecha_inicio >= dateKey(new Date())).sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)).slice(0, 3)); }
}

$('calendar-widget-prev').addEventListener('click', () => { state.cursor.setMonth(state.cursor.getMonth() - 1); renderCalendar(); load(); });
$('calendar-widget-next').addEventListener('click', () => { state.cursor.setMonth(state.cursor.getMonth() + 1); renderCalendar(); load(); });
$('calendar-schedule-button').addEventListener('click', () => { window.location.assign('./calendario/calendario.html'); });
load();
})();
