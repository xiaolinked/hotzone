import { Enemy } from "./Enemy";

export class TankEnemy extends Enemy {
    constructor(x: number, y: number) {
        super(x, y);

        // Stats Override (Slow & Tanky)
        this.maxHp = 200;
        this.hp = this.maxHp;

        this.maxShield = 150;
        this.shield = this.maxShield;

        this.speed = 0.8; // Slow plodding
        this.color = '#2E8B57'; // Sea Green
        this.radius = 1.1;
        this.shieldRadius = 2.2;
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
            ctx.lineWidth = 0.1;
            ctx.beginPath();
            ctx.arc(0, 0, this.shieldRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Slow rotation for menacing feel
        const slowSpin = Date.now() * 0.0005;
        ctx.rotate(slowSpin);

        // --- JUGGERNAUT: Neon glowing HEXAGON ---
        const mainColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#5DADE2' : '#2ECC71');
        const glowColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#AED6F1' : '#2ECC71');
        const r = this.radius;

        // Draw hexagon helper
        const drawHex = (size: number) => {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 6;
                const px = Math.cos(a) * size;
                const py = Math.sin(a) * size;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        };

        // Outer glow
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.1;
        drawHex(r);
        ctx.stroke();
        ctx.restore();

        // Filled body
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = this.opacity * 0.2;
        drawHex(r);
        ctx.fill();
        ctx.globalAlpha = this.opacity;

        // Inner hexagon ring
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.05;
        drawHex(r * 0.6);
        ctx.stroke();

        // Center dot (pulsing)
        const pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.5;
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = this.opacity * pulse;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = this.opacity;

        // Cross lines connecting hex vertices (armor feel)
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.03;
        ctx.globalAlpha = this.opacity * 0.4;
        for (let i = 0; i < 3; i++) {
            const a1 = (Math.PI / 3) * i - Math.PI / 6;
            const a2 = a1 + Math.PI;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a1) * r * 0.6, Math.sin(a1) * r * 0.6);
            ctx.lineTo(Math.cos(a2) * r * 0.6, Math.sin(a2) * r * 0.6);
            ctx.stroke();
        }
        ctx.globalAlpha = this.opacity;

        ctx.restore();

        // Bomb
        if (this.bomb && this.bomb.parent === this) {
            this.bomb.draw(ctx);
        }
    }
}
