import { Game } from "../game";
import { ConfigManager } from "../config";
import { Enemy } from "../entities/Enemy";
import { FastEnemy } from "../entities/FastEnemy";
import { TankEnemy } from "../entities/TankEnemy";
import { BlinkerEnemy } from "../entities/BlinkerEnemy";
import { SplitterEnemy } from "../entities/SplitterEnemy";
import { SummonerEnemy } from "../entities/SummonerEnemy";

export enum WaveState {
    READY,      // Before Wave 1
    COUNTDOWN,  // 3..2..1 before wave
    WAVE,       // Playing
    WAVE_COMPLETE, // 2s pause with message
    SHOP,        // Intermission
    INDEX,        // Enemy Encyclopedia
    STATS         // Stats Overview
}

export interface SpawnTelegraph {
    x: number;
    y: number;
    timer: number;
    maxTimer: number;
}

export class WaveManager {
    private game: Game;
    public currentWave: number = 0;
    public activeTelegraphs: SpawnTelegraph[] = [];

    public state: WaveState = WaveState.READY;
    public stateTimer: number = 0; // Generic timer for countdown/wave

    private spawnTimer: number = 0;

    constructor(game: Game) {
        this.game = game;
    }

    public update(dt: number) {
        switch (this.state) {
            case WaveState.READY:
                // Wait for external Space input
                break;
            case WaveState.COUNTDOWN:
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    this.startWave();
                }
                break;
            case WaveState.WAVE:
                this.stateTimer -= dt; // Wave Duration
                if (this.stateTimer <= 0) {
                    this.endWave();
                } else {
                    this.handleSpawning(dt);
                    this.updateTelegraphs(dt);
                }
                break;
            case WaveState.WAVE_COMPLETE:
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    this.openShop();
                }
                break;
            case WaveState.SHOP:
                // Wait for external Space input
                break;
            case WaveState.INDEX:
                // Wait for external Space input
                break;
        }
    }

    // Called by Game.ts on Space
    public openIndex() {
        if (this.state === WaveState.READY || this.state === WaveState.WAVE || this.game.isPaused) {
            this.state = WaveState.INDEX;
        }
    }

    public openStats() {
        if (this.state === WaveState.READY || this.state === WaveState.WAVE || this.game.isPaused) {
            this.state = WaveState.STATS;
        }
    }

    public triggerNextPhase() {
        if (this.state === WaveState.INDEX || this.state === WaveState.STATS) {
            if (this.currentWave === 0) {
                this.state = WaveState.READY;
            } else {
                this.state = WaveState.WAVE;
            }
            return;
        }

        if (this.state === WaveState.READY) {
            this.startCountdown();
        } else if (this.state === WaveState.SHOP) {
            this.startCountdown();
        }
    }

    private startCountdown() {
        this.state = WaveState.COUNTDOWN;
        this.stateTimer = ConfigManager.getConfig().game_flow.inter_wave_pause_time;
        console.log("Countdown Started");
    }

    private startWave() {
        this.currentWave++;
        this.state = WaveState.WAVE;
        const config = ConfigManager.getConfig();

        // Duration: Linear increase
        this.stateTimer = config.game_flow.wave_base_duration + (this.currentWave - 1) * config.game_flow.wave_duration_growth;

        console.log(`Wave ${this.currentWave} Started! Duration: ${this.stateTimer.toFixed(1)}s`);
    }

    private endWave() {
        this.state = WaveState.WAVE_COMPLETE;
        this.stateTimer = 2.0;
        console.log("Wave Ended! Fading out...");

        // Trigger Fade Out
        this.game.enemies.forEach(e => {
            e.isFadingOut = true;
            if (e.bomb) e.bomb.isFadingOut = true;
        });
        this.game.coins.forEach(c => c.isFadingOut = true);
        this.game.bombs.forEach(b => b.isFadingOut = true);
        this.game.bullets.forEach(b => b.isFadingOut = true); // Fade bullets
        this.activeTelegraphs = [];
    }

    private openShop() {
        this.state = WaveState.SHOP;
        console.log("Shop Open.");

        // AS REQUESTED: Auto-Center Hero, Refill HP/Stamina/Ammo
        this.game.hero.x = 0;
        this.game.hero.y = 0;
        this.game.hero.hp = this.game.hero.maxHp;
        this.game.hero.stamina = this.game.hero.maxStamina;
        this.game.hero.ammo = this.game.hero.maxAmmo;
        this.game.hero.reloadTimer = 0;

        console.log("Hero Position Reset & Resources Restored.");

        // Clear Enemies, Bombs, Coins, and Telegraphs
        this.game.enemies = [];
        this.game.bombs = [];
        this.game.coins = [];
        this.game.bullets = []; // Clear bullets
        this.activeTelegraphs = [];

        this.game.generateUpgradeOptions();
        this.game.rerollCost = ConfigManager.getConfig().shop.reroll_base_cost;
    }

    private handleSpawning(dt: number) {
        const config = ConfigManager.getConfig();
        const hero = this.game.hero;
        if (!hero) return;

        // 1. Difficulty Scaling for Spawning
        // Waves 1-5 are "way easier" with strict limits and slow spawns
        let maxOnScreen = 15;
        let spawnDelay = config.enemy.spawn.spawn_delay; // Default 0.5

        if (this.currentWave <= 5) {
            // Wave 1: 5 on screen, 2.5s delay
            // Wave 5: 12 on screen, 0.7s delay
            const progress = (this.currentWave - 1) / 4; // 0 to 1
            maxOnScreen = Math.floor(5 + progress * 7);
            spawnDelay = 2.5 - (progress * 1.8);
        } else if (this.currentWave <= 10) {
            // Waves 6-10: Gradual ramp (transition zone)
            const progress = (this.currentWave - 5) / 5; // 0 to 1
            maxOnScreen = Math.floor(13 + progress * 9);  // 13 -> 22
            spawnDelay = 1.2 - (progress * 0.6);           // 1.2s -> 0.6s
        } else {
            // Wave 11+: Full chaos (capped at 60 for performance)
            maxOnScreen = Math.min(60, 22 + (this.currentWave - 10) * 3);
            spawnDelay = config.enemy.spawn.spawn_delay;
        }

        // 2. Count On-Screen Enemies
        // We use viewport bounds + small margin (padding)
        const halfWidth = (window.innerWidth / 2) / 20;
        const halfHeight = (window.innerHeight / 2) / 20;
        const padding = 2.0;

        let onScreenCount = 0;
        for (const enemy of this.game.enemies) {
            if (enemy.isFadingOut) continue;
            const dx = Math.abs(enemy.x - hero.x);
            const dy = Math.abs(enemy.y - hero.y);
            if (dx < halfWidth + padding && dy < halfHeight + padding) {
                onScreenCount++;
            }
        }

        // Count telegraphs too (potential soon-to-be enemies)
        for (const t of this.activeTelegraphs) {
            const dx = Math.abs(t.x - hero.x);
            const dy = Math.abs(t.y - hero.y);
            if (dx < halfWidth + padding && dy < halfHeight + padding) {
                onScreenCount++;
            }
        }

        // 3. Spawning
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && onScreenCount < maxOnScreen) {
            this.queueTelegraph();
            this.spawnTimer = spawnDelay;
        }
    }

    private updateTelegraphs(dt: number) {
        for (let i = this.activeTelegraphs.length - 1; i >= 0; i--) {
            const t = this.activeTelegraphs[i];
            t.timer -= dt;
            if (t.timer <= 0) {
                this.spawnEnemyAt(t.x, t.y);
                this.activeTelegraphs.splice(i, 1);
            }
        }
    }

    private queueTelegraph() {
        const config = ConfigManager.getConfig();
        const angle = Math.random() * Math.PI * 2;
        const dist = config.enemy.spawn.min_distance_from_hero + Math.random() * (config.enemy.spawn.max_distance_from_hero - config.enemy.spawn.min_distance_from_hero);

        let x = this.game.hero.x + Math.cos(angle) * dist;
        let y = this.game.hero.y + Math.sin(angle) * dist;

        // Clamp to Arena
        const halfWidth = config.arena.width / 2 - 2;
        const halfHeight = config.arena.height / 2 - 2;
        x = Math.max(-halfWidth, Math.min(halfWidth, x));
        y = Math.max(-halfHeight, Math.min(halfHeight, y));

        this.activeTelegraphs.push({
            x, y,
            timer: config.enemy.spawn.telegraph_duration,
            maxTimer: config.enemy.spawn.telegraph_duration
        });
    }

    private spawnEnemyAt(x: number, y: number) {
        const config = ConfigManager.getConfig();
        const rand = Math.random();
        let enemy: Enemy;

        // Test Mode: Randomize all enemies regardless of wave
        if (rand < 0.16) {
            enemy = new TankEnemy(x, y);
        } else if (rand < 0.32) {
            enemy = new SummonerEnemy(x, y);
        } else if (rand < 0.48) {
            enemy = new FastEnemy(x, y);
        } else if (rand < 0.64) {
            enemy = new BlinkerEnemy(x, y);
        } else if (rand < 0.8) {
            enemy = new SplitterEnemy(x, y);
        } else {
            enemy = new Enemy(x, y);
        }

        // Apply Wave Scaling
        if (this.currentWave > 1) {
            const hpMult = Math.pow(config.enemy.scaling.hp_per_wave, this.currentWave - 1);
            const shieldMult = Math.pow(config.enemy.scaling.shield_per_wave, this.currentWave - 1);

            enemy.maxHp *= hpMult;
            enemy.hp = enemy.maxHp;
            enemy.maxShield *= shieldMult;
            enemy.shield = enemy.maxShield;
        }

        this.game.enemies.push(enemy);
    }

    // Helpers for other classes
    public get isWaveActive(): boolean {
        return this.state === WaveState.WAVE;
    }

    public get isWaveComplete(): boolean {
        return this.state === WaveState.WAVE_COMPLETE;
    }

    public get isShopOpen(): boolean {
        return this.state === WaveState.SHOP;
    }
    public get isIndexOpen(): boolean {
        return this.state === WaveState.INDEX;
    }

    public get isStatsOpen(): boolean {
        return this.state === WaveState.STATS;
    }

    public get isCountdown(): boolean {
        return this.state === WaveState.COUNTDOWN;
    }

    public get isReady(): boolean {
        return this.state === WaveState.READY;
    }
}
