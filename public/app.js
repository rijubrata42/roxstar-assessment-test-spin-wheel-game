'use strict';

/* ═══════════════════════════════════════════════════════════════
   SpinRox Frontend — Vanilla JS SPA
   ═══════════════════════════════════════════════════════════════ */

// ─── Global State ─────────────────────────────────────────────
const State = {
    token: localStorage.getItem('spinrox_token'),
    user: JSON.parse(localStorage.getItem('spinrox_user') || 'null'),
    socket: null,
    activeWheel: null,
    socketWheelId: null,
    wheelEngine: null,
    countdownInterval: null,
    winnerCountdownInterval: null,
    lobbyPollInterval: null,
};

// ─── Utilities ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString();

function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }
function toggle(el, condition) { condition ? show(el) : hide(el); }

function setLoading(btn, loading) {
    if (!btn) return;
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled = loading;
    if (text) text.style.opacity = loading ? '0' : '1';
    if (spinner) toggle(spinner, loading);
}

function toast(msg, type = 'info') {
    const icons = { success: '✅', error: '❌', info: '💬', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
    $('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function formatDate(str) {
    return new Date(str).toLocaleString('en-IN', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ─── API Helper ───────────────────────────────────────────────
async function api(method, endpoint, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (State.token) opts.headers['Authorization'] = `Bearer ${State.token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${endpoint}`, opts);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// ─── Update balance everywhere ─────────────────────────────────
function updateBalanceDisplay(balance) {
    if ($('sidebar-balance'))  $('sidebar-balance').textContent  = fmt(balance);
    if ($('mobile-balance'))   $('mobile-balance').textContent   = fmt(balance);
    if ($('profile-balance'))  $('profile-balance').textContent  = fmt(balance);
    if (State.user) State.user.coin_balance = balance;
    localStorage.setItem('spinrox_user', JSON.stringify(State.user));
}

// ─── Router ───────────────────────────────────────────────────
const Router = {
    current: null,

    go(panel) {
        // Hide all panels
        ['lobby', 'game', 'profile', 'admin'].forEach(p => {
            hide($(`panel-${p}`));
            const navEl = $(`nav-${p}`);
            const mobileEl = $(`mobile-nav-${p}`);
            if (navEl)    navEl.classList.remove('active');
            if (mobileEl) mobileEl.classList.remove('active');
        });

        show($(`panel-${panel}`));
        const navEl = $(`nav-${panel}`);
        const mobileEl = $(`mobile-nav-${panel}`);
        if (navEl)    navEl.classList.add('active');
        if (mobileEl) mobileEl.classList.add('active');

        Router.current = panel;

        // Trigger panel initializers
        if (panel === 'lobby')   Lobby.init();
        if (panel === 'game')    Game.init();
        if (panel === 'profile') Profile.init();
        if (panel === 'admin')   Admin.init();
    }
};

// ═══════════════════════════════════════════════════════════════
//  AUTH MODULE
// ═══════════════════════════════════════════════════════════════
const Auth = {
    showTab(tab) {
        ['login', 'register'].forEach(t => {
            toggle($(`${t}-form`), t === tab);
            $(`tab-${t}`).classList.toggle('active', t === tab);
        });
    },

    async handleLogin(e) {
        e.preventDefault();
        const errorEl = $('login-error');
        hide(errorEl);
        const btn = $('login-submit');
        setLoading(btn, true);

        try {
            const data = await api('POST', '/auth/login', {
                username: $('login-username').value.trim(),
                password: $('login-password').value,
            });
            Auth._storeAndEnter(data);
        } catch (err) {
            errorEl.textContent = err.message;
            show(errorEl);
        } finally {
            setLoading(btn, false);
        }
    },

    async handleRegister(e) {
        e.preventDefault();
        const errorEl = $('reg-error');
        hide(errorEl);

        const pass    = $('reg-password').value;
        const confirm = $('reg-confirm').value;
        if (pass !== confirm) {
            errorEl.textContent = 'Passwords do not match.';
            show(errorEl);
            return;
        }

        const btn = $('reg-submit');
        setLoading(btn, true);
        try {
            const data = await api('POST', '/auth/register', {
                username: $('reg-username').value.trim(),
                password: pass,
            });
            Auth._storeAndEnter(data);
        } catch (err) {
            errorEl.textContent = err.message;
            show(errorEl);
        } finally {
            setLoading(btn, false);
        }
    },

    _storeAndEnter(data) {
        State.token = data.token;
        State.user  = data.user;
        localStorage.setItem('spinrox_token', data.token);
        localStorage.setItem('spinrox_user',  JSON.stringify(data.user));
        Auth._enterApp();
    },

    _enterApp() {
        hide($('auth-view'));
        show($('app-shell'));

        // Populate sidebar
        const u = State.user;
        if ($('sidebar-avatar'))   $('sidebar-avatar').textContent   = u.username[0].toUpperCase();
        if ($('sidebar-username')) $('sidebar-username').textContent = u.username;
        if ($('sidebar-role'))     $('sidebar-role').textContent     = u.role;
        updateBalanceDisplay(u.coin_balance);

        // Show admin nav if admin
        if (u.role === 'admin') {
            show($('nav-admin'));
            show($('mobile-nav-admin'));
        }

        // Connect socket
        Socket.init();

        // Start on lobby
        Router.go('lobby');
    },

    logout() {
        State.token = null;
        State.user  = null;
        localStorage.removeItem('spinrox_token');
        localStorage.removeItem('spinrox_user');
        if (State.socket) { State.socket.disconnect(); State.socket = null; }
        clearInterval(State.countdownInterval);
        clearInterval(State.lobbyPollInterval);
        hide($('app-shell'));
        show($('auth-view'));
    }
};

// ═══════════════════════════════════════════════════════════════
//  SOCKET MODULE
// ═══════════════════════════════════════════════════════════════
const Socket = {
    init() {
        if (State.socket) State.socket.disconnect();
        State.socket = io({ auth: { token: State.token } });

        State.socket.on('connect', () => {
            console.log('Socket connected');
            // Rejoin wheel room if there's an active wheel
            if (State.activeWheel?.wheel?.id) {
                Socket.joinRoom(State.activeWheel.wheel.id);
            }
        });

        State.socket.on('connect_error', (err) => {
            console.warn('Socket auth error:', err.message);
        });

        // ─ Game Events ─
        State.socket.on('player-joined', (data) => {
            toast(`${data.username} joined the wheel! 👋`, 'info');
            if (Router.current === 'lobby') Lobby.refresh();
        });

        State.socket.on('game-started', (data) => {
            toast('🎰 Game has started!', 'success');
            show($('game-live-badge'));
            $('players-remaining').textContent = `${data.participantCount} players remaining`;
            hide($('join-wheel-btn'));
            hide($('start-wheel-btn'));
            show($('watch-game-btn'));
            // Auto-switch to game view
            Router.go('game');
            Game.initFromEvent(data.participants);
        });

        State.socket.on('player-eliminated', (data) => {
            Game.handleElimination(data);
            // Refresh profile balance if it's us
            if (data.username === State.user?.username) {
                Profile.refreshBalance();
            }
        });

        State.socket.on('game-ended', (data) => {
            Game.handleEnd(data);
            // Refresh balance for everyone
            Profile.refreshBalance();
        });

        State.socket.on('wheel-aborted', (data) => {
            toast(`Wheel aborted: ${data.reason}. Coins refunded 💸`, 'warning');
            hide($('game-live-badge'));
            State.activeWheel = null;
            if (Router.current === 'game') Router.go('lobby');
            else Lobby.refresh();
        });
    },

    joinRoom(wheelId) {
        if (!State.socket || State.socketWheelId === wheelId) return;
        if (State.socketWheelId) State.socket.emit('leave-wheel-room', State.socketWheelId);
        State.socket.emit('join-wheel-room', wheelId);
        State.socketWheelId = wheelId;
    }
};

// ═══════════════════════════════════════════════════════════════
//  LOBBY MODULE
// ═══════════════════════════════════════════════════════════════
const Lobby = {
    async init() {
        // Show admin create card
        toggle($('admin-create-card'), State.user?.role === 'admin');
        await Lobby.refresh();
    },

    async refresh() {
        try {
            const data = await api('GET', '/wheel/active');
            State.activeWheel = data;

            if (!data.wheel) {
                Lobby._showNoWheel();
                return;
            }

            Socket.joinRoom(data.wheel.id);
            Lobby._renderWheel(data);
        } catch (err) {
            console.error('Lobby refresh error:', err);
        }
    },

    _showNoWheel() {
        hide($('active-wheel-card'));
        show($('no-wheel-card'));
        clearInterval(State.countdownInterval);
    },

    _renderWheel(data) {
        const { wheel, participants, participant_count } = data;

        hide($('no-wheel-card'));
        show($('active-wheel-card'));

        // Status badge
        const badge = $('wheel-status-badge');
        badge.textContent = wheel.status.toUpperCase();
        badge.className = `badge ${wheel.status === 'waiting' ? 'badge-green' : 'badge-gold'}`;

        $('wheel-fee-display').textContent = fmt(wheel.entry_fee);
        $('pool-winner').textContent = fmt(wheel.winner_pool);
        $('pool-admin').textContent  = fmt(wheel.admin_pool);
        $('pool-app').textContent    = fmt(wheel.app_pool);
        $('participant-count').textContent = participant_count;

        // Check if user already joined
        const alreadyJoined = participants.some(p => p.user_id === State.user?.id);
        const isAdmin = State.user?.role === 'admin';
        const isWaiting = wheel.status === 'waiting';
        const isRunning = wheel.status === 'running';

        toggle($('join-wheel-btn'),  isWaiting && !alreadyJoined);
        toggle($('start-wheel-btn'), isWaiting && isAdmin && participant_count >= 3);
        toggle($('watch-game-btn'),  isRunning);
        toggle($('game-live-badge'), isRunning);

        // Countdown timer
        if (isWaiting && wheel.created_at) {
            const created = new Date(wheel.created_at).getTime();
            const autoStart = created + 3 * 60 * 1000;
            Lobby._startCountdown(autoStart);
        } else {
            hide($('wheel-timer'));
            clearInterval(State.countdownInterval);
        }

        // Participants list
        const list = $('participants-list');
        list.innerHTML = '';
        participants.forEach(p => {
            const chip = document.createElement('div');
            chip.className = 'participant-chip';
            chip.innerHTML = `
                <div class="participant-avatar">${p.username[0].toUpperCase()}</div>
                <span>${p.username}</span>
                ${p.user_id === State.user?.id ? '<span class="badge badge-purple" style="font-size:0.65rem;padding:1px 6px;">You</span>' : ''}
            `;
            list.appendChild(chip);
        });
    },

    _startCountdown(targetMs) {
        clearInterval(State.countdownInterval);
        show($('wheel-timer'));

        function tick() {
            const remaining = Math.max(0, targetMs - Date.now());
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            $('countdown-display').textContent = `${m}:${s.toString().padStart(2, '0')}`;
            if (remaining === 0) clearInterval(State.countdownInterval);
        }
        tick();
        State.countdownInterval = setInterval(tick, 1000);
    },

    async joinWheel() {
        const wheelId = State.activeWheel?.wheel?.id;
        if (!wheelId) return;

        const btn = $('join-wheel-btn');
        setLoading(btn, true);
        try {
            const data = await api('POST', `/wheel/join/${wheelId}`);
            toast(`Joined! New balance: ${fmt(data.new_balance)} 🪙`, 'success');
            updateBalanceDisplay(data.new_balance);
            await Lobby.refresh();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    },

    async createWheel() {
        const fee = parseInt($('create-fee-input').value);
        if (!fee || fee < 1) { toast('Enter a valid entry fee', 'error'); return; }

        const btn = $('create-wheel-btn');
        setLoading(btn, true);
        try {
            await api('POST', '/wheel/create', { entry_fee: fee });
            toast('Wheel created! Auto-starts in 3 minutes.', 'success');
            await Lobby.refresh();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    },

    async manualStart() {
        const wheelId = State.activeWheel?.wheel?.id;
        if (!wheelId) return;

        const btn = $('start-wheel-btn');
        setLoading(btn, true);
        try {
            await api('POST', `/wheel/start/${wheelId}`);
            toast('Game starting! 🎰', 'success');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  SPIN WHEEL ENGINE
// ═══════════════════════════════════════════════════════════════
class SpinWheelEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.size = canvas.width;
        this.cx = this.size / 2;
        this.cy = this.size / 2;
        this.outerR = this.size / 2 - 36;
        this.innerR = 52;
        this.rotation = 0;
        this.players = [];
        this.idleRaf = null;
        this.spinRaf = null;
        this.COLORS = ['#8b5cf6','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#06b6d4','#f97316','#a855f7','#84cc16'];
    }

    setPlayers(names) {
        this.players = names.map((name, i) => ({
            name,
            eliminated: false,
            color: this.COLORS[i % this.COLORS.length]
        }));
        this.draw();
    }

    draw() {
        const { ctx, cx, cy, outerR, innerR, rotation, players, size } = this;
        const n = players.length;
        if (n === 0) return;

        ctx.clearRect(0, 0, size, size);

        const arc = (2 * Math.PI) / n;

        // Outer glow ring
        const glow = ctx.createRadialGradient(cx, cy, outerR - 20, cx, cy, outerR + 30);
        glow.addColorStop(0, 'rgba(139,92,246,0)');
        glow.addColorStop(0.5, 'rgba(139,92,246,0.15)');
        glow.addColorStop(1, 'rgba(139,92,246,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, outerR + 30, 0, 2 * Math.PI);
        ctx.fillStyle = glow;
        ctx.fill();

        // Background circle
        ctx.beginPath();
        ctx.arc(cx, cy, outerR + 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#0c0c1e';
        ctx.fill();

        // Segments
        for (let i = 0; i < n; i++) {
            const p = players[i];
            const startAngle = rotation + i * arc;
            const endAngle = startAngle + arc;
            const midAngle = startAngle + arc / 2;
            const color = p.eliminated ? '#1e1e3a' : p.color;

            // Segment fill with gradient
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, outerR, startAngle, endAngle);
            ctx.closePath();

            if (!p.eliminated) {
                const g = ctx.createRadialGradient(
                    cx + Math.cos(midAngle) * innerR, cy + Math.sin(midAngle) * innerR, 0,
                    cx + Math.cos(midAngle) * outerR, cy + Math.sin(midAngle) * outerR, outerR
                );
                g.addColorStop(0, color + 'dd');
                g.addColorStop(1, color + '88');
                ctx.fillStyle = g;
            } else {
                ctx.fillStyle = color;
            }
            ctx.fill();

            // Segment border
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, outerR, startAngle, endAngle);
            ctx.closePath();
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Label
            if (!p.eliminated) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(midAngle);
                const labelR = (innerR + outerR) / 2 + 10;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff';
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 6;
                ctx.font = `bold ${Math.max(10, Math.min(14, 120 / n))}px Inter, sans-serif`;
                const label = p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name;
                ctx.fillText(label, labelR, 0);
                ctx.restore();
            } else {
                // Eliminated: skull
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(midAngle);
                const labelR = (innerR + outerR) / 2 + 10;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `${Math.max(12, Math.min(18, 140 / n))}px serif`;
                ctx.globalAlpha = 0.4;
                ctx.fillText('💀', labelR, 0);
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        }

        // Outer decorative ring
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(139,92,246,0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Tick marks on outer ring
        for (let a = 0; a < n * 2; a++) {
            const rad = rotation + a * (Math.PI / n);
            const isMajor = a % 2 === 0;
            const innerT = outerR + 4;
            const outerT = outerR + (isMajor ? 14 : 8);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(rad) * innerT, cy + Math.sin(rad) * innerT);
            ctx.lineTo(cx + Math.cos(rad) * outerT, cy + Math.sin(rad) * outerT);
            ctx.strokeStyle = isMajor ? 'rgba(245,158,11,0.8)' : 'rgba(255,255,255,0.25)';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.stroke();
        }

        // Center hub
        const hubGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
        hubGrad.addColorStop(0, '#2d1b69');
        hubGrad.addColorStop(1, '#1e1b4b');
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
        ctx.fillStyle = hubGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(139,92,246,0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Hub text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(innerR * 0.32)}px Space Grotesk, sans-serif`;
        ctx.fillStyle = '#a78bfa';
        ctx.shadowColor = 'rgba(139,92,246,0.5)';
        ctx.shadowBlur = 8;
        ctx.fillText('SPIN', cx, cy - 7);
        ctx.fillText('ROX', cx, cy + 11);
        ctx.shadowBlur = 0;

        // Pointer (fixed, above canvas)
        this._drawPointer();
    }

    _drawPointer() {
        const { ctx, cx, cy, outerR } = this;
        const tipY = cy - outerR - 8;
        const baseY = tipY + 28;
        const hw = 12;

        ctx.beginPath();
        ctx.moveTo(cx, tipY);
        ctx.lineTo(cx - hw, baseY);
        ctx.lineTo(cx + hw, baseY);
        ctx.closePath();

        const pg = ctx.createLinearGradient(cx, tipY, cx, baseY);
        pg.addColorStop(0, '#fbbf24');
        pg.addColorStop(1, '#d97706');
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Pointer tip glow
        ctx.beginPath();
        ctx.arc(cx, tipY + 4, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    startIdle() {
        this.stopAll();
        const animate = () => {
            this.rotation += 0.004;
            this.draw();
            this.idleRaf = requestAnimationFrame(animate);
        };
        this.idleRaf = requestAnimationFrame(animate);
    }

    stopAll() {
        if (this.idleRaf) { cancelAnimationFrame(this.idleRaf); this.idleRaf = null; }
        if (this.spinRaf) { cancelAnimationFrame(this.spinRaf); this.spinRaf = null; }
    }

    spinToIndex(targetIndex, duration = 4500) {
        return new Promise((resolve) => {
            this.stopAll();
            const n = this.players.length;
            const arc = (2 * Math.PI) / n;

            // Pointer at top (-π/2) should hit center of segment targetIndex
            // Segment center angle (absolute) = rotation + (targetIndex + 0.5) * arc
            // We want that = -π/2 + 2πk
            const targetNorm = ((-Math.PI / 2) - (targetIndex + 0.5) * arc % (2 * Math.PI) + 4 * Math.PI) % (2 * Math.PI);
            const currentNorm = ((this.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

            let diff = targetNorm - currentNorm;
            if (diff <= 0) diff += 2 * Math.PI;

            // 5-8 full spins + the final position
            const totalSpin = this.rotation + diff + 2 * Math.PI * (5 + Math.floor(Math.random() * 3));
            const startRot = this.rotation;
            const startTime = performance.now();

            const animate = (now) => {
                const t = Math.min((now - startTime) / duration, 1);
                const ease = 1 - Math.pow(1 - t, 4); // quartic ease-out
                this.rotation = startRot + (totalSpin - startRot) * ease;
                this.draw();
                if (t < 1) {
                    this.spinRaf = requestAnimationFrame(animate);
                } else {
                    this.rotation = totalSpin;
                    this.spinRaf = null;
                    resolve();
                }
            };
            this.spinRaf = requestAnimationFrame(animate);
        });
    }

    async spinAndEliminate(username) {
        const idx = this.players.findIndex(p => p.name === username);
        if (idx === -1) return;

        await this.spinToIndex(idx, 4000);
        this.players[idx].eliminated = true;
        this.draw();

        await new Promise(r => setTimeout(r, 1500));
        this.startIdle();
    }
}

// ═══════════════════════════════════════════════════════════════
//  GAME MODULE
// ═══════════════════════════════════════════════════════════════
const Game = {
    elimQueue: [],
    processing: false,
    participants: [],
    elimCount: 0,

    init() {
        // If there's a running wheel, load its current state
        const wheel = State.activeWheel?.wheel;
        if (!wheel) {
            $('game-state-msg').textContent = 'No active game. Head to Lobby.';
            return;
        }
        if (wheel.status === 'running') {
            // Reload full status to get current eliminated state
            Game._loadCurrentState(wheel.id);
        } else {
            $('game-state-msg').textContent = 'Waiting for game to start…';
            if (!State.wheelEngine) Game._setupCanvas([]);
        }
    },

    async _loadCurrentState(wheelId) {
        try {
            const data = await api('GET', `/wheel/status/${wheelId}`);
            const allPlayers = data.participants.map(p => p.username);
            const eliminated = data.participants.filter(p => p.is_eliminated).map(p => p.username);
            const remaining  = data.participants.filter(p => !p.is_eliminated).length;

            Game._setupCanvas(allPlayers);

            // Mark already-eliminated players
            eliminated.forEach(u => {
                if (State.wheelEngine) {
                    const p = State.wheelEngine.players.find(x => x.name === u);
                    if (p) p.eliminated = true;
                }
                Game._addEliminatedChip(u);
            });
            if (State.wheelEngine) State.wheelEngine.draw();

            $('players-remaining').textContent = `${remaining} players remaining`;
            $('game-state-msg').textContent = '';
            State.wheelEngine.startIdle();
        } catch (err) {
            console.error('Load game state error:', err);
        }
    },

    initFromEvent(participantNames) {
        Game.participants = participantNames;
        Game.elimCount = 0;
        $('elimination-log').innerHTML = '';
        $('eliminated-list').innerHTML = '';
        Game._setupCanvas(participantNames);
        $('players-remaining').textContent = `${participantNames.length} players remaining`;
        $('game-state-msg').textContent = '';
        State.wheelEngine.startIdle();
    },

    _setupCanvas(players) {
        const canvas = $('wheel-canvas');
        if (!canvas) return;
        if (State.wheelEngine) State.wheelEngine.stopAll();
        State.wheelEngine = new SpinWheelEngine(canvas);
        State.wheelEngine.setPlayers(players);
    },

    handleElimination(data) {
        // Queue eliminations in case multiple fire quickly
        Game.elimQueue.push(data);
        if (!Game.processing) Game._processNext();
    },

    async _processNext() {
        if (Game.elimQueue.length === 0) { Game.processing = false; return; }
        Game.processing = true;

        const data = Game.elimQueue.shift();
        Game.elimCount++;

        // Update status bar
        $('players-remaining').textContent = `${data.remainingCount} players remaining`;

        // Add elimination log entry
        const log = $('elimination-log');
        if (log.querySelector('.log-empty')) log.innerHTML = '';
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="log-entry-num">#${Game.elimCount}</span>
            <span>💀 <strong>${data.username}</strong> eliminated</span>
        `;
        log.prepend(entry);

        // Show spin label
        const label = $('spin-label');
        label.textContent = `Eliminating ${data.username}…`;
        show(label);

        // Spin the wheel
        if (State.wheelEngine) {
            await State.wheelEngine.spinAndEliminate(data.username);
        } else {
            await new Promise(r => setTimeout(r, 1500));
        }

        hide(label);

        // Add eliminated chip
        Game._addEliminatedChip(data.username);

        // Process next in queue
        Game._processNext();
    },

    _addEliminatedChip(username) {
        const chip = document.createElement('div');
        chip.className = 'elim-chip';
        chip.textContent = username;
        $('eliminated-list').appendChild(chip);
    },

    async handleEnd(data) {
        // Wait for any ongoing spin to complete
        await new Promise(r => setTimeout(r, 500));

        if (State.wheelEngine) State.wheelEngine.stopAll();

        // Fetch winner's prize pool amount
        const winnerPrize = State.activeWheel?.wheel?.winner_pool;

        // Show winner overlay
        $('winner-name').textContent = data.winner;
        $('winner-prize').textContent = winnerPrize ? `+${fmt(winnerPrize)} 🪙` : '';

        show($('winner-overlay'));
        hide($('game-live-badge'));

        // Countdown back to lobby
        let sec = 5;
        $('winner-countdown').textContent = sec;
        clearInterval(State.winnerCountdownInterval);
        State.winnerCountdownInterval = setInterval(() => {
            sec--;
            if ($('winner-countdown')) $('winner-countdown').textContent = sec;
            if (sec <= 0) {
                clearInterval(State.winnerCountdownInterval);
                hide($('winner-overlay'));
                State.activeWheel = null;
                State.socketWheelId = null;
                Game.elimQueue = [];
                Game.processing = false;
                Router.go('lobby');
            }
        }, 1000);
    }
};

// ═══════════════════════════════════════════════════════════════
//  PROFILE MODULE
// ═══════════════════════════════════════════════════════════════
const Profile = {
    async init() {
        try {
            const [meData, txData, gameData] = await Promise.all([
                api('GET', '/users/me'),
                api('GET', '/users/me/transactions'),
                api('GET', '/users/me/games'),
            ]);

            const u = meData.user;
            $('profile-avatar-lg').textContent  = u.username[0].toUpperCase();
            $('profile-username').textContent   = u.username;
            $('profile-balance').textContent    = fmt(u.coin_balance);
            $('profile-role-badge').textContent = u.role;
            $('profile-role-badge').className   = `badge badge-${u.role === 'admin' ? 'gold' : 'purple'}`;
            updateBalanceDisplay(u.coin_balance);

            // Stats
            const games   = gameData.games || [];
            const txs     = txData.transactions || [];
            const wins    = games.filter(g => g.is_winner).length;
            const spent   = txs.filter(t => t.type === 'entry_fee').reduce((a, t) => a + Math.abs(t.amount), 0);
            const earned  = txs.filter(t => t.type === 'winning').reduce((a, t) => a + t.amount, 0);

            $('stat-games').textContent = games.length;
            $('stat-wins').textContent  = wins;
            $('stat-spent').textContent = fmt(spent);
            $('stat-earned').textContent = fmt(earned);

            // Transactions table
            const tbody = $('tx-tbody');
            tbody.innerHTML = '';
            if (txs.length === 0) {
                show($('tx-empty'));
                hide(document.querySelector('#tx-table thead'));
            } else {
                hide($('tx-empty'));
                const thead = document.querySelector('#tx-table thead');
                if (thead) show(thead);
                txs.forEach(tx => {
                    const isPos = tx.amount > 0;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span class="tx-type tx-${tx.type}">${tx.type.replace('_', ' ')}</span></td>
                        <td class="${isPos ? 'tx-amount-pos' : 'tx-amount-neg'}">${isPos ? '+' : ''}${fmt(tx.amount)}</td>
                        <td>${fmt(tx.balance_after)}</td>
                        <td style="color:var(--text-3);font-size:0.8rem">${formatDate(tx.created_at)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } catch (err) {
            toast('Failed to load profile: ' + err.message, 'error');
        }
    },

    async refreshBalance() {
        try {
            const data = await api('GET', '/users/me');
            updateBalanceDisplay(data.user.coin_balance);
        } catch (_) {}
    }
};

// ═══════════════════════════════════════════════════════════════
//  ADMIN MODULE
// ═══════════════════════════════════════════════════════════════
const Admin = {
    async init() {
        await Promise.all([
            Admin.loadConfig(),
            Admin.loadActiveWheel(),
            Admin.loadUsers(),
        ]);
    },

    async loadConfig() {
        try {
            const data = await api('GET', '/admin/config');
            const c = data.config;
            $('config-winner').value = c.winner_percentage ?? 70;
            $('config-admin').value  = c.admin_percentage  ?? 20;
            $('config-app').value    = c.app_percentage    ?? 10;
            Admin.updateConfigSum();
        } catch (err) {
            toast('Failed to load config', 'error');
        }
    },

    updateConfigSum() {
        const w = parseInt($('config-winner').value) || 0;
        const a = parseInt($('config-admin').value)  || 0;
        const ap= parseInt($('config-app').value)    || 0;
        const total = w + a + ap;
        $('config-sum').textContent = total;

        const ok = total === 100;
        $('config-sum-status').textContent = ok ? '✅' : '❌';
        $('config-sum').className = `config-sum-val ${ok ? 'config-sum-ok' : 'config-sum-bad'}`;
        $('save-config-btn').disabled = !ok;
    },

    async saveConfig() {
        const btn = $('save-config-btn');
        setLoading(btn, true);
        try {
            await api('PUT', '/admin/config', {
                winner_percentage: parseInt($('config-winner').value),
                admin_percentage:  parseInt($('config-admin').value),
                app_percentage:    parseInt($('config-app').value),
            });
            toast('Config saved! ✅', 'success');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    },

    async loadActiveWheel() {
        const container = $('admin-wheel-info');
        try {
            const data = await api('GET', '/wheel/active');
            if (!data.wheel) {
                container.innerHTML = '<div class="empty-state-sm">No active wheel right now.</div>';
                return;
            }
            const w = data.wheel;
            container.innerHTML = `
                <div class="admin-wheel-info-grid">
                    <div class="admin-info-row">
                        <span class="admin-info-label">Wheel ID</span>
                        <span class="admin-info-value">#${w.id}</span>
                    </div>
                    <div class="admin-info-row">
                        <span class="admin-info-label">Status</span>
                        <span class="badge badge-${w.status === 'waiting' ? 'green' : 'gold'}">${w.status.toUpperCase()}</span>
                    </div>
                    <div class="admin-info-row">
                        <span class="admin-info-label">Entry Fee</span>
                        <span class="admin-info-value">${fmt(w.entry_fee)} 🪙</span>
                    </div>
                    <div class="admin-info-row">
                        <span class="admin-info-label">Participants</span>
                        <span class="admin-info-value">${data.participant_count}</span>
                    </div>
                    <div class="admin-info-row">
                        <span class="admin-info-label">Winner Pool</span>
                        <span class="admin-info-value" style="color:var(--gold)">${fmt(w.winner_pool)} 🪙</span>
                    </div>
                </div>
                ${w.status === 'waiting' ? `
                <button class="btn btn-gold" onclick="Admin.startWheel(${w.id})" id="admin-start-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <span class="btn-text">Start Game Now</span>
                    <span class="btn-spinner hidden"></span>
                </button>` : ''}
            `;
        } catch (err) {
            container.innerHTML = '<div class="empty-state-sm">Failed to load wheel info.</div>';
        }
    },

    async startWheel(wheelId) {
        const btn = $('admin-start-btn');
        if (btn) setLoading(btn, true);
        try {
            await api('POST', `/wheel/start/${wheelId}`);
            toast('Game is starting! 🎰', 'success');
            Admin.loadActiveWheel();
        } catch (err) {
            toast(err.message, 'error');
            if (btn) setLoading(btn, false);
        }
    },

    async loadUsers() {
        const tbody = $('admin-users-tbody');
        try {
            const data = await api('GET', '/admin/users');
            tbody.innerHTML = '';
            data.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="display:flex;align-items:center;gap:8px">
                            <div class="user-avatar" style="width:28px;height:28px;font-size:0.75rem">${u.username[0].toUpperCase()}</div>
                            ${u.username}
                        </div>
                    </td>
                    <td><span class="badge badge-${u.role === 'admin' ? 'gold' : 'blue'}">${u.role}</span></td>
                    <td style="color:var(--gold);font-weight:600">${fmt(u.coin_balance)} 🪙</td>
                    <td>
                        <div style="display:flex;gap:6px;align-items:center">
                            <input type="number" class="topup-input" id="topup-${u.id}" value="500" min="1" />
                            <button class="btn btn-ghost btn-sm" onclick="Admin.topup(${u.id}, 'topup-${u.id}')">Add</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            toast('Failed to load users', 'error');
        }
    },

    async topup(userId, inputId) {
        const amount = parseInt($(inputId).value);
        if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
        try {
            const data = await api('POST', `/admin/users/${userId}/topup`, { amount });
            toast(`Added ${fmt(amount)} coins to ${data.user.username} ✅`, 'success');
            Admin.loadUsers();
            // Update own balance if topping up self
            if (userId === State.user?.id) updateBalanceDisplay(data.user.coin_balance);
        } catch (err) {
            toast(err.message, 'error');
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    if (State.token && State.user) {
        Auth._enterApp();
    } else {
        show($('auth-view'));
        hide($('app-shell'));
    }
});
