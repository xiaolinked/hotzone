import { Enemy } from "./Enemy";
import { Game } from "../game";
import { BombState } from "./Bomb";

export class BlinkerEnemy extends Enemy {
    private blinkTimer: number = 2.0;
    private blinkCooldown: number = 3.0;

    constructor(x: number, y: number) {
        super(x, y);
        this.color = '#A020F0'; // Purple
        this.speed = 1.2;
        this.radius = 0.7;
        this.shieldRadius = 1.5;
    }

    public update(dt: number, game: Game): void {
        super.update(dt, game);

        if (this.isDead || this.isFadingOut) return;

        // Only blink if bomb is NOT armed (or maybe only if it IS armed?)
        // Let's say they blink more aggressively when armed.
        const currentCooldown = (this.bomb && this.bomb.state === BombState.ARMED) ? 1.5 : this.blinkCooldown;

        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
            this.blink(game);
            this.blinkTimer = currentCooldown;
        }
    }

    private blink(game: Game) {
        const hero = game.hero;
        if (!hero) return;

        // Blink towards hero but keep some distance (or go behind?)
        const angle = Math.atan2(hero.y - this.y, hero.x - this.x);
        const blinkDist = 5.0;

        const newX = this.x + Math.cos(angle) * blinkDist;
        const newY = this.y + Math.sin(angle) * blinkDist;

        // Check if new position is valid (not inside obstacle?)
        // For simplicity, just blink. In the game loop checkObstacleCollision will push out.
        this.x = newX;
        this.y = newY;

        // Visual feedback for blink
        // Handle in draw or add a flash
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);

        // Glitch offset before blink
        if (this.blinkTimer < 0.3) {
            const glitchIntensity = (0.3 - this.blinkTimer) * 2;
            ctx.translate(
                (Math.random() - 0.5) * 0.3 * glitchIntensity,
                (Math.random() - 0.5) * 0.3 * glitchIntensity
            );
        }

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

        // Slow spin
        const spin = Date.now() * 0.001;
        ctx.rotate(spin);

        // --- PHANTOM: Neon glowing SQUARE ---
        const mainColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#5DADE2' : '#A020F0');
        const glowColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#AED6F1' : '#A020F0');
        const r = this.radius;

        // Flickering opacity when about to blink
        if (this.blinkTimer < 0.5) {
            ctx.globalAlpha = this.opacity * (0.3 + Math.sin(Date.now() * 0.05) * 0.3);
        }

        // Outer glow
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.06;
        ctx.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.restore();

        // Filled body
        ctx.fillStyle = mainColor;
        ctx.globalAlpha = (this.blinkTimer < 0.5 ? 0.15 : 0.25) * this.opacity;
        ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.globalAlpha = this.opacity;

        // Inner diamond
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.45);
        ctx.lineTo(r * 0.45, 0);
        ctx.lineTo(0, r * 0.45);
        ctx.lineTo(-r * 0.45, 0);
        ctx.closePath();
        ctx.stroke();

        // Center cross
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.02;
        ctx.globalAlpha = this.opacity * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.4);
        ctx.lineTo(0, r * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, 0);
        ctx.lineTo(r * 0.4, 0);
        ctx.stroke();
        ctx.globalAlpha = this.opacity;

        ctx.restore();

        // Bomb
        if (this.bomb && this.bomb.parent === this) {
            this.bomb.draw(ctx);
        }
    }
}
