import { Enemy } from "./Enemy";

export class FastEnemy extends Enemy {
    constructor(x: number, y: number) {
        super(x, y);

        // Stats Override (Fast & Fragile)
        this.maxHp = 10;
        this.hp = this.maxHp;

        this.maxShield = 1;
        this.shield = this.maxShield;

        this.speed = 8.0; // Fast but manageable
        this.chargeSpeed = 12.0; // Fast when armed
        this.shieldRadius = 1.4;

        this.color = '#FF3333'; // Bright Red
        this.radius = 0.6; // Reduced from 0.8

        // Reduced Bomb Damage
        if (this.bomb) {
            this.bomb.damage = 25; // Half of base damage
            this.bomb.radiusExplosion = 3.0; // Slightly smaller explosion too
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);

        // Shield
        if (this.shield > 0) {
            ctx.save();
            ctx.strokeStyle = '#4DFFF3';
            ctx.globalAlpha = 0.7 * this.opacity;
            ctx.lineWidth = 0.05;
            ctx.beginPath();
            ctx.arc(0, 0, this.shieldRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Rotate to face direction
        ctx.rotate(this.angle);

        // --- SCOUT: Neon glowing DIAMOND (sharp arrow) ---
        const mainColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#5DADE2' : '#FF3333');
        const glowColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#AED6F1' : '#FF3333');
        const r = this.radius;

        // Speed trail lines behind
        ctx.save();
        ctx.globalAlpha = 0.25 * this.opacity;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.03;
        for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.moveTo(-r * 0.6 - i * 0.2, -r * 0.15 * i);
            ctx.lineTo(-r * 0.6 - i * 0.2 - 0.3, -r * 0.15 * i);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-r * 0.6 - i * 0.2, r * 0.15 * i);
            ctx.lineTo(-r * 0.6 - i * 0.2 - 0.3, r * 0.15 * i);
            ctx.stroke();
        }
        ctx.restore();

        // Outer glow
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.moveTo(r * 1.2, 0);        // sharp nose (elongated)
        ctx.lineTo(0, -r * 0.45);
        ctx.lineTo(-r * 0.6, 0);
        ctx.lineTo(0, r * 0.45);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Filled body
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = this.opacity * 0.25;
        ctx.beginPath();
        ctx.moveTo(r * 1.2, 0);
        ctx.lineTo(0, -r * 0.45);
        ctx.lineTo(-r * 0.6, 0);
        ctx.lineTo(0, r * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = this.opacity;

        // Inner detail
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.03;
        ctx.beginPath();
        ctx.moveTo(r * 0.6, 0);
        ctx.lineTo(0, -r * 0.2);
        ctx.lineTo(-r * 0.3, 0);
        ctx.lineTo(0, r * 0.2);
        ctx.closePath();
        ctx.stroke();

        // Cyan eye
        ctx.fillStyle = this.damageFlash > 0 ? '#FFF' : '#00FFFF';
        ctx.beginPath();
        ctx.arc(r * 0.3, 0, 0.05, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Bomb
        if (this.bomb && this.bomb.parent === this) {
            this.bomb.draw(ctx);
        }
    }
}
