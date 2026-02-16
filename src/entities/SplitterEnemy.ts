import { Enemy } from "./Enemy";
import { MiniEnemy } from "./MiniEnemy";
import { Game } from "../game";

export class SplitterEnemy extends Enemy {
    constructor(x: number, y: number) {
        super(x, y);
        this.color = '#FF69B4'; // Hot Pink
        this.maxHp = 80;
        this.hp = this.maxHp;
        this.speed = 1.0;
        this.radius = 0.8;
        this.shieldRadius = 1.8;
    }

    public onDeath(game: Game): void {
        // Spawn 3 MiniEnemies
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 / 3) * i;
            const dist = 0.5;
            const mx = this.x + Math.cos(angle) * dist;
            const my = this.y + Math.sin(angle) * dist;
            game.enemies.push(new MiniEnemy(mx, my));
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
            ctx.lineWidth = 0.06;
            ctx.beginPath();
            ctx.arc(0, 0, this.shieldRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Slow spin
        const spin = Date.now() * 0.0008;
        ctx.rotate(spin);

        // --- HIVE MOTHER: Neon glowing OCTAGON ---
        const mainColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#5DADE2' : '#FF69B4');
        const glowColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#AED6F1' : '#FF69B4');
        const r = this.radius;

        // Draw octagon helper
        const drawOct = (size: number) => {
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI / 4) * i;
                const px = Math.cos(a) * size;
                const py = Math.sin(a) * size;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        };

        // Outer glow
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.07;
        drawOct(r);
        ctx.stroke();
        ctx.restore();

        // Filled body
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = this.opacity * 0.2;
        drawOct(r);
        ctx.fill();
        ctx.globalAlpha = this.opacity;

        // Inner octagon
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.04;
        drawOct(r * 0.55);
        ctx.stroke();

        // 3 internal segments (show it will split into 3)
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.03;
        ctx.globalAlpha = this.opacity * 0.5;
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 / 3) * i;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
            ctx.stroke();
        }
        ctx.globalAlpha = this.opacity;

        // 3 small dots at segment ends (mini preview)
        ctx.fillStyle = '#FFA500';
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 / 3) * i;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, 0.06, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        if (this.bomb && this.bomb.parent === this) {
            this.bomb.draw(ctx);
        }
    }
}
