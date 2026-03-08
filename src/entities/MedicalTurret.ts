import { Entity } from "./Entity";
import { Game } from "../game";
import { Bullet } from "./Bullet";
import { AudioManager } from "../audio/AudioManager";

export class MedicalTurret extends Entity {
    public hp: number;
    public maxHp: number;
    private fireTimer: number = 0;
    private fireRate: number = 2.0; // Shoots every 2.0s
    private healAmount: number = 20; // Heals 20 HP per shot
    private targetAngle: number = 0;
    private gunLength: number = 0.8;

    constructor(x: number, y: number) {
        super(x, y);
        this.maxHp = 100;
        this.hp = 100;
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

        // Aim at hero
        const hero = game.hero;
        if (hero && !hero.isDying) {
            this.targetAngle = Math.atan2(hero.y - this.y, hero.x - this.x);

            // Fire Healing Bullet
            if (this.fireTimer <= 0) {
                this.fireTimer = this.fireRate;
                AudioManager.playShoot(); // Maybe a distinct heal sound
                
                const tipX = this.x + Math.cos(this.targetAngle) * this.gunLength;
                const tipY = this.y + Math.sin(this.targetAngle) * this.gunLength;
                
                // Shoot towards hero
                const targetX = this.x + Math.cos(this.targetAngle) * 50;
                const targetY = this.y + Math.sin(this.targetAngle) * 50;

                // Healing bullet (negative damage = heal in Bullet class, or special handling)
                // We'll just pass negative damage to signify a heal
                const healingBullet = new Bullet(
                    tipX, tipY, targetX, targetY, 
                    0, // 0% crit chance
                    'pistol', // We'll modify bullet drawing later, or just use this for now
                    -this.healAmount, // Negative damage
                    10, // Slower bullet
                    50
                );
                healingBullet.isHealing = true; // Add a custom flag
                game.bullets.push(healingBullet);
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

        const strokeDark = () => {
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 0.04;
            ctx.stroke();
        };

        // 1. Base (Tripod style)
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 0.05;
        
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            const r = 0.7;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Plus symbol on base
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(-0.1, -0.4, 0.2, 0.8);
        ctx.fillRect(-0.4, -0.1, 0.8, 0.2);

        // 2. Rotating Gun Mount
        ctx.save();
        ctx.rotate(this.targetAngle);

        // Gun body
        ctx.fillStyle = '#00FF00'; // Green top 
        ctx.beginPath(); ctx.roundRect(-0.2, -0.25, 0.5, 0.5, 0.1); ctx.fill(); strokeDark();

        // Barrel (Thicker for healing)
        ctx.fillStyle = '#EAEAEA';
        ctx.beginPath(); ctx.roundRect(0.3, -0.15, 0.5, 0.3, 0.05); ctx.fill(); strokeDark();
        
        // Muzzle flare if firing
        if (this.fireTimer > this.fireRate - 0.05) {
            ctx.fillStyle = '#00FF00';
            ctx.beginPath(); ctx.arc(0.9, 0, 0.25, 0, Math.PI * 2); ctx.fill();
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
