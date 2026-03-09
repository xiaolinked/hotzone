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

export interface UpgradeOption {
    type: 'damage' | 'firerate' | 'multishot' | 'health' | 'stamina' | 'ammo' | 'regen' | 'armor' | 'crit' | 'weapon';
    name: string;
    description: string;
    cost: number;
    weaponId?: string;
}

// Weapon stat definitions
const WEAPON_STATS: { [id: string]: { damage: number, fireRate: number, range: number, magSize: number, reloadTime: number, spread: number, multishot: number, bulletSpeed: number } } = {
    pistol: { damage: 10, fireRate: 0.22, range: 25, magSize: 10, reloadTime: 0.8, spread: 0, multishot: 1, bulletSpeed: 25 },
    smg: { damage: 4, fireRate: 0.12, range: 15, magSize: 20, reloadTime: 1.0, spread: 0.08, multishot: 1, bulletSpeed: 28 },
    shotgun: { damage: 14, fireRate: 0.45, range: 12, magSize: 6, reloadTime: 1.4, spread: 0.12, multishot: 5, bulletSpeed: 22 },
    rifle: { damage: 25, fireRate: 0.35, range: 35, magSize: 8, reloadTime: 1.6, spread: 0, multishot: 1, bulletSpeed: 30 },
};

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
    public rerollCost: number = 20;
    public shopCooldown: number = 0;
    public shopScrollOffset: number = 0;
    
    public hitStopTimer: number = 0;

    public deathPauseTimer: number = 0;
    public deathHighlightTimer: number = 0;
    private isDeathSequenceStarted: boolean = false;

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
                const inResumeBtn = Math.abs(mx - cx) < 120 && Math.abs(my - (ch - 20)) < 25;
                const inIndexBtn = Math.abs(mx - cx) < 120 && Math.abs(my - (ch + 50)) < 25;

                if (inResumeBtn || isInPauseHUD) {
                    this.isPaused = false;
                    return;
                }
                if (inIndexBtn) {
                    this.waveManager.openIndex();
                    return;
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
        const config = ConfigManager.getConfig();
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
        this.deathPauseTimer = 0;
        this.deathHighlightTimer = 0;
        this.rerollCost = config.shop.reroll_base_cost;
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

    public addComboText(text: string, x: number, y: number) {
        this.combos.push({ x, y, text, timer: 1.0 });
    }

    private buyUpgrade(index: number) {
        const opt = this.currentShopOptions[index];
        if (!opt) return;

        const config = ConfigManager.getConfig();
        const wId = opt.weaponId || 'pistol';
        const isWeapon = opt.type === 'weapon';
        const isWeaponOwned = isWeapon && this.hero.ownedWeapons.includes(wId);

        if (isWeaponOwned || this.coinCount >= opt.cost) {
            // Deduct coins only if it's NOT a free weapon switch
            if (!isWeaponOwned) {
                this.coinCount -= opt.cost;
            }

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
                case 'crit':
                    this.hero.critChance = Math.min(1.0, this.hero.critChance + 0.02);
                    break;
                case 'weapon': {
                    const ws = WEAPON_STATS[wId];
                    if (ws) {
                        this.hero.equipWeapon(wId, ws);
                    }
                    break;
                }
            }

            // PER USER REQUEST:
            // Auto-refresh the shop immediately after any purchase!
            // We just regenerate the options so the player can buy endlessly
            this.generateUpgradeOptions();

            // MANUAL DEPLOY ONLY: Removed triggerNextPhase()
        } else {
            // This 'else' still applies to non-weapon upgrades or general cost check failure
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

                AudioManager.playDeath();
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

        if (this.waveManager.isShopOpen || this.waveManager.isReady || this.waveManager.isIndexOpen) {
            const mx = input.mouse.x;
            const my = input.mouse.y;
            const cx = window.innerWidth / 2;
            const h = window.innerHeight;
            const width = window.innerWidth;
            const height = window.innerHeight;

            // Handle Shop Scrolling
            if (this.waveManager.isShopOpen) {
                if (input.scrollDeltaY !== 0) {
                    this.shopScrollOffset -= input.scrollDeltaY * 0.5; // Scroll speed multiplier
                    input.scrollDeltaY = 0; // Consume scroll
                }

                // Temporary bounds check (we'll refine this later based on actual content height)
                const maxScroll = 0; // Top limit
                // Approximate bottom limit based on 6 items (2 rows max usually)
                const minScroll = -300; 

                if (this.shopScrollOffset > maxScroll) this.shopScrollOffset = maxScroll;
                // We'll allow a bit of overflow for now, renderer can handle the rest
                if (this.shopScrollOffset < minScroll) this.shopScrollOffset = minScroll;
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
                    
                    // Color Swatches Hit Detection
                    const colors = ['#FF3333', '#3388FF', '#33FF55', '#FFCC00', '#B833FF'];
                    const swatchSize = 40;
                    const swatchGap = 15;
                    const totalWidth = (colors.length * swatchSize) + ((colors.length - 1) * swatchGap);
                    const startX = cx - totalWidth / 2;
                    const swatchY = (h / 2) + 140;

                    let swatchClicked = false;
                    if (clickHappened) {
                        for (let i = 0; i < colors.length; i++) {
                            const x = startX + i * (swatchSize + swatchGap);
                            if (mx >= x && mx <= x + swatchSize && my >= swatchY && my <= swatchY + swatchSize) {
                                Hero.defaultHatColor = colors[i];
                                this.hero.hatColor = colors[i]; // Update immediately for preview
                                swatchClicked = true;
                                break;
                            }
                        }
                    }

                    if (isKeyboard || inStartBtn) {
                        this.waveManager.triggerNextPhase();
                        this.shopCooldown = config.ui.shop.cooldown_after_start;
                        input.keys['enter'] = false;
                        return;
                    }

                    if (!swatchClicked && inIndexBtn) {
                        this.waveManager.openIndex();
                        return;
                    }
                } else if (this.waveManager.isShopOpen && this.shopCooldown <= 0) {
                    const inButtonArea = Math.abs(mx - cx) < config.ui.shop.shop_button_width && Math.abs(my - config.ui.shop.shop_button_y) < config.ui.shop.shop_button_height;
                    // The deploy button doesn't scroll
                    if (isKeyboard || inButtonArea) {
                        this.waveManager.triggerNextPhase();
                        this.shopCooldown = config.ui.shop.cooldown_after_close;
                        this.shopScrollOffset = 0; // Reset scroll
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
                    // Apply scroll offset to hitboxes
                    let startY = config.ui.shop.card_start_y + this.shopScrollOffset;
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

                    const cardsPerRow = 3;
                    const totalWidth = (cardWidth * cardsPerRow) + (spacing * (cardsPerRow - 1));
                    const startX = cx - totalWidth / 2;
                    const optionsCount = this.currentShopOptions.length;

                    for (let i = 0; i < optionsCount; i++) {
                        const opt = this.currentShopOptions[i];
                        if (!opt) continue;

                        const row = Math.floor(i / cardsPerRow);
                        const col = i % cardsPerRow;

                        const x = startX + col * (cardWidth + spacing);
                        const y = startY + row * (cardHeight + spacing);

                        if (mx >= x && mx <= x + cardWidth && my >= y && my <= y + cardHeight) {
                            this.buyUpgrade(i);
                            return; // Success
                        }
                    }

                    // Reroll Hit Detection
                    const rowCount = Math.ceil(optionsCount / cardsPerRow);
                    const rerollBtnY = startY + rowCount * (cardHeight + spacing) - spacing + 30;
                    const inRerollBtn = Math.abs(mx - cx) < 100 && Math.abs(my - rerollBtnY) < 22;
                    if (inRerollBtn && this.coinCount >= this.rerollCost) {
                        this.rerollShop();
                        return;
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

        // Filter pool: only multishot if wave >= 5, filter owned weapons
        let filteredPool = pool;
        if (this.waveManager.currentWave < 5) {
            filteredPool = pool.filter(opt => opt.type !== 'multishot');
        }

        // Separate weapons and other upgrades
        let weapons = pool.filter(opt => opt.type === 'weapon');
        let otherUpgrades = filteredPool.filter(opt => opt.type !== 'weapon');

        // Shuffle other upgrades
        const shuffledOthers = [...otherUpgrades].sort(() => 0.5 - Math.random());

        let finalOptions: UpgradeOption[] = [];

        // Always include all weapons (first 3 slots)
        finalOptions.push(...weapons);

        // Fill the rest with random other upgrades
        while (finalOptions.length < config.shop.options_per_wave && shuffledOthers.length > 0) {
            finalOptions.push(shuffledOthers.shift()!);
        }

        // Scale price based on wave: starts at 50% for wave 1, increases by 30% each wave
        const priceFactor = 0.2 + (this.waveManager.currentWave * 0.3);

        this.currentShopOptions = finalOptions.map(opt => {
            const isWeapon = opt.type === 'weapon';
            return {
                ...opt,
                // Weapons ignore scaling
                cost: isWeapon ? opt.cost : Math.floor(opt.cost * priceFactor)
            };
        });

        // One item is always cheap: base 15-18 coins, +3 per wave
        // BUT it cannot be a weapon
        const nonWeaponIndices = this.currentShopOptions
            .map((opt, i) => opt && opt.type !== 'weapon' ? i : -1)
            .filter(i => i !== -1);

        if (nonWeaponIndices.length > 0) {
            const cheapIdx = nonWeaponIndices[Math.floor(Math.random() * nonWeaponIndices.length)];
            const baseCheap = 15 + Math.floor(Math.random() * 4); // 15-18
            const finalCheapCost = baseCheap + (this.waveManager.currentWave - 1) * 3;

            // Only apply if it's actually cheaper than current scaled cost
            if (finalCheapCost < this.currentShopOptions[cheapIdx].cost) {
                this.currentShopOptions[cheapIdx].cost = finalCheapCost;
            }
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

