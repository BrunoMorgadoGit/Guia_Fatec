/* ═══════════════════════════════════════════════════════════
   GuiaFATEC · script.js — dark UI edition
═══════════════════════════════════════════════════════════ */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ══════════════════════════════════════════════════════════
     1. MAPA LEAFLET
  ══════════════════════════════════════════════════════════ */
  const BOUNDS = [[0, 0], [1142, 1738]];

  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -1, 
    maxZoom: 2,
    maxBounds: BOUNDS,
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    attributionControl: false
  });

  const imageOverlay = L.imageOverlay(
    '/static/images/fatec_map_enhanced.png?v=3.0', 
    BOUNDS
  ).addTo(map);

  map.fitBounds(BOUNDS);

  function makeMarkerIcon(room) {
    const firstImage = room.images && room.images.length > 0 ? room.images[0] : room.image;
    const isTopFocus = (room.name === 'Sala 2ª Termo B-10' || room.name === 'Laboratório Sistemas Inteligentes D-05' || room.name === 'Laboratório D-09') ? 'top-focus' : '';
    
    const statusClass = (room.name === 'Entrada' || room.status === 'utility') ? 'utility' : room.status;
    
    return L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div class="marker-pin ${statusClass}"></div>
        <div class="marker-tooltip ${isTopFocus}">
          <img src="/${firstImage}" alt="${room.name}">
          <span>${room.name}</span>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  /* ══════════════════════════════════════════════════════════
     2. ESTADO
  ══════════════════════════════════════════════════════════ */
  let roomsData    = [];
  let markers      = [];
  let activeCourse = 'all';
  let currentRole  = 'student';
  let currentImgIdx = 0;
  let currentRoomImages = [];
  let currentRoomName = '';
  let routeLayer      = null;
  /* ══════════════════════════════════════════════════════════
     3. SELETORES
  ══════════════════════════════════════════════════════════ */
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  /* ══════════════════════════════════════════════════════════
     4. RELÓGIO
  ══════════════════════════════════════════════════════════ */
  function updateClock() {
    $('clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  updateClock();
  setInterval(updateClock, 10000);

  /* ══════════════════════════════════════════════════════════
     5. TABS
  ══════════════════════════════════════════════════════════ */
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(id) {
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    $$('.pane').forEach(p => p.classList.toggle('active', p.id === `tab-${id}`));
    if (id === 'map') setTimeout(() => map.invalidateSize(), 80);
  }

  /* ══════════════════════════════════════════════════════════
     6. DROPDOWN / NOTIFICAÇÕES / PERFIL
  ══════════════════════════════════════════════════════════ */
  const roleBtn    = $('role-btn');
  const roleMenu   = $('role-menu');

  function closeAll() {
    roleMenu.classList.add('hidden');
  }

  roleBtn.addEventListener('click', e => { e.stopPropagation(); togglePanel(roleMenu); });
  document.addEventListener('click', closeAll);
  roleMenu.addEventListener('click', e => e.stopPropagation());

  function togglePanel(show) {
    show.classList.toggle('hidden');
  }


  /* ── Troca de perfil ── */
  $$('.dd-item').forEach(opt => {
    opt.addEventListener('click', () => {
      currentRole = opt.dataset.role;
      $$('.dd-item').forEach(o => o.classList.toggle('active', o.dataset.role === currentRole));
      $('role-icon').innerHTML  = currentRole === 'professor' 
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' 
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      $('role-label').textContent = currentRole === 'professor' ? 'Professor' : 'Estudante';
      closeAll();
      refreshProfPanel();
    });
  });

  $('go-prof').addEventListener('click', () => {
    currentRole = 'professor';
    $('role-icon').innerHTML  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    $('role-label').textContent = 'Professor';
    $$('.dd-item').forEach(o => o.classList.toggle('active', o.dataset.role === 'professor'));
    refreshProfPanel();
  });

  /* ══════════════════════════════════════════════════════════
     7. SALAS — fetch + render
  ══════════════════════════════════════════════════════════ */
  async function fetchRooms() {
    try {
      const res = await fetch('/api/rooms');
      roomsData = await res.json();
      buildStats();
      buildFilters();
      filterAndRender();
      buildSchedule();
    } catch (e) { console.error('Salas:', e); }
  }

  function buildStats() {
    const classrooms = roomsData.filter(r => r.type === 'classroom');
    const free = classrooms.filter(r => r.status === 'available').length;
    
    $('cnt-free').textContent  = free;
    $('cnt-occ').textContent   = classrooms.length - free;
    $('cnt-total').textContent = classrooms.length;

    // Próximas aulas logic removed as per user request
  }

  function buildFilters() {
    const courses = Array.from(new Set(roomsData.flatMap(r => r.courses))).filter(c => c !== 'Todos' && c !== 'ADS');
    const wrap = $('course-chips');
    wrap.innerHTML = '';

    courses.forEach((c, index) => {
      const btn = document.createElement('button');
      btn.className = 'chip'; 
      if (index === 0 && activeCourse === 'all') {
        btn.classList.add('active');
        activeCourse = c;
      } else if (activeCourse === c) {
        btn.classList.add('active');
      }
      btn.dataset.course = c; 
      btn.textContent = c;
      btn.addEventListener('click', () => {
        $$('.chip').forEach(ch => ch.classList.remove('active'));
        btn.classList.add('active');
        activeCourse = c; filterAndRender();
      });
      wrap.appendChild(btn);
    });

  }

  function filterAndRender() {
    const q = $('room-search').value.toLowerCase();
    const filtered = roomsData.filter(r => {
      const matchQ = !q || r.name.toLowerCase().includes(q) || r.location.toLowerCase().includes(q) || r.courses.some(c => c.toLowerCase().includes(q));
      
      const isUtil = r.name === 'Entrada' || r.name === 'Secretaria' || r.type === 'utility';
      const matchC = activeCourse === 'all' || r.courses.includes(activeCourse) || isUtil;
      
      return matchQ && matchC;
    });
    $('rooms-count').textContent = filtered.length;
    renderList(filtered);
    renderMarkers(filtered);
  }

  function renderList(rooms) {
    const ul = $('room-list');
    ul.innerHTML = '';
    rooms.forEach(room => {
      const li = document.createElement('li');
      li.className = 'room-item anim-in';
      const isUtil = room.type === 'utility';
      li.innerHTML = `
        ${isUtil ? '' : `<span class="ri-dot ${room.status}"></span>`}
        <div class="ri-body">
          <h4>${room.name}</h4>
          <p>${room.location}${room.courses.length > 0 ? ` · ${room.courses.join(', ')}` : ''}</p>
          ${room.reserved_by ? `<p class="ri-reserved">🔒 ${room.reserved_by}${room.reserved_subject ? `: ${room.reserved_subject}` : ''}</p>` : ''}
        </div>
        ${isUtil ? '' : `<span class="ri-status ${room.status}">${room.status === 'available' ? 'Livre' : 'Ocupada'}</span>`}
      `;
      li.addEventListener('click', () => focusRoom(room));
      ul.appendChild(li);
    });
  }

  function renderMarkers(rooms) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    rooms.forEach(room => {
      const coords = room.coords;
      const marker = L.marker(coords, { icon: makeMarkerIcon(room) }).addTo(map);
      marker.on('click', () => {
        console.log('Marker clicked:', room.name);
        openModal(room);
      });
      marker.roomData = room;
      markers.push(marker);
    });
  }

  function focusRoom(room) {
    switchTab('map');
    const coords = room.coords;
    setTimeout(() => {
      map.flyTo(coords, 1, { duration: 1.1 });
      const marker = markers.find(m => m.roomData?.id === room.id);
      if (marker) {
        const el = marker.getElement();
        if (el) {
          el.querySelector('.marker-pin')?.classList.add('highlighted');
          setTimeout(() => el.querySelector('.marker-pin')?.classList.remove('highlighted'), 2500);
        }
        openModal(room);
      }
    }, 150);
  }

  function showRoute(path) {
    clearRoute();
    if (!path || path.length === 0) return;

    if (typeof path === 'string') {
      // Image-based route
      routeLayer = L.imageOverlay('/' + path, BOUNDS, { opacity: 0.9, zIndex: 1000 }).addTo(map);
    } else {
      // Coordinate-based route
      routeLayer = L.polyline(path, {
        color: '#EF4444', 
        weight: 6,
        opacity: 0.9,
        dashArray: '12, 12',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
    }

    $('clear-route-btn').classList.remove('hidden');
    
    // Zoom out slightly to see the full route
    map.flyTo([571, 869], 0, { duration: 1 });
  }

  function clearRoute() {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    $('clear-route-btn').classList.add('hidden');
  }

  $('clear-route-btn').addEventListener('click', clearRoute);

  /* ── Busca ── */
  $('room-search').addEventListener('input', filterAndRender);

  /* ══════════════════════════════════════════════════════════
     8. MODAL
  ══════════════════════════════════════════════════════════ */
  const modal = $('modal');

  function updateModalImage() {
    const img = $('m-img');
    const prev = $('m-prev');
    const next = $('m-next');
    
    if (currentRoomImages.length > 0) {
      img.src = '/' + currentRoomImages[currentImgIdx];
      img.style.display = 'block';
      
      // Ajusta a posição da imagem: primeira imagem exibe o topo apenas para as salas específicas, as demais ficam centralizadas
      const topFocusRooms = ['Sala 2ª Termo B-10', 'Laboratório Sistemas Inteligentes D-05', 'Laboratório D-09'];
      if (currentImgIdx === 0 && topFocusRooms.includes(currentRoomName)) {
        img.style.objectPosition = 'top';
      } else {
        img.style.objectPosition = 'center';
      }
    } else {
      img.src = '';
      img.style.display = 'none';
    }
    
    if (currentRoomImages.length > 1) {
      if (prev) prev.classList.remove('hidden');
      if (next) next.classList.remove('hidden');
    } else {
      if (prev) prev.classList.add('hidden');
      if (next) next.classList.add('hidden');
    }
  }

  function openModal(room) {
    currentRoomName = room.name;
    currentRoomImages = room.images || (room.image ? [room.image] : []);
    currentImgIdx = 0;
    updateModalImage();
    
    $('m-img').alt = 'Foto da sala ' + room.name;
    $('m-name').textContent = room.name;
    $('m-loc').textContent  = room.location;
    $('m-floor').textContent = room.floor;

    $('m-floor2').textContent = room.floor;
    $('m-sched').textContent  = room.schedule;
    $('m-cap').textContent    = room.capacity ? `${room.capacity} pessoas` : '—';
    $('m-desc').textContent   = room.description;

    const resWrap = $('m-reserved-wrap');
    const nextBox = $('m-next-class');
    
    if (room.reserved_by) {
      if (resWrap) {
        resWrap.classList.remove('hidden');
        $('m-reserved-name').textContent = room.reserved_by;
      }
      if (nextBox) {
        nextBox.style.display = 'block';
        nextBox.classList.add('active-class');
        nextBox.querySelector('.ncb-label').textContent = 'Aula em Andamento';
        $('m-next-subj').textContent = room.reserved_subject || 'Aula confirmada';
        $('m-next-det').textContent  = `Professor ${room.reserved_by}`;
      }
    } else {
      if (resWrap) resWrap.classList.add('hidden');
      if (nextBox) {
        if (room.next_class) {
          nextBox.style.display = 'block';
          nextBox.classList.remove('active-class');
          nextBox.querySelector('.ncb-label').textContent = 'Próxima Aula';
          $('m-next-subj').textContent = room.next_class.subject;
          $('m-next-det').textContent  = `${room.next_class.teacher} · ${room.next_class.time}`;
        } else {
          nextBox.style.display = 'none';
        }
      }
    }

    const isEntrance    = room.name === 'Entrada';
    const isSecretariat = room.name === 'Secretaria';
    const isUtility     = isEntrance || isSecretariat || room.status === 'utility' || room.type === 'utility';

    const statusBadge = $('m-status');
    if (statusBadge) statusBadge.style.display = isUtility ? 'none' : 'block';

    const metaCap = $('m-meta-cap');
    const metaFloor = $('m-meta-floor');
    const floorChip = $('m-floor');
    const coursesSection = document.querySelector('.modal-courses');

    // Both: Hide Capacity and Courses
    if (metaCap) metaCap.style.display = isUtility ? 'none' : 'flex';
    if (coursesSection) coursesSection.style.display = isUtility ? 'none' : 'block';

    // Entrance: Hide Floor. Secretariat: Keep Floor. Standard: Keep Floor.
    if (isEntrance) {
      if (metaFloor) metaFloor.style.display = 'none';
      if (floorChip) floorChip.style.display = 'none';
    } else {
      if (metaFloor) metaFloor.style.display = 'flex';
      if (floorChip) floorChip.style.display = 'block';
    }

    const cr = $('m-tags');
    if (cr) {
      cr.innerHTML = '';
      if (room.courses && room.courses.length > 0) {
        room.courses.forEach(c => {
          const span = document.createElement('span');
          span.className = 'm-tag'; span.textContent = c;
          cr.appendChild(span);
        });
      }
    }

    const routeBtn = $('m-route');
    if (routeBtn) {
      routeBtn.style.display = isEntrance ? 'none' : 'block';
    }

    modal.classList.add('active');
  }

  function closeModal() { if (modal) modal.classList.remove('active'); }
  if ($('modal-close')) $('modal-close').addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  if ($('m-map-btn')) $('m-map-btn').addEventListener('click', closeModal);
  if ($('m-report-btn')) $('m-report-btn').addEventListener('click', () => { closeModal(); switchTab('chat'); });
  if ($('m-route')) $('m-route').addEventListener('click', () => {
    const room = roomsData.find(r => r.name === currentRoomName);
    if (room && room.route_path) {
      showRoute(room.route_path);
      closeModal();
    } else {
      alert('Rota não disponível para este local.');
    }
  });

  if ($('m-share')) $('m-share').addEventListener('click', () => alert('Link copiado!'));

  if ($('m-prev')) $('m-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    currentImgIdx = (currentImgIdx - 1 + currentRoomImages.length) % currentRoomImages.length;
    updateModalImage();
  });
  if ($('m-next')) $('m-next').addEventListener('click', (e) => {
    e.stopPropagation();
    currentImgIdx = (currentImgIdx + 1) % currentRoomImages.length;
    updateModalImage();
  });

  /* ── FULL-SCREEN MODAL ── */
  const fsModal = $('fs-modal');
  const fsImg = $('fs-img');
  const fsClose = $('fs-close');

  if ($('m-expand')) {
    $('m-expand').addEventListener('click', (e) => {
      e.stopPropagation(); // Previne eventos de clique sobrepostos
      fsImg.src = $('m-img').src;
      fsModal.classList.add('active');
    });
  }

  // Comentando ou removendo o evento do clique direto na imagem, caso queira que só o botão expanda
  // if ($('m-img')) {
  //   $('m-img').addEventListener('click', () => {
  //     fsImg.src = $('m-img').src;
  //     fsModal.classList.add('active');
  //   });
  // }

  function closeFsModal() {
    fsModal.classList.remove('active');
  }

  if (fsClose) fsClose.addEventListener('click', closeFsModal);
  if (fsModal) fsModal.addEventListener('click', (e) => {
    if (e.target === fsModal) closeFsModal();
  });

  // Fecha tela cheia com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fsModal.classList.contains('active')) {
      closeFsModal();
    }
  });

  /* ══════════════════════════════════════════════════════════
     9. HORÁRIOS
  ══════════════════════════════════════════════════════════ */
  const SCHEDULE = {
    'Segunda-feira': [
      { subject: 'Alg. Log. Programação', room: 'Lab 4', time: '13:30', duration: '90min', professor: 'Favan', color: '#6366f1' },
      { subject: 'Alg. Log. Programação', room: 'Lab 4', time: '15:20', duration: '90min', professor: 'Favan', color: '#6366f1' },
      { subject: 'Alg. Log. Programação', room: 'Lab 4', time: '17:10', duration: '90min', professor: 'Favan', color: '#6366f1' },
      { subject: 'Alg. Log. Programação', room: 'Lab 4', time: '19:00', duration: '90min', professor: 'Favan', color: '#6366f1' }
    ],
    'Terça-feira': [
      { subject: 'P.I. Sis. Inteligentes I', room: 'Lab 4', time: '13:30', duration: '90min', professor: 'Lucas', color: '#8b5cf6' },
      { subject: 'Introd. À Estatística', room: 'SA 4 Termo', time: '15:20', duration: '90min', professor: 'Marçal', color: '#06b6d4' },
      { subject: 'Introd. À Estatística', room: 'SA 4 Termo', time: '17:10', duration: '90min', professor: 'Marçal', color: '#06b6d4' }
    ],
    'Quarta-feira': [
      { subject: 'P.I. Sis. Inteligentes I', room: 'Lab 4', time: '13:30', duration: '90min', professor: 'Lucas', color: '#8b5cf6' },
      { subject: 'Comun. e Expressão', room: 'Laboratório D-09', shortRoom: 'Lab D-09', time: '15:20', duration: '90min', professor: 'Eloiza', color: '#f59e0b' },
      { subject: 'Lid. E Empreend', room: 'Laboratório D-09', shortRoom: 'Lab D-09', time: '17:10', duration: '90min', professor: 'Lucas', color: '#ec4899' }
    ],
    'Quinta-feira': [
      { subject: 'Sistemas Digitais', room: 'Laboratório Sistemas Inteligentes D-05', shortRoom: 'Lab TSI', time: '13:30', duration: '180min', professor: 'André', color: '#10b981' },
      { subject: 'Sistemas Digitais', room: 'Laboratório Sistemas Inteligentes D-05', shortRoom: 'Lab TSI', time: '17:10', duration: '90min', professor: 'André', color: '#10b981' }
    ],
    'Sexta-feira': [
      { subject: 'M. Computacional', room: 'SA 2 Termo', time: '13:30', duration: '90min', professor: 'Marçal', color: '#3b82f6' },
      { subject: 'Engenharia de Software', room: 'Lab 4', time: '15:20', duration: '180min', professor: 'André', color: '#6366f1' }
    ]
  };

  function buildSchedule() {
    const cards = document.getElementById('schedule-cards');
    if (!cards) return;
    
    cards.innerHTML = ''; 

    const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
    const table = document.createElement('div');
    table.className = 'table-responsive';
    
    let html = `
      <table class="premium-table">
        <thead>
          <tr>
            ${days.map(d => `<th>${d.split('-')[0]}-feira</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    // Row definitions based on the user's grid
    const grid = [
      // Row 0 & 1: P.I. (Ter/Qua)
      [null, 'P.I. Sis. Inteligentes I', 'P.I. Sis. Inteligentes I', null, null],
      [null, 'P.I. Sis. Inteligentes I', 'P.I. Sis. Inteligentes I', null, null],
      // Row 2 & 3: Main Block
      ['Alg. Log. Programação', 'Introd. À Estatística', 'Comun. e Expressão', 'Sistemas Digitais', 'M. Computacional'],
      ['Alg. Log. Programação', 'Introd. À Estatística', 'Comun. e Expressão', 'Sistemas Digitais', 'M. Computacional'],
      // Row 4: INTERVALO
      ['INTERVALO', 'INTERVALO', 'INTERVALO', 'INTERVALO', 'INTERVALO'],
      // Row 5 & 6: Late Block
      ['Alg. Log. Programação', 'Introd. À Estatística', 'Lid. E Empreend', 'Sistemas Digitais', 'Engenharia de Software'],
      ['Alg. Log. Programação', 'Introd. À Estatística', 'Lid. E Empreend', 'Sistemas Digitais', 'Engenharia de Software']
    ];

    grid.forEach((row, rowIndex) => {
      if (rowIndex === 4) {
        html += `<tr class="interval-row"><td colspan="5">INTERVALO</td></tr>`;
        return;
      }
      
      html += '<tr>';
      row.forEach((subj, colIndex) => {
        if (!subj) {
          html += '<td></td>';
          return;
        }

        // Find full data for the subject to get color/room
        let data = null;
        const day = days[colIndex];
        if (SCHEDULE[day]) {
          data = SCHEDULE[day].find(s => s.subject === subj);
        }

        if (data) {
          html += `
            <td class="class-cell" style="--cell-color: ${data.color}">
              <div class="cell-content" onclick="window.focusByRoomName('${data.room}')">
                <span class="cell-subj">${data.subject}</span>
                <span class="cell-meta">${data.professor} (${data.shortRoom || data.room})</span>
              </div>
            </td>`;
        } else {
          html += `<td>${subj}</td>`;
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    table.innerHTML = html;
    cards.appendChild(table);
  }

  // Global helper for the table click
  window.focusByRoomName = (name) => {
    const room = roomsData.find(r => r.name === name);
    if (room) focusRoom(room); else switchTab('map');
  };

  /* ══════════════════════════════════════════════════════════
     10. CHAT IA
  ══════════════════════════════════════════════════════════ */
  const chatMsgs  = $('chat-msgs');
  const chatInput = $('chat-input');
  const chatSend  = $('chat-send');

  function appendMsg(from, text) {
    const div = document.createElement('div');
    div.className = `msg ${from}`;
    div.innerHTML = from === 'bot'
      ? `<div class="m-av">🤖</div><div class="m-bub">${text}</div>`
      : `<div class="m-bub">${text}</div>`;
    chatMsgs.appendChild(div);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'msg bot'; div.id = 'typing';
    div.innerHTML = `<div class="m-av">🤖</div><div class="m-bub"><div class="typing"><span></span><span></span><span></span></div></div>`;
    chatMsgs.appendChild(div);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
  }
  function hideTyping() { const el = $('typing'); if (el) el.remove(); }

  async function sendChat(msg) {
    const text = msg || chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    appendMsg('user', text);
    showTyping();
    try {
      const res  = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: text }) });
      const data = await res.json();
      hideTyping();
      appendMsg('bot', data.reply || data.error || 'Erro ao processar.');
    } catch {
      hideTyping();
      appendMsg('bot', 'Erro de conexão. Verifique se o servidor está rodando.');
    }
  }

  chatSend.addEventListener('click', () => sendChat());
  chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $$('.quick').forEach(q => q.addEventListener('click', () => sendChat(q.textContent)));

  /* ══════════════════════════════════════════════════════════
     11. PAINEL DO PROFESSOR
  ══════════════════════════════════════════════════════════ */
  const PROF_ROOMS = [
    { id:1, name:'Sala 2ª Termo B-10', time:'13:30–15:10', subject:'Projeto Integrador', students:36, capacity:30, confirmed:false, cancelled:false },
    { id:4, name:'Laboratório Sistemas Inteligentes D-05', time:'17:10–18:50', subject:'Empreendedorismo', students:18, capacity:25, confirmed:false, cancelled:false },
    { id:5, name:'Laboratório D-09', time:'19:10–20:50', subject:'Projeto Integrador', students:24, capacity:30, confirmed:false, cancelled:false },
  ];

  function populateProfRoomSelect() {
    const select = $('prof-room-select');
    if (!select) return;
    
    // Clear and add placeholder
    select.innerHTML = '<option value="">Escolha uma sala...</option>';
    
    // Filter out Entrance and Secretariat
    roomsData.forEach(r => {
      if (r.name === 'Entrada' || r.name === 'Secretaria') return;
      
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = `${r.name} (${r.location})`;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      const newRoomName = e.target.value;
      const subject = $('prof-subject-select').value;
      if (!newRoomName) {
        renderProfRooms();
        return;
      }
      
      const room = roomsData.find(r => r.name === newRoomName);
      if (room) {
        // Show a confirmation card instead of the list
        const wrap = $('prof-rooms');
        wrap.innerHTML = `
          <div class="pr-card anim-in" style="border-left-color: var(--amber)">
            <div class="pr-body">
              <div class="pr-meta">Reserva de Sala</div>
              <div class="pr-name">${room.name}</div>
              <div class="pr-subj">${subject}</div>
            </div>
            <div class="pr-actions" style="margin-top: 1rem">
              <button class="pc-btn confirm" id="confirm-switch-btn" style="width:100%">Confirmar Reserva</button>
            </div>
          </div>
        `;

        $('confirm-switch-btn').addEventListener('click', async () => {
          const btn = $('confirm-switch-btn');
          btn.textContent = 'Reservando...';
          btn.disabled = true;

          try {
            await fetch(`/api/rooms/${room.id}/toggle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                status: 'occupied',
                reserved_by: 'Lucas',
                reserved_subject: subject
              })
            });
            window.location.reload();
          } catch (err) {
            alert('Erro ao reservar sala.');
            btn.textContent = 'Confirmar Reserva';
            btn.disabled = false;
          }
        });
      }
    });
  }

  function refreshProfPanel() {
    const locked = $('prof-locked');
    const panel  = $('prof-panel');
    if (currentRole === 'professor') {
      locked.classList.add('hidden');
      panel.classList.remove('hidden');
      if ($('prof-room-select') && $('prof-room-select').options.length <= 1) {
        populateProfRoomSelect();
      }
      renderProfRooms();
    } else {
      locked.classList.remove('hidden');
      panel.classList.add('hidden');
    }
  }

  function renderProfRooms() {
    const wrap = $('prof-rooms');
    wrap.innerHTML = '';
    PROF_ROOMS.forEach(r => {
      const div = document.createElement('div');
      const isCancelled = r.cancelled;
      div.className = `pr-card ${r.confirmed ? 'confirmed' : ''} ${isCancelled ? 'cancelled-card' : ''} anim-in`;
      
      div.innerHTML = `
        <div class="pr-card-header">
           <h4>${r.subject}</h4>
           ${isCancelled ? '<span class="cancelled-badge">AULA CANCELADA</span>' : ''}
        </div>
        <p>📍 ${r.name}</p>
        <p>⏰ ${r.time}</p>
        <div class="pr-tags">
          <span class="pr-tag">👥 ${r.students}/${r.capacity}</span>
          <span class="pr-tag ${isCancelled ? 'cancelled-tag' : (r.confirmed ? 'confirmed-tag' : 'pending-tag')}">
            ${isCancelled ? '✕ Cancelada' : (r.confirmed ? '✓ Presença Confirmada' : '⚠ Confirmação Pendente')}
          </span>
        </div>
        <div class="pr-actions">
          ${(!r.confirmed && !isCancelled) ? `<button class="btn-confirm" data-id="${r.id}">✓ Confirmar presença</button>` : ''}
          ${!isCancelled ? `<button class="btn-cancel-cls" data-id="${r.id}">✕ Cancelar aula</button>` : `<button class="btn-restore-cls" data-id="${r.id}">↺ Reativar aula</button>`}
        </div>
      `;

      // Confirm Presence
      const confirmBtn = div.querySelector('.btn-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          try { 
            const subject = $('prof-subject-select').value;
            await fetch(`/api/rooms/${r.id}/toggle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                status: 'occupied',
                reserved_by: 'Lucas',
                reserved_subject: subject
              })
            }); 
            r.confirmed = true;
            renderProfRooms();
            fetchRooms(); // Update main map status
          } catch (e) { console.error(e); }
        });
      }

      // Cancel Class
      const cancelBtn = div.querySelector('.btn-cancel-cls');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          if (!confirm(`Deseja realmente cancelar a aula de ${r.subject}?`)) return;
          try {
            await fetch(`/api/rooms/${r.id}/toggle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'available' })
            });
            r.confirmed = false;
            r.cancelled = true;
            renderProfRooms();
            fetchRooms();
          } catch (e) { console.error(e); }
        });
      }

      // Restore Class
      const restoreBtn = div.querySelector('.btn-restore-cls');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
          r.cancelled = false;
          renderProfRooms();
        });
      }

      wrap.appendChild(div);
    });
  }

  /* ══════════════════════════════════════════════════════════
     12. INIT
     ══════════════════════════════════════════════════════════ */
  async function init() {
    await fetchRooms();
  }

  init();
});
