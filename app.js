import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-h1O-c5iNOzBNoBW9R-YZVnWu7OgwH3E",
  authDomain: "artale-rjpq-6b73d.firebaseapp.com",
  databaseURL: "https://artale-rjpq-6b73d-default-rtdb.firebaseio.com",
  projectId: "artale-rjpq-6b73d",
  storageBucket: "artale-rjpq-6b73d.firebasestorage.app",
  messagingSenderId: "607708622638",
  appId: "1:607708622638:web:7f0e9d86ecb626ee5fd4bf",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ROOMS = ['a', 'b', 'c', 'd'];
const ROOM_NAMES = { a: '甲', b: '乙', c: '丙', d: '丁' };
const FLOORS = 10;

let myRoom = null;
let pendingRoom = null;
let gameState = {};
let occupiedRooms = {};
let sessionId = null;
let currentSessionRef = null;

// ── URL / session helpers ────────────────────────────────────────────────────

function getSessionFromUrl() {
  return new URLSearchParams(window.location.search).get('s');
}

function setSessionInUrl(id) {
  const url = new URL(window.location);
  url.searchParams.set('s', id);
  window.history.replaceState({}, '', url);
}

function generateId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Nickname helpers ─────────────────────────────────────────────────────────

// Returns the display name for a room (nickname if set, else 甲乙丙丁)
function getRoomDisplayName(r) {
  const val = occupiedRooms[r];
  return (val && typeof val === 'string') ? val : ROOM_NAMES[r];
}

// ── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  document.getElementById('themeToggle').textContent = isLight ? '暗色' : '亮色';
}

window.toggleTheme = () => {
  const isLight = !document.body.classList.contains('light');
  applyTheme(isLight);
  localStorage.setItem('artale_theme', isLight ? 'light' : 'dark');
};

applyTheme(localStorage.getItem('artale_theme') === 'light');

// ── Copy helpers ─────────────────────────────────────────────────────────────

window.copyLink = () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = document.getElementById('copyLinkBtn');
    btn.textContent = '✓ 已複製';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '⎘ 複製連結';
      btn.classList.remove('copied');
    }, 2000);
  });
};

window.copyCode = () => {
  navigator.clipboard.writeText(sessionId).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '已複製！';
    setTimeout(() => btn.textContent = '複製代碼', 2000);
  });
};

// ── Game state ───────────────────────────────────────────────────────────────

function initEmptyState() {
  gameState = {};
  occupiedRooms = {};
  for (let f = 1; f <= FLOORS; f++) {
    gameState[f] = { a: null, b: null, c: null, d: null };
  }
}

function updateStatus(data) {
  const activeRooms = new Set();
  if (data && data.floors) {
    Object.values(data.floors).forEach(f => {
      ROOMS.forEach(r => { if (f[r] !== null) activeRooms.add(r); });
    });
  }
  document.getElementById('roomCount').textContent = `${activeRooms.size}/4 房間`;
}

function updateRoomButtons() {
  ROOMS.forEach(r => {
    const btn = document.querySelector(`.overlay-room-btn.btn-${r}`);
    if (!btn) return;
    const sub = btn.querySelector('.sub');
    if (occupiedRooms[r] && r !== myRoom) {
      btn.classList.add('disabled');
      btn.title = '此房間已有人進入';
      if (sub) sub.textContent = getRoomDisplayName(r);
    } else {
      btn.classList.remove('disabled');
      btn.title = '';
      if (sub) sub.textContent = `ROOM ${r.toUpperCase()}`;
    }
  });
}

function updateFloorHeader() {
  ROOMS.forEach(r => {
    const cell = document.querySelector(`.fh-${r}`);
    if (cell) cell.textContent = getRoomDisplayName(r);
  });
}

// ── Firebase session ─────────────────────────────────────────────────────────

function subscribeSession(id) {
  if (currentSessionRef) off(currentSessionRef);

  sessionId = id;
  setSessionInUrl(id);
  currentSessionRef = ref(db, `sessions/${sessionId}`);

  document.getElementById('statusDot').classList.remove('online');
  document.getElementById('statusText').textContent = '連線中...';

  onValue(currentSessionRef, (snapshot) => {
    const data = snapshot.val();
    gameState = (data && data.floors) ? data.floors : (() => { initEmptyState(); return gameState; })();
    occupiedRooms = (data && data.rooms) ? data.rooms : {};
    updateRoomButtons();

    document.getElementById('statusDot').classList.add('online');
    document.getElementById('statusText').textContent = `已連線 · 場次 ${sessionId}`;
    document.getElementById('copyLinkBtn').classList.remove('hidden');
    renderGrid();
    updateStatus(data);
  }, () => {
    document.getElementById('statusText').textContent = '連線失敗';
  });

  document.getElementById('sessionInfo').innerHTML = `
    場次代碼：<strong style="color:var(--accent);font-size:18px;letter-spacing:3px">${sessionId}</strong><br>
    <button class="copy-btn" onclick="copyCode()">複製代碼</button>
  `;
}

// ── Session init ─────────────────────────────────────────────────────────────

function initSession() {
  const savedAccess = localStorage.getItem('artale_access');
  const savedSession = localStorage.getItem('artale_session');
  const savedRoom = localStorage.getItem('artale_room');
  const savedNickname = localStorage.getItem('artale_nickname');
  const urlSession = getSessionFromUrl();

  if (!savedAccess) {
    initEmptyState();
    subscribeSession(urlSession || generateId());
    document.getElementById('roomOverlay').classList.add('hidden');
    return;
  }

  if (urlSession && urlSession === savedSession && savedRoom) {
    myRoom = savedRoom;
    initEmptyState();
    subscribeSession(urlSession);
    const name = savedNickname || ROOM_NAMES[savedRoom];
    const roomRef = ref(db, `sessions/${urlSession}/rooms/${savedRoom}`);
    set(roomRef, name).then(() => onDisconnect(roomRef).remove());
    document.getElementById('accessOverlay').classList.add('hidden');
    document.getElementById('roomOverlay').classList.add('hidden');
    return;
  }

  if (urlSession) {
    initEmptyState();
    subscribeSession(urlSession);
    document.getElementById('accessOverlay').classList.add('hidden');
    return;
  }

  if (savedSession && savedRoom) {
    myRoom = savedRoom;
    initEmptyState();
    subscribeSession(savedSession);
    const name = savedNickname || ROOM_NAMES[savedRoom];
    const roomRef = ref(db, `sessions/${savedSession}/rooms/${savedRoom}`);
    set(roomRef, name).then(() => onDisconnect(roomRef).remove());
    document.getElementById('accessOverlay').classList.add('hidden');
    document.getElementById('roomOverlay').classList.add('hidden');
    return;
  }

  initEmptyState();
  subscribeSession(generateId());
  document.getElementById('accessOverlay').classList.add('hidden');
}

initSession();

// ── Access code ──────────────────────────────────────────────────────────────

window.verifyAccess = async () => {
  const input = document.getElementById('accessInput');
  const code = input.value.trim().toUpperCase();
  const errEl = document.getElementById('accessError');
  if (!code) return;
  const snap = await get(ref(db, `access_codes/${code}`));
  if (snap.exists()) {
    localStorage.setItem('artale_access', code);
    document.getElementById('accessOverlay').classList.add('hidden');
    document.getElementById('roomOverlay').classList.remove('hidden');
  } else {
    errEl.classList.remove('hidden');
    input.focus();
  }
};

document.getElementById('accessInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') verifyAccess();
});

// ── Room selection ───────────────────────────────────────────────────────────

window.selectRoom = (room) => {
  if (occupiedRooms[room] && room !== myRoom) return;
  pendingRoom = room;

  document.getElementById('nicknameRoomLabel').innerHTML =
    `為「${ROOM_NAMES[room]}」設定暱稱<br>可略過，預設使用房間名稱`;
  document.getElementById('nicknameInput').value = '';
  document.getElementById('roomOverlay').classList.add('hidden');
  document.getElementById('nicknameOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('nicknameInput').focus(), 50);
};

window.confirmNickname = () => {
  const raw = document.getElementById('nicknameInput').value.trim();
  const name = raw || ROOM_NAMES[pendingRoom];
  finalizeRoomSelection(pendingRoom, name);
};

window.skipNickname = () => {
  finalizeRoomSelection(pendingRoom, ROOM_NAMES[pendingRoom]);
};

document.getElementById('nicknameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmNickname();
});

async function finalizeRoomSelection(room, name) {
  myRoom = room;
  localStorage.setItem('artale_session', sessionId);
  localStorage.setItem('artale_room', room);
  localStorage.setItem('artale_nickname', name);

  const roomRef = ref(db, `sessions/${sessionId}/rooms/${room}`);
  await set(roomRef, name);
  onDisconnect(roomRef).remove();

  document.getElementById('nicknameOverlay').classList.add('hidden');
  renderGrid();
}

// ── Join session ─────────────────────────────────────────────────────────────

window.joinSession = () => {
  const input = document.getElementById('joinInput');
  const code = input.value.trim().toUpperCase();
  const errEl = document.getElementById('joinError');

  if (!/^[A-Z0-9]{4,10}$/.test(code)) {
    errEl.classList.remove('hidden');
    input.focus();
    return;
  }
  errEl.classList.add('hidden');
  input.value = '';

  myRoom = null;
  localStorage.removeItem('artale_session');
  localStorage.removeItem('artale_room');
  localStorage.removeItem('artale_nickname');
  initEmptyState();
  renderGrid();
  subscribeSession(code);
};

document.getElementById('joinInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinSession();
});

// ── Sequence bar ─────────────────────────────────────────────────────────────

let seqCollapsed = false;

window.toggleSeq = () => {
  seqCollapsed = !seqCollapsed;
  document.getElementById('seqContent').style.display = seqCollapsed ? 'none' : '';
  document.getElementById('seqToggle').textContent = seqCollapsed ? '展開' : '收起';
};

function updateSequenceBar() {
  const bar = document.getElementById('seqBar');
  const container = document.querySelector('.container');
  if (!myRoom) {
    bar.classList.add('hidden');
    container.classList.remove('has-seq-bar');
    return;
  }

  const roomColors = { a: 'room-a', b: 'room-b', c: 'room-c', d: 'room-d' };
  const seqRoom = document.getElementById('seqRoom');
  seqRoom.className = `seq-room ${roomColors[myRoom]}`;
  seqRoom.textContent = getRoomDisplayName(myRoom);

  const parts = [];
  for (let f = 1; f <= FLOORS; f++) {
    const val = gameState[f] && gameState[f][myRoom];
    if (val !== null && val !== undefined) parts.push(val);
  }

  const seqContent = document.getElementById('seqContent');
  if (parts.length === 0) {
    seqContent.innerHTML = '<span style="color:var(--muted)">尚未選擇踏板</span>';
  } else {
    const sep = '<span style="color:var(--muted)"> · </span>';
    seqContent.innerHTML = parts.map((v, i) =>
      i === parts.length - 1 ? `<span class="seq-latest">${v}</span>` : `${v}`
    ).join(sep);
  }

  bar.classList.remove('hidden');
  container.classList.add('has-seq-bar');
}

// ── Grid render ──────────────────────────────────────────────────────────────

function renderGrid() {
  updateFloorHeader();

  const grid = document.getElementById('floorGrid');
  let html = '';
  for (let f = FLOORS; f >= 1; f--) {
    const floorData = gameState[f] || { a: null, b: null, c: null, d: null };
    const taken = new Set();
    ROOMS.forEach(r => { if (floorData[r] !== null) taken.add(floorData[r]); });

    html += `<div class="floor-row">`;
    html += `<div class="floor-label"><span class="floor-num">${f}</span>層</div>`;

    ROOMS.forEach(r => {
      const isMe = (r === myRoom);
      const val = floorData[r];
      const colorClass = `cell-${r}`;

      if (isMe) {
        html += `<div class="platform-cell ${colorClass} mine">`;
        html += `<span class="room-tag">${getRoomDisplayName(r)}</span>`;
        html += `<div class="platform-btns">`;
        for (let n = 1; n <= 4; n++) {
          const isCorrect = (val === n);
          const isTaken = !isCorrect && taken.has(n);
          const cls = isCorrect ? 'is-correct' : isTaken ? 'is-taken' : '';
          const disabled = isTaken ? 'disabled' : '';
          html += `<button class="platform-num-btn ${cls}" ${disabled}
            onclick="setPlatform(${f},'${r}',${isCorrect ? 'null' : n})">${n}</button>`;
        }
        html += `</div></div>`;
      } else {
        let dispClass = 'empty';
        let dispText = '—';
        if (val !== null && val !== undefined) {
          dispClass = `confirmed-${r}`;
          dispText = val;
        }
        html += `<div class="platform-cell ${colorClass}">`;
        html += `<span class="room-tag">${getRoomDisplayName(r)}</span>`;
        html += `<div class="other-display ${dispClass}">${dispText}</div>`;
        html += `</div>`;
      }
    });

    html += `</div>`;
  }
  grid.innerHTML = html;
  updateSequenceBar();
}

// ── Actions ──────────────────────────────────────────────────────────────────

window.setPlatform = async (floor, room, value) => {
  if (!myRoom || room !== myRoom) return;
  await set(ref(db, `sessions/${sessionId}/floors/${floor}/${room}`), value);
};

window.confirmReset = async () => {
  if (confirm('確定要重置這場的所有資料嗎？')) {
    const empty = {};
    for (let f = 1; f <= FLOORS; f++) {
      empty[f] = { a: null, b: null, c: null, d: null };
    }
    await set(ref(db, `sessions/${sessionId}/floors`), empty);
    gameState = empty;
    renderGrid();
  }
};

renderGrid();
