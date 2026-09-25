(() => {
  if (window.__amcCalendarLoaded) return;
  window.__amcCalendarLoaded = true;
  const $ = (id) => document.getElementById(id);
  const state = { year: new Date().getFullYear(), events: [], upcoming: [], selectedDate: null };
  const colors = { IMPUESTO:'#e05768', NOMINA:'#7b4df2', COBRO:'#e99a16', REUNION:'#0b8ede', TAREA:'#0dbb75', GENERAL:'#0b46eb' };
  const api = 'http://localhost:3000/api';
  const localKey = 'amc_calendario_eventos_local';
  const token = () => { try { return JSON.parse(sessionStorage.getItem('amc_session_v2') || '{}').token; } catch { return null; } };
  const fetchApi = async (path, options = {}) => { const response = await fetch(`${api}${path}`, { ...options, headers: { 'Content-Type':'application/json', ...(token() ? { Authorization:`Bearer ${token()}` } : {}) } }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || 'No fue posible conectar con el calendario'); } return response.status === 204 ? null : response.json(); };
  const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const formatted = (value) => new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`));
  const remaining = (value) => Math.ceil((new Date(`${value}T12:00:00`) - new Date(new Date().toDateString())) / 86400000);
  function render() {
    $('month-title').textContent = String(state.year);
    const eventsByDate = state.events.reduce((all,event) => { (all[event.fecha_inicio] ||= []).push(event); return all; }, {});
    const root = document.createDocumentFragment();
    for (let month = 0; month < 12; month++) {
      const card = document.createElement('section'); card.className = 'year-month';
      const title = document.createElement('h3'); title.textContent = new Intl.DateTimeFormat('es-CO',{month:'long'}).format(new Date(state.year,month,1)); card.append(title);
      const weekdays = document.createElement('div'); weekdays.className='year-weekdays'; weekdays.innerHTML='<span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>'; card.append(weekdays);
      const days = document.createElement('div'); days.className='year-days'; const start=(new Date(state.year,month,1).getDay()+6)%7, max=new Date(state.year,month+1,0).getDate();
      for(let i=0;i<start+max;i++){const cell=document.createElement('button');cell.type='button';cell.className='year-day';if(i<start){cell.disabled=true;cell.classList.add('blank');}else{const number=i-start+1,date=new Date(state.year,month,number),dateId=dayKey(date),events=eventsByDate[dateId]||[];cell.innerHTML=`<span>${number}</span>`;if(dateId===dayKey(new Date()))cell.classList.add('today');if(events.length){const dot=document.createElement('i');dot.style.background=events[0].color;cell.append(dot);cell.title=`${events.length} evento${events.length===1?'':'s'}`;}cell.addEventListener('click',()=>openDay(dateId));}days.append(cell);}card.append(days);root.append(card);
    } $('calendar-grid').replaceChildren(root); renderUpcoming();
  }
  function renderUpcoming(){const root=$('upcoming-events');if(!state.upcoming.length){root.innerHTML='<p class="calendar-empty-side">No hay vencimientos próximos.</p>';return;}root.replaceChildren(...state.upcoming.map(event=>{const item=document.createElement('article');item.className='calendar-event-item';const bar=document.createElement('i');if(/^#[\da-f]{6}$/i.test(event.color||''))bar.style.background=event.color;const details=document.createElement('div'),title=document.createElement('b'),date=document.createElement('span'),remainingLabel=document.createElement('em');title.textContent=event.titulo;date.textContent=formatted(event.fecha_inicio);const days=remaining(event.fecha_inicio);remainingLabel.textContent=days===0?'Hoy':`${days} d`;details.append(title,date);item.append(bar,details,remainingLabel);item.addEventListener('click',()=>openEvent(event));return item;}));}
  const localEvents = () => {
    for (const storageName of ['localStorage', 'sessionStorage']) {
      try {
        const storage = window[storageName];
        const saved = storage.getItem(localKey);
        if (saved !== null) return JSON.parse(saved);
      } catch { /* Prueba el siguiente almacenamiento disponible. */ }
    }
    return [];
  };
  const saveLocalEvents = (events) => {
    const serialized = JSON.stringify(events);
    for (const storageName of ['localStorage', 'sessionStorage']) {
      try { window[storageName].setItem(localKey, serialized); return true; } catch { /* Prueba el siguiente almacenamiento disponible. */ }
    }
    return false;
  };
  const mergeEvents = (...groups) => { const merged = new Map(); groups.flat().forEach(event => merged.set(event.id || `${event.fecha_inicio}-${event.titulo}`, event)); return [...merged.values()]; };
  async function load(){const saved=localEvents();try{const [events,upcoming]=await Promise.all([fetchApi(`/calendario?desde=${state.year}-01-01&hasta=${state.year}-12-31`),fetchApi('/calendario/proximos?limit=10')]);state.events=mergeEvents(events.eventos,saved.filter(event=>event.fecha_inicio.startsWith(`${state.year}-`)));state.upcoming=mergeEvents(upcoming.eventos,saved.filter(event=>event.estado==='PENDIENTE'&&event.fecha_inicio>=dayKey(new Date()))).sort((a,b)=>a.fecha_inicio.localeCompare(b.fecha_inicio)).slice(0,5);render();}catch{state.events=saved.filter(event=>event.fecha_inicio.startsWith(`${state.year}-`));state.upcoming=saved.filter(event=>event.estado==='PENDIENTE'&&event.fecha_inicio>=dayKey(new Date())).sort((a,b)=>a.fecha_inicio.localeCompare(b.fecha_inicio)).slice(0,5);render();}}
  function reset(){ $('event-form').reset();$('event-id').value='';$('event-color').value='#0b46eb';$('delete-event').hidden=true;$('form-kicker').textContent='NUEVO REGISTRO';$('form-title').textContent='Programar evento';$('form-message').textContent='';}
  function openDay(date){state.selectedDate=date;$('selected-date-title').textContent=formatted(date);const dialog=$('day-dialog'),list=$('selected-day-events'),events=state.events.filter(event=>event.fecha_inicio===date);if(!events.length){const empty=document.createElement('p');empty.className='day-empty';empty.textContent='No hay eventos registrados para este día.';list.replaceChildren(empty);}else{list.replaceChildren(...events.map(event=>{const item=document.createElement('button');item.type='button';item.className='day-event-row';item.innerHTML=`<i style="background:${event.color}"></i><span></span><b aria-hidden="true">›</b>`;item.querySelector('span').textContent=event.titulo;item.addEventListener('click',()=>{dialog.close();openEvent(event);});return item;}));}dialog.showModal();}
  function openNew(date=state.selectedDate||dayKey(new Date())){if($('day-dialog').open)$('day-dialog').close();reset();$('event-date').value=date;$('event-dialog').showModal();}
  function openEvent(event){if($('day-dialog').open)$('day-dialog').close();reset();$('event-id').value=event.id;$('event-title').value=event.titulo;$('event-description').value=event.descripcion||'';$('event-date').value=event.fecha_inicio;$('event-category').value=event.categoria;$('event-color').value=event.color;$('event-reminder').value=event.recordatorio_dias??'';$('event-completed').checked=event.estado==='COMPLETADO';$('delete-event').hidden=false;$('form-kicker').textContent='EVENTO PROGRAMADO';$('form-title').textContent='Editar evento';$('event-dialog').showModal();}
  const payload=()=>({titulo:$('event-title').value,descripcion:$('event-description').value,fecha_inicio:$('event-date').value,categoria:$('event-category').value,color:$('event-color').value,recordatorio_dias:$('event-reminder').value,todo_el_dia:true,estado:$('event-completed').checked?'COMPLETADO':'PENDIENTE'});
  $('new-event').onclick=()=>openNew(dayKey(new Date()));$('close-dialog').onclick=()=>$('event-dialog').close();$('close-day-dialog').onclick=()=>$('day-dialog').close();$('add-event-to-day').onclick=()=>openNew(state.selectedDate);$('previous-year').onclick=()=>{state.year--;load();};$('next-year').onclick=()=>{state.year++;load();};$('today-month').onclick=()=>{state.year=new Date().getFullYear();load();};$('event-category').onchange=()=>{$('event-color').value=colors[$('event-category').value]||'#0b46eb';};
  $('event-form').onsubmit=async(e)=>{e.preventDefault();const id=$('event-id').value,data=payload();let localWriteFailed=false;try{if(id)await fetchApi(`/calendario/${id}`,{method:'PUT',body:JSON.stringify(data)});else await fetchApi('/calendario',{method:'POST',body:JSON.stringify(data)});}catch{const saved=localEvents(), event={...data,id:id||`local-${Date.now()}`}, index=saved.findIndex(item=>item.id===event.id);if(index>=0)saved[index]=event;else saved.push(event);localWriteFailed=!saveLocalEvents(saved);}if(localWriteFailed){$('form-message').textContent='El navegador bloqueó el guardado local. Abra el sistema desde un servidor web para guardar eventos.';return;}$('event-dialog').close();await load();if(state.selectedDate===data.fecha_inicio)openDay(data.fecha_inicio);};
  $('delete-event').onclick=async()=>{if(!confirm('¿Eliminar este evento?'))return;const id=$('event-id').value;try{await fetchApi(`/calendario/${id}`,{method:'DELETE'});}catch{if(!saveLocalEvents(localEvents().filter(event=>event.id!==id))){$('form-message').textContent='No se pudo eliminar porque el navegador bloqueó el guardado local.';return;}}$('event-dialog').close();load();};load();
})();
