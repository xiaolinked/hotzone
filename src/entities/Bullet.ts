import { Entity } from "./Entity";
import { Game } from "../game";
import { ConfigManager } from "../config";

export class Bullet extends Entity {
    private velocity: { x: number, y: number };
    public damage: number;
    private maxLifetime: number; // Range / Speed
    private lifetime: number = 0;
    private angle: number = 0;

    constructor(x: number, y: number, targetX: number, targetY: number) {
        super(x, y);
        const config = ConfigManager.getConfig();
        this.radius = 0.15;
        this.color = '#00FFFF';
        this.damage = config.blaster.bullet_damage;

        const speed = config.blaster.bullet_speed;
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.angle = Math.atan2(dy, dx);

        this.velocity = {
            x: (dx / dist) * speed,
            y: (dy / dist) * speed
        };

        // Lifetime = Range / Speed
        this.maxLifetime = config.blaster.bullet_range / speed;
    }

    public update(dt: number, game: Game): void {
        if (this.isFadingOut) {
            this.opacity -= dt * 0.8;
            if (this.opacity < 0) this.opacity = 0;
            return; // STOP LOGIC
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

        // Collision with Enemies
        for (const enemy of game.enemies) {
            if (this.distanceTo(enemy) < (this.radius + enemy.getCollisionRadius())) {
                enemy.takeDamage(this.damage, true);
                this.isDead = true;
                return;
            }
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Tracer trail (elongated glow behind bullet)
        const trailGrad = ctx.createLinearGradient(-0.6, 0, 0.1, 0);
        trailGrad.addColorStop(0, 'rgba(0, 255, 255, 0)');
        trailGrad.addColorStop(0.4, 'rgba(0, 200, 255, 0.15)');
        trailGrad.addColorStop(1, 'rgba(0, 255, 255, 0.4)');
        ctx.fillStyle = trailGrad;
        ctx.beginPath();
        ctx.ellipse(-0.2, 0, 0.45, 0.06, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bullet body (elongated capsule)
        const bodyGrad = ctx.createLinearGradient(-0.15, 0, 0.2, 0);
        bodyGrad.addColorStop(0, '#005577');
        bodyGrad.addColorStop(0.3, '#00CCEE');
        bodyGrad.addColorStop(0.7, '#88FFFF');
        bodyGrad.addColorStop(1, '#FFFFFF');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.18, 0.055, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hot tip (bright white point at front)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0.14, 0, 0.03, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
