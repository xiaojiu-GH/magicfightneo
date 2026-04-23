// ================= 核心架构与状态管理 =================
const GameState = { SELECTION: 0, BATTLE: 1, END: 2 };
let currentState = GameState.SELECTION;

class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
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
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start();
    }

    shoot() {
        const now = performance.now();
        if (this.lastShootTime && now - this.lastShootTime < 50) return;
        this.lastShootTime = now;
        this.playTone(400, 'square', 0.1, 0.05);
        setTimeout(() => this.playTone(300, 'square', 0.1, 0.05), 50);
    }

    hit() {
        const now = performance.now();
        if (this.lastHitTime && now - this.lastHitTime < 50) return;
        this.lastHitTime = now;
        this.playNoise(0.2, 0.2);
    }

    cast() {
        const now = performance.now();
        if (this.lastCastTime && now - this.lastCastTime < 50) return;
        this.lastCastTime = now;
        this.playTone(600, 'sine', 0.3, 0.1);
        setTimeout(() => this.playTone(800, 'sine', 0.3, 0.1), 100);
    }
    
    dash() {
        const now = performance.now();
        if (this.lastDashTime && now - this.lastDashTime < 50) return;
        this.lastDashTime = now;
        this.playNoise(0.3, 0.1);
        this.playTone(200, 'sawtooth', 0.3, 0.05);
    }
    
    wall() {
        const now = performance.now();
        if (this.lastWallTime && now - this.lastWallTime < 50) return;
        this.lastWallTime = now;
        this.playNoise(0.5, 0.15);
        this.playTone(150, 'square', 0.5, 0.1);
    }
    
    explosion() {
        const now = performance.now();
        if (this.lastExplosionTime && now - this.lastExplosionTime < 50) return;
        this.lastExplosionTime = now;
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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 玩家配置信息
const configA = { id: 'A', startX: 150, startY: 300, color: '#2ecc71', keys: { up: 'w', down: 's', left: 'a', right: 'd', skill1: '1', skill2: '2', skill3: '3', skill4: '4', skill5: '5' } };
const configB = { id: 'B', startX: 850, startY: 300, color: '#e74c3c', keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', skill1: '8', skill2: '9', skill3: '0', skill4: '-', skill5: '=' } };

let playerAClass = null;
let playerBClass = null;

let p1, p2;
let entities = []; // 存储所有技能投射物/特效
let particles = []; // 存储粒子系统
let lastTime = 0;

// 键盘按键状态池
const keys = {};
window.addEventListener('keydown', e => {
    soundManager.init();
    keys[e.key] = true;
    handleSelectionInput(e.key);
});
window.addEventListener('keyup', e => keys[e.key] = false);

// ================= 技能数据定义 =================
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
    }
};

// ================= 选择界面逻辑 =================
function handleSelectionInput(key) {
    if (currentState !== GameState.SELECTION) return;
    
    const classMap = { '1': '火系', '2': '水系', '3': '土系', '4': '风系', '7': '风系', '8': '火系', '9': '水系', '0': '土系' };
    
    if (['1', '2', '3', '4'].includes(key)) {
        playerAClass = classMap[key];
        document.getElementById('p1-status').innerText = `当前选择：${playerAClass}`;
        soundManager.select();
    }
    if (['7', '8', '9', '0'].includes(key)) {
        playerBClass = classMap[key];
        document.getElementById('p2-status').innerText = `当前选择：${playerBClass}`;
        soundManager.select();
    }

    if (playerAClass && playerBClass) {
        setTimeout(startGame, 500);
    }
}

// ================= 实体类定义 =================
class Player {
    constructor(config, className) {
        this.config = config;
        this.className = className;
        this.classData = SkillData[className];
        this.x = config.startX;
        this.y = config.startY;
        this.hp = 100;
        this.maxHp = 100;
        this.mp = 100;
        this.maxMp = 100;
        this.mpRegen = 5; // 每秒恢复5点法力
        this.baseSpeed = 250;
        this.radius = 20;
        
        this.cooldowns = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }; // 5个技能的CD
        this.statuses = []; // 状态列表: { type: 'burn'|'slow'|'root'|'shield', duration, value, tickTimer }
        this.shieldAmount = 0; // 护盾值
    }

    get speed() {
        if (this.hasStatus('root')) return 0;
        let finalSpeed = this.baseSpeed;
        if (this.hasStatus('slow')) finalSpeed *= 0.6; // 减速40%
        if (this.hasStatus('haste')) finalSpeed *= 1.6; // 加速60%
        return finalSpeed;
    }

    hasStatus(type) {
        return this.statuses.some(s => s.type === type);
    }

    addStatus(type, duration, value = 0) {
        this.statuses.push({ type, duration, maxDuration: duration, value, tickTimer: 0 });
    }

    takeDamage(amount, sourceClass = null) {
        soundManager.hit();
        let finalDamage = amount;
        
        // 元素克制计算：火克风，风克土，土克水，水克火
        // 火(1.2) -> 风
        // 风(1.2) -> 土
        // 土(1.2) -> 水
        // 水(1.2) -> 火
        if (sourceClass) {
            if ((sourceClass === '火系' && this.className === '风系') ||
                (sourceClass === '风系' && this.className === '土系') ||
                (sourceClass === '土系' && this.className === '水系') ||
                (sourceClass === '水系' && this.className === '火系')) {
                finalDamage = finalDamage * 1.2;
            }
        }
        
        // 处理护盾
        if (this.shieldAmount > 0) {
            if (this.shieldAmount >= finalDamage) {
                this.shieldAmount -= finalDamage;
                finalDamage = 0;
            } else {
                finalDamage -= this.shieldAmount;
                this.shieldAmount = 0;
                // 护盾破裂反伤逻辑由护盾状态本身处理
            }
        }
        
        this.hp = Math.max(0, this.hp - finalDamage);
        this.updateUI();
    }

    update(dt, enemy) {
        // 检查护盾是否提前破裂
        const shieldIndex = this.statuses.findIndex(s => s.type === 'shield');
        if (shieldIndex !== -1 && this.shieldAmount <= 0) {
            // 护盾被打破，触发爆炸反伤
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < 100) enemy.takeDamage(15, this.className);
            // 护盾破裂视觉效果
            createExplosion(this.x, this.y, '#f1c40f', 20, 150, 0.6, 6);
            createExplosion(this.x, this.y, '#7f8c8d', 15, 120, 0.5, 4);
            entities.push(new AoE(this, this.x, this.y, 100, 0.1, '#f1c40f', 'shieldbreak', () => {}));
            this.statuses.splice(shieldIndex, 1);
        }

        // 更新状态效果
        for (let i = this.statuses.length - 1; i >= 0; i--) {
            let s = this.statuses[i];
            s.duration -= dt;
            
            // 灼烧效果 tick 和 视觉效果
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
            
            // 浮空效果 (修改位置)
            if (s.type === 'knockup') {
                // 不影响实际x/y，但在绘制时加上y轴偏移，这里不修改真实y坐标
                // 以防影响碰撞判断
            }
            
            if (s.duration <= 0) {
                if (s.type === 'shield') {
                    // 护盾自然结束，触发爆炸反伤
                    const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                    if (dist < 100) enemy.takeDamage(15, this.className);
                    createExplosion(this.x, this.y, '#f1c40f', 20, 150, 0.6, 6);
                    createExplosion(this.x, this.y, '#7f8c8d', 15, 120, 0.5, 4);
                    entities.push(new AoE(this, this.x, this.y, 100, 0.1, '#f1c40f', 'shieldbreak', () => {}));
                    this.shieldAmount = 0;
                }
                this.statuses.splice(i, 1);
            }
        }

        // 如果被禁锢或正在施法前摇或浮空，禁止移动
        if (!this.hasStatus('root') && !this.hasStatus('knockup')) {
            let dx = 0, dy = 0;
            if (keys[this.config.keys.up]) dy -= 1;
            if (keys[this.config.keys.down]) dy += 1;
            if (keys[this.config.keys.left]) dx -= 1;
            if (keys[this.config.keys.right]) dx += 1;
            
            if (dx !== 0 && dy !== 0) {
                const len = Math.hypot(dx, dy);
                dx /= len; dy /= len;
            }
            
            this.x += dx * this.speed * dt;
            this.y += dy * this.speed * dt;
            
            this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
            this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
        }

        // 更新技能冷却和法力恢复
        this.mp = Math.min(this.maxMp, this.mp + this.mpRegen * dt);
        
        for (let i = 0; i < 5; i++) {
            if (this.cooldowns[i] > 0) this.cooldowns[i] -= dt;
        }
        
        this.updateSkillUI();

        // 技能释放
        for (let i = 0; i < 5; i++) {
            const skillKey = this.config.keys[`skill${i+1}`];
            if (skillKey && keys[skillKey] && this.cooldowns[i] <= 0 && this.classData.skills[i]) {
                const cost = this.classData.skills[i].cost;
                if (this.mp >= cost) {
                    this.mp -= cost;
                    this.castSkill(i, enemy);
                } else {
                    // 法力不足提示，可选实现
                }
            }
        }
    }

    castSkill(slot, enemy) {
        const skill = this.classData.skills[slot];
        this.cooldowns[slot] = skill.cd;
        
        // 计算面向方向 (朝向敌人)
        let dirX = enemy.x - this.x;
        let dirY = enemy.y - this.y;
        const dist = Math.hypot(dirX, dirY);
        if (dist > 0) { dirX /= dist; dirY /= dist; }

        // 播放对应音效
        if (['fireball', 'frostray', 'waterjet', 'stonevolley', 'windblade'].includes(skill.id)) {
            soundManager.shoot();
        } else if (['fireblast', 'meteor', 'waterprison', 'blizzard', 'earthquake', 'hurricane', 'frostarmor', 'earthshield'].includes(skill.id)) {
            soundManager.cast();
        } else if (['flamedash', 'tailwind', 'earthspike'].includes(skill.id)) {
            soundManager.dash();
        } else if (['firewall', 'windwall', 'mudswamp', 'whirlwind'].includes(skill.id)) {
            soundManager.wall();
        } else {
            soundManager.shoot();
        }

        switch(skill.id) {
            case 'fireball':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 500, 20, 15, '#e74c3c', 'fireball', target => {
                    target.takeDamage(20, this.className);
                    target.addStatus('burn', 3);
                }));
                break;
            case 'fireblast':
                entities.push(new AoE(this, this.x, this.y, 100, 0.5, '#e67e22', 'fireblast', target => {
                    target.takeDamage(40, this.className);
                    // 简单击退
                    let kx = target.x - this.x;
                    let ky = target.y - this.y;
                    let kLen = Math.hypot(kx, ky);
                    if(kLen>0) { target.x += (kx/kLen)*50; target.y += (ky/kLen)*50; }
                }));
                break;
            case 'flamedash':
                // 瞬移逻辑：向当前面朝方向冲刺一段距离，路径留下火焰
                const dashDist = 150;
                const dashSteps = 5;
                for (let i = 1; i <= dashSteps; i++) {
                    const px = this.x + dirX * (dashDist / dashSteps) * i;
                    const py = this.y + dirY * (dashDist / dashSteps) * i;
                    // 路径上生成短暂的火焰范围伤害
                    entities.push(new AoE(this, px, py, 30, 0.2, '#e74c3c', 'flamedash', target => {
                        target.takeDamage(15, this.className);
                        target.addStatus('burn', 2);
                    }));
                }
                this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x + dirX * dashDist));
                this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y + dirY * dashDist));
                createExplosion(this.x, this.y, '#f39c12', 20, 80, 0.4, 4);
                break;
            case 'firewall':
                // 类似风墙，但有伤害和灼烧
                let fWallX = this.x + dirX * 50;
                let fWallY = this.y + dirY * 50;
                entities.push(new Wall(this, fWallX, fWallY, dirX, dirY, 100, 5, '#e67e22', true));
                break;
            case 'meteor':
                // 延迟较大的巨额范围伤害
                entities.push(new AoE(this, enemy.x, enemy.y, 120, 1.5, '#c0392b', 'meteor', target => {
                    target.takeDamage(60, this.className);
                    target.addStatus('burn', 5);
                }));
                break;
            case 'frostray':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 1000, 15, 10, '#00a8ff', 'frostray', target => {
                    target.takeDamage(15, this.className);
                    target.addStatus('slow', 2);
                }));
                break;
            case 'waterprison':
                // 在敌人脚下生成，0.5秒后生效
                entities.push(new AoE(this, enemy.x, enemy.y, 40, 0.5, '#3498db', 'waterprison', target => {
                    target.takeDamage(10, this.className);
                    target.addStatus('root', 1.5);
                }));
                break;
            case 'waterjet':
                // 类似风刃但更慢，连续多段
                for(let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 600, 10, 12, '#2980b9', 'waterjet', target => {
                            target.takeDamage(10, this.className);
                            target.x += dirX * 10;
                            target.y += dirY * 10;
                        }));
                    }, i * 200);
                }
                break;
            case 'frostarmor':
                this.addStatus('shield', 6);
                this.shieldAmount = 30; // 较弱的护盾，但被攻击减速（在takeDamage或碰撞里实现）
                this.addStatus('frostarmor', 6); // 增加一个特殊标记用于受伤时反伤减速
                createExplosion(this.x, this.y, '#3498db', 20, 50, 0.5, 4);
                break;
            case 'blizzard':
                // 大范围减速和伤害
                entities.push(new AoE(this, enemy.x, enemy.y, 150, 2.0, '#bdc3c7', 'blizzard', target => {
                    target.takeDamage(45, this.className);
                    target.addStatus('slow', 4);
                }));
                break;
            case 'stonevolley':
                for(let i = -1; i <= 1; i++) {
                    let angle = Math.atan2(dirY, dirX) + i * 0.2;
                    entities.push(new Projectile(this, this.x, this.y, Math.cos(angle), Math.sin(angle), 400, 10, 8, '#7f8c8d', 'stone', target => {
                        target.takeDamage(10, this.className);
                        // 短暂打断 (减速一瞬间)
                        target.addStatus('slow', 0.2);
                    }));
                }
                break;
            case 'earthshield':
                this.shieldAmount = 50;
                this.addStatus('shield', 5);
                
                // 开启护盾时的爆发特效
                createExplosion(this.x, this.y, '#f1c40f', 15, 50, 0.5, 4);
                createExplosion(this.x, this.y, '#95a5a6', 10, 80, 0.6, 5);
                break;
            case 'earthspike':
                // 沿直线生成一排地刺
                for (let i = 1; i <= 4; i++) {
                    setTimeout(() => {
                        const px = this.x + dirX * 60 * i;
                        const py = this.y + dirY * 60 * i;
                        entities.push(new AoE(this, px, py, 25, 0.3, '#f39c12', 'earthspike', target => {
                            target.takeDamage(15, this.className);
                            target.addStatus('knockup', 0.5); // 短暂击飞
                        }));
                    }, i * 150);
                }
                break;
            case 'mudswamp':
                // 在敌人脚下生成持久泥沼，减速且吸蓝
                entities.push(new AoE(this, enemy.x, enemy.y, 80, 0.5, '#7f8c8d', 'mudswamp', target => {
                    target.takeDamage(10, this.className);
                    target.addStatus('slow', 5);
                    // 吸蓝可以设计为一个持续状态或瞬间扣除
                    target.mp = Math.max(0, target.mp - 20); 
                }));
                // 修改泥沼的类型让它持续存在一段时间作为地形效果会更酷，但为了框架简单，目前用一次性大范围减速+扣蓝模拟
                break;
            case 'earthquake':
                // 全屏或极大范围中心爆发
                entities.push(new AoE(this, this.x, this.y, 250, 1.5, '#8e44ad', 'earthquake', target => {
                    target.takeDamage(45, this.className);
                    target.addStatus('root', 2);
                }));
                break;
            case 'windblade':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 800, 8, 10, '#1abc9c', 'windblade', target => {
                    target.takeDamage(8, this.className);
                }));
                break;
            case 'whirlwind':
                entities.push(new Projectile(this, this.x, this.y, dirX, dirY, 150, 25, 40, '#16a085', 'whirlwind', target => {
                    target.takeDamage(25, this.className);
                    // 小幅击退
                    target.x += dirX * 30;
                    target.y += dirY * 30;
                }, true)); // 穿透效果，多段伤害由投射物内部处理或简单处理为单次穿透
                break;
            case 'windwall':
                // 在身前一段距离生成风墙
                let wallX = this.x + dirX * 50;
                let wallY = this.y + dirY * 50;
                // 风墙实际上是一个特殊的实体，这里我们用AoE稍加改造或者新建一个Wall类，这里为了简便我们新建Wall实体
                entities.push(new Wall(this, wallX, wallY, dirX, dirY, 80, 4, '#1abc9c'));
                break;
            case 'hurricane':
                entities.push(new AoE(this, enemy.x, enemy.y, 60, 1.0, '#1abc9c', 'hurricane', target => {
                    target.takeDamage(45, this.className);
                    target.addStatus('knockup', 1.5);
                }));
                break;
            case 'tailwind':
                this.addStatus('haste', 5);
                createExplosion(this.x, this.y, '#1abc9c', 20, 100, 0.5, 3);
                break;
        }
    }

    draw(ctx) {
        // 绘制护盾
        if (this.shieldAmount > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            // 护盾光晕
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 15, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(241, 196, 15, 0.4)';
            ctx.lineWidth = 4;
            ctx.stroke();
            
            // 环绕岩石动画
            const time = performance.now() / 1000;
            ctx.rotate(time * 2); // 岩石旋转
            
            for (let i = 0; i < 3; i++) {
                ctx.save();
                ctx.rotate((Math.PI * 2 / 3) * i);
                ctx.translate(this.radius + 15, 0);
                
                ctx.fillStyle = '#95a5a6';
                ctx.beginPath();
                ctx.moveTo(5, 0);
                ctx.lineTo(2, 6);
                ctx.lineTo(-5, 3);
                ctx.lineTo(-4, -4);
                ctx.lineTo(2, -5);
                ctx.closePath();
                ctx.fill();
                
                ctx.strokeStyle = '#7f8c8d';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.restore();
            }
            
            ctx.restore();
        }

        // 浮空表现
        let drawY = this.y;
        let knockupStatus = this.statuses.find(s => s.type === 'knockup');
        if (knockupStatus) {
            // 一个简单的抛物线跳跃效果
            let t = knockupStatus.maxDuration - knockupStatus.duration;
            let total = knockupStatus.maxDuration;
            let height = 50; // 浮空最高点
            // y = 4h * (t/T) * (1 - t/T)
            let offsetY = 4 * height * (t/total) * (1 - t/total);
            drawY -= offsetY;
        }

        // 绘制角色主体 (用 drawY 代替 this.y)
        ctx.fillStyle = this.config.color;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // 绘制状态特效提示
        if (this.hasStatus('burn')) {
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(this.x - 5, drawY - this.radius - 10, 10, 10);
        }
        if (this.hasStatus('slow')) {
            ctx.fillStyle = '#3498db';
            ctx.fillRect(this.x - 15, drawY - this.radius - 10, 10, 10);
        }
        if (this.hasStatus('haste')) {
            ctx.fillStyle = '#1abc9c';
            ctx.fillRect(this.x + 5, drawY - this.radius - 10, 10, 10);
        }
        if (this.hasStatus('root') || this.hasStatus('knockup')) {
            ctx.strokeStyle = '#9b59b6';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, drawY, this.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 绘制职业标识
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.className, this.x, drawY + 5);
    }

    initUI() {
        const skillsContainer = document.getElementById(`p${this.config.id === 'A' ? '1' : '2'}-skills`);
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
        const hpBar = document.getElementById(`p${this.config.id === 'A' ? '1' : '2'}-hp`);
        hpBar.style.width = `${(this.hp / this.maxHp) * 100}%`;
        
        const mpBar = document.getElementById(`p${this.config.id === 'A' ? '1' : '2'}-mp`);
        if(mpBar) mpBar.style.width = `${(this.mp / this.maxMp) * 100}%`;
    }

    updateSkillUI() {
        for(let i=0; i<5; i++) {
            if (!this.classData.skills[i]) continue;
            const cdOverlay = document.getElementById(`p${this.config.id}-cd${i}`);
            const skillIcon = document.getElementById(`p${this.config.id}-skill${i}`);
            
            if(cdOverlay) {
                const maxCd = this.classData.skills[i].cd;
                const currentCd = this.cooldowns[i];
                const pct = currentCd > 0 ? (currentCd / maxCd) * 100 : 0;
                cdOverlay.style.height = `${pct}%`;
            }
            
            if (skillIcon) {
                // 如果法力不足，给技能图标加暗色提示
                if (this.mp < this.classData.skills[i].cost) {
                    skillIcon.style.opacity = '0.5';
                } else {
                    skillIcon.style.opacity = '1';
                }
            }
        }
        
        // 由于update逻辑里频繁调用，顺便更新下血蓝条
        this.updateUI();
    }
}

// === 粒子系统 ===
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

// 产生粒子爆炸效果的工具函数
function createExplosion(x, y, color, count, speed, life, size) {
    soundManager.explosion();
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const s = speed * (0.5 + Math.random() * 0.5);
        particles.push(new Particle(
            x, y,
            Math.cos(angle) * s, Math.sin(angle) * s,
            life * (0.5 + Math.random() * 0.5),
            color,
            size * (0.5 + Math.random() * 0.5)
        ));
    }
}

// === 投射物 ===
class Projectile {
    constructor(owner, x, y, dirX, dirY, speed, damage, radius, color, type, onHit, pierce = false) {
        this.owner = owner;
        this.x = x; this.y = y;
        this.dirX = dirX; this.dirY = dirY;
        this.speed = speed;
        this.radius = radius;
        this.color = color;
        this.type = type; // 增加类型以区分特效
        this.onHit = onHit;
        this.active = true;
        this.pierce = pierce; // 是否穿透
        this.hitTargets = new Set(); // 记录已命中的目标，用于穿透类技能
    }

    update(dt) {
        if (!this.active) return;
        this.x += this.dirX * this.speed * dt;
        this.y += this.dirY * this.speed * dt;

        // 风墙阻挡检测
        for (let e of entities) {
            if (e instanceof Wall && e.owner !== this.owner) {
                // 简单的圆形和线段碰撞检测，风墙是一条线段
                const wx = e.x; const wy = e.y;
                const dist = Math.hypot(this.x - wx, this.y - wy);
                // 简化判断：如果投射物靠近风墙中心点，且方向与风墙法线相反
                if (dist < e.length / 2 + this.radius) {
                    this.active = false;
                    createExplosion(this.x, this.y, this.color, 5, 50, 0.3, 3);
                    return;
                }
            }
        }

        // 生成拖尾粒子特效
        if (Math.random() < 0.5) {
            if (this.type === 'fireball') {
                particles.push(new Particle(
                    this.x + (Math.random() - 0.5) * this.radius,
                    this.y + (Math.random() - 0.5) * this.radius,
                    -this.dirX * 50 + (Math.random() - 0.5) * 20,
                    -this.dirY * 50 + (Math.random() - 0.5) * 20,
                    0.5,
                    Math.random() < 0.5 ? '#e74c3c' : '#f39c12',
                    this.radius * (0.3 + Math.random() * 0.4)
                ));
            } else if (this.type === 'frostray') {
                particles.push(new Particle(
                    this.x + (Math.random() - 0.5) * this.radius,
                    this.y + (Math.random() - 0.5) * this.radius,
                    (Math.random() - 0.5) * 30,
                    (Math.random() - 0.5) * 30,
                    0.4,
                    '#bdc3c7',
                    this.radius * 0.2
                ));
            } else if (this.type === 'frostray') {
            // 冰霜射线核心
            ctx.strokeStyle = '#ecf0f1';
            ctx.lineCap = 'round';
            ctx.lineWidth = this.radius * 0.8;
            ctx.beginPath();
            ctx.moveTo(-this.dirX * this.radius * 1.5, -this.dirY * this.radius * 1.5);
            ctx.lineTo(this.dirX * this.radius * 1.5, this.dirY * this.radius * 1.5);
            ctx.stroke();
            
            // 外层光晕
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = this.radius * 1.5;
            ctx.globalAlpha = 0.5;
            ctx.stroke();
        } else if (this.type === 'stone') {
                if (Math.random() < 0.3) {
                    particles.push(new Particle(
                        this.x, this.y,
                        -this.dirX * 30 + (Math.random() - 0.5) * 10,
                        -this.dirY * 30 + (Math.random() - 0.5) * 10,
                        0.3,
                        '#95a5a6',
                        this.radius * 0.3
                    ));
                }
            }
        }

        // 边界销毁
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
            return;
        }

        // 碰撞检测
        const enemy = this.owner === p1 ? p2 : p1;
        const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
        if (dist < this.radius + enemy.radius) {
            if (!this.hitTargets.has(enemy)) {
                this.onHit(enemy);
                if (this.pierce) {
                    this.hitTargets.add(enemy);
                    // 旋风斩多段伤害，可以设置一个冷却或直接只命中一次
                } else {
                    this.active = false; // 命中销毁
                }
                
                // 命中特效
                if (this.type === 'fireball') {
                    createExplosion(this.x, this.y, '#e74c3c', 15, 100, 0.5, 5);
                } else if (this.type === 'frostray') {
                    createExplosion(this.x, this.y, '#3498db', 10, 80, 0.4, 4);
                } else if (this.type === 'stone') {
                    createExplosion(this.x, this.y, '#7f8c8d', 8, 60, 0.3, 6);
                } else if (this.type === 'windblade') {
                    createExplosion(this.x, this.y, '#1abc9c', 8, 120, 0.3, 3);
                } else if (this.type === 'whirlwind') {
                    createExplosion(this.x, this.y, '#16a085', 12, 80, 0.4, 4);
                }
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        
        if (this.type === 'fireball') {
            // 核心
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
            // 外焰
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'stone') {
            // 不规则石头
            ctx.fillStyle = this.color;
            const angle = Math.atan2(this.dirY, this.dirX);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(this.radius * 0.5, this.radius * 0.8);
            ctx.lineTo(-this.radius, this.radius * 0.5);
            ctx.lineTo(-this.radius * 0.8, -this.radius * 0.8);
            ctx.lineTo(this.radius * 0.3, -this.radius);
            ctx.closePath();
            ctx.fill();
            
            // 石头纹理
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-this.radius * 0.5, 0);
            ctx.lineTo(this.radius * 0.5, this.radius * 0.3);
            ctx.stroke();
        } else if (this.type === 'windblade') {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.radius, this.radius * 0.3, Math.atan2(this.dirY, this.dirX), 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'whirlwind') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            const time = performance.now() / 100;
            ctx.rotate(time);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 0.6, Math.PI, Math.PI * 2);
            ctx.stroke();
            
            // 内部旋转粒子
            if (Math.random() < 0.3) {
                particles.push(new Particle(
                    this.x + (Math.random() - 0.5) * this.radius,
                    this.y + (Math.random() - 0.5) * this.radius,
                    -this.dirY * 50, this.dirX * 50,
                    0.5, '#ecf0f1', 2
                ));
            }
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

// === 风墙 ===
class Wall {
    constructor(owner, x, y, dirX, dirY, length, duration, color) {
        this.owner = owner;
        this.x = x; this.y = y;
        // 风墙方向垂直于释放方向
        this.dx = -dirY; 
        this.dy = dirX;
        this.length = length;
        this.duration = duration;
        this.color = color;
        this.active = true;
    }

    update(dt) {
        if (!this.active) return;
        this.duration -= dt;
        if (this.duration <= 0) {
            this.active = false;
        }
        
        // 产生风的粒子效果
        if (Math.random() < 0.3) {
            const offset = (Math.random() - 0.5) * this.length;
            particles.push(new Particle(
                this.x + this.dx * offset,
                this.y + this.dy * offset,
                this.dy * 20, -this.dx * 20, // 向上飘动
                0.5, '#ecf0f1', 2
            ));
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 100) * 0.2; // 闪烁效果
        ctx.beginPath();
        ctx.moveTo(this.x - this.dx * this.length / 2, this.y - this.dy * this.length / 2);
        ctx.lineTo(this.x + this.dx * this.length / 2, this.y + this.dy * this.length / 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// === 范围效果 (AoE) ===
class AoE {
    constructor(owner, x, y, radius, delay, color, type, onHit) {
        this.owner = owner;
        this.x = x; this.y = y;
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
        
        // 预警阶段的粒子效果
        if (this.type === 'fireblast' && Math.random() < 0.2) {
            particles.push(new Particle(
                this.x + (Math.random() - 0.5) * this.radius * 2,
                this.y + (Math.random() - 0.5) * this.radius * 2,
                0, -20, 0.5, '#e67e22', 2
            ));
        } else if (this.type === 'waterprison' && Math.random() < 0.2) {
            particles.push(new Particle(
                this.x + (Math.random() - 0.5) * this.radius,
                this.y + (Math.random() - 0.5) * this.radius,
                0, -30, 0.6, '#ecf0f1', 3
            ));
        } else if (this.type === 'hurricane') {
            // 飓风预警风圈特效
            particles.push(new Particle(
                this.x + (Math.random() - 0.5) * this.radius * 1.5,
                this.y + (Math.random() - 0.5) * this.radius * 1.5,
                (Math.random() - 0.5) * 40, -40, 
                0.4, '#1abc9c', 2
            ));
        }

        if (this.timer >= this.delay) {
            // 爆发
            const enemy = this.owner === p1 ? p2 : p1;
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < this.radius + enemy.radius) {
                this.onHit(enemy);
            }
            this.active = false;
            
            // 爆发特效
            if (this.type === 'fireblast') {
                createExplosion(this.x, this.y, '#e74c3c', 30, 150, 0.8, 8);
                createExplosion(this.x, this.y, '#f1c40f', 20, 100, 0.6, 5);
            } else if (this.type === 'waterprison') {
                createExplosion(this.x, this.y, '#3498db', 20, 80, 0.5, 4);
            } else if (this.type === 'hurricane') {
                createExplosion(this.x, this.y, '#1abc9c', 40, 200, 0.8, 6);
                createExplosion(this.x, this.y, '#ecf0f1', 20, 150, 0.6, 4);
            } else if (this.type === 'meteor') {
                createExplosion(this.x, this.y, '#c0392b', 50, 250, 1.0, 10);
                createExplosion(this.x, this.y, '#e67e22', 30, 150, 0.8, 6);
            } else if (this.type === 'blizzard') {
                createExplosion(this.x, this.y, '#ecf0f1', 40, 120, 0.6, 5);
            } else if (this.type === 'earthspike') {
                createExplosion(this.x, this.y, '#f39c12', 10, 80, 0.4, 4);
            } else if (this.type === 'mudswamp') {
                createExplosion(this.x, this.y, '#7f8c8d', 20, 60, 0.8, 6);
            } else if (this.type === 'earthquake') {
                createExplosion(this.x, this.y, '#8e44ad', 40, 300, 1.0, 8);
                createExplosion(this.x, this.y, '#9b59b6', 20, 200, 0.8, 5);
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;
        
        if (this.type === 'fireblast') {
            // 绘制预警圈
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // 绘制填充进度
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.3 * (this.timer / this.delay);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'waterprison') {
            // 水牢上升效果
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            const currentRadius = this.radius * (this.timer / this.delay);
            ctx.ellipse(this.x, this.y + this.radius - currentRadius, currentRadius, currentRadius * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#bdc3c7';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (this.type === 'hurricane') {
            // 龙卷风预警圈
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // 龙卷风内部旋转动画
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate((performance.now() / 100) * 2);
            ctx.strokeStyle = 'rgba(26, 188, 156, 0.5)';
            ctx.lineWidth = 4;
            const currentRadius = this.radius * (this.timer / this.delay);
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius, 0, Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius * 0.5, Math.PI, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else if (this.type === 'meteor') {
            // 陨石预警，红圈逐渐变小
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.5;
            const currentRadius = this.radius * (1 - this.timer / this.delay);
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'blizzard') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // 暴风雪雪花旋转
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(performance.now() / 200);
            ctx.fillStyle = '#ecf0f1';
            for (let i=0; i<6; i++) {
                ctx.rotate(Math.PI * 2 / 6);
                ctx.beginPath();
                ctx.arc(this.radius * 0.6, 0, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else if (this.type === 'earthquake') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 5;
            ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 50) * 0.3; // 震动闪烁
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * (this.timer / this.delay), 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // 默认预警圈
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * (this.timer / this.delay), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }
}

// ================= 游戏主循环 =================
function startGame() {
    document.getElementById('selection-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    currentState = GameState.BATTLE;
    soundManager.start();
    
    p1 = new Player(configA, playerAClass);
    p2 = new Player(configB, playerBClass);
    
    p1.initUI();
    p2.initUI();
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameLoop(time) {
    if (currentState !== GameState.BATTLE) return;
    
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    p1.update(dt, p2);
    p2.update(dt, p1);

    // 更新所有实体
    entities.forEach(e => e.update(dt));
    // 清理失效实体
    entities = entities.filter(e => e.active);
    
    // 更新粒子
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => p.life > 0);
    
    // 胜负判定
    if (p1.hp <= 0 || p2.hp <= 0) {
        let winner = '';
        if (p1.hp <= 0 && p2.hp <= 0) winner = '平局';
        else if (p1.hp <= 0) winner = '玩家 B';
        else winner = '玩家 A';
        endGame(winner);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制地图中线
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width/2, 0);
    ctx.lineTo(canvas.width/2, canvas.height);
    ctx.stroke();

    p1.draw(ctx);
    p2.draw(ctx);
    entities.forEach(e => e.draw(ctx));
    particles.forEach(p => p.draw(ctx));
}

function endGame(winner) {
    currentState = GameState.END;
    soundManager.win();
    document.getElementById('game-screen').classList.add('hidden');
    const endScreen = document.getElementById('end-screen');
    endScreen.classList.remove('hidden');
    
    const winnerText = document.getElementById('winner-text');
    if (winner === '平局') {
        winnerText.innerText = '🤝 平局！';
        winnerText.style.color = '#ecf0f1';
    } else {
        winnerText.innerText = `🏆 ${winner} 获胜！`;
        winnerText.style.color = winner === '玩家 A' ? configA.color : configB.color;
    }
}
