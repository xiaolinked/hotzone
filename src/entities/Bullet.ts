import { Entity } from "./Entity";
import { Game } from "../game";
import { ConfigManager } from "../config";

export class Bullet extends Entity {
    private velocity: { x: number, y: number };
    public damage: number;
    private maxLifetime: number; // Range / Speed
    private lifetime: number = 0;
    public angle: number = 0;
    public isCrit: boolean = false;
    public weaponType: string = 'pistol';
    public isHealing: boolean = false;

    constructor(x: number, y: number, targetX: number, targetY: number, critChance: number = 0, weaponType: string = 'pistol', weaponDamage?: number, weaponSpeed?: number, weaponRange?: number) {
        super(x, y);
        const config = ConfigManager.getConfig();
        // Smaller base radius for all bullets
        this.radius = 0.1;
        this.weaponType = weaponType;
        this.damage = weaponDamage ?? config.blaster.bullet_damage;

        // Roll for crit
        if (critChance > 0 && Math.random() < critChance) {
            this.isCrit = true;
            this.damage *= 3;
        }

        const speed = weaponSpeed ?? config.blaster.bullet_speed;
        const range = weaponRange ?? config.blaster.bullet_range;
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.angle = Math.atan2(dy, dx);

        this.velocity = {
            x: (dx / dist) * speed,
            y: (dy / dist) * speed
        };

        // Lifetime = Range / Speed
        this.maxLifetime = range / speed;
    }

    public update(dt: number, game: Game): void {
        if (this.isFadingOut) {
            this.opacity -= dt * 0.8;
            if (this.opacity < 0) this.opacity = 0;
            return;
        }

        // Move
        this.x += this.velocity.x * dt;
        this.y += this.velocity.y * dt;

        // Lifetime
        this.lifetime += dt;
        if (this.lifetime >= this.maxLifetime) {
            this.isDead = true;
            return;
        }

        // Collision Check
        const collRadius = (this.weaponType === 'shotgun' ? 0.08 : 0.12);
        
        if (this.isHealing) {
            // Check collision with Hero
            if (this.distanceTo(game.hero) < (collRadius + game.hero.radius)) {
                // Heal the hero (negative damage is passed, or just use absolute value)
                const healAmt = Math.abs(this.damage);
                game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + healAmt);
                // Maybe a small green combo text
                game.addComboText(`+${healAmt}`, game.hero.x, game.hero.y - 1);
                this.isDead = true;
                return;
            }
        } else {
            // Collision with Enemies
            for (const enemy of game.enemies) {
                if (enemy.isFadingOut || enemy.isDead) continue;
                if (this.distanceTo(enemy) < (collRadius + enemy.getCollisionRadius())) {
                    enemy.takeDamage(this.damage, true);
                    this.isDead = true;
                    return;
                }
            }
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Global bullet scaling (smaller than before)
        const scale = this.weaponType === 'shotgun' ? 0.35 : 0.45;
        ctx.scale(scale, scale);

        if (this.weaponType === 'shotgun') {
            this.drawBuckshot(ctx);
        } else if (this.weaponType === 'rifle') {
            this.drawRifleBullet(ctx);
        } else {
            // Pistol/SMG
            this.drawRoundBullet(ctx);
        }

        ctx.restore();
    }

    private drawRoundBullet(ctx: CanvasRenderingContext2D): void {
        const glow = this.isCrit ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 200, 0, 0.2)';
        ctx.shadowBlur = 4;
        ctx.shadowColor = glow;

        const grad = ctx.createRadialGradient(-0.1, -0.1, 0, 0, 0, 0.5);
        if (this.isHealing) {
            grad.addColorStop(0, '#E0FFE0');
            grad.addColorStop(0.4, '#00FF00');
            grad.addColorStop(1, '#008800');
            ctx.shadowColor = 'rgba(0, 255, 0, 0.4)';
        } else if (this.isCrit) {
            grad.addColorStop(0, '#FFF');
            grad.addColorStop(0.4, '#00FFFF');
            grad.addColorStop(1, '#0088AA');
        } else {
            grad.addColorStop(0, '#FFF8E0');
            grad.addColorStop(0.4, '#FFD84D');
            grad.addColorStop(1, '#B8860B');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Reflection highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(-0.12, -0.12, 0.1, 0, Math.PI * 2);
        ctx.fill();
    }

    private drawBuckshot(ctx: CanvasRenderingContext2D): void {
        // Metallic grey/lead look
        const grad = ctx.createRadialGradient(-0.05, -0.05, 0, 0, 0, 0.3);
        grad.addColorStop(0, '#A0A0A0');
        grad.addColorStop(1, '#303030');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.05;
        ctx.stroke();
    }

    private drawRifleBullet(ctx: CanvasRenderingContext2D): void {
        // Pointy aerodynamic shape
        ctx.beginPath();
        ctx.moveTo(-0.6, -0.2);
        ctx.lineTo(0.2, -0.2);
        ctx.quadraticCurveTo(0.8, -0.15, 1.0, 0);
        ctx.quadraticCurveTo(0.8, 0.15, 0.2, 0.2);
        ctx.lineTo(-0.6, 0.2);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, -0.2, 0, 0.2);
        if (this.isCrit) {
            grad.addColorStop(0, '#E0FFFF');
            grad.addColorStop(0.5, '#00FFFF');
            grad.addColorStop(1, '#008B8B');
        } else {
            grad.addColorStop(0, '#FFD700');
            grad.addColorStop(0.5, '#DAA520');
            grad.addColorStop(1, '#8B4513');
        }

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.04;
        ctx.stroke();

        // Shine line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(-0.4, -0.1);
        ctx.lineTo(0.3, -0.1);
        ctx.stroke();
    }
}
