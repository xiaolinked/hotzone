import { Enemy } from "./Enemy";

export class MiniEnemy extends Enemy {
    constructor(x: number, y: number) {
        super(x, y);
        this.maxHp = 10;
        this.hp = this.maxHp;
        this.maxShield = 0;
        this.shield = 0;
        this.speed = 2.5;
        this.radius = 0.4; // Reduced from 0.5
        this.color = '#FFA500'; // Orange

        // Arm bomb immediately
        if (this.bomb) {
            this.bomb.arm();
            this.bomb.timer = 2.0; // Short fuse
            this.bomb.damage = 15; // Even lower for minis
            this.bomb.radiusExplosion = 2.0;
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);

        // --- SPIDER-BOT: Neon glowing small CIRCLE ---
        const mainColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#5DADE2' : '#FFA500');
        const glowColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#AED6F1' : '#FFA500');
        const r = this.radius;

        // Rotate to face direction
        ctx.rotate(this.angle);

        // Outer glow
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Filled body
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = this.opacity * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = this.opacity;

        // Spiky legs (4 short lines)
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.02;
        const legAnim = Math.sin(Date.now() * 0.03) * 0.1;
        for (let i = 0; i < 4; i++) {
            const a = (Math.PI / 2) * i + Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            ctx.lineTo(Math.cos(a) * (r + 0.2 + legAnim), Math.sin(a) * (r + 0.2 + legAnim));
            ctx.stroke();
        }

        // Eye dot
        ctx.fillStyle = this.damageFlash > 0 ? '#FFF' : '#FF0000';
        ctx.beginPath();
        ctx.arc(r * 0.3, 0, 0.04, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        if (this.bomb && this.bomb.parent === this) {
            this.bomb.draw(ctx);
        }
    }
}
