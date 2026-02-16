import { Hero } from './entities/Hero';
import { Enemy } from './entities/Enemy';
import { Bomb, BombState } from './entities/Bomb';
import { Bullet } from './entities/Bullet';
import { Renderer } from './renderer';
import { ConfigManager } from './config';
import { WaveManager } from './managers/WaveManager';
import { InputManager } from './input';
import { Coin } from './entities/Coin';
import { AudioManager } from './audio/AudioManager';
import { RICK_ROLL_NOTES } from './rickroll';

export interface UpgradeOption {
    type: 'damage' | 'firerate' | 'multishot' | 'health' | 'stamina' | 'ammo' | 'regen' | 'armor';
    name: string;
    description: string;
    cost: number;
}

export class Game {
    private lastTime: number = 0;
    public renderer: Renderer;
    private isRunning: boolean = false;

    public hero: Hero;
    public enemies: Enemy[] = [];
    public bombs: Bomb[] = [];
    public bullets: Bullet[] = [];
    public coins: Coin[] = [];
    private generatedChunks: Set<string> = new Set();

    public score: number = 0;
    public coinCount: number = 0;
    public combos: { x: number, y: number, text: string, timer: number }[] = [];
    public currentShopOptions: UpgradeOption[] = [];
    public rerollCost: number = 0;
    private previousShopTypes: string[] = [];

    private shopCooldown: number = 0;
    public hitStopTimer: number = 0;

    public deathPauseTimer: number = 0;
    public deathHighlightTimer: number = 0;
    private isDeathSequenceStarted: boolean = false;
    public isRickRolled: boolean = false;

    public waveManager: WaveManager;
    public isPaused: boolean = false;
    private pauseCooldown: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas);
        console.log("Game Initialized");

        this.hero = new Hero(0, 0);
        this.waveManager = new WaveManager(this);
        this.generateUpgradeOptions();
    }



    public togglePause() {
        this.isPaused = !this.isPaused;
    }



    public start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.update(time));
    }

    public update(time: number) {
        if (!this.isRunning) return;

        let dt = (time - this.lastTime) / 1000;
        if (dt > 0.1) dt = 0.1; // Cap dt to prevent physics glitches on large frame drops
        this.lastTime = time;

        const input = InputManager.getInstance();
        input.isJoystickDisabled = this.waveManager.isShopOpen || this.waveManager.isIndexOpen || this.waveManager.isStatsOpen;
        const clickHappened = input.isNewClick();

        if (this.pauseCooldown > 0) this.pauseCooldown -= dt;

        if ((input.keys['p'] || input.keys['escape']) && this.pauseCooldown <= 0) {
            this.togglePause();
            this.pauseCooldown = 0.3; // Cooldown to prevent multiple toggles from a single press
        }

        if (this.isPaused) {
            if (clickHappened) {
                const mx = input.mouse.x;
                const my = input.mouse.y;
                const width = window.innerWidth;
                const height = window.innerHeight;

                // Pause Button (HUD) - Top Right
                const isInPauseHUD = Math.abs(mx - (width - 80)) < 50 && Math.abs(my - 50) < 20;

                const cx = width / 2;
                const ch = height / 2;

                // Pause Menu Buttons
                const isResume = Math.abs(mx - cx) < 120 && Math.abs(my - (ch - 20)) < 25;
                const isIndex = Math.abs(mx - cx) < 120 && Math.abs(my - (ch + 50)) < 25;
                const isStats = Math.abs(mx - cx) < 120 && Math.abs(my - (ch + 120)) < 25;

                if (isInPauseHUD || isResume) {
                    this.togglePause();
                    this.pauseCooldown = 0.3;
                } else if (isIndex) {
                    this.waveManager.openIndex();
                } else if (isStats) {
                    this.waveManager.openStats();
                }
            }

            if (this.isPaused) {
                this.renderer.render(this);
                requestAnimationFrame((t) => this.update(t));
                return;
            }
        }

        if (clickHappened) {
            const mx = input.mouse.x;
            const my = input.mouse.y;
            const width = window.innerWidth;
            const isPauseBtn = Math.abs(mx - (width - 80)) < 50 && Math.abs(my - 50) < 20;
            if (isPauseBtn) {
                this.togglePause();
                this.pauseCooldown = 0.3;
            }
        }

        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= dt;
        } else if (this.deathPauseTimer > 0) {
            this.deathPauseTimer -= dt;
            for (const bomb of this.bombs) {
                // Update ALL bombs so chains can start and play out
                bomb.update(dt, this);
            }
            // Update Hero so the death animation plays during the slow motion/pause
            if (this.hero.isDying) {
                this.hero.update(dt, this);
            }
        } else {
            this.gameUpdate(dt, clickHappened); // Renamed original update to gameUpdate to avoid conflict
        }

        if (this.deathHighlightTimer > 0) {
            this.deathHighlightTimer -= dt;
        }

        this.renderer.render(this);
        requestAnimationFrame((t) => this.update(t));
    }

    public restart() {
        AudioManager.stopRickRoll();
        this.hero = new Hero(0, 0);
        this.enemies = [];
        this.bombs = [];
        this.bullets = [];
        this.coins = [];
        this.generatedChunks.clear();
        this.score = 0;
        this.coinCount = 0;
        this.waveManager = new WaveManager(this);
        this.isDeathSequenceStarted = false;
        this.isRickRolled = false;
        this.deathPauseTimer = 0;
        this.deathHighlightTimer = 0;
        this.rerollCost = 0;
        this.previousShopTypes = [];
        this.generateUpgradeOptions();
        console.log("Game Restarted");
    }

    public collectCoin(coin: Coin, index?: number) {
        coin.isDead = true;

        let idx = index;
        if (idx === undefined) {
            idx = this.coins.indexOf(coin);
        }

        if (idx !== undefined && idx >= 0) {
            this.coins.splice(idx, 1);
            const multiplier = coin.isLucky ? ConfigManager.getConfig().economy.coin.lucky_multiplier : 1;
            const gainedCoins = coin.value * multiplier;
            this.coinCount += gainedCoins;

            if (coin.isLucky) {
                AudioManager.playJackpot();
            } else {
                AudioManager.playCoin();
            }
        }
    }

    private buyUpgrade(index: number) {
        const opt = this.currentShopOptions[index];
        if (!opt) return;

        const config = ConfigManager.getConfig();
        if (this.coinCount >= opt.cost) {
            this.coinCount -= opt.cost;
            this.shopCooldown = config.ui.shop.cooldown_after_buy;
            AudioManager.playBuy();

            switch (opt.type) {
                case 'damage':
                    config.blaster.bullet_damage += config.blaster.upgrades.damage_increment;
                    break;
                case 'firerate':
                    config.blaster.fire_rate = Math.max(config.blaster.upgrades.min_fire_rate, config.blaster.fire_rate - config.blaster.upgrades.fire_rate_decrement);
                    break;
                case 'multishot':
                    this.hero.multishot += config.blaster.upgrades.multishot_increment;
                    break;
                case 'health':
                    this.hero.maxHp += config.hero.hp.upgrade_increment;
                    this.hero.hp = this.hero.maxHp;
                    break;
                case 'stamina':
                    this.hero.maxStamina += config.hero.stamina.upgrade_increment;
                    this.hero.stamina = this.hero.maxStamina;
                    break;
                case 'ammo':
                    this.hero.maxAmmo += 5;
                    this.hero.ammo = this.hero.maxAmmo;
                    break;
                case 'regen':
                    if (this.hero.hpRegen === 0) {
                        this.hero.hpRegen = 1.5;
                    } else {
                        this.hero.hpRegen += 1.5; // Fixed: increase by 1.5 consistently
                    }
                    break;
                case 'armor':
                    config.hero.armor.damage_reduction_percent = Math.min(0.9, config.hero.armor.damage_reduction_percent + 0.05);
                    break;
            }
            this.currentShopOptions[index] = null as any;

            // AS REQUESTED: IMMEDIATELY TRIGGER NEXT WAVE AFTER PURCHASE
            this.waveManager.triggerNextPhase();
        } else {
            this.shopCooldown = ConfigManager.getConfig().ui.shop.cooldown_after_buy;
        }
    }

    private gameUpdate(dt: number, clickHappened: boolean) {
        const config = ConfigManager.getConfig();
        if (this.shopCooldown > 0) this.shopCooldown -= dt;

        const input = InputManager.getInstance();

        // Update Combos
        for (let i = this.combos.length - 1; i >= 0; i--) {
            this.combos[i].timer -= dt;
            this.combos[i].y -= dt * 1.5; // Float up
            if (this.combos[i].timer <= 0) {
                this.combos.splice(i, 1);
            }
        }

        if (this.hero.isDead || this.hero.isDying) {
            if (!this.isDeathSequenceStarted) {
                this.isDeathSequenceStarted = true;
                this.deathPauseTimer = 3.0; // Keep managing input block
                this.deathHighlightTimer = config.ui.death.highlight_duration;

                // Create a dramatic explosion at hero's location
                const heroExplosion = new Bomb(this.hero.x, this.hero.y, null);
                // Manually set explosion radius and duration for hero for "wow" factor
                heroExplosion.radiusExplosion = 10.0;
                heroExplosion.explosionDuration = 1.5;
                this.bombs.push(heroExplosion);
                heroExplosion.explode(this);

                // --- NEW: TRIGGER ALL OTHER BOMBS TO EXPLODE INSTANTLY ---
                for (let i = this.enemies.length - 1; i >= 0; i--) {
                    const enemy = this.enemies[i];
                    if (enemy.bomb) {
                        const b = enemy.bomb;
                        // Force detach and explode
                        b.parent = null;
                        enemy.bomb = null;
                        this.bombs.push(b);
                        b.explode(this);
                    }
                }

                // Explode already detached bombs
                for (const bomb of this.bombs) {
                    if (bomb !== heroExplosion && bomb.state !== BombState.EXPLODING && bomb.state !== BombState.DEAD) {
                        bomb.explode(this);
                    }
                }

                // Violent Screen Effects
                this.renderer.triggerShake(1.5, 2.0);
                this.renderer.triggerDeathFlash();

                // ALWAYS Rick Roll
                if (Math.random() < 1.1) {
                    this.isRickRolled = true;
                    // Play the song after the explosion (1.5s delay)
                    setTimeout(() => AudioManager.playRickRollSequence(RICK_ROLL_NOTES), 1500);
                } else {
                    AudioManager.playDeath();
                }
            }

            if (clickHappened) {
                const mx = input.mouse.x;
                const my = input.mouse.y;
                const cx = window.innerWidth / 2;
                // Button was lowered to height/2 + 150
                const cy = window.innerHeight / 2 + 150;
                // Button width is 220, so half width is 110. Height is 60, half is 30.
                if (Math.abs(mx - cx) < 110 && Math.abs(my - cy) < 30) {
                    this.restart();
                    return;
                }
            }

            if (input.keys['enter']) this.restart();
            return;
        }

        if (this.waveManager.isShopOpen || this.waveManager.isReady || this.waveManager.isIndexOpen || this.waveManager.isStatsOpen) {
            const mx = input.mouse.x;
            const my = input.mouse.y;
            const cx = window.innerWidth / 2;
            const h = window.innerHeight;
            const width = window.innerWidth;
            const height = window.innerHeight;

            if (this.waveManager.isStatsOpen) {
                const inBackBtn = Math.abs(mx - cx) < 100 && Math.abs(my - (height - 80)) < 30;
                if ((clickHappened && inBackBtn) || input.keys['escape']) {
                    this.waveManager.triggerNextPhase();
                    return;
                }
                return;
            }

            if (this.waveManager.isIndexOpen) {
                const inCloseBtn = Math.abs(mx - (width - 100)) < 80 && Math.abs(my - (height - 50)) < 25;

                if ((clickHappened && inCloseBtn) || input.keys['escape']) {
                    this.waveManager.triggerNextPhase();
                    return;
                }
                return;
            }

            if (clickHappened || input.keys['enter']) {
                const isKeyboard = input.keys['enter'];

                if (this.waveManager.isReady) {
                    const inStartBtn = Math.abs(mx - cx) < 140 && Math.abs(my - (h / 2)) < 27.5;
                    const inIndexBtn = Math.abs(mx - cx) < 140 && Math.abs(my - (h / 2 + 70)) < 27.5;

                    if (isKeyboard || inStartBtn) {
                        this.waveManager.triggerNextPhase();
                        this.shopCooldown = config.ui.shop.cooldown_after_start;
                        input.keys['enter'] = false;
                        return;
                    }

                    if (inIndexBtn) {
                        this.waveManager.openIndex();
                        return;
                    }
                } else if (this.waveManager.isShopOpen && this.shopCooldown <= 0) {
                    const inButtonArea = Math.abs(mx - cx) < config.ui.shop.shop_button_width && Math.abs(my - config.ui.shop.shop_button_y) < config.ui.shop.shop_button_height;
                    if (isKeyboard || inButtonArea) {
                        this.waveManager.triggerNextPhase();
                        this.shopCooldown = config.ui.shop.cooldown_after_close;
                        input.keys['enter'] = false;
                        return;
                    }

                    // Reroll button hit detection
                    let cardWidth = config.ui.shop.card_width;
                    let cardHeight = config.ui.shop.card_height;
                    if (input.isTouchDevice) {
                        const availableWidth = Math.min(window.innerWidth - 20, 600);
                        cardWidth = Math.floor((availableWidth - 40) / 3);
                        if (cardWidth > 160) cardWidth = 160;
                        cardHeight = cardWidth * 1.4;
                    }
                    const rerollBtnY = config.ui.shop.card_start_y + cardHeight + 30;
                    const inRerollBtn = Math.abs(mx - cx) < 100 && Math.abs(my - rerollBtnY) < 22;
                    if (inRerollBtn && this.coinCount >= this.rerollCost) {
                        this.rerollShop();
                        return;
                    }
                }
            }

            if (this.waveManager.isShopOpen && this.shopCooldown <= 0) {
                const optionsPerWave = ConfigManager.getConfig().shop.options_per_wave;
                for (let i = 0; i < optionsPerWave; i++) {
                    const opt = this.currentShopOptions[i];
                    if (opt && input.keys[(i + 1).toString()]) {
                        this.buyUpgrade(i);
                    }
                }

                // Keyboard shortcut for reroll
                if (input.keys['r'] && this.coinCount >= this.rerollCost) {
                    input.keys['r'] = false;
                    this.rerollShop();
                }

                if (clickHappened) {
                    const mx = input.mouse.x;
                    const my = input.mouse.y;
                    const cx = window.innerWidth / 2;
                    let startY = config.ui.shop.card_start_y;
                    let cardWidth = config.ui.shop.card_width;
                    let cardHeight = config.ui.shop.card_height;
                    let spacing = config.ui.shop.card_spacing;

                    // SYNC WITH RENDERER: Mobile Sizing Logic
                    if (input.isTouchDevice) {
                        const totalSpacing = 20;
                        const availableWidth = Math.min(window.innerWidth - 20, 600);
                        cardWidth = Math.floor((availableWidth - totalSpacing * 2) / 3);
                        if (cardWidth > 160) cardWidth = 160;
                        cardHeight = cardWidth * 1.4;
                        spacing = 10;
                    }

                    const totalWidth = (cardWidth * optionsPerWave) + (spacing * (optionsPerWave - 1));
                    const startX = cx - totalWidth / 2;

                    for (let i = 0; i < optionsPerWave; i++) {
                        const opt = this.currentShopOptions[i];
                        if (!opt) continue;
                        const x = startX + i * (cardWidth + spacing);
                        const y = startY;
                        if (mx >= x && mx <= x + cardWidth && my >= y && my <= y + cardHeight) {
                            this.buyUpgrade(i);
                            break;
                        }
                    }
                }
            }
            return;
        }

        if (this.hero.isDying) {
            this.hero.update(dt, this);
            return;
        }

        this.waveManager.update(dt);

        if (this.waveManager.isWaveActive) {
            this.hero.update(dt, this);

            // Constrain Hero to Arena
            const halfWidth = config.arena.width / 2;
            const halfHeight = config.arena.height / 2;
            const margin = this.hero.radius;
            if (this.hero.x < -halfWidth + margin) this.hero.x = -halfWidth + margin;
            if (this.hero.x > halfWidth - margin) this.hero.x = halfWidth - margin;
            if (this.hero.y < -halfHeight + margin) this.hero.y = -halfHeight + margin;
            if (this.hero.y > halfHeight - margin) this.hero.y = halfHeight - margin;
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const dx = enemy.x - this.hero.x;
            const dy = enemy.y - this.hero.y;
            if (dx * dx + dy * dy > config.enemy.despawn_distance * config.enemy.despawn_distance) {
                this.enemies.splice(i, 1);
                continue;
            }

            enemy.update(dt, this);
            if (enemy.isDead) {
                enemy.onDeath(this);
                this.enemies.splice(i, 1);

                // Minis drop fewer coins (just 1)
                const isMini = enemy.constructor.name === 'MiniEnemy';
                const coinsDropped = isMini ? 1 : config.economy.coins_drop_base + Math.floor(Math.random() * (config.economy.coins_drop_random_variance + 1));
                for (let j = 0; j < coinsDropped; j++) {
                    const cx = enemy.x + (Math.random() - 0.5) * config.economy.coin.drop_spread;
                    const cy = enemy.y + (Math.random() - 0.5) * config.economy.coin.drop_spread;
                    const isLucky = Math.random() < config.economy.coin.lucky_chance;
                    this.coins.push(new Coin(cx, cy, 1, isLucky));
                }
            }
        }

        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            bomb.update(dt, this);
            if (bomb.state === BombState.DEAD) this.bombs.splice(i, 1);
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update(dt, this);

            if (bullet.isDead) this.bullets.splice(i, 1);
        }



        for (let i = this.coins.length - 1; i >= 0; i--) {
            const coin = this.coins[i];
            coin.update(dt, this);

            if (this.hero.distanceTo(coin) < ConfigManager.getConfig().economy.coin.pickup_distance) {
                this.collectCoin(coin);
                continue; // Coin is spliced in collectCoin
            }

            const dx = coin.x - this.hero.x;
            const dy = coin.y - this.hero.y;
            if (dx * dx + dy * dy > config.economy.coin.cleanup_distance * config.economy.coin.cleanup_distance) {
                this.coins.splice(i, 1);
            }
        }



        // Arena Boundary Cleanup
        const halfWidth = config.arena.width / 2;
        const halfHeight = config.arena.height / 2;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (Math.abs(enemy.x) > halfWidth || Math.abs(enemy.y) > halfHeight) {
                this.enemies.splice(i, 1);
            }
        }


    }

    public rerollShop() {
        const config = ConfigManager.getConfig();
        this.coinCount -= this.rerollCost;
        this.rerollCost += config.shop.reroll_cost_increase;
        this.shopCooldown = config.ui.shop.cooldown_after_buy;
        AudioManager.playBuy();
        this.generateUpgradeOptions();
    }

    public generateUpgradeOptions() {
        const config = ConfigManager.getConfig();
        const pool: UpgradeOption[] = config.shop.upgrades as UpgradeOption[];

        // Filter pool: only multishot if wave >= 5
        let filteredPool = pool;
        if (this.waveManager.currentWave < 5) {
            filteredPool = pool.filter(opt => opt.type !== 'multishot');
        }

        // Avoid showing the same set of types back-to-back
        let availablePool = filteredPool;
        if (this.previousShopTypes.length > 0) {
            const nonRepeat = filteredPool.filter(opt => !this.previousShopTypes.includes(opt.type));
            // Only use the filtered pool if we have enough options
            if (nonRepeat.length >= config.shop.options_per_wave) {
                availablePool = nonRepeat;
            }
        }

        const shuffled = [...availablePool].sort(() => 0.5 - Math.random());

        // Scale price based on wave: starts at 50% for wave 1, increases by 30% each wave
        const priceFactor = 0.2 + (this.waveManager.currentWave * 0.3);

        this.currentShopOptions = shuffled.slice(0, config.shop.options_per_wave).map(opt => ({
            ...opt,
            cost: Math.floor(opt.cost * priceFactor)
        }));

        // Save current types for next reroll's duplicate prevention
        this.previousShopTypes = this.currentShopOptions.map(opt => opt.type);

        // One item is always cheap: base 15-18 coins, +3 per wave
        if (this.currentShopOptions.length > 0) {
            const cheapIdx = Math.floor(Math.random() * this.currentShopOptions.length);
            const baseCheap = 15 + Math.floor(Math.random() * 4); // 15-18
            this.currentShopOptions[cheapIdx].cost = baseCheap + (this.waveManager.currentWave - 1) * 3;
        }
    }

    public getEntities() {
        return {
            hero: this.hero,
            enemies: this.enemies,
            bombs: this.bombs,
            bullets: this.bullets,
            coins: this.coins
        };
    }
}

