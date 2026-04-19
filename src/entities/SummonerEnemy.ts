import { Enemy } from "./Enemy";
import { Game } from "../game";
import { MiniEnemy } from "./MiniEnemy";

export class SummonerEnemy extends Enemy {
    private spawnTimer: number = 0;
    
    constructor(x: number, y: number) {
        super(x, y);
        this.maxHp = 60; // High health
        this.hp = this.maxHp;
        this.maxShield = 15;
        this.shield = this.maxShield;
        this.speed = 2.0; // Slow
        this.radius = 1.2;
        this.color = '#8A2BE2'; // Blue Violet
        this.shieldRadius = 2.0;

        // Summoner has no bomb, stays far and summons
        this.bomb = null; 
    }

    public update(dt: number, game: Game): void {
        // Handle damage flash, fading, and freezing
        if (this.damageFlash > 0) this.damageFlash -= dt;

        if (this.isFadingOut) {
            this.opacity -= dt * 0.8;
            if (this.opacity < 0) this.opacity = 0;
            return; 
        }

        if (this.freezeTimer > 0) {
            this.freezeTimer -= dt;
            return;
        }

        const hero = game.hero;
        if (!hero) return;

        // AI logic override: maintain distance
        const dx = hero.x - this.x;
        const dy = hero.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Override angle to face player
        this.angle = Math.atan2(dy, dx);

        // Move away from player if too close, or move randomly
        if (dist < 15) {
            this.x -= (dx / dist) * this.speed * dt;
            this.y -= (dy / dist) * this.speed * dt;
        } else if (dist > 25) {
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
        } else {
            // Circle strafe slowly
            this.x += Math.cos(this.angle + Math.PI / 2) * this.speed * 0.5 * dt;
            this.y += Math.sin(this.angle + Math.PI / 2) * this.speed * 0.5 * dt;
        }

        // General arena bounds check to prevent floating away
        const halfWidth = 30; // approx
        const halfHeight = 20; // approx
        if (this.x < -halfWidth) this.x = -halfWidth;
        if (this.x > halfWidth) this.x = halfWidth;
        if (this.y < -halfHeight) this.y = -halfHeight;
        if (this.y > halfHeight) this.y = halfHeight;

        // Spawning logic
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnTimer = 4.0; // Spawn every 4 seconds
            
            // Spawn 2 MiniEnemies
            for (let i = 0; i < 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                const spawnX = this.x + Math.cos(angle) * this.radius * 1.5;
                const spawnY = this.y + Math.sin(angle) * this.radius * 1.5;
                
                const mini = new MiniEnemy(spawnX, spawnY);
                // Make the spawned minis scale correctly
                game.enemies.push(mini);
            }
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);

        // Shield Aura
        if (this.shield > 0) {
            const pulse = (Math.sin(Date.now() * 0.01) + 1) / 2;
            ctx.save();
            ctx.strokeStyle = '#4DFFF3';
            ctx.globalAlpha = (0.5 + pulse * 0.3) * this.opacity;
            ctx.lineWidth = 0.08;
            ctx.beginPath();
            ctx.arc(0, 0, this.shieldRadius + pulse * 0.2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(77, 255, 243, 0.05)';
            ctx.fill();
            ctx.restore();
        }

        ctx.rotate(this.angle);

        // Drawing a Summoner structure (Star shape)
        const mainColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#5DADE2' : '#8A2BE2');
        const glowColor = this.damageFlash > 0 ? '#FFFFFF' : (this.freezeTimer > 0 ? '#AED6F1' : '#8A2BE2');
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 0.08;

        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI) / 5;
            const px = Math.cos(angle) * this.radius;
            const py = Math.sin(angle) * this.radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
            
            const innerAngle = angle + Math.PI / 5;
            const ix = Math.cos(innerAngle) * this.radius * 0.4;
            const iy = Math.sin(innerAngle) * this.radius * 0.4;
            ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = 'rgba(138, 43, 226, 0.2)';
        ctx.fill();

        // Pulsing core (represents spawning)
        const corePulse = (Math.sin(Date.now() * 0.005) + 1) / 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.3 + corePulse * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
