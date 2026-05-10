// ================= 核心架构与状态管理 =================
const GameState = { SELECTION: 0, BATTLE: 1, END: 2 };
let currentState = GameState.SELECTION;

class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        this.lastShootTime = 0;
        this.lastHitTime = 0;
        this.lastCastTime = 0;
        this.lastDashTime = 0;
        this.lastWallTime = 0;
        this.lastExplosionTime = 0;
    }

    init() {
        if (!this.ctx) {
            const AudioContextCtor = window.AudioContext || window['webkitAudioContext'];
            this.ctx = new AudioContextCtor();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.enabled = true;
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, vol = 0.1) {
        if (!this.enabled || !this.ctx) return;
        const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    shouldSkip(tsName, gap = 50) {
        const now = performance.now();
        if (this[tsName] && now - this[tsName] < gap) return true;
        this[tsName] = now;
        return false;
    }

    shoot() {
        if (this.shouldSkip('lastShootTime')) return;
        this.playTone(400, 'square', 0.1, 0.05);
        setTimeout(() => this.playTone(300, 'square', 0.1, 0.05), 50);
    }

    hit() {
        if (this.shouldSkip('lastHitTime')) return;
        this.playNoise(0.2, 0.2);
    }

    cast() {
        if (this.shouldSkip('lastCastTime')) return;
        this.playTone(600, 'sine', 0.3, 0.1);
        setTimeout(() => this.playTone(800, 'sine', 0.3, 0.1), 100);
    }

    dash() {
        if (this.shouldSkip('lastDashTime')) return;
        this.playNoise(0.3, 0.1);
        this.playTone(200, 'sawtooth', 0.3, 0.05);
    }

    wall() {
        if (this.shouldSkip('lastWallTime')) return;
        this.playNoise(0.5, 0.15);
        this.playTone(150, 'square', 0.5, 0.1);
    }

    explosion() {
        if (this.shouldSkip('lastExplosionTime')) return;
        this.playNoise(0.8, 0.4);
    }

    select() {
        this.playTone(800, 'sine', 0.1, 0.1);
    }

    start() {
        this.playTone(440, 'sine', 0.2, 0.1);
        setTimeout(() => this.playTone(554, 'sine', 0.2, 0.1), 200);
        setTimeout(() => this.playTone(659, 'sine', 0.4, 0.1), 400);
    }

    win() {
        this.playTone(440, 'square', 0.2, 0.1);
        setTimeout(() => this.playTone(554, 'square', 0.2, 0.1), 200);
        setTimeout(() => this.playTone(659, 'square', 0.2, 0.1), 400);
        setTimeout(() => this.playTone(880, 'square', 0.6, 0.1), 600);
    }
}

const soundManager = new SoundManager();

let floatingTexts = [];
let screenShake = 0;

class FloatingText {
    constructor(x, y, text, color, size = 20) {
        this.x = x + (Math.random() - 0.5) * 30;
        this.y = y - 20;
        this.text = text;
        this.color = color;
        this.size = size;
        this.life = 1.0;
        this.maxLife = 1.0;
        this.vy = -30;
    }
    update(dt) {
        this.y += this.vy * dt;
        this.life -= dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

function triggerKillFeed(killerId, victimId) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'kill-feed-item';
    item.textContent = `玩家 ${killerId} 击杀了 玩家 ${victimId}`;
    feed.appendChild(item);
    setTimeout(() => {
        if (item.parentNode) item.parentNode.removeChild(item);
    }, 3000);
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const configA = { id: 'A', startX: 150, startY: 150, color: '#2ecc71', keys: { up: 'w', down: 's', left: 'a', right: 'd', skill1: '1', skill2: '2', skill3: '3', skill4: '4', skill5: '5' } };
const configB = { id: 'B', startX: 850, startY: 150, color: '#e74c3c', keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', skill1: '8', skill2: '9', skill3: '0', skill4: '-', skill5: '=' } };
const configC = { id: 'C', startX: 150, startY: 450, color: '#2980b9', keys: { up: 'w', down: 's', left: 'a', right: 'd', skill1: '1', skill2: '2', skill3: '3', skill4: '4', skill5: '5' } };
const configD = { id: 'D', startX: 850, startY: 450, color: '#f39c12', keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', skill1: '8', skill2: '9', skill3: '0', skill4: '-', skill5: '=' } };
const playerConfigs = { 'A': configA, 'B': configB, 'C': configC, 'D': configD };

const networkStatusEl = document.getElementById('network-status');
const roomCodeEl = document.getElementById('room-code');
const roomIdInput = document.getElementById('room-id-input');
const startTipEl = document.getElementById('start-tip');
const localBtn = document.getElementById('local-mode-btn');
const playerCountSelect = document.getElementById('player-count-select');
const gameModeSelect = document.getElementById('game-mode-select');
const hostBtn = document.getElementById('host-room-btn');
const joinBtn = document.getElementById('join-room-btn');
const copyRoomBtn = document.getElementById('copy-room-btn');
const deleteRoomBtn = document.getElementById('delete-room-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const returnLobbyBtn = document.getElementById('return-lobby-btn');
const countdownOverlayEl = document.getElementById('countdown-overlay');
const countdownTextEl = document.getElementById('countdown-text');

let targetPlayerCount = 2;
let gameMode = 'ffa'; // 'ffa' (Free For All) or '2v2'
let playerClasses = { A: null, B: null, C: null, D: null };
let p1 = null, p2 = null, p3 = null, p4 = null;
let playersList = [];
let entities = [];
let particles = [];
let lastTime = 0;
let animationStarted = false;
let startScheduled = false;
let countdownTimer = null;

let myPlayerId = 'A'; // defaults to A for host/local
let currentSessionStats = { kills: 0, damage: 0 };

const keys = {};
let remoteKeys = {};

const NetworkMode = { LOCAL: 'local', ONLINE: 'online' };
const NetworkRole = { LOCAL: 'local', HOST: 'host', GUEST: 'guest' };
let networkMode = NetworkMode.LOCAL;
let networkRole = NetworkRole.LOCAL;
let peer = null;
let connections = {};
let nextGuestId = 'B';
let roomId = '';
let lastSnapshotSent = 0;
let networkEvents = [];

// Matchmaking State
let mqttClient = null;
let isMatching = false;
let matchCheckInterval = null;
let becomeHostTimer = null;
let matchTimerInterval = null;
let matchStartTime = 0;

// Auth & Stats System
let currentUser = null;
function getAccounts() {
    return JSON.parse(localStorage.getItem('accounts') || '{}');
}
function saveAccounts(accs) {
    localStorage.setItem('accounts', JSON.stringify(accs));
}
function initAuth() {
    const saved = localStorage.getItem('currentUser');
    if (saved) currentUser = saved;
    updateAuthUI();
}

const SkillData = {
    '火系': {
        color: '#e67e22',
        skills: [
            { id: 'fireball', name: '火球术', cd: 2, cost: 10, keyName: '1/8', desc: '发射火球，附带灼烧效果' },
            { id: 'fireblast', name: '炎爆阵', cd: 8, cost: 30, keyName: '2/9', desc: '自身周围爆发，造成范围伤害并击退' },
            { id: 'flamedash', name: '烈焰冲刺', cd: 6, cost: 20, keyName: '3/0', desc: '向前突进一段距离，对路径上的敌人造成伤害' },
            { id: 'firewall', name: '火墙术', cd: 12, cost: 35, keyName: '4/-', desc: '在面前生成一道火墙，穿越的敌人会被严重灼烧' },
            { id: 'meteor', name: '陨石雨', cd: 20, cost: 50, keyName: '5/=', desc: '在敌人当前位置召唤巨大的陨石砸下，造成毁灭性范围伤害' }
        ]
    },
    '水系': {
        color: '#3498db',
        skills: [
            { id: 'frostray', name: '冰霜射线', cd: 3, cost: 15, keyName: '1/8', desc: '发射射线，附带减速效果' },
            { id: 'waterprison', name: '水牢术', cd: 10, cost: 25, keyName: '2/9', desc: '在敌人脚下召唤水牢，命中造成禁锢' },
            { id: 'waterjet', name: '水流喷射', cd: 5, cost: 20, keyName: '3/0', desc: '持续向前方喷射水流，造成多段伤害并击退' },
            { id: 'frostarmor', name: '冰霜护甲', cd: 15, cost: 30, keyName: '4/-', desc: '为自己附加护甲，减少受到的伤害并使攻击者减速' },
            { id: 'blizzard', name: '暴风雪', cd: 18, cost: 45, keyName: '5/=', desc: '召唤大范围暴风雪，持续造成伤害并强力减速所有敌人' }
        ]
    },
    '土系': {
        color: '#f1c40f',
        skills: [
            { id: 'stonevolley', name: '飞石连击', cd: 4, cost: 20, keyName: '1/8', desc: '发射三颗飞石，附带微弱减速' },
            { id: 'earthshield', name: '大地之盾', cd: 12, cost: 40, keyName: '2/9', desc: '召唤高额护盾，破裂时反伤周围敌人' },
            { id: 'earthspike', name: '地刺突袭', cd: 8, cost: 25, keyName: '3/0', desc: '从地下召唤一排地刺向前方蔓延，造成伤害和短暂击飞' },
            { id: 'mudswamp', name: '泥沼术', cd: 14, cost: 35, keyName: '4/-', desc: '在目标区域生成泥沼，极大降低敌人移速并持续吸蓝' },
            { id: 'earthquake', name: '地震波', cd: 18, cost: 45, keyName: '5/=', desc: '以自身为中心引发大范围地震，造成伤害并眩晕（禁锢）所有敌人' }
        ]
    },
    '风系': {
        color: '#1abc9c',
        skills: [
            { id: 'windblade', name: '风刃', cd: 1.5, cost: 8, keyName: '1/8', desc: '基础攻击，弹道极快，伤害较低' },
            { id: 'whirlwind', name: '旋风斩', cd: 6, cost: 25, keyName: '2/9', desc: '发出缓慢向前的龙卷风，持续多段伤害并附带小幅击退' },
            { id: 'windwall', name: '风墙', cd: 12, cost: 30, keyName: '3/0', desc: '在面前生成一道风墙，持续4秒，阻挡所有敌方飞行道具' },
            { id: 'hurricane', name: '飓风术', cd: 15, cost: 45, keyName: '4/-', desc: '在目标区域召唤强大飓风，短暂延迟后将敌人浮空并造成巨额伤害' },
            { id: 'tailwind', name: '顺风之息', cd: 20, cost: 20, keyName: '5/=', desc: '为自己附加极速状态，移动速度提升60%，持续5秒' }
        ]
    },
    '电系': {
        color: '#f1c40f',
        skills: [
            { id: 'spark', name: '电火花', cd: 1, cost: 5, keyName: '1/8', desc: '极速电流，伤害低，能快速叠加感电层数' },
            { id: 'balllightning', name: '球状闪电', cd: 8, cost: 25, keyName: '2/9', desc: '缓慢飞行的雷电球，持续电击周围敌人' },
            { id: 'magneticfield', name: '电磁立场', cd: 12, cost: 35, keyName: '3/0', desc: '在自身周围生成电磁场，持续伤害并减速靠近的敌人' },
            { id: 'thunderstrike', name: '落雷', cd: 10, cost: 30, keyName: '4/-', desc: '在鼠标位置召唤落雷，小范围高伤害并附带麻痹' },
            { id: 'railgun', name: '超电磁炮', cd: 18, cost: 50, keyName: '5/=', desc: '蓄力后发射贯穿全图的闪电射线，造成巨额即时伤害' }
        ]
    },
    '光系': {
        color: '#f39c12',
        skills: [
            { id: 'lightbolt', name: '圣光弹', cd: 2, cost: 10, keyName: '1/8', desc: '发射圣光弹，命中敌人造成伤害，如果命中队友则轻微治疗' },
            { id: 'healingaura', name: '治疗光环', cd: 15, cost: 40, keyName: '2/9', desc: '在自身周围生成治疗光环，持续恢复自己和队友的生命值' },
            { id: 'holyshield', name: '圣盾术', cd: 18, cost: 45, keyName: '3/0', desc: '为自己附加一个高额护盾' },
            { id: 'lightbind', name: '圣光束缚', cd: 12, cost: 30, keyName: '4/-', desc: '在目标脚下召唤光柱，短暂延迟后禁锢敌人' },
            { id: 'judgment', name: '裁决之光', cd: 20, cost: 60, keyName: '5/=', desc: '召唤巨大的光剑劈向敌人，造成巨额伤害' }
        ]
    },
    '暗系': {
        color: '#8e44ad',
        skills: [
            { id: 'shadowball', name: '暗影球', cd: 2.5, cost: 12, keyName: '1/8', desc: '发射缓慢飞行的暗影球，命中后吸取少量生命值' },
            { id: 'vampirictouch', name: '吸血之触', cd: 10, cost: 30, keyName: '2/9', desc: '连接一个敌人，持续吸取其生命值并减速' },
            { id: 'fearscream', name: '恐惧尖啸', cd: 15, cost: 35, keyName: '3/0', desc: '发出尖啸，使周围敌人陷入恐惧状态，不受控制地乱跑' },
            { id: 'abyssswamp', name: '深渊泥潭', cd: 16, cost: 40, keyName: '4/-', desc: '在目标区域召唤深渊，持续造成伤害并大幅降低移速' },
            { id: 'deathdescent', name: '死神降临', cd: 30, cost: 80, keyName: '5/=', desc: '化身死神(8秒)：移速提升、免伤50%、灼烧近身敌人。若敌人血量>90且高于自身，靠近会触发死神触手重击！结束时反噬扣血。' }
        ]
    }
};

function setNetworkStatus(text, tone = 'normal') {
    networkStatusEl.textContent = text;
    networkStatusEl.dataset.tone = tone;
    
    // Toggle chat visibility based on network mode
    if (typeof lobbyChat !== 'undefined' && lobbyChat) {
        if (networkMode === NetworkMode.ONLINE) {
            lobbyChat.classList.remove('hidden');
        } else {
            lobbyChat.classList.add('hidden');
        }
    }
}

function setRoomCode(text) {
    roomCodeEl.textContent = text;
}

function updateStartTip() {
    if (networkMode === NetworkMode.LOCAL) {
        startTipEl.textContent = '本地模式：双方在同一台电脑选择法系后自动开始';
        return;
    }
    if (networkRole === NetworkRole.HOST) {
        startTipEl.textContent = `联机主机：你负责玩家 A，等待客机连接（目标人数 ${targetPlayerCount}）并选择法系`;
        return;
    }
    if (networkRole === NetworkRole.GUEST) {
        startTipEl.textContent = `联机客机：你负责玩家 ${myPlayerId}，按相应键位选择法系`;
    }
}

function setSelectionStatusDefaults() {
    let actualTargetCount = (networkMode === NetworkMode.LOCAL) ? 2 : targetPlayerCount;
    ['p1-status', 'p2-status', 'p3-status', 'p4-status'].forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el) {
            if (idx < actualTargetCount) {
                el.innerText = '当前选择：等待中...';
            } else {
                el.innerText = '未参与';
            }
        }
    });
}

function clearInputStates() {
    Object.keys(keys).forEach(key => { keys[key] = false; });
    remoteKeys = {};
}

function hideCountdownOverlay() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    countdownTextEl.innerText = '3';
    countdownOverlayEl.classList.add('hidden');
}

function startBattleCountdown(seconds = 3) {
    hideCountdownOverlay();
    let remain = seconds;
    countdownTextEl.innerText = String(remain);
    countdownOverlayEl.classList.remove('hidden');

    countdownTimer = setInterval(() => {
        remain -= 1;
        if (remain > 0) {
            countdownTextEl.innerText = String(remain);
            return;
        }

        hideCountdownOverlay();
        clearInputStates();
        currentState = GameState.BATTLE;
        soundManager.start();
        lastTime = performance.now();

        if (!animationStarted) {
            animationStarted = true;
            requestAnimationFrame(gameLoop);
        }
    }, 1000);
}

function resetRuntimeState() {
    playerClasses = { A: null, B: null, C: null, D: null };
    p1 = null;
    p2 = null;
    p3 = null;
    p4 = null;
    entities = [];
    particles = [];
    remoteKeys = {};
    startScheduled = false;
    hideCountdownOverlay();
    clearInputStates();
    currentState = GameState.SELECTION;
    document.getElementById('selection-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    setSelectionStatusDefaults();
    updateStartTip();
}

function cleanupConnection(keepMode = false) {
    Object.values(connections).forEach(conn => {
        if (conn) {
            conn.off && conn.off();
            conn.close();
        }
    });
    connections = {};
    nextGuestId = 'B';
    if (peer) {
        peer.destroy();
        peer = null;
    }
    roomId = '';
    setRoomCode('房间码：未创建');
    
    deleteRoomBtn.classList.add('hidden');
    disconnectBtn.classList.add('hidden');

    if (!keepMode) {
        networkMode = NetworkMode.LOCAL;
        networkRole = NetworkRole.LOCAL;
    }
}

function switchToLocalMode() {
    cleanupConnection();
    resetRuntimeState();
    updatePlayerCardsVisibility();
    setNetworkStatus('当前为本地双人模式', 'normal');
}

function ensurePeerJs() {
    if (window.Peer) return true;
    setNetworkStatus('未能加载 PeerJS，请确认网络可访问 CDN', 'error');
    return false;
}

function isGuestConnected() {
    return Object.values(connections).some(conn => conn && conn.open);
}

function broadcast(message) {
    Object.values(connections).forEach(conn => {
        if (conn && conn.open) {
            conn.send(message);
        }
    });
}

function setupConnection(conn, guestId) {
    if (networkRole === NetworkRole.HOST) {
        connections[guestId] = conn;
    } else {
        connections['HOST'] = conn;
    }
    
    conn.on('open', () => {
        if (networkRole === NetworkRole.HOST) {
            setNetworkStatus(`客机已连接 (${Object.keys(connections).length}/${targetPlayerCount - 1})，等待选择法系`, 'success');
            conn.send({ type: 'host-welcome', guestId: guestId, targetPlayerCount, gameMode });
            broadcast({ type: 'host-selection', classes: playerClasses });
        } else {
            setNetworkStatus('已连接主机，等待分配身份', 'success');
        }
        updateStartTip();
    });

    conn.on('data', data => {
        handleNetworkMessage(data, guestId);
    });

    conn.on('close', () => {
        if (networkRole === NetworkRole.HOST) {
            delete connections[guestId];
            playerClasses[guestId] = null;
            setNetworkStatus(`玩家 ${guestId} 已断开`, 'error');
            Object.keys(remoteKeys).forEach(k => {
                if (k.startsWith(guestId + '_')) delete remoteKeys[k];
            });
            // Kill the player if they disconnect during battle
            if (currentState === GameState.BATTLE) {
                const p = playersList.find(p => p.config.id === guestId);
                if (p) p.hp = 0;
            }
        } else {
            setNetworkStatus('连接已断开，可重新创建或加入房间', 'error');
        }
        updateStartTip();
    });

    conn.on('error', () => {
        setNetworkStatus('联机出现错误，请重新连接', 'error');
    });
}

function createRoom(isQuickMatch = false) {
    if (!ensurePeerJs()) return;
    cleanupConnection(true);
    resetRuntimeState();
    networkMode = NetworkMode.ONLINE;
    targetPlayerCount = parseInt(playerCountSelect.value) || 2;
    if (targetPlayerCount > 4) targetPlayerCount = 4;
    networkRole = NetworkRole.HOST;
    roomId = `magic-${Math.random().toString(36).slice(2, 8)}`;
    setNetworkStatus('正在创建房间...', 'normal');
    setRoomCode(`房间码：${roomId}`);
    updateStartTip();
    deleteRoomBtn.classList.remove('hidden');

    peer = new window.Peer(roomId);
    peer.on('open', () => {
        if (isQuickMatch === true) {
            setNetworkStatus('正在匹配中 (作为房主)...', 'normal');
            matchCheckInterval = setInterval(() => {
                if (Object.keys(connections).length < targetPlayerCount - 1) {
                    if (mqttClient) {
                        const accs = getAccounts();
                        const myElo = (currentUser && accs[currentUser]) ? (accs[currentUser].stats.elo || 1000) : 1000;
                        mqttClient.publish('magic-battle-matchmaking-queue', JSON.stringify({
                            type: 'HOSTING',
                            roomId: roomId,
                            gameMode: gameMode,
                            targetPlayerCount: targetPlayerCount,
                            elo: myElo
                        }));
                    }
                } else {
                    stopMatchmaking();
                }
            }, 2000);
        } else {
            setNetworkStatus('房间已创建，把房间码发给朋友', 'success');
        }
    });
    peer.on('connection', conn => {
        if (Object.keys(connections).length >= targetPlayerCount - 1) {
            conn.close();
            return;
        }
        const guestId = nextGuestId;
        nextGuestId = String.fromCharCode(nextGuestId.charCodeAt(0) + 1);
        setupConnection(conn, guestId);
    });
    peer.on('error', err => {
        setNetworkStatus(`创建房间失败：${err.type || '未知错误'}`, 'error');
    });
}

function joinRoom(targetId = null) {
    if (!ensurePeerJs()) return;
    const targetRoomId = (typeof targetId === 'string') ? targetId : roomIdInput.value.trim();
    if (!targetRoomId) {
        setNetworkStatus('请先输入房间码', 'error');
        return;
    }

    cleanupConnection(true);
    resetRuntimeState();
    networkMode = NetworkMode.ONLINE;
    targetPlayerCount = parseInt(playerCountSelect.value) || 2;
    if (targetPlayerCount > 4) targetPlayerCount = 4;
    networkRole = NetworkRole.GUEST;
    setRoomCode(`目标房间：${targetRoomId}`);
    setNetworkStatus('正在连接主机...', 'normal');
    updateStartTip();
    disconnectBtn.classList.remove('hidden');

    peer = new window.Peer();
    peer.on('open', () => {
        const conn = peer.connect(targetRoomId, { reliable: true });
        setupConnection(conn, 'HOST');
    });
    peer.on('error', err => {
        setNetworkStatus(`连接失败：${err.type || '未知错误'}`, 'error');
    });
}

// Quick Match Logic
function startQuickMatch() {
    if (!ensurePeerJs()) return;
    if (typeof mqtt === 'undefined') {
        setNetworkStatus('正在加载匹配组件，请稍后再试...', 'error');
        return;
    }

    cleanupConnection(true);
    resetRuntimeState();
    networkMode = NetworkMode.ONLINE;
    isMatching = true;
    matchStartTime = Date.now();

    document.getElementById('quick-match-btn').classList.add('hidden');
    document.getElementById('cancel-match-btn').classList.remove('hidden');
    document.getElementById('host-room-btn').classList.add('hidden');
    document.getElementById('local-mode-btn').classList.add('hidden');
    
    setNetworkStatus('正在连接匹配服务器...', 'normal');

    mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt');

    mqttClient.on('connect', () => {
        mqttClient.subscribe('magic-battle-matchmaking-queue');
        setNetworkStatus('匹配中 0s...', 'normal');
        matchTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - matchStartTime) / 1000);
            setNetworkStatus(`匹配中 ${elapsed}s...`, 'normal');
            if (elapsed > 60) {
                stopMatchmaking();
                setNetworkStatus('匹配超时，请重试', 'error');
                switchToLocalMode();
            }
        }, 1000);
    });

    let foundRoom = false;
    becomeHostTimer = setTimeout(() => {
        if (!foundRoom && isMatching) {
            createRoom(true);
        }
    }, 3000);

    mqttClient.on('message', (topic, message) => {
        if (!isMatching) return;
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'HOSTING' && data.gameMode === gameMode && data.targetPlayerCount === targetPlayerCount) {
                const accs = getAccounts();
                const myElo = (currentUser && accs[currentUser]) ? (accs[currentUser].stats.elo || 1000) : 1000;
                const hostElo = data.elo || 1000;
                const elapsed = Math.floor((Date.now() - matchStartTime) / 1000);
                
                // Elo tolerance expands by 10 points every second
                const tolerance = 50 + (elapsed * 10);
                if (Math.abs(myElo - hostElo) > tolerance) {
                    return; // Ignore this host, Elo difference too high
                }

                if (networkRole === NetworkRole.HOST && roomId) {
                    if (roomId > data.roomId) {
                        // Yield to the other host to avoid split-brain
                        stopMatchmaking();
                        cleanupConnection(true);
                        joinRoom(data.roomId);
                    }
                } else {
                    // Found a room
                    foundRoom = true;
                    stopMatchmaking();
                    joinRoom(data.roomId);
                }
            }
        } catch (e) {}
    });
}

function stopMatchmaking() {
    isMatching = false;
    if (matchCheckInterval) clearInterval(matchCheckInterval);
    if (matchTimerInterval) clearInterval(matchTimerInterval);
    if (becomeHostTimer) clearTimeout(becomeHostTimer);
    if (mqttClient) {
        mqttClient.end();
        mqttClient = null;
    }
    document.getElementById('quick-match-btn').classList.remove('hidden');
    document.getElementById('cancel-match-btn').classList.add('hidden');
    document.getElementById('host-room-btn').classList.remove('hidden');
    document.getElementById('local-mode-btn').classList.remove('hidden');
}

document.getElementById('quick-match-btn').addEventListener('click', startQuickMatch);
document.getElementById('cancel-match-btn').addEventListener('click', () => {
    stopMatchmaking();
    switchToLocalMode();
    setNetworkStatus('已取消匹配', 'normal');
});

function copyRoomCode() {
    if (!roomId) {
        setNetworkStatus('当前没有可复制的房间码', 'error');
        return;
    }
    navigator.clipboard.writeText(roomId).then(() => {
        setNetworkStatus('房间码已复制', 'success');
    }).catch(() => {
        setNetworkStatus(`请手动复制房间码：${roomId}`, 'normal');
    });
}

function updatePlayerCardsVisibility() {
    let actualTargetCount = (networkMode === NetworkMode.LOCAL) ? 2 : targetPlayerCount;
    document.getElementById('card-p3').classList.toggle('hidden', actualTargetCount < 3);
    document.getElementById('card-p4').classList.toggle('hidden', actualTargetCount < 4);
    
    // Clear selections if reduced
    if (actualTargetCount < 4) {
        playerClasses.D = null;
        const el = document.getElementById('p4-status');
        if (el) el.innerText = '当前选择：等待中...';
    }
    if (actualTargetCount < 3) {
        playerClasses.C = null;
        const el = document.getElementById('p3-status');
        if (el) el.innerText = '当前选择：等待中...';
    }
}

playerCountSelect.addEventListener('change', (e) => {
    if (gameMode === '2v2') return;
    targetPlayerCount = parseInt(e.target.value);
    if (networkMode === NetworkMode.LOCAL && targetPlayerCount > 2) {
        setNetworkStatus('注意：本地模式只支持双人，请点击"创建房间"进行多人联机', 'normal');
    }
    updatePlayerCardsVisibility();
});

gameModeSelect.addEventListener('change', (e) => {
    gameMode = e.target.value;
    if (gameMode === '2v2') {
        playerCountSelect.value = '4';
        playerCountSelect.disabled = true;
        targetPlayerCount = 4;
        if (networkMode === NetworkMode.LOCAL) {
            setNetworkStatus('注意：2v2 组队模式需要创建房间进行联机', 'normal');
        }
    } else {
        playerCountSelect.disabled = false;
        targetPlayerCount = parseInt(playerCountSelect.value) || 2;
    }
    updatePlayerCardsVisibility();
});

// Auth UI Logic
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const statsBtn = document.getElementById('stats-btn');
const authModal = document.getElementById('auth-modal');
const statsModal = document.getElementById('stats-modal');
const closeAuthBtn = document.getElementById('close-auth');
const closeStatsBtn = document.getElementById('close-stats');
const doLoginBtn = document.getElementById('do-login-btn');
const doRegisterBtn = document.getElementById('do-register-btn');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const currentUserDisplay = document.getElementById('current-user-display');

function updateAuthUI() {
    if (currentUser) {
        currentUserDisplay.textContent = `玩家：${currentUser}`;
        currentUserDisplay.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        statsBtn.classList.remove('hidden');
    } else {
        currentUserDisplay.classList.add('hidden');
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        statsBtn.classList.add('hidden');
    }
}

loginBtn.addEventListener('click', () => {
    authModal.classList.remove('hidden');
    authError.textContent = '';
});

closeAuthBtn.addEventListener('click', () => authModal.classList.add('hidden'));

doRegisterBtn.addEventListener('click', () => {
    const user = authUsername.value.trim();
    const pass = authPassword.value.trim();
    if (!user || !pass) { authError.textContent = '用户名和密码不能为空'; return; }
    
    const accs = getAccounts();
    if (accs[user]) { authError.textContent = '该用户名已被注册'; return; }
    
    accs[user] = {
        password: pass,
        stats: { wins: 0, losses: 0, draws: 0, kills: 0, damage: 0, elo: 1000 }
    };
    saveAccounts(accs);
    authError.style.color = '#2ecc71';
    authError.textContent = '注册成功！请点击登录。';
});

doLoginBtn.addEventListener('click', () => {
    const user = authUsername.value.trim();
    const pass = authPassword.value.trim();
    if (!user || !pass) { authError.textContent = '用户名和密码不能为空'; return; }
    
    const accs = getAccounts();
    if (!accs[user] || accs[user].password !== pass) {
        authError.style.color = '#e74c3c';
        authError.textContent = '用户名或密码错误';
        return;
    }
    
    currentUser = user;
    localStorage.setItem('currentUser', user);
    authModal.classList.add('hidden');
    authUsername.value = '';
    authPassword.value = '';
    updateAuthUI();
});

logoutBtn.addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('currentUser');
    updateAuthUI();
});

function getRankName(elo) {
    if (elo < 1100) return { name: '青铜', color: '#cd7f32' };
    if (elo < 1300) return { name: '白银', color: '#bdc3c7' };
    if (elo < 1500) return { name: '黄金', color: '#f1c40f' };
    if (elo < 1800) return { name: '铂金', color: '#00cec9' };
    return { name: '钻石', color: '#9b59b6' };
}

statsBtn.addEventListener('click', () => {
    if (!currentUser) return;
    const accs = getAccounts();
    const stats = accs[currentUser]?.stats || { wins: 0, losses: 0, draws: 0, kills: 0, damage: 0, elo: 1000 };
    
    const rank = getRankName(stats.elo || 1000);
    const rankEl = document.getElementById('stat-rank');
    rankEl.textContent = `${rank.name} (${Math.round(stats.elo || 1000)})`;
    rankEl.style.color = rank.color;

    document.getElementById('stat-wins').textContent = stats.wins;
    document.getElementById('stat-losses').textContent = stats.losses;
    document.getElementById('stat-draws').textContent = stats.draws;
    document.getElementById('stat-kills').textContent = stats.kills;
    document.getElementById('stat-damage').textContent = Math.round(stats.damage);
    const totalGames = stats.wins + stats.losses + stats.draws;
    const winRate = totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0;
    document.getElementById('stat-winrate').textContent = `${winRate}%`;
    statsModal.classList.remove('hidden');
});

closeStatsBtn.addEventListener('click', () => statsModal.classList.add('hidden'));

// Chat UI Logic
const lobbyChat = document.getElementById('lobby-chat');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

function appendChatMessage(author, text, isSys = false) {
    const msgEl = document.createElement('p');
    msgEl.className = 'chat-msg';
    if (isSys) {
        msgEl.innerHTML = `<span class="sys">${text}</span>`;
    } else {
        msgEl.innerHTML = `<span class="author">[${author}]:</span> ${text}`;
    }
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
    if (networkMode !== NetworkMode.ONLINE) return;
    const text = chatInput.value.trim();
    if (!text) return;
    const author = currentUser || (networkRole === NetworkRole.HOST ? '主机' : `玩家 ${myPlayerId}`);
    
    if (networkRole === NetworkRole.HOST) {
        appendChatMessage(author, text);
        broadcast({ type: 'chat', author, text });
    } else {
        connections['HOST'].send({ type: 'chat', author, text });
    }
    chatInput.value = '';
}

sendChatBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

localBtn.addEventListener('click', switchToLocalMode);
hostBtn.addEventListener('click', createRoom);
joinBtn.addEventListener('click', joinRoom);
copyRoomBtn.addEventListener('click', copyRoomCode);
deleteRoomBtn.addEventListener('click', switchToLocalMode);
disconnectBtn.addEventListener('click', switchToLocalMode);

function returnToLobby() {
    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
        broadcast({ type: 'return-lobby' });
    }
    resetRuntimeState();
}

returnLobbyBtn.addEventListener('click', returnToLobby);

function scheduleStartIfReady() {
    if (startScheduled || currentState !== GameState.SELECTION) return;
    
    let actualTargetCount = (networkMode === NetworkMode.LOCAL) ? 2 : targetPlayerCount;
    let readyCount = 0;
    for (let i = 0; i < actualTargetCount; i++) {
        if (playerClasses[String.fromCharCode(65 + i)]) readyCount++;
    }
    if (readyCount < actualTargetCount) return;
    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST && !isGuestConnected()) return;

    startScheduled = true;
    setTimeout(() => {
        startScheduled = false;
        if (readyCount < actualTargetCount || currentState !== GameState.SELECTION) return;
        if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
            broadcast({ type: 'start', classes: playerClasses });
        }
        startGame();
    }, 500);
}

function handleSelectionInput(key) {
    if (currentState !== GameState.SELECTION) return;

    const classMap = { 
        '1': '火系', '2': '水系', '3': '土系', '4': '风系', '5': '电系', 'r': '光系', 't': '暗系',
        '6': '电系', '7': '风系', '8': '火系', '9': '水系', '0': '土系', 'o': '光系', 'p': '暗系' 
    };
    const allKeysMap = { ...classMap };

    if (networkMode === NetworkMode.LOCAL) {
        if (['1', '2', '3', '4', '5', 'r', 't'].includes(key)) {
            playerClasses.A = classMap[key];
            document.getElementById('p1-status').innerText = `当前选择：${playerClasses.A}`;
            soundManager.select();
        }
        if (['6', '7', '8', '9', '0', 'o', 'p'].includes(key)) {
            playerClasses.B = classMap[key];
            document.getElementById('p2-status').innerText = `当前选择：${playerClasses.B}`;
            soundManager.select();
        }
        scheduleStartIfReady();
        return;
    }

    if (networkRole === NetworkRole.HOST && ['1', '2', '3', '4', '5', 'r', 't'].includes(key)) {
        playerClasses.A = classMap[key];
        document.getElementById('p1-status').innerText = `当前选择：${playerClasses.A}`;
        broadcast({ type: 'host-selection', classes: playerClasses });
        soundManager.select();
        scheduleStartIfReady();
    }

    if (networkRole === NetworkRole.GUEST && allKeysMap[key]) {
        playerClasses[myPlayerId] = allKeysMap[key];
        const el = document.getElementById(`p${myPlayerId.charCodeAt(0)-64}-status`);
        if (el) el.innerText = `当前选择：${playerClasses[myPlayerId]}`;
        if (isGuestConnected()) {
            connections['HOST'].send({ type: 'guest-selection', guestId: myPlayerId, className: playerClasses[myPlayerId] });
        }
        soundManager.select();
    }
}

function isGuestBattleKey(key) {
    return true; // We send all keys to host
}

function handleNetworkMessage(message, guestId) {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'chat') {
        appendChatMessage(message.author, message.text);
        if (networkRole === NetworkRole.HOST) {
            broadcast(message);
        }
        return;
    }

    if (message.type === 'host-welcome' && networkRole === NetworkRole.GUEST) {
        myPlayerId = message.guestId;
        targetPlayerCount = message.targetPlayerCount;
        gameMode = message.gameMode || 'ffa';
        if (gameMode === '2v2') {
            gameModeSelect.value = '2v2';
            playerCountSelect.value = '4';
            playerCountSelect.disabled = true;
        } else {
            gameModeSelect.value = 'ffa';
            playerCountSelect.value = targetPlayerCount.toString();
        }
        updatePlayerCardsVisibility();
        setNetworkStatus(`已连接主机，你的身份是 玩家 ${myPlayerId}`, 'success');
        updateStartTip();
        return;
    }

    if (message.type === 'guest-selection' && networkRole === NetworkRole.HOST) {
        playerClasses[message.guestId] = message.className;
        const num = message.guestId.charCodeAt(0) - 64;
        const el = document.getElementById(`p${num}-status`);
        if(el) el.innerText = `当前选择：${message.className}`;
        broadcast({ type: 'host-selection', classes: playerClasses });
        scheduleStartIfReady();
        return;
    }

    if (message.type === 'host-selection' && networkRole === NetworkRole.GUEST) {
        playerClasses = message.classes;
        for (const [id, cls] of Object.entries(playerClasses)) {
            if (cls) {
                const el = document.getElementById(`p${id.charCodeAt(0)-64}-status`);
                if(el) el.innerText = `当前选择：${cls}`;
            }
        }
        return;
    }

    if (message.type === 'input' && networkRole === NetworkRole.HOST) {
        remoteKeys[`${message.guestId}_${message.key}`] = !!message.pressed;
        return;
    }

    if (message.type === 'start' && networkRole === NetworkRole.GUEST) {
        playerClasses = message.classes;
        startGame();
        return;
    }

    if (message.type === 'snapshot' && networkRole === NetworkRole.GUEST) {
        applySnapshot(message.state);
        if (message.events) {
            message.events.forEach(e => {
                if (e.type === 'explosion') {
                    createExplosion(e.x, e.y, e.color, e.count, e.speed, e.life, e.size, true, e.playSound);
                } else if (e.type === 'sound') {
                    if (soundManager[e.sound]) soundManager[e.sound]();
                }
            });
        }
        return;
    }

    if (message.type === 'end' && networkRole === NetworkRole.GUEST) {
        endGame(message.winner, false);
        return;
    }

    if (message.type === 'return-lobby' && networkRole === NetworkRole.GUEST) {
        resetRuntimeState();
        return;
    }
}

window.addEventListener('keydown', e => {
    soundManager.init();
    const alreadyPressed = !!keys[e.key];
    keys[e.key] = true;

    if (!alreadyPressed) {
        handleSelectionInput(e.key);
        if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.GUEST && currentState === GameState.BATTLE && isGuestBattleKey(e.key) && isGuestConnected()) {
            connections['HOST'].send({ type: 'input', guestId: myPlayerId, key: e.key, pressed: true });
        }
    }
});

window.addEventListener('keyup', e => {
    keys[e.key] = false;
    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.GUEST && currentState === GameState.BATTLE && isGuestBattleKey(e.key) && isGuestConnected()) {
        connections['HOST'].send({ type: 'input', guestId: myPlayerId, key: e.key, pressed: false });
    }
});

function shouldSimulateLocally() {
    return networkMode === NetworkMode.LOCAL || networkRole === NetworkRole.HOST;
}

function getInputState(playerId) {
    if (networkMode === NetworkMode.LOCAL) return keys;
    return playerId === 'A' ? keys : new Proxy(remoteKeys, { get: (t, prop) => t[`${playerId}_${prop}`] || false });
}

function isEnemy(p1, p2) {
    if (p1 === p2) return false;
    if (gameMode === '2v2' && p1.team !== 0 && p1.team === p2.team) return false;
    return true;
}

function getClosestEnemy(player) {
    let closest = null;
    let minDist = Infinity;
    for (let p of playersList) {
        if (!isEnemy(p, player) || (p.hp <= 0 && !p.isDowned)) continue;
        const d = Math.hypot(p.x - player.x, p.y - player.y);
        if (d < minDist) {
            minDist = d;
            closest = p;
        }
    }
    return closest || player;
}

class Player {
    constructor(config, className) {
        this.config = config;
        this.className = className;
        this.classData = SkillData[className];
        this.team = gameMode === '2v2' ? ((config.id === 'A' || config.id === 'C') ? 1 : 2) : 0;
        this.x = config.startX;
        this.y = config.startY;
        this.hp = 100;
        this.maxHp = 100;
        this.mp = 100;
        this.maxMp = 100;
        this.mpRegen = 5;
        this.baseSpeed = 250;
        this.radius = 20;
        this.cooldowns = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
        this.statuses = [];
        this.shieldAmount = 0;
        this.isDowned = false;
        this.downedHp = 0;
        this.maxDownedHp = 100;
        this.revivingTimer = 0;
    }

    get speed() {
        if (this.hasStatus('root') || this.hasStatus('paralyze')) return 0;
        let finalSpeed = this.baseSpeed;
        if (this.hasStatus('slow')) finalSpeed *= 0.6;
        if (this.hasStatus('haste')) finalSpeed *= 1.6;
        if (this.hasStatus('deathdescent')) finalSpeed *= 1.5;
        return finalSpeed;
    }

    hasStatus(type) {
        return this.statuses.some(s => s.type === type);
    }

    addStatus(type, duration, value = 0) {
        this.statuses.push({ type, duration, maxDuration: duration, value, tickTimer: 0 });
    }

    applyShock(sourceClass) {
        this.addStatus('shock', 5);
        const shockCount = this.statuses.filter(s => s.type === 'shock').length;
        if (shockCount >= 3) {
            // Remove all shocks
            this.statuses = this.statuses.filter(s => s.type !== 'shock');
            this.takeDamage(15, sourceClass); // Nerfed bonus true damage from 30 to 15
            createExplosion(this.x, this.y, '#f1c40f', 15, 60, 0.4, 3);
        }
    }

    takeDamage(amount, sourceClass = null, attacker = null) {
        soundManager.hit();
        if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
            networkEvents.push({ type: 'sound', sound: 'hit' });
        }
        let finalDamage = amount;

        if (sourceClass) {
            if ((sourceClass === '火系' && this.className === '风系') ||
                (sourceClass === '风系' && this.className === '土系') ||
                (sourceClass === '土系' && this.className === '水系') ||
                (sourceClass === '水系' && this.className === '火系') ||
                (sourceClass === '电系' && (this.className === '土系' || this.className === '火系')) ||
                (sourceClass === '水系' && this.className === '电系') ||
                (sourceClass === '光系' && this.className === '暗系') ||
                (sourceClass === '暗系' && this.className === '光系')) {
                finalDamage *= 1.2;
            }
        }

        if (this.hasStatus('deathdescent')) {
            finalDamage *= 0.5; // 50% damage reduction during death descent
        }

        if (this.shieldAmount > 0) {
            if (this.shieldAmount >= finalDamage) {
                this.shieldAmount -= finalDamage;
                finalDamage = 0;
            } else {
                finalDamage -= this.shieldAmount;
                this.shieldAmount = 0;
            }
        }

        if (finalDamage > 0) {
            if (attacker && attacker.config.id === myPlayerId) {
                currentSessionStats.damage += finalDamage;
            }

            const dmgText = `-${Math.round(finalDamage)}`;
            const dmgSize = finalDamage >= 30 ? 28 : 20;
            floatingTexts.push(new FloatingText(this.x, this.y, dmgText, '#e74c3c', dmgSize));
            if (finalDamage >= 30) screenShake = Math.max(screenShake, finalDamage >= 50 ? 15 : 8);
            
            if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                networkEvents.push({ type: 'floatingText', x: this.x, y: this.y, text: dmgText, color: '#e74c3c', size: dmgSize });
                if (finalDamage >= 30) {
                    networkEvents.push({ type: 'shake', amount: finalDamage >= 50 ? 15 : 8 });
                }
            }
        }

        if (this.isDowned) {
            this.downedHp -= finalDamage;
            if (this.downedHp <= 0) {
                this.isDowned = false;
                this.hp = 0;
                if (attacker) {
                    if (attacker.config.id === myPlayerId) currentSessionStats.kills++;
                    triggerKillFeed(attacker.config.id, this.config.id);
                    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                        networkEvents.push({ type: 'kill', killer: attacker.config.id, victim: this.config.id });
                    }
                }
            }
            this.updateUI();
            return;
        }

        const wasAlive = this.hp > 0;
        this.hp = Math.max(0, this.hp - finalDamage);

        if (wasAlive && this.hp === 0) {
            if (gameMode === '2v2') {
                this.isDowned = true;
                this.downedHp = this.maxDownedHp;
                this.statuses = []; // clear statuses
                floatingTexts.push(new FloatingText(this.x, this.y, '倒地!', '#e67e22', 25));
                if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                    networkEvents.push({ type: 'floatingText', x: this.x, y: this.y, text: '倒地!', color: '#e67e22', size: 25 });
                }
            } else {
                if (attacker) {
                    if (attacker.config.id === myPlayerId) currentSessionStats.kills++;
                    triggerKillFeed(attacker.config.id, this.config.id);
                    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                        networkEvents.push({ type: 'kill', killer: attacker.config.id, victim: this.config.id });
                    }
                }
            }
        }

        this.updateUI();
    }

    update(dt) {
        if (this.isDowned) {
            this.downedHp -= dt * 5; // bleed out
            if (this.downedHp <= 0) {
                this.hp = 0;
                this.isDowned = false; // completely dead
                triggerKillFeed('流血', this.config.id);
                if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                    networkEvents.push({ type: 'kill', killer: '流血', victim: this.config.id });
                }
            }

            // Check revive
            let beingRevived = false;
            for (const teammate of playersList) {
                if (teammate === this || teammate.hp <= 0 || teammate.isDowned || teammate.team !== this.team) continue;
                const dist = Math.hypot(this.x - teammate.x, this.y - teammate.y);
                if (dist < 80) {
                    beingRevived = true;
                    break;
                }
            }

            if (beingRevived) {
                this.revivingTimer += dt;
                if (this.revivingTimer >= 3.0) {
                    this.isDowned = false;
                    this.hp = this.maxHp * 0.3; // revive with 30% HP
                    this.revivingTimer = 0;
                    floatingTexts.push(new FloatingText(this.x, this.y, '已救援', '#2ecc71', 25));
                    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                        networkEvents.push({ type: 'floatingText', x: this.x, y: this.y, text: '已救援', color: '#2ecc71', size: 25 });
                    }
                }
            } else {
                this.revivingTimer = Math.max(0, this.revivingTimer - dt);
            }

            const input = getInputState(this.config.id);
            let dx = 0; let dy = 0;
            if (input.up) dy -= 1;
            if (input.down) dy += 1;
            if (input.left) dx -= 1;
            if (input.right) dx += 1;
            if (dx !== 0 || dy !== 0) {
                const len = Math.hypot(dx, dy);
                this.x += (dx / len) * 50 * dt; // Crawl speed
                this.y += (dy / len) * 50 * dt;
                this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
                this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
            }
            this.updateUI();
            return; // skip normal update
        }

        const enemy = getClosestEnemy(this);
        const shieldIndex = this.statuses.findIndex(s => s.type === 'shield');
        if (shieldIndex !== -1 && this.shieldAmount <= 0) {
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < 100) enemy.takeDamage(15, this.className, this);
            createExplosion(this.x, this.y, '#f1c40f', 20, 150, 0.6, 6);
            createExplosion(this.x, this.y, '#7f8c8d', 15, 120, 0.5, 4);
            entities.push(new AoE(this, this.x, this.y, 100, 0.1, '#f1c40f', 'shieldbreak', () => {}));
            this.statuses.splice(shieldIndex, 1);
        }

        for (let i = this.statuses.length - 1; i >= 0; i--) {
            const s = this.statuses[i];
            s.duration -= dt;

            if (s.type === 'burn') {
                if (Math.random() < 0.1) {
                    particles.push(new Particle(
                        this.x + (Math.random() - 0.5) * this.radius * 2,
                        this.y + (Math.random() - 0.5) * this.radius * 2,
                        0, -30, 0.5, '#e74c3c', 2
                    ));
                }
                s.tickTimer += dt;
                if (s.tickTimer >= 1) {
                    this.takeDamage(2, '火系');
                    s.tickTimer -= 1;
                }
            }

            if (s.type === 'magnetic_field') {
                if (Math.random() < 0.2) {
                    particles.push(new Particle(
                        this.x + (Math.random() - 0.5) * 150,
                        this.y + (Math.random() - 0.5) * 150,
                        0, -10, 0.3, '#f1c40f', 2
                    ));
                }
                s.tickTimer += dt;
                if (s.tickTimer >= 1.0) {
                    const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                    if (dist < 150) {
                        enemy.takeDamage(3, '电系', this);
                        enemy.addStatus('slow', 0.2);
                        enemy.applyShock('电系');
                        particles.push(new Particle(this.x, this.y, (enemy.x - this.x)*5, (enemy.y - this.y)*5, 0.2, '#f1c40f', 3));
                    }
                    s.tickTimer -= 1.0;
                }
            }

            if (s.type === 'deathdescent') {
                s.tickTimer += dt;
                if (s.tickTimer >= 0.5) {
                    // Deal low aura damage to nearby enemies every 0.5s
                    const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                    if (dist < 100) {
                        enemy.takeDamage(5, '暗系', this);
                        particles.push(new Particle(enemy.x, enemy.y, 0, -20, 0.4, '#8e44ad', 3));
                        
                        // Tentacle logic: enemy HP > 90 AND enemy HP > my HP
                        if (enemy.hp > 90 && enemy.hp > this.hp) {
                            if (!this.tentacleCooldown || this.tentacleCooldown <= 0) {
                                // Trigger tentacle
                                enemy.takeDamage(40, '暗系', this);
                                createExplosion(enemy.x, enemy.y, '#8e44ad', 20, 200, 0.8, 6);
                                floatingTexts.push(new FloatingText(enemy.x, enemy.y, '死神触手!', '#9b59b6', 25));
                                if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                                    networkEvents.push({ type: 'floatingText', x: enemy.x, y: enemy.y, text: '死神触手!', color: '#9b59b6', size: 25 });
                                }
                                this.tentacleCooldown = 3.0; // 3 second cooldown for tentacle
                            }
                        }
                    }
                    s.tickTimer -= 0.5;
                }
            }

            if (s.duration <= 0) {
                if (s.type === 'deathdescent') {
                    this.hp = Math.max(1, this.hp - 10); // Penalty when ending
                    this.updateUI();
                }
                if (s.type === 'shield') {
                    const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                    if (dist < 100) enemy.takeDamage(15, this.className, this);
                    createExplosion(this.x, this.y, '#f1c40f', 20, 150, 0.6, 6);
                    createExplosion(this.x, this.y, '#7f8c8d', 15, 120, 0.5, 4);
                    entities.push(new AoE(this, this.x, this.y, 100, 0.1, '#f1c40f', 'shieldbreak', () => {}));
                    this.shieldAmount = 0;
                }
                this.statuses.splice(i, 1);
            }
        }

        if (!this.hasStatus('root') && !this.hasStatus('knockup') && !this.hasStatus('paralyze')) {
            const input = getInputState(this.config.id);
            let dx = 0;
            let dy = 0;
            
            if (this.hasStatus('fear')) {
                // Move randomly if feared
                if (Math.random() < 0.1) {
                    this.fearDx = (Math.random() - 0.5) * 2;
                    this.fearDy = (Math.random() - 0.5) * 2;
                }
                dx = this.fearDx || (Math.random() - 0.5);
                dy = this.fearDy || (Math.random() - 0.5);
            } else {
                if (input[this.config.keys.up]) dy -= 1;
                if (input[this.config.keys.down]) dy += 1;
                if (input[this.config.keys.left]) dx -= 1;
                if (input[this.config.keys.right]) dx += 1;
            }
            
            if (dx !== 0 || dy !== 0) {
                const len = Math.hypot(dx, dy);
                dx /= len;
                dy /= len;
            }
            
            this.x += dx * this.speed * dt;
            this.y += dy * this.speed * dt;
            this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
            this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
        }

        this.mp = Math.min(this.maxMp, this.mp + this.mpRegen * dt);
        if (this.tentacleCooldown > 0) this.tentacleCooldown -= dt;
        for (let i = 0; i < 5; i++) {
            if (this.cooldowns[i] > 0) this.cooldowns[i] -= dt;
        }
        this.updateSkillUI();

        const input = getInputState(this.config.id);
        if (!this.hasStatus('knockup') && !this.hasStatus('paralyze')) {
            for (let i = 0; i < 5; i++) {
                const skillKey = this.config.keys[`skill${i + 1}`];
                if (skillKey && input[skillKey] && this.cooldowns[i] <= 0 && this.classData.skills[i]) {
                    const cost = this.classData.skills[i].cost;
                    if (this.mp >= cost) {
                        this.mp -= cost;
                        this.castSkill(i);
                    }
                }
            }
        }
    }

    castSkill(slot) {
        const enemy = getClosestEnemy(this);
        const skill = this.classData.skills[slot];
        this.cooldowns[slot] = skill.cd;

        let dirX = enemy.x - this.x;
        let dirY = enemy.y - this.y;
        const dist = Math.hypot(dirX, dirY);
        if (dist > 0) {
            dirX /= dist;
            dirY /= dist;
        }

        if (['fireball', 'frostray', 'waterjet', 'stonevolley', 'windblade'].includes(skill.id)) {
            soundManager.shoot();
            if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) networkEvents.push({ type: 'sound', sound: 'shoot' });
        } else if (['fireblast', 'meteor', 'waterprison', 'blizzard', 'earthquake', 'hurricane', 'frostarmor', 'earthshield'].includes(skill.id)) {
            soundManager.cast();
            if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) networkEvents.push({ type: 'sound', sound: 'cast' });
        } else if (['flamedash', 'tailwind', 'earthspike'].includes(skill.id)) {
            soundManager.dash();
            if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) networkEvents.push({ type: 'sound', sound: 'dash' });
        } else if (['firewall', 'windwall', 'mudswamp', 'whirlwind'].includes(skill.id)) {
            soundManager.wall();
            if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) networkEvents.push({ type: 'sound', sound: 'wall' });
        } else {
            soundManager.shoot();
            if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) networkEvents.push({ type: 'sound', sound: 'shoot' });
        }

        switch (skill.id) {
            case 'fireball':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 500, 15, '#e74c3c', 'fireball', target => {
                    target.takeDamage(20, this.className, this);
                    target.addStatus('burn', 3);
                }));
                break;
            case 'fireblast':
                entities.push(new AoE(this, this.x, this.y, 100, 0.5, '#e67e22', 'fireblast', target => {
                    target.takeDamage(40, this.className, this);
                    const kx = target.x - this.x;
                    const ky = target.y - this.y;
                    const kLen = Math.hypot(kx, ky);
                    if (kLen > 0) {
                        target.x += (kx / kLen) * 50;
                        target.y += (ky / kLen) * 50;
                    }
                }));
                break;
            case 'flamedash': {
                const dashDist = 150;
                const dashSteps = 5;
                for (let i = 1; i <= dashSteps; i++) {
                    const px = this.x + dirX * (dashDist / dashSteps) * i;
                    const py = this.y + dirY * (dashDist / dashSteps) * i;
                    entities.push(new AoE(this, px, py, 30, 0.2, '#e74c3c', 'flamedash', target => {
                        target.takeDamage(15, this.className, this);
                        target.addStatus('burn', 2);
                    }));
                }
                this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x + dirX * dashDist));
                this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y + dirY * dashDist));
                createExplosion(this.x, this.y, '#f39c12', 20, 80, 0.4, 4);
                break;
            }
            case 'firewall': {
                const wallX = this.x + dirX * 50;
                const wallY = this.y + dirY * 50;
                entities.push(new Wall(this, wallX, wallY, dirX, dirY, 100, 4, '#e67e22', true));
                break;
            }
            case 'meteor':
                entities.push(new AoE(this, enemy.x, enemy.y, 120, 1.5, '#c0392b', 'meteor', target => {
                    target.takeDamage(60, this.className, this);
                    target.addStatus('burn', 5);
                }));
                break;
            case 'frostray':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 800, 10, '#00a8ff', 'frostray', target => {
                    target.takeDamage(15, this.className, this);
                    target.addStatus('slow', 2);
                }));
                break;
            case 'waterprison':
                entities.push(new AoE(this, enemy.x, enemy.y, 40, 0.5, '#3498db', 'waterprison', target => {
                    target.takeDamage(10, this.className, this);
                    target.addStatus('root', 1.5);
                }));
                break;
            case 'waterjet':
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 600, 12, '#2980b9', 'waterjet', target => {
                            target.takeDamage(10, this.className, this);
                            target.x += dirX * 10;
                            target.y += dirY * 10;
                        }));
                    }, i * 200);
                }
                break;
            case 'frostarmor':
                this.addStatus('shield', 6);
                this.shieldAmount = 30;
                this.addStatus('frostarmor', 6);
                createExplosion(this.x, this.y, '#3498db', 20, 50, 0.5, 4);
                break;
            case 'blizzard':
                entities.push(new AoE(this, enemy.x, enemy.y, 150, 2.0, '#bdc3c7', 'blizzard', target => {
                    target.takeDamage(45, this.className, this);
                    target.addStatus('slow', 4);
                }));
                break;
            case 'stonevolley':
                for (let i = -1; i <= 1; i++) {
                    const angle = Math.atan2(dirY, dirX) + i * 0.2;
                    entities.push(new Projectile(this, this.x, this.y, Math.cos(angle), Math.sin(angle), 400, 8, '#7f8c8d', 'stone', target => {
                        target.takeDamage(10, this.className, this);
                        target.addStatus('slow', 0.2);
                    }));
                }
                break;
            case 'earthshield':
                this.shieldAmount = 50;
                this.addStatus('shield', 5);
                createExplosion(this.x, this.y, '#f1c40f', 15, 50, 0.5, 4);
                createExplosion(this.x, this.y, '#95a5a6', 10, 80, 0.6, 5);
                break;
            case 'earthspike':
                for (let i = 1; i <= 4; i++) {
                    setTimeout(() => {
                        const px = this.x + dirX * 60 * i;
                        const py = this.y + dirY * 60 * i;
                        entities.push(new AoE(this, px, py, 25, 0.3, '#f39c12', 'earthspike', target => {
                            target.takeDamage(15, this.className, this);
                            target.addStatus('knockup', 0.5);
                        }));
                    }, i * 150);
                }
                break;
            case 'mudswamp':
                entities.push(new AoE(this, enemy.x, enemy.y, 80, 0.5, '#7f8c8d', 'mudswamp', target => {
                    target.takeDamage(10, this.className, this);
                    target.addStatus('slow', 5);
                    target.mp = Math.max(0, target.mp - 20);
                }));
                break;
            case 'earthquake':
                entities.push(new AoE(this, this.x, this.y, 250, 1.5, '#8e44ad', 'earthquake', target => {
                    target.takeDamage(45, this.className, this);
                    target.addStatus('root', 2);
                }));
                break;
            case 'windblade':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 1200, 10, '#1abc9c', 'windblade', target => {
                    target.takeDamage(8, this.className, this);
                }));
                break;
            case 'whirlwind':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 150, 40, '#16a085', 'whirlwind', target => {
                    target.takeDamage(25, this.className, this);
                    target.x += dirX * 30;
                    target.y += dirY * 30;
                }, true));
                break;
            case 'windwall': {
                const wallX = this.x + dirX * 50;
                const wallY = this.y + dirY * 50;
                entities.push(new Wall(this, wallX, wallY, dirX, dirY, 80, 4, '#1abc9c', false));
                break;
            }
            case 'hurricane':
                entities.push(new AoE(this, enemy.x, enemy.y, 90, 0.6, '#1abc9c', 'hurricane', target => {
                    target.takeDamage(45, this.className, this);
                    target.addStatus('knockup', 1.5);
                }));
                break;
            case 'tailwind':
                this.addStatus('haste', 5);
                createExplosion(this.x, this.y, '#1abc9c', 20, 100, 0.5, 3);
                break;
            case 'spark':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 1500, 6, '#f1c40f', 'spark', target => {
                    target.takeDamage(5, this.className, this);
                    target.applyShock(this.className);
                }));
                break;
            case 'balllightning':
                // Slow moving projectile that constantly zaps nearby enemies
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 150, 25, '#f1c40f', 'balllightning', target => {
                    target.takeDamage(10, this.className, this); // Slightly nerfed direct hit damage
                    target.addStatus('paralyze', 0.2); // Restore a bit of paralyze
                    target.applyShock(this.className);
                }));
                break;
            case 'magneticfield':
                this.addStatus('magnetic_field', 5);
                createExplosion(this.x, this.y, '#f1c40f', 15, 80, 0.4, 3);
                break;
            case 'thunderstrike':
                // Small AoE at mouse/enemy location with delay
                entities.push(new AoE(this, enemy.x, enemy.y, 40, 0.3, '#9b59b6', 'thunderstrike', target => {
                    target.takeDamage(35, this.className, this);
                    target.addStatus('paralyze', 0.5);
                    target.applyShock(this.className);
                }));
                break;
            case 'railgun': {
                // Hitscan: damage anything in a line after a 1 second charge
                this.addStatus('root', 1); // Self root during cast
                
                // Initial direction
                let currentAngle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
                let targetX = this.x + Math.cos(currentAngle) * 1000;
                let targetY = this.y + Math.sin(currentAngle) * 1000;
                
                // We use AoE class but with a special 'railgun' type to handle line intersection
                entities.push(new AoE(this, targetX, targetY, 1, 1.0, '#f1c40f', 'railgun', target => {
                    target.takeDamage(60, this.className, this);
                    target.addStatus('paralyze', 0.5);
                    target.applyShock(this.className);
                    createExplosion(target.x, target.y, '#f1c40f', 30, 150, 0.6, 5);
                }));
                break;
            }
            case 'lightbolt':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 800, 12, '#f39c12', 'lightbolt', target => {
                    if (isEnemy(target, this)) {
                        target.takeDamage(12, this.className, this);
                    } else if (target !== this && target.hp > 0 && !target.isDowned) {
                        target.hp = Math.min(target.maxHp, target.hp + 8);
                        target.updateUI();
                        floatingTexts.push(new FloatingText(target.x, target.y, '+8', '#2ecc71', 20));
                        if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                            networkEvents.push({ type: 'floatingText', x: target.x, y: target.y, text: '+8', color: '#2ecc71', size: 20 });
                        }
                    }
                }));
                break;
            case 'healingaura':
                entities.push(new AoE(this, this.x, this.y, 120, 3.0, '#f39c12', 'healingaura', target => {
                    if (!isEnemy(target, this) && target.hp > 0 && !target.isDowned) {
                        target.hp = Math.min(target.maxHp, target.hp + 20);
                        target.updateUI();
                        floatingTexts.push(new FloatingText(target.x, target.y, '+20', '#2ecc71', 20));
                        if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                            networkEvents.push({ type: 'floatingText', x: target.x, y: target.y, text: '+20', color: '#2ecc71', size: 20 });
                        }
                    }
                }));
                break;
            case 'holyshield':
                this.shieldAmount += 50;
                createExplosion(this.x, this.y, '#f39c12', 20, 100, 0.5, 3);
                break;
            case 'lightbind':
                entities.push(new AoE(this, enemy.x, enemy.y, 80, 0.6, '#f39c12', 'lightbind', target => {
                    if (isEnemy(target, this)) {
                        target.takeDamage(20, this.className, this);
                        target.addStatus('root', 2.5);
                    }
                }));
                break;
            case 'judgment':
                entities.push(new AoE(this, enemy.x, enemy.y, 60, 0.8, '#f39c12', 'judgment', target => {
                    target.takeDamage(55, this.className, this);
                }));
                break;
            case 'shadowball':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 300, 20, '#8e44ad', 'shadowball', target => {
                    target.takeDamage(20, this.className, this);
                    this.hp = Math.min(this.maxHp, this.hp + 10);
                    this.updateUI();
                    floatingTexts.push(new FloatingText(this.x, this.y, '+10', '#2ecc71', 20));
                    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                        networkEvents.push({ type: 'floatingText', x: this.x, y: this.y, text: '+10', color: '#2ecc71', size: 20 });
                    }
                }));
                break;
            case 'vampirictouch':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 900, 15, '#8e44ad', 'vampirictouch', target => {
                    target.takeDamage(35, this.className, this);
                    target.addStatus('slow', 3);
                    this.hp = Math.min(this.maxHp, this.hp + 20);
                    this.updateUI();
                    floatingTexts.push(new FloatingText(this.x, this.y, '+20', '#2ecc71', 20));
                    if (networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
                        networkEvents.push({ type: 'floatingText', x: this.x, y: this.y, text: '+20', color: '#2ecc71', size: 20 });
                    }
                }));
                break;
            case 'fearscream':
                entities.push(new AoE(this, this.x, this.y, 150, 0.5, '#8e44ad', 'fearscream', target => {
                    target.takeDamage(20, this.className, this);
                    target.addStatus('fear', 2);
                }));
                break;
            case 'abyssswamp':
                entities.push(new AoE(this, enemy.x, enemy.y, 100, 1.0, '#8e44ad', 'abyssswamp', target => {
                    target.takeDamage(30, this.className, this);
                    target.addStatus('slow', 4);
                }));
                break;
            case 'deathdescent':
                this.addStatus('deathdescent', 8);
                createExplosion(this.x, this.y, '#8e44ad', 30, 150, 1.0, 4);
                break;
        }
    }

    draw(ctx) {
        drawPlayerShape(ctx, this);
    }

    initUI() {
        const containerId = `p${this.config.id.charCodeAt(0)-64}-skills`;
        const skillsContainer = document.getElementById(containerId);
        skillsContainer.innerHTML = '';
        this.classData.skills.forEach((skill, index) => {
            skillsContainer.innerHTML += `
                <div class="skill-icon" id="p${this.config.id}-skill${index}" style="border-color: ${this.classData.color}">
                    <span>${skill.name}</span>
                    <div class="cooldown-overlay" id="p${this.config.id}-cd${index}"></div>
                </div>
            `;
        });
        this.updateUI();
    }

    updateUI() {
        const num = this.config.id.charCodeAt(0) - 64;
        const hpBar = document.getElementById(`p${num}-hp`);
        const mpBar = document.getElementById(`p${num}-mp`);
        if(!hpBar || !mpBar) return;
        
        let hpPct = `${(this.hp / this.maxHp) * 100}%`;
        if (this.isDowned) {
            hpPct = `${(this.downedHp / this.maxDownedHp) * 100}%`;
            hpBar.style.backgroundColor = '#e67e22'; // Orange/bleed color
        } else {
            hpBar.style.backgroundColor = '#e74c3c'; // Normal red
        }
        
        const mpPct = `${(this.mp / this.maxMp) * 100}%`;
        
        if (hpBar.style.width !== hpPct) hpBar.style.width = hpPct;
        if (mpBar.style.width !== mpPct) mpBar.style.width = mpPct;
    }

    updateSkillUI() {
        for (let i = 0; i < 5; i++) {
            if (!this.classData.skills[i]) continue;
            const cdOverlay = document.getElementById(`p${this.config.id}-cd${i}`);
            const skillIcon = document.getElementById(`p${this.config.id}-skill${i}`);
            if (cdOverlay) {
                const maxCd = this.classData.skills[i].cd;
                const currentCd = Math.max(0, this.cooldowns[i]);
                const pct = currentCd > 0 ? (currentCd / maxCd) * 100 : 0;
                const heightStr = `${pct}%`;
                if (cdOverlay.style.height !== heightStr) {
                    cdOverlay.style.height = heightStr;
                }
            }
            if (skillIcon) {
                const targetOpacity = this.mp < this.classData.skills[i].cost ? '0.5' : '1';
                if (skillIcon.style.opacity !== targetOpacity) {
                    skillIcon.style.opacity = targetOpacity;
                }
            }
        }
        this.updateUI();
    }
}

class Particle {
    constructor(x, y, vx, vy, life, color, size, fade = true) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size;
        this.fade = fade;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        if (this.fade) {
            ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        }
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createExplosion(x, y, color, count, speed, life, size, fromNetwork = false, playSound = true) {
    if (playSound) soundManager.explosion();
    if (!fromNetwork && networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
        networkEvents.push({ type: 'explosion', x, y, color, count, speed, life, size, playSound });
    }
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const s = speed * (0.5 + Math.random() * 0.5);
        particles.push(new Particle(
            x,
            y,
            Math.cos(angle) * s,
            Math.sin(angle) * s,
            life * (0.5 + Math.random() * 0.5),
            color,
            size * (0.5 + Math.random() * 0.5)
        ));
    }
}

class Projectile {
    constructor(owner, x, y, dirX, dirY, speed, radius, color, type, onHit, pierce = false) {
        this.owner = owner;
        this.x = x;
        this.y = y;
        this.dirX = dirX;
        this.dirY = dirY;
        this.speed = speed;
        this.radius = radius;
        this.color = color;
        this.type = type;
        this.onHit = onHit;
        this.active = true;
        this.pierce = pierce;
        this.hitTargets = new Set();
    }

    update(dt) {
        if (!this.active) return;
        this.x += this.dirX * this.speed * dt;
        this.y += this.dirY * this.speed * dt;

        for (const entity of entities) {
            if (entity instanceof Wall && isEnemy(entity.owner, this.owner)) {
                const dist = Math.hypot(this.x - entity.x, this.y - entity.y);
                if (dist < entity.length / 2 + this.radius) {
                    this.active = false;
                    createExplosion(this.x, this.y, this.color, 5, 50, 0.3, 3);
                    return;
                }
            }
        }

        if (Math.random() < 0.5) {
            if (this.type === 'fireball') {
                particles.push(new Particle(this.x, this.y, -this.dirX * 50, -this.dirY * 50, 0.4, '#f39c12', this.radius * 0.4));
            } else if (this.type === 'frostray' || this.type === 'waterjet') {
                particles.push(new Particle(this.x, this.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.3, '#ecf0f1', this.radius * 0.25));
            } else if (this.type === 'stone') {
                particles.push(new Particle(this.x, this.y, -this.dirX * 20, -this.dirY * 20, 0.25, '#95a5a6', this.radius * 0.3));
            } else if (this.type === 'windblade' || this.type === 'whirlwind') {
                particles.push(new Particle(this.x, this.y, -this.dirY * 20, this.dirX * 20, 0.25, '#ecf0f1', this.radius * 0.18));
            } else if (this.type === 'spark') {
                particles.push(new Particle(this.x, this.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.2, '#f1c40f', 2));
            } else if (this.type === 'balllightning') {
                particles.push(new Particle(this.x + (Math.random() - 0.5) * 40, this.y + (Math.random() - 0.5) * 40, 0, 0, 0.3, '#f1c40f', 3));
            }
        }
        
        if (this.type === 'balllightning') {
            const enemy = getClosestEnemy(this.owner);
            const distToEnemy = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (isEnemy(enemy, this.owner) && distToEnemy < 100 && Math.random() < dt * 1.5) { // ~1.5 zaps per second (balanced frequency)
                enemy.takeDamage(2, '电系', this.owner); // Slightly reduced zap damage
                enemy.addStatus('paralyze', 0.1); // Restore some paralyze
                enemy.applyShock('电系');
                // visual arc
                for(let i=0; i<3; i++) {
                    particles.push(new Particle(
                        this.x + (enemy.x - this.x) * (i/3),
                        this.y + (enemy.y - this.y) * (i/3),
                        0, 0, 0.1, '#f1c40f', 2
                    ));
                }
            }
        }

        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
            return;
        }

        for (const enemy of playersList) {
            if (!isEnemy(enemy, this.owner) || (enemy.hp <= 0 && !enemy.isDowned)) continue;
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < this.radius + enemy.radius && !this.hitTargets.has(enemy.config.id)) {
            this.onHit(enemy);
            if (this.pierce || this.type === 'balllightning') {
                this.hitTargets.add(enemy.config.id);
            } else {
                this.active = false;
            }

            if (this.type === 'fireball') {
                createExplosion(this.x, this.y, '#e74c3c', 15, 100, 0.5, 5);
            } else if (this.type === 'frostray' || this.type === 'waterjet') {
                createExplosion(this.x, this.y, '#3498db', 10, 80, 0.4, 4);
            } else if (this.type === 'stone') {
                createExplosion(this.x, this.y, '#7f8c8d', 8, 60, 0.3, 6);
            } else if (this.type === 'windblade') {
                createExplosion(this.x, this.y, '#1abc9c', 8, 120, 0.3, 3);
            } else if (this.type === 'whirlwind') {
                createExplosion(this.x, this.y, '#16a085', 12, 80, 0.4, 4);
            } else if (this.type === 'spark') {
                createExplosion(this.x, this.y, '#f1c40f', 5, 80, 0.2, 2);
            } else if (this.type === 'balllightning') {
                createExplosion(this.x, this.y, '#f1c40f', 20, 150, 0.5, 4);
            }
        }
        }
    }

    draw(ctx) {
        drawProjectileShape(ctx, this);
    }
}

class Wall {
    constructor(owner, x, y, dirX, dirY, length, duration, color, damaging = false) {
        this.owner = owner;
        this.x = x;
        this.y = y;
        this.dx = -dirY;
        this.dy = dirX;
        this.length = length;
        this.duration = duration;
        this.color = color;
        this.active = true;
        this.damaging = damaging;
        this.damageTickTimer = 0;
        this.burnTickTimer = 0;
    }

    update(dt) {
        if (!this.active) return;
        this.duration -= dt;
        if (this.duration <= 0) {
            this.active = false;
            return;
        }

        if (Math.random() < 0.25) {
            const offset = (Math.random() - 0.5) * this.length;
            particles.push(new Particle(
                this.x + this.dx * offset,
                this.y + this.dy * offset,
                this.dy * 20,
                -this.dx * 20,
                0.5,
                this.damaging ? '#f39c12' : '#ecf0f1',
                2
            ));
        }

        if (this.damaging) {
            for (const enemy of playersList) {
            if (!isEnemy(enemy, this.owner) || (enemy.hp <= 0 && !enemy.isDowned)) continue;
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < this.length / 2 + enemy.radius) {
                this.damageTickTimer += dt;
                this.burnTickTimer += dt;

                // 火墙改为固定频率结算，避免按帧伤害过高。
                if (this.damageTickTimer >= 0.25) {
                    enemy.takeDamage(4, this.owner.className, this.owner);
                    this.damageTickTimer = 0;
                }

                if (this.burnTickTimer >= 0.75) {
                    enemy.addStatus('burn', 1.5);
                    this.burnTickTimer = 0;
                }
            } else {
                this.damageTickTimer = 0;
                this.burnTickTimer = 0;
            }
        }
        }
    }

    draw(ctx) {
        drawWallShape(ctx, this);
    }
}

class AoE {
    constructor(owner, x, y, radius, delay, color, type, onHit) {
        this.owner = owner;
        this.x = x;
        this.y = y;
        this.targetX = x; // useful for directional AoEs
        this.targetY = y;
        this.radius = radius;
        this.delay = delay;
        this.timer = 0;
        this.color = color;
        this.type = type;
        this.onHit = onHit;
        this.active = true;
    }

    update(dt) {
        if (!this.active) return;
        this.timer += dt;

        if (this.type === 'railgun') {
            const enemy = getClosestEnemy(this.owner);
            // Calculate angle to current target position
            let currentAngle = Math.atan2(this.y - this.owner.y, this.x - this.owner.x);
            // Calculate angle to enemy
            let targetAngle = Math.atan2(enemy.y - this.owner.y, enemy.x - this.owner.x);
            
            // Normalize angles
            let diff = targetAngle - currentAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            
            // Turn speed: ~12.5 degrees per second (balanced tracking)
            const turnSpeed = 0.22 * dt;
            
            if (Math.abs(diff) <= turnSpeed) {
                currentAngle = targetAngle;
            } else {
                currentAngle += Math.sign(diff) * turnSpeed;
            }
            
            // Update x,y to point in the new direction
            this.x = this.owner.x + Math.cos(currentAngle) * 1000;
            this.y = this.owner.y + Math.sin(currentAngle) * 1000;
        }

        if (this.type === 'fireblast' && Math.random() < 0.2) {
            particles.push(new Particle(this.x + (Math.random() - 0.5) * this.radius, this.y + (Math.random() - 0.5) * this.radius, 0, -20, 0.5, '#e67e22', 2));
        } else if (this.type === 'waterprison' && Math.random() < 0.2) {
            particles.push(new Particle(this.x + (Math.random() - 0.5) * this.radius, this.y + (Math.random() - 0.5) * this.radius, 0, -30, 0.6, '#ecf0f1', 3));
        } else if (this.type === 'hurricane') {
            particles.push(new Particle(this.x + (Math.random() - 0.5) * this.radius, this.y + (Math.random() - 0.5) * this.radius, (Math.random() - 0.5) * 40, -40, 0.4, '#1abc9c', 2));
        } else if (this.type === 'railgun') {
            // Charging effect at player position and along the line
            particles.push(new Particle(this.owner.x + (Math.random() - 0.5) * 40, this.owner.y + (Math.random() - 0.5) * 40, 0, 0, 0.3, '#f1c40f', 2));
            
            // Draw line
            let rx = this.x - this.owner.x;
            let ry = this.y - this.owner.y;
            const rDist = Math.hypot(rx, ry);
            if (rDist > 0) { rx /= rDist; ry /= rDist; }
            
            if (Math.random() < 0.3) {
                const dist = Math.random() * 800;
                particles.push(new Particle(this.owner.x + rx * dist, this.owner.y + ry * dist, (Math.random() - 0.5)*10, (Math.random() - 0.5)*10, 0.2, '#f1c40f', 2));
            }
        }

        if (this.timer >= this.delay) {
            const enemy = getClosestEnemy(this.owner);
            if (this.type === 'railgun') {
                let rx = this.x - this.owner.x;
                let ry = this.y - this.owner.y;
                const rDist = Math.hypot(rx, ry);
                if (rDist > 0) { rx /= rDist; ry /= rDist; } else { rx = 1; ry = 0; }
                for (const e of playersList) {
                    if (!isEnemy(e, this.owner) || (e.hp <= 0 && !e.isDowned)) continue;
                    const crossProduct = Math.abs(rx * (e.y - this.owner.y) - ry * (e.x - this.owner.x));
                    const isHitting = crossProduct <= e.radius + 15;
                    const dotProduct = (e.x - this.owner.x) * rx + (e.y - this.owner.y) * ry;
                    if (isHitting && dotProduct > 0) {
                        this.onHit(e);
                    }
                }
            } else {
                for (const e of playersList) {
                    if (!isEnemy(e, this.owner) || (e.hp <= 0 && !e.isDowned)) continue;
                    const dist = Math.hypot(this.x - e.x, this.y - e.y);
                    if (dist < this.radius + e.radius) {
                        this.onHit(e);
                    }
                }
            }
            this.active = false;
            triggerAoEExplosion(this);
        }
    }

    draw(ctx) {
        drawAoEShape(ctx, this);
    }
}

function triggerAoEExplosion(aoe) {
    if (aoe.type === 'fireblast') {
        createExplosion(aoe.x, aoe.y, '#e74c3c', 30, 150, 0.8, 8);
        createExplosion(aoe.x, aoe.y, '#f1c40f', 20, 100, 0.6, 5);
    } else if (aoe.type === 'waterprison') {
        createExplosion(aoe.x, aoe.y, '#3498db', 20, 80, 0.5, 4);
    } else if (aoe.type === 'hurricane') {
        createExplosion(aoe.x, aoe.y, '#1abc9c', 40, 200, 0.8, 6);
        createExplosion(aoe.x, aoe.y, '#ecf0f1', 20, 150, 0.6, 4);
    } else if (aoe.type === 'meteor') {
        createExplosion(aoe.x, aoe.y, '#c0392b', 50, 250, 1.0, 10);
        createExplosion(aoe.x, aoe.y, '#e67e22', 30, 150, 0.8, 6);
    } else if (aoe.type === 'blizzard') {
        createExplosion(aoe.x, aoe.y, '#ecf0f1', 40, 120, 0.6, 5);
    } else if (aoe.type === 'earthspike') {
        createExplosion(aoe.x, aoe.y, '#f39c12', 10, 80, 0.4, 4);
    } else if (aoe.type === 'mudswamp') {
        createExplosion(aoe.x, aoe.y, '#7f8c8d', 20, 60, 0.8, 6);
    } else if (aoe.type === 'earthquake') {
        createExplosion(aoe.x, aoe.y, '#8e44ad', 40, 300, 1.0, 8);
        createExplosion(aoe.x, aoe.y, '#9b59b6', 20, 200, 0.8, 5);
    } else if (aoe.type === 'thunderstrike') {
        createExplosion(aoe.x, aoe.y, '#9b59b6', 25, 120, 0.5, 5);
        createExplosion(aoe.x, aoe.y, '#f1c40f', 15, 80, 0.4, 3);
    } else if (aoe.type === 'railgun') {
        let rx = aoe.x - aoe.owner.x;
        let ry = aoe.y - aoe.owner.y;
        const rDist = Math.hypot(rx, ry);
        if (rDist > 0) { rx /= rDist; ry /= rDist; }
        soundManager.explosion();
        for (let i = 0; i < 20; i++) {
            const dist = Math.random() * 1000;
            createExplosion(aoe.owner.x + rx * dist, aoe.owner.y + ry * dist, '#f1c40f', 5, 50, 0.3, 3, false, false);
        }
    }
}

function drawPlayerShape(ctx, player) {
    const hasBurn = player.hasStatus ? player.hasStatus('burn') : player.statuses.some(s => s.type === 'burn');
    const hasSlow = player.hasStatus ? player.hasStatus('slow') : player.statuses.some(s => s.type === 'slow');
    const hasHaste = player.hasStatus ? player.hasStatus('haste') : player.statuses.some(s => s.type === 'haste');
    const hasControl = player.hasStatus
        ? player.hasStatus('root') || player.hasStatus('knockup') || player.hasStatus('paralyze')
        : player.statuses.some(s => s.type === 'root' || s.type === 'knockup' || s.type === 'paralyze');

    const hasMagneticField = player.hasStatus 
        ? player.hasStatus('magnetic_field') 
        : player.statuses.some(s => s.type === 'magnetic_field');

    if (hasMagneticField) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.beginPath();
        ctx.arc(0, 0, 150, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(241, 196, 15, 0.05)';
        ctx.fill();
        
        ctx.rotate(performance.now() / 200);
        ctx.setLineDash([10, 20]);
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.5)';
        ctx.stroke();
        ctx.restore();
    }
    
    if (player.shieldAmount > 0) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.4)';
        ctx.lineWidth = 4;
        ctx.stroke();
        const time = performance.now() / 1000;
        ctx.rotate(time * 2);
        for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.rotate((Math.PI * 2 / 3) * i);
            ctx.translate(player.radius + 15, 0);
            ctx.fillStyle = '#95a5a6';
            ctx.beginPath();
            ctx.moveTo(5, 0);
            ctx.lineTo(2, 6);
            ctx.lineTo(-5, 3);
            ctx.lineTo(-4, -4);
            ctx.lineTo(2, -5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    const hasDeathDescent = player.hasStatus ? player.hasStatus('deathdescent') : player.statuses.some(s => s.type === 'deathdescent');
    if (hasDeathDescent) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(142, 68, 173, 0.4)';
        ctx.fill();
        ctx.restore();
    }

    let drawY = player.y;
    const knockupStatus = player.statuses.find(s => s.type === 'knockup');
    if (knockupStatus) {
        const t = knockupStatus.maxDuration - knockupStatus.duration;
        const total = knockupStatus.maxDuration || 1;
        const offsetY = 4 * 50 * (t / total) * (1 - t / total);
        drawY -= offsetY;
    }

    // 根据法系决定玩家颜色
    let playerColor = player.config.color; // 默认老版本颜色
    const classCounts = {};
    playersList.forEach(p => {
        classCounts[p.className] = (classCounts[p.className] || 0) + 1;
    });
    if (classCounts[player.className] === 1) {
        if (player.className === '火系') playerColor = '#e74c3c'; // 红色
        else if (player.className === '水系') playerColor = '#3498db'; // 蓝色
        else if (player.className === '土系') playerColor = '#8b4513'; // 棕色
        else if (player.className === '风系') playerColor = '#2ecc71'; // 绿色
        else if (player.className === '电系') playerColor = '#f1c40f'; // 黄色
        else if (player.className === '光系') playerColor = '#f39c12'; // 亮金色
        else if (player.className === '暗系') playerColor = '#8e44ad'; // 深紫色
    }

    ctx.fillStyle = playerColor;
    ctx.beginPath();
    if (player.isDowned) {
        ctx.ellipse(player.x, drawY + player.radius / 2, player.radius, player.radius / 2, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 0.5; // Draw slightly transparent
        ctx.fill();
        ctx.globalAlpha = 1.0;
    } else {
        ctx.arc(player.x, drawY, player.radius, 0, Math.PI * 2);
        ctx.fill();
        
        if (player.className === '光系') {
            // Light faction glow effect
            ctx.save();
            ctx.translate(player.x, drawY);
            ctx.beginPath();
            ctx.arc(0, 0, player.radius + 5, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.8)'; // Yellowish glow
            ctx.stroke();
            
            // Add a cross inside
            ctx.beginPath();
            ctx.moveTo(0, -player.radius + 2);
            ctx.lineTo(0, player.radius - 2);
            ctx.moveTo(-player.radius + 2, 0);
            ctx.lineTo(player.radius - 2, 0);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.stroke();
            ctx.restore();
        } else if (player.className === '暗系') {
            // Dark faction shadow aura
            ctx.save();
            ctx.translate(player.x, drawY);
            
            // Outer shadow ring
            ctx.beginPath();
            ctx.arc(0, 0, player.radius + 8, 0, Math.PI * 2);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(142, 68, 173, 0.6)'; // Purple aura
            ctx.setLineDash([5, 5]);
            ctx.rotate(performance.now() / 1000);
            ctx.stroke();
            
            // Inner dark core
            ctx.beginPath();
            ctx.arc(0, 0, player.radius - 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fill();
            
            ctx.restore();
        }
    }

    const hasBlind = player.hasStatus ? player.hasStatus('blind') : player.statuses.some(s => s.type === 'blind');
    if (hasBlind && player.config.id === myPlayerId) {
        // Blind effect for local player
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to cover whole canvas
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    if (hasBurn) {
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(player.x - 5, drawY - player.radius - 10, 10, 10);
    }
    if (hasSlow) {
        ctx.fillStyle = '#3498db';
        ctx.fillRect(player.x - 15, drawY - player.radius - 10, 10, 10);
    }
    if (hasHaste) {
        ctx.fillStyle = '#1abc9c';
        ctx.fillRect(player.x + 5, drawY - player.radius - 10, 10, 10);
    }
    
    const shockCount = player.statuses.filter(s => s.type === 'shock').length;
    if (shockCount > 0) {
        ctx.fillStyle = '#f1c40f';
        for (let i = 0; i < shockCount; i++) {
            ctx.beginPath();
            ctx.arc(player.x - 10 + i * 10, drawY - player.radius - 15, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (hasControl) {
        ctx.strokeStyle = '#9b59b6';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(player.x, drawY, player.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(player.className, player.x, drawY + 5);

    if (gameMode === '2v2') {
        const teamColor = player.team === 1 ? '#3498db' : '#e74c3c';
        const teamText = player.team === 1 ? '蓝队' : '红队';
        ctx.fillStyle = teamColor;
        ctx.font = 'bold 12px Arial';
        const stateText = player.isDowned ? `[${teamText} ${player.config.id} - 倒地]` : `[${teamText} ${player.config.id}]`;
        ctx.fillText(stateText, player.x, drawY - player.radius - 20);
    } else {
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        const stateText = player.isDowned ? `[玩家 ${player.config.id} - 倒地]` : `[玩家 ${player.config.id}]`;
        ctx.fillText(stateText, player.x, drawY - player.radius - 20);
    }
}

function drawProjectileShape(ctx, projectile) {
    if (!projectile.active) return;
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    if (projectile.type === 'fireball') {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = projectile.color;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
    } else if (projectile.type === 'stone') {
        ctx.fillStyle = projectile.color;
        ctx.rotate(Math.atan2(projectile.dirY, projectile.dirX));
        ctx.beginPath();
        ctx.moveTo(projectile.radius, 0);
        ctx.lineTo(projectile.radius * 0.5, projectile.radius * 0.8);
        ctx.lineTo(-projectile.radius, projectile.radius * 0.5);
        ctx.lineTo(-projectile.radius * 0.8, -projectile.radius * 0.8);
        ctx.lineTo(projectile.radius * 0.3, -projectile.radius);
        ctx.closePath();
        ctx.fill();
    } else if (projectile.type === 'windblade') {
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, projectile.radius, projectile.radius * 0.3, Math.atan2(projectile.dirY, projectile.dirX), 0, Math.PI * 2);
        ctx.fill();
    } else if (projectile.type === 'whirlwind') {
        ctx.strokeStyle = projectile.color;
        ctx.lineWidth = 2;
        ctx.rotate(performance.now() / 100);
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius * 0.6, Math.PI, Math.PI * 2);
        ctx.stroke();
    } else if (projectile.type === 'frostray' || projectile.type === 'waterjet') {
        ctx.strokeStyle = projectile.type === 'frostray' ? '#ecf0f1' : '#85c1e9';
        ctx.lineCap = 'round';
        ctx.lineWidth = projectile.radius * 0.8;
        ctx.beginPath();
        ctx.moveTo(-projectile.dirX * projectile.radius * 1.5, -projectile.dirY * projectile.radius * 1.5);
        ctx.lineTo(projectile.dirX * projectile.radius * 1.5, projectile.dirY * projectile.radius * 1.5);
        ctx.stroke();
    } else if (projectile.type === 'spark') {
        ctx.strokeStyle = '#f1c40f';
        ctx.lineCap = 'round';
        ctx.lineWidth = projectile.radius;
        ctx.beginPath();
        ctx.moveTo(-projectile.dirX * projectile.radius * 2, -projectile.dirY * projectile.radius * 2);
        ctx.lineTo(projectile.dirX * projectile.radius * 2, projectile.dirY * projectile.radius * 2);
        ctx.stroke();
    } else if (projectile.type === 'balllightning') {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius + Math.random() * 5, 0, Math.PI * 2);
        ctx.stroke();
    } else if (projectile.type === 'lightbolt') {
        // Lightbolt: golden star/cross
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-projectile.radius, 0);
        ctx.lineTo(projectile.radius, 0);
        ctx.moveTo(0, -projectile.radius);
        ctx.lineTo(0, projectile.radius);
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
    } else if (projectile.type === 'shadowball' || projectile.type === 'vampirictouch') {
        // Shadowball: pulsating dark core with purple aura
        ctx.fillStyle = '#8e44ad';
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 150);
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2c3e50';
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawWallShape(ctx, wall) {
    if (!wall.active) return;
    ctx.save();
    ctx.strokeStyle = wall.color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 100) * 0.2;
    ctx.beginPath();
    ctx.moveTo(wall.x - wall.dx * wall.length / 2, wall.y - wall.dy * wall.length / 2);
    ctx.lineTo(wall.x + wall.dx * wall.length / 2, wall.y + wall.dy * wall.length / 2);
    ctx.stroke();
    ctx.restore();
}

function drawAoEShape(ctx, aoe) {
    if (!aoe.active) return;
    ctx.save();
    if (aoe.type === 'railgun') {
        let rx = aoe.x - aoe.owner.x;
        let ry = aoe.y - aoe.owner.y;
        const rDist = Math.hypot(rx, ry);
        if (rDist > 0) { rx /= rDist; ry /= rDist; }
        
        ctx.strokeStyle = '#f1c40f';
        ctx.globalAlpha = 0.5 + (Math.sin(performance.now() / 50) * 0.2);
        ctx.lineWidth = 2 + (aoe.timer / aoe.delay) * 4;
        ctx.beginPath();
        ctx.moveTo(aoe.owner.x, aoe.owner.y);
        ctx.lineTo(aoe.owner.x + rx * 2000, aoe.owner.y + ry * 2000);
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (['fireblast', 'meteor', 'blizzard', 'earthquake', 'hurricane', 'healingaura', 'judgment', 'lightbind', 'fearscream', 'abyssswamp'].includes(aoe.type)) {
        ctx.strokeStyle = aoe.color;
        ctx.lineWidth = aoe.type === 'earthquake' ? 5 : 2;
        ctx.beginPath();
        const radius = aoe.type === 'earthquake' ? aoe.radius * (aoe.timer / aoe.delay) : aoe.radius;
        ctx.arc(aoe.x, aoe.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        if (aoe.type === 'judgment') {
            ctx.fillStyle = '#f39c12';
            ctx.globalAlpha = 0.6 * (aoe.timer / aoe.delay);
            ctx.fillRect(aoe.x - 10, aoe.y - 200 * (aoe.timer / aoe.delay), 20, 200 * (aoe.timer / aoe.delay));
        } else if (aoe.type === 'lightbind') {
            ctx.strokeStyle = '#f1c40f';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(aoe.x, aoe.y, aoe.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (aoe.type === 'healingaura') {
            ctx.strokeStyle = '#2ecc71';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.arc(aoe.x, aoe.y, aoe.radius * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            // Plus symbols
            ctx.fillStyle = '#2ecc71';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 150);
            ctx.fillRect(aoe.x - 2, aoe.y - 15, 4, 10);
            ctx.fillRect(aoe.x - 5, aoe.y - 12, 10, 4);
        } else if (aoe.type === 'fearscream') {
            ctx.strokeStyle = '#8e44ad';
            ctx.lineWidth = 4;
            ctx.beginPath();
            const progress = 1 - (aoe.timer / aoe.delay); // Expands outwards
            ctx.arc(aoe.x, aoe.y, aoe.radius * progress, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = '#8e44ad';
            ctx.fill();
        } else if (aoe.type === 'abyssswamp') {
            ctx.fillStyle = '#8e44ad';
            ctx.globalAlpha = 0.3 + 0.1 * Math.sin(performance.now() / 300);
            ctx.beginPath();
            ctx.arc(aoe.x, aoe.y, aoe.radius, 0, Math.PI * 2);
            ctx.fill();
            // Swamp bubbles
            ctx.fillStyle = '#2c3e50';
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(aoe.x + Math.sin(performance.now()/200)*20, aoe.y + Math.cos(performance.now()/250)*20, 5, 0, Math.PI*2);
            ctx.arc(aoe.x - Math.cos(performance.now()/150)*30, aoe.y + Math.sin(performance.now()/200)*15, 8, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (aoe.type === 'waterprison') {
        ctx.fillStyle = aoe.color;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        const currentRadius = aoe.radius * (aoe.timer / aoe.delay);
        ctx.ellipse(aoe.x, aoe.y + aoe.radius - currentRadius, currentRadius, currentRadius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.strokeStyle = aoe.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(aoe.x, aoe.y, aoe.radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.fillStyle = aoe.color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(aoe.x, aoe.y, aoe.radius * Math.min(1, aoe.timer / aoe.delay), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function serializePlayer(player) {
    return {
        className: player.className,
        x: player.x,
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        mp: player.mp,
        maxMp: player.maxMp,
        shieldAmount: player.shieldAmount,
        cooldowns: { ...player.cooldowns },
        statuses: player.statuses.map(status => ({ ...status })),
        isDowned: player.isDowned,
        downedHp: player.downedHp
    };
}

function serializeEntity(entity) {
    if (entity instanceof Projectile) {
        return {
            kind: 'projectile',
            ownerId: entity.owner.config.id,
            x: entity.x,
            y: entity.y,
            dirX: entity.dirX,
            dirY: entity.dirY,
            speed: entity.speed,
            radius: entity.radius,
            color: entity.color,
            type: entity.type,
            active: entity.active,
            pierce: entity.pierce,
            damaging: false
        };
    }
    if (entity instanceof Wall) {
        return {
            kind: 'wall',
            ownerId: entity.owner.config.id,
            x: entity.x,
            y: entity.y,
            dx: entity.dx,
            dy: entity.dy,
            length: entity.length,
            duration: entity.duration,
            color: entity.color,
            active: entity.active,
            damaging: entity.damaging
        };
    }
    if (entity instanceof AoE) {
        return {
            kind: 'aoe',
            ownerId: entity.owner.config.id,
            x: entity.x,
            y: entity.y,
            radius: entity.radius,
            delay: entity.delay,
            timer: entity.timer,
            color: entity.color,
            type: entity.type,
            active: entity.active
        };
    }
    return null;
}

function buildSnapshot() {
    const playersData = {};
    playersList.forEach(p => {
        playersData[p.config.id] = serializePlayer(p);
    });
    return {
        players: playersData,
        entities: entities.map(serializeEntity).filter(Boolean)
    };
}

function applyPlayerSnapshot(target, data) {
    target.x = data.x;
    target.y = data.y;
    target.hp = data.hp;
    target.maxHp = data.maxHp;
    target.mp = data.mp;
    target.maxMp = data.maxMp;
    target.shieldAmount = data.shieldAmount;
    target.cooldowns = { ...data.cooldowns };
    target.statuses = data.statuses.map(status => ({ ...status }));
    target.isDowned = data.isDowned || false;
    target.downedHp = data.downedHp || 0;
    target.updateSkillUI();
}

function deserializeEntity(data) {
    const owner = playersList.find(p => p.config.id === data.ownerId);
    if (!owner) return null;
    if (data.kind === 'projectile') {
        const projectile = new Projectile(owner, data.x, data.y, data.dirX, data.dirY, data.speed, data.radius, data.color, data.type, () => {}, data.pierce);
        projectile.active = data.active;
        return projectile;
    }
    if (data.kind === 'wall') {
        const wall = new Wall(owner, data.x, data.y, 0, 1, data.length, data.duration, data.color, data.damaging);
        wall.dx = data.dx;
        wall.dy = data.dy;
        wall.active = data.active;
        return wall;
    }
    if (data.kind === 'aoe') {
        const aoe = new AoE(owner, data.x, data.y, data.radius, data.delay, data.color, data.type, () => {});
        aoe.timer = data.timer;
        aoe.active = data.active;
        return aoe;
    }
    return null;
}

function applySnapshot(state) {
    if (!state || !state.players) return;
    if (playersList.length === 0) {
        Object.keys(state.players).forEach(id => {
            const p = new Player(playerConfigs[id], state.players[id].className);
            playersList.push(p);
            p.initUI();
            if (id === 'A') p1 = p;
            if (id === 'B') p2 = p;
            if (id === 'C') p3 = p;
            if (id === 'D') p4 = p;
        });
        
        ['ui-p1', 'ui-p2', 'ui-p3', 'ui-p4'].forEach((uiId, idx) => {
            const el = document.getElementById(uiId);
            if (el) {
                if (idx < Object.keys(state.players).length) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        });
    }

    playersList.forEach(p => {
        if (state.players[p.config.id]) {
            applyPlayerSnapshot(p, state.players[p.config.id]);
        }
    });
    entities = state.entities.map(deserializeEntity).filter(Boolean);
}

function maybeSendSnapshot() {
    if (networkMode !== NetworkMode.ONLINE || networkRole !== NetworkRole.HOST || !isGuestConnected()) return;
    const now = performance.now();
    if (now - lastSnapshotSent < 33) return; // 约 30FPS 发送快照
    lastSnapshotSent = now;
    broadcast({ type: 'snapshot', state: buildSnapshot(), events: networkEvents });
    networkEvents = [];
}

function startGame() {
    document.getElementById('selection-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    currentSessionStats = { kills: 0, damage: 0 };
    
    document.getElementById('game-screen').classList.remove('hidden');
    currentState = GameState.SELECTION;

    entities = [];
    particles = [];
    remoteKeys = {};
    playersList = [];

    const ids = ['A', 'B', 'C', 'D'];
    let actualTargetCount = (networkMode === NetworkMode.LOCAL) ? 2 : targetPlayerCount;
    for (let i = 0; i < actualTargetCount; i++) {
        const id = ids[i];
        if (playerClasses[id]) {
            const p = new Player(playerConfigs[id], playerClasses[id]);
            playersList.push(p);
            p.initUI();
            if (id === 'A') p1 = p;
            if (id === 'B') p2 = p;
            if (id === 'C') p3 = p;
            if (id === 'D') p4 = p;
        }
    }
    
    ['ui-p1', 'ui-p2', 'ui-p3', 'ui-p4'].forEach((uiId, idx) => {
        const el = document.getElementById(uiId);
        if (el) {
            if (idx < actualTargetCount) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    startBattleCountdown(3);
}

function gameLoop(time) {
    if (currentState !== GameState.BATTLE) {
        animationStarted = false;
        return;
    }

    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;

    if (shouldSimulateLocally()) {
        update(dt);
        maybeSendSnapshot();
    } else {
        // 客机端进行视觉上的插值（外推），让飞行物和粒子平滑移动
        if (playersList.length > 0) {
            // 客机端进行简单的移动预测
            playersList.forEach(p => {
                if (!p.hasStatus('root') && !p.hasStatus('knockup') && !p.hasStatus('paralyze')) {
                    const input = getInputState(p.config.id);
                    let dx = 0;
                    let dy = 0;
                    if (input[p.config.keys.up]) dy -= 1;
                    if (input[p.config.keys.down]) dy += 1;
                    if (input[p.config.keys.left]) dx -= 1;
                    if (input[p.config.keys.right]) dx += 1;
                    if (dx !== 0 && dy !== 0) {
                        const len = Math.hypot(dx, dy);
                        dx /= len;
                        dy /= len;
                    }
                    p.x += dx * p.speed * dt;
                    p.y += dy * p.speed * dt;
                    p.x = Math.max(p.radius, Math.min(canvas.width - p.radius, p.x));
                    p.y = Math.max(p.radius, Math.min(canvas.height - p.radius, p.y));
                }
            });

            entities.forEach(entity => {
                if (entity instanceof Projectile && entity.active) {
                    entity.x += entity.dirX * entity.speed * dt;
                    entity.y += entity.dirY * entity.speed * dt;
                    
                    // 尾迹粒子
                    if (Math.random() < 0.5) {
                        if (entity.type === 'fireball') {
                            particles.push(new Particle(entity.x, entity.y, -entity.dirX * 50, -entity.dirY * 50, 0.4, '#f39c12', entity.radius * 0.4));
                        } else if (entity.type === 'frostray' || entity.type === 'waterjet') {
                            particles.push(new Particle(entity.x, entity.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.3, '#ecf0f1', entity.radius * 0.25));
                        } else if (entity.type === 'stone') {
                            particles.push(new Particle(entity.x, entity.y, -entity.dirX * 20, -entity.dirY * 20, 0.25, '#95a5a6', entity.radius * 0.3));
                        } else if (entity.type === 'windblade' || entity.type === 'whirlwind') {
                            particles.push(new Particle(entity.x, entity.y, -entity.dirY * 20, entity.dirX * 20, 0.25, '#ecf0f1', entity.radius * 0.18));
                        }
                    }
                } else if (entity instanceof Wall && entity.active) {
                    if (Math.random() < 0.25) {
                        const offset = (Math.random() - 0.5) * entity.length;
                        particles.push(new Particle(
                            entity.x + entity.dx * offset,
                            entity.y + entity.dy * offset,
                            entity.dy * 20,
                            -entity.dx * 20,
                            0.5,
                            entity.damaging ? '#f39c12' : '#ecf0f1',
                            2
                        ));
                    }
                } else if (entity instanceof AoE && entity.active) {
                    if (entity.type === 'fireblast' && Math.random() < 0.2) {
                        particles.push(new Particle(entity.x + (Math.random() - 0.5) * entity.radius, entity.y + (Math.random() - 0.5) * entity.radius, 0, -20, 0.5, '#e67e22', 2));
                    } else if (entity.type === 'waterprison' && Math.random() < 0.2) {
                        particles.push(new Particle(entity.x + (Math.random() - 0.5) * entity.radius, entity.y + (Math.random() - 0.5) * entity.radius, 0, -30, 0.6, '#ecf0f1', 3));
                    } else if (entity.type === 'hurricane') {
                        particles.push(new Particle(entity.x + (Math.random() - 0.5) * entity.radius, entity.y + (Math.random() - 0.5) * entity.radius, (Math.random() - 0.5) * 40, -40, 0.4, '#1abc9c', 2));
                    }
                }
            });
            particles.forEach(particle => particle.update(dt));
            particles = particles.filter(particle => particle.life > 0);
        }
    }
    draw();
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    playersList.forEach(p => {
        if (p.hp > 0 || p.isDowned) p.update(dt);
    });
    entities.forEach(entity => entity.update(dt));
    entities = entities.filter(entity => entity.active);
    particles.forEach(particle => particle.update(dt));
    particles = particles.filter(particle => particle.life > 0);

    let winner = null;
    if (gameMode === '2v2') {
        const team1Alive = playersList.some(p => p.team === 1 && (p.hp > 0 || p.isDowned));
        const team2Alive = playersList.some(p => p.team === 2 && (p.hp > 0 || p.isDowned));
        if (!team1Alive && !team2Alive) {
            winner = '平局';
        } else if (!team1Alive) {
            winner = '红队'; // Team 2 wins
        } else if (!team2Alive) {
            winner = '蓝队'; // Team 1 wins
        }
    } else {
        const alivePlayers = playersList.filter(p => p.hp > 0 || p.isDowned);
        if (alivePlayers.length <= 1 && playersList.length > 1) {
            winner = '平局';
            if (alivePlayers.length === 1) {
                winner = `玩家 ${alivePlayers[0].config.id}`;
            }
        }
    }

    if (winner) {
        endGame(winner, true);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    if (playersList.length === 0) return;
    playersList.forEach(p => {
        if (p.hp > 0 || p.isDowned) p.draw(ctx);
    });
    entities.forEach(entity => entity.draw(ctx));
    particles.forEach(particle => particle.draw(ctx));
}

function endGame(winner, notifyPeer) {
    currentState = GameState.END;
    hideCountdownOverlay();
    soundManager.win();
    if (notifyPeer && networkMode === NetworkMode.ONLINE && networkRole === NetworkRole.HOST) {
        broadcast({ type: 'end', winner });
    }

    document.getElementById('game-screen').classList.add('hidden');
    const endScreen = document.getElementById('end-screen');
    endScreen.classList.remove('hidden');

    const winnerText = document.getElementById('winner-text');
    let isWin = false;
    let isDraw = false;
    let isLoss = false;

    if (winner === '平局') {
        winnerText.innerText = '平局！';
        winnerText.style.color = '#ecf0f1';
        isDraw = true;
    } else {
        winnerText.innerText = `${winner} 获胜！`;
        
        let winnerColor = '#ecf0f1';
        if (winner === '蓝队') {
            winnerColor = '#3498db';
            winnerText.style.color = winnerColor;
            if (myPlayerId === 'A' || myPlayerId === 'C') isWin = true;
            else isLoss = true;
        } else if (winner === '红队') {
            winnerColor = '#e74c3c';
            winnerText.style.color = winnerColor;
            if (myPlayerId === 'B' || myPlayerId === 'D') isWin = true;
            else isLoss = true;
        } else {
            const winnerId = winner.replace('玩家 ', '');
            if (winnerId === myPlayerId) isWin = true;
            else isLoss = true;

            const winnerPlayer = playersList.find(p => p.config.id === winnerId);
            if (winnerPlayer) {
                winnerColor = winnerPlayer.config.color;
                const classCounts = {};
                playersList.forEach(p => { classCounts[p.className] = (classCounts[p.className] || 0) + 1; });
                if (classCounts[winnerPlayer.className] === 1) {
                    if (winnerPlayer.className === '火系') winnerColor = '#e74c3c';
                    else if (winnerPlayer.className === '水系') winnerColor = '#3498db';
                    else if (winnerPlayer.className === '土系') winnerColor = '#8b4513';
                    else if (winnerPlayer.className === '风系') winnerColor = '#2ecc71';
                    else if (winnerPlayer.className === '电系') winnerColor = '#f1c40f';
                    else if (winnerPlayer.className === '光系') winnerColor = '#f39c12';
                    else if (winnerPlayer.className === '暗系') winnerColor = '#8e44ad';
                }
                winnerText.style.color = winnerColor;
            }
        }
    }

    if (currentUser) {
        const accs = getAccounts();
        if (accs[currentUser]) {
            let eloChange = 0;
            let currentElo = accs[currentUser].stats.elo || 1000;
            
            // Simple Elo calc (K-factor = 32, assuming average opponent Elo = 1000 if not implemented full matchmaking elo yet)
            const expectedScore = 1 / (1 + Math.pow(10, (1000 - currentElo) / 400));
            const actualScore = isWin ? 1 : (isDraw ? 0.5 : 0);
            eloChange = Math.round(32 * (actualScore - expectedScore));
            
            accs[currentUser].stats.elo = Math.max(0, currentElo + eloChange);
            
            if (isWin) accs[currentUser].stats.wins++;
            if (isLoss) accs[currentUser].stats.losses++;
            if (isDraw) accs[currentUser].stats.draws++;
            accs[currentUser].stats.kills += currentSessionStats.kills;
            accs[currentUser].stats.damage += currentSessionStats.damage;
            saveAccounts(accs);
            
            const eloText = eloChange >= 0 ? `+${eloChange}` : `${eloChange}`;
            const eloColor = eloChange >= 0 ? '#2ecc71' : '#e74c3c';
            winnerText.innerHTML += `<br><span style="font-size: 0.6em; color: ${eloColor};">排位分 ${eloText} (当前: ${accs[currentUser].stats.elo})</span>`;
        }
    }
}

// Auth Init Call
initAuth();
switchToLocalMode();
