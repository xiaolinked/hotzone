import { Entity } from "./Entity";
import { Game } from "../game";
import { BombState } from "./Bomb";
import { AudioManager } from "../audio/AudioManager";

export class Landmine extends Entity {
    private scalePhase: number = 0;
    private blinkTimer: number = 0;
    public triggerRadius: number = 2.0;

    constructor(x: number, y: number) {
        super(x, y);
    }

    update(dt: number, game: Game) {
        // Arming animation
        if (this.scalePhase < 1) {
            this.scalePhase = Math.min(1, this.scalePhase + dt * 2);
        }

        this.blinkTimer += dt;

        // Check for enemies
        if (this.scalePhase >= 1) {
            let triggered = false;
            for (const enemy of game.enemies) {
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                if (dx * dx + dy * dy < this.triggerRadius * this.triggerRadius) {
                    triggered = true;
                    break;
                }
            }

            if (triggered) {
                this.explode(game);
            }
        }
    }

    private explode(game: Game) {
        AudioManager.playExplosion();
        
        // Push an explosion effect
        // Utilizing the existing Bomb logic but instantly skipping to DEAD/Exploding
        const explosion = {
            x: this.x,
            y: this.y,
            state: BombState.DEAD, 
            radius: 4, // Large explosion radius
            fuseTimer: 0,
            animationTimer: 1.0, 
            isFadingOut: false,
            update: function(dt: number) { this.animationTimer -= dt; },
            draw: function(ctx: CanvasRenderingContext2D) {
                if (this.animationTimer > 0) {
                    ctx.save();
                    ctx.translate(this.x, this.y);
                    const p = 1.0 - this.animationTimer; 
                    const currentRadius = this.radius * p * 1.5;
                    ctx.fillStyle = `rgba(255, 100, 0, ${this.animationTimer})`;
                    ctx.beginPath();
                    ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        };

        // Deal Damage to all nearby enemies
        for (const enemy of game.enemies) {
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            if (dx * dx + dy * dy < explosion.radius * explosion.radius) {
                enemy.takeDamage(100); // Massive damage
            }
        }

        // We push this pseudo-bomb into the bombs array just for its draw effect
        game.bombs.push(explosion as any);

        // Remove the landmine
        const idx = game.mines.indexOf(this);
        if (idx !== -1) {
            game.mines.splice(idx, 1);
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        const scale = Math.sin(this.scalePhase * Math.PI / 2);
        ctx.scale(scale, scale);

        // Mine Body
        ctx.fillStyle = '#2A3026';
        ctx.beginPath();
        ctx.arc(0, 0, 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner rim
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 0.05;
        ctx.stroke();

        // Warning light (blinks)
        if (this.scalePhase >= 1) {
            const blinkRate = 1.0; 
            if (this.blinkTimer % blinkRate < 0.1) {
                ctx.fillStyle = '#FF0000';
                // Small glow
                ctx.shadowColor = '#FF0000';
                ctx.shadowBlur = 10;
            } else {
                ctx.fillStyle = '#440000';
                ctx.shadowBlur = 0;
            }
            ctx.beginPath();
            ctx.arc(0, 0, 0.15, 0, Math.PI * 2);
            ctx.fill();
        }

        // Pressure plates around outer edge
        ctx.fillStyle = '#4A5046';
        for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI / 2);
            ctx.fillRect(-0.08, -0.45, 0.16, 0.1);
            ctx.restore();
        }

        // Draw Trigger Radius faintly
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.arc(0, 0, this.triggerRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}
