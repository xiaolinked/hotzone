import { ConfigManager } from "../config";
import { Game } from "../game";
import { Entity } from "./Entity";
import { Enemy } from "./Enemy";
import { AudioManager } from "../audio/AudioManager";
import { TankEnemy } from "./TankEnemy";
import { MiniEnemy } from "./MiniEnemy";

export enum BombState {
    IDLE,       // Passive on enemy back
    ARMED,      // Counting down on enemy back
    DETACHED,   // On ground (Dangerous)
    EXPLODING,  // Boom one frame
    DEAD        // To be removed
}

export class Bomb extends Entity {
    public state: BombState = BombState.IDLE;
    public parent: Enemy | null = null; // Who is carrying it

    // Timers
    public timer: number = 0;
    public flashTimer: number = 0;

    // Config values
    public radiusExplosion: number;
    public originalParent: Enemy | null = null;
    public damage: number;

    constructor(x: number, y: number, parent: Enemy | null = null) {
        super(x, y);
        this.parent = parent;
        this.radius = 0.35; // VISUAL SPEC: Radius 0.35
        this.color = '#8B1E1E';

        const config = ConfigManager.getConfig();
        this.radiusExplosion = config.bomb.explosion.radius;
        this.damage = config.bomb.explosion.max_damage;
    }

    public explosionDuration: number = ConfigManager.getConfig().bomb.explosion.visual_duration;
    private explosionTimer: number = 0;

    public update(dt: number, game: Game): void {
        const config = ConfigManager.getConfig();

        if (this.isFadingOut) {
            this.opacity -= dt * 0.8;
            if (this.opacity < 0) this.opacity = 0;
            return; // STOP LOGIC (don't explode, don't move)
        }

        // 0. Explosion Logic
        if (this.state === BombState.EXPLODING) {
            this.explosionTimer -= dt;
            if (this.explosionTimer <= 0) {
                this.state = BombState.DEAD;
            }
            return;
        }

        // 0. Contact Detonation (Instant) - If touching Hero
        if (this.state !== BombState.DEAD) {
            const distToHero = this.distanceTo(game.hero);
            // Hero ~0.5 + Bomb ~0.35 = 0.85 approx contact
            if (distToHero < 0.8) {
                this.explode(game);
                return;
            }
        }

        // 1. Position Logic
        if (this.parent) {
            // Stick to parent's back (offset)
            this.x = this.parent.x;
            this.y = this.parent.y;

            // IDLE -> ARMED check
            if (this.state === BombState.IDLE) {
                // Check dist to hero OR shield broken
                const dist = this.distanceTo(game.hero);
                if (dist < config.bomb.proximity_activation_distance || this.parent.shield <= 0) {
                    this.arm();
                }
            }

            // Check if parent dead -> Explode immediately
            if (this.parent.isDead) {
                this.explode(game);
            }
        }

        // 2. Timer Logic
        if (this.state === BombState.ARMED || this.state === BombState.DETACHED) {
            this.timer -= dt;

            // Pulse visual
            this.flashTimer += dt * config.ui.bomb_visuals.pulse_speed;

            if (this.timer <= 0) {
                this.explode(game);
            }
        }
    }

    public arm() {
        if (this.state === BombState.IDLE) {
            this.state = BombState.ARMED;
            this.timer = ConfigManager.getConfig().bomb.countdown_duration;
        }
    }

    public detach() {
        this.parent = null;
        this.state = BombState.DETACHED;
        if (this.timer <= 0) {
            this.timer = ConfigManager.getConfig().bomb.detached.lifetime;
        }
    }

    public explode(game: Game) {
        if (this.state === BombState.DEAD || this.state === BombState.EXPLODING) return;

        // Safety: don't damage player during wave completion or intermissions
        if (this.isFadingOut || !game.waveManager.isWaveActive) {
            this.state = BombState.DEAD; // Just kill it silently
            return;
        }

        const config = ConfigManager.getConfig();
        AudioManager.playExplosion();
        this.state = BombState.EXPLODING;
        this.explosionTimer = this.explosionDuration;

        const originalParent = this.parent;
        this.originalParent = originalParent; // For death clarity

        // SCORE LOGIC: Only counts if parent was damaged by player
        if (originalParent && originalParent.damagedByPlayer) {
            game.score++;
        }

        // Transfer to global bomb list to ensure rendering if parent dies
        if (this.parent) {
            this.parent.bomb = null; // Detach from parent
            // Kill the parent if the bomb explodes while still attached!
            this.parent.takeDamage(9999);
            this.parent = null;
            if (!game.bombs.includes(this)) {
                game.bombs.push(this); // Handover to Game loop
            }
        }

        // Deal Damage
        // 1. Hero
        const distHero = this.distanceTo(game.hero);
        if (distHero < this.radiusExplosion) {
            // Flat 20 damage as requested
            const actualDamage = this.damage;
            game.hero.takeDamage(actualDamage, this);
            game.hitStopTimer = config.ui.explosion.hit_stop;
        }

        // Screen shake
        game.renderer.triggerShake(config.bomb.explosion.screen_shake_intensity, config.ui.explosion.screen_shake_duration);

        // 2. Enemies (Chain Reaction)
        let currentChainKills = 0;
        for (const enemy of game.enemies) {
            if (originalParent === enemy) {
                enemy.takeDamage(9999);
                continue;
            }

            const dist = this.distanceTo(enemy);
            if (dist < this.radiusExplosion) {
                const pct = 1.0 - (dist / this.radiusExplosion);

                if (enemy.bomb && enemy.bomb.state !== BombState.EXPLODING && enemy.bomb.state !== BombState.DEAD) {
                    if (enemy instanceof TankEnemy) {
                        // Juggernaut: activate bomb at 50% countdown
                        enemy.bomb.arm();
                        enemy.bomb.timer = Math.min(enemy.bomb.timer, config.bomb.countdown_duration * 0.5);
                    } else {
                        // All other enemies: instant chain explosion
                        enemy.bomb.explode(game);
                    }
                }

                if (enemy.shield > 0) {
                    enemy.shield = 0;
                } else {
                    const actualDamage = Math.max(0, this.damage * pct);
                    enemy.takeDamage(actualDamage);
                    if (enemy.hp <= 0 && !(enemy instanceof MiniEnemy)) currentChainKills++;
                }
            }
        }

        // COMBO DISPLAY: If this killed multiple enemies in a chain
        if (currentChainKills > 1) {
            game.combos.push({
                x: this.x,
                y: this.y,
                text: `x${currentChainKills}`,
                timer: 1.0
            });
        }

        // 3. Detached Bombs (Chain Reaction)
        for (const otherBomb of game.bombs) {
            if (otherBomb === this || otherBomb.state === BombState.DEAD || otherBomb.state === BombState.EXPLODING) continue;
            if (this.distanceTo(otherBomb) < this.radiusExplosion) {
                // Instantly arm and set short timer
                otherBomb.timer = Math.min(otherBomb.timer, 0.02);
                if (otherBomb.state === BombState.IDLE) {
                    otherBomb.state = BombState.ARMED;
                }
            }
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        if (this.state === BombState.DEAD) return;

        ctx.save();
        if (this.state !== BombState.EXPLODING) {
            ctx.globalAlpha = this.opacity;
        }
        ctx.translate(this.x, this.y);

        if (this.state === BombState.EXPLODING) {
            const progress = 1.0 - (this.explosionTimer / this.explosionDuration);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentRadius = this.radiusExplosion * easeOut;

            ctx.save();
            ctx.globalCompositeOperation = 'screen';

            // 1. Central Core (Bright White/Yellow)
            const coreRadius = currentRadius * 0.4;
            const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
            coreGrad.addColorStop(0, '#FFFFFF');
            coreGrad.addColorStop(0.7, '#FFF2A8');
            coreGrad.addColorStop(1, 'rgba(255, 242, 168, 0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
            ctx.fill();

            // 2. Main Blast (Orange/Red)
            const blastGrad = ctx.createRadialGradient(0, 0, currentRadius * 0.2, 0, 0, currentRadius);
            blastGrad.addColorStop(0, '#FFD84D');
            blastGrad.addColorStop(0.4, '#FF9933');
            blastGrad.addColorStop(0.8, '#FF3B3B');
            blastGrad.addColorStop(1, 'rgba(255, 59, 59, 0)');

            ctx.fillStyle = blastGrad;
            ctx.globalAlpha = 1.0 - progress;
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
            ctx.fill();

            // 3. Shockwave Ring
            ctx.strokeStyle = `rgba(255, 255, 255, ${(1.0 - progress) * 0.5})`;
            ctx.lineWidth = 0.1 * (1.0 - progress);
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius * 1.1, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
            ctx.restore();
            return;
        }

        // Visuals
        // VISUAL SPEC: Unarmed #8B1E1E, Armed #FF3B3B
        if (this.state === BombState.ARMED || this.state === BombState.DETACHED) {
            // Pulsing
            const scale = 1.0 + Math.sin(this.flashTimer) * 0.2;
            ctx.scale(scale, scale);
            ctx.fillStyle = '#FF3B3B';
        } else {
            ctx.fillStyle = '#8B1E1E';
        }

        // VISUAL SPEC: Radius 0.35
        ctx.beginPath();
        ctx.arc(0, 0, 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Draw Fuse/Text
        // VISUAL SPEC: Text color: White, Text outline: Black
        if (this.timer > 0) {
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 0.05;
            ctx.font = 'bold 0.8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const txt = Math.ceil(this.timer).toString();
            ctx.strokeText(txt, 0, 0);
            ctx.fillText(txt, 0, 0);
        }

        ctx.restore();
    }
}
