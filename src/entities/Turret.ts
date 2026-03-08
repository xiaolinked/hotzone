import { Entity } from "./Entity";
import { Game } from "../game";
import { Bullet } from "./Bullet";
import { AudioManager } from "../audio/AudioManager";

export class Turret extends Entity {
    public hp: number;
    public maxHp: number;
    private fireTimer: number = 0;
    private fireRate: number = 0.5; // Shoots every 0.5s
    private range: number = 20;
    private damage: number = 15;
    private targetAngle: number = 0;
    private gunLength: number = 0.8;

    constructor(x: number, y: number) {
        super(x, y);
        this.maxHp = 100;
        this.hp = 100;
        // Plop down animation effect
        this.scalePhase = 0; 
    }

    private scalePhase: number;

    update(dt: number, game: Game) {
        // Entrance animation
        if (this.scalePhase < 1) {
            this.scalePhase = Math.min(1, this.scalePhase + dt * 4);
        }

        // Handle firing
        if (this.fireTimer > 0) {
            this.fireTimer -= dt;
        }

        // Find closest enemy
        let closestEnemy = null;
        let closestDistSq = Infinity;

        for (const enemy of game.enemies) {
            const distSq = (enemy.x - this.x) ** 2 + (enemy.y - this.y) ** 2;
            if (distSq < this.range ** 2 && distSq < closestDistSq) {
                closestDistSq = distSq;
                closestEnemy = enemy;
            }
        }

        if (closestEnemy) {
            // Aim at enemy
            this.targetAngle = Math.atan2(closestEnemy.y - this.y, closestEnemy.x - this.x);

            // Fire!
            if (this.fireTimer <= 0) {
                this.fireTimer = this.fireRate;
                AudioManager.playShoot(); // Maybe a unique turret sound later
                
                const tipX = this.x + Math.cos(this.targetAngle) * this.gunLength;
                const tipY = this.y + Math.sin(this.targetAngle) * this.range;
                
                // Shoot slightly past the enemy for the bullet trajectory
                const targetX = this.x + Math.cos(this.targetAngle) * this.range;
                const targetY = this.y + Math.sin(this.targetAngle) * this.range;

                game.bullets.push(new Bullet(
                    tipX, tipY, targetX, targetY, 
                    0, // 0% crit chance for now
                    'pistol', // Bullet appearance
                    this.damage, 
                    25, // Fast bullet speed
                    this.range
                ));
            }
        }
    }

    takeDamage(amount: number) {
        this.hp -= amount;
        if (this.hp <= 0) {
            // Destroyed
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Bouncy spawn animation
        const scale = Math.sin(this.scalePhase * Math.PI / 2) * 1.5;
        ctx.scale(scale, scale);

        // helper
        const strokeDark = () => {
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 0.04;
            ctx.stroke();
        };

        // 1. Base (Hexagon or Tripod)
        ctx.fillStyle = '#222';
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 0.05;
        
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            const r = 0.6;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Base center hub
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(0, 0, 0.4, 0, Math.PI * 2); ctx.fill();

        // 2. Rotating Gun Mount
        ctx.save();
        ctx.rotate(this.targetAngle);

        // Gun body
        ctx.fillStyle = '#EAEAEA'; // White/Grey top 
        ctx.beginPath(); ctx.roundRect(-0.2, -0.25, 0.5, 0.5, 0.1); ctx.fill(); strokeDark();

        // Barrel
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.roundRect(0.3, -0.08, 0.5, 0.16, 0.02); ctx.fill(); strokeDark();
        
        // Muzzle flare if firing
        if (this.fireTimer > this.fireRate - 0.05) {
            ctx.fillStyle = 'orange';
            ctx.beginPath(); ctx.arc(0.9, 0, 0.2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore(); // Restore from rotation

        // Draw Healthbar
        if (this.hp < this.maxHp) {
            ctx.save();
            ctx.translate(0, -1.2);
            const w = 1.0;
            const h = 0.15;
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(-w/2, -h/2, w * (this.hp / this.maxHp), h);
            ctx.restore();
        }

        ctx.restore(); // Final main restore
    }
}
