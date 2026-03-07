import { ConfigManager } from "../config";
import { Game } from "../game";
import { InputManager } from "../input";
import { Entity } from "./Entity";
import { Bullet } from "./Bullet";
import { Bomb } from "./Bomb";
import { AudioManager } from "../audio/AudioManager";

export interface DeathClarityInfo {
    explosionX: number;
    explosionY: number;
    bombId: string;
    radius: number;
    enemyInfo?: {
        x: number,
        y: number,
        angle: number
    };
    isDetached: boolean;
}

export class Hero extends Entity {
    public hp: number;
    public maxHp: number;
    public killingBlow: DeathClarityInfo | null = null;

    public stamina: number;
    public maxStamina: number;
    private staminaRegenTimer: number = 0;
    private fireTimer: number = 0;
    public ammo: number;
    public maxAmmo: number;
    public reloadTimer: number = 0;
    public multishot: number = 1;
    public hpRegen: number = 0;
    public critChance: number = 0.05;

    // Weapon system
    public currentWeapon: string = 'pistol';
    public ownedWeapons: string[] = ['pistol']; 

    private recoilVelocity: { x: number, y: number } = { x: 0, y: 0 };
    public weaponDamage: number = 10;
    public weaponFireRate: number = 0.42;
    public weaponRange: number = 25;
    public weaponMagSize: number = 10;
    public weaponReloadTime: number = 1.2;
    public weaponSpread: number = 0;
    public weaponMultishot: number = 1;
    public weaponBulletSpeed: number = 18;

    public equipWeapon(wId: string, ws: any): void {
        this.currentWeapon = wId;
        this.weaponDamage = ws.damage;
        this.weaponFireRate = ws.fireRate;
        this.weaponRange = ws.range;
        this.weaponMagSize = ws.magSize;
        this.weaponReloadTime = ws.reloadTime;
        this.weaponSpread = ws.spread;
        this.weaponMultishot = ws.multishot;
        this.weaponBulletSpeed = ws.bulletSpeed; // Reverted super fast bullets

        // Update ammo to new mag size
        this.maxAmmo = ws.magSize;
        this.ammo = ws.magSize;
        this.reloadTimer = 0;

        if (!this.ownedWeapons.includes(wId)) {
            this.ownedWeapons.push(wId);
        }
    }

    // Dash
    private isDashing: boolean = false;
    private dashTimer: number = 0;
    private dashCooldownTimer: number = 0;
    private dashVector: { x: number, y: number } = { x: 0, y: 0 };
    private afterimages: { x: number, y: number, alpha: number }[] = [];
    public walkTimer: number = 0;
    public isWalking: boolean = false;
    public deathAnimationTimer: number = 0;
    public isDying: boolean = false;
    public lastMoveAngle: number = Math.PI / 2;

    constructor(x: number, y: number) {
        super(x, y);
        const config = ConfigManager.getConfig();
        this.maxHp = config.hero.base_hp;
        this.hp = this.maxHp;

        this.stamina = config.hero.stamina.base;
        this.maxStamina = config.hero.stamina.base;

        this.maxAmmo = config.blaster.magazine_size;
        this.ammo = this.maxAmmo;
        this.multishot = config.blaster.multishot_count;

        this.color = '#0088FF'; // Blue
    }



    public update(dt: number, game: Game): void {
        const config = ConfigManager.getConfig();
        const input = InputManager.getInstance();

        if (this.isDying) {
            // First frame of dying: Trigger big juice
            if (this.deathAnimationTimer === 2.0) {
                game.renderer.triggerShake(1.0, 0.4);
            }

            this.deathAnimationTimer -= dt;
            if (this.deathAnimationTimer <= 0) {
                this.isDying = false;
                this.isDead = true;
                this.deathAnimationTimer = 0;
            }
            return; // No input processing while dying
        }

        // 1. Cooldowns
        if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
        if (this.fireTimer > 0) this.fireTimer -= dt;
        if (this.reloadTimer > 0) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.ammo = this.maxAmmo;
            }
        }

        if (this.damageFlashTimer > 0) this.damageFlashTimer -= dt;

        // 2. Dash Logic
        if (this.isDashing) {
            this.dashTimer -= dt;
            const dashDist = config.abilities.dash.distance;
            const dashSpeed = dashDist / config.abilities.dash.duration;

            this.x += this.dashVector.x * dashSpeed * dt;
            this.y += this.dashVector.y * dashSpeed * dt;

            if (this.dashTimer <= 0) {
                this.isDashing = false;
                this.staminaRegenTimer = config.hero.stamina.regen_delay_after_dash;
            }
            return;
        }



        // Manual Reload (R)
        if (input.keys['r'] && this.reloadTimer <= 0 && this.ammo < this.maxAmmo) {
            this.reloadTimer = config.blaster.reload_time;
            AudioManager.playReload();
        }

        // Shooting
        let isShooting = false;
        let aimX = input.mouseWorld.x;
        let aimY = input.mouseWorld.y;

        if (input.isTouchDevice) {
            // Use Right Stick
            if (input.stickRight.active) {
                const dist = Math.sqrt(input.stickRight.x * input.stickRight.x + input.stickRight.y * input.stickRight.y);
                if (dist > 0.3) { // Deadzone
                    isShooting = true;
                }
            }
            // Also check mouse if stick is not active (Hybrid/Chromebook support)
            if (!isShooting && input.mouse.leftDown) {
                isShooting = true;
            }
        } else {
            // Mouse
            isShooting = input.mouse.leftDown;
        }

        if (isShooting && this.fireTimer <= 0 && this.reloadTimer <= 0) {
            if (this.ammo > 0) {
                this.ammo--;
                this.fireTimer = this.weaponFireRate;

                // Aim Logic
                let baseAngle = 0;
                if (input.isTouchDevice && input.stickRight.active) {
                    baseAngle = Math.atan2(input.stickRight.y, input.stickRight.x);
                } else {
                    baseAngle = Math.atan2(aimY - this.y, aimX - this.x);
                }

                // Multishot: weapon base + upgrade bonus
                const totalMultishot = this.weaponMultishot + (this.multishot - 1);
                const spread = this.weaponSpread > 0 ? this.weaponSpread : config.blaster.multishot_spread_radians;

                // Calculate gun tip position in world space
                const gunTipLocalX = 0.88 * 1.6;
                const gunTipLocalY = -0.11 * 1.6;
                const flipY = Math.abs(baseAngle) > Math.PI / 2 ? -1 : 1;
                const cosA = Math.cos(baseAngle);
                const sinA = Math.sin(baseAngle);
                const spawnX = this.x + cosA * gunTipLocalX - sinA * (gunTipLocalY * flipY);
                const spawnY = this.y + sinA * gunTipLocalX + cosA * (gunTipLocalY * flipY);

                // Re-trigger the massive muzzle flash
                (this as any).muzzleFlashTimer = 0.15; // 150ms of bright flash

                // Randomize speed slightly (-5% to +5%)
                const speedSpread = Math.random() * 0.1 - 0.05;
                const finalSpeed = this.weaponBulletSpeed * (1 + speedSpread);

                for (let i = 0; i < totalMultishot; i++) {
                    const offset = (i - (totalMultishot - 1) / 2) * spread;
                    const angle = baseAngle + offset;
                    const targetX = spawnX + Math.cos(angle) * config.blaster.multishot_target_distance;
                    const targetY = spawnY + Math.sin(angle) * config.blaster.multishot_target_distance;

                    game.bullets.push(new Bullet(spawnX, spawnY, targetX, targetY, this.critChance, this.currentWeapon, this.weaponDamage, finalSpeed, this.weaponRange));
                }

                // Apply Recoil Pushback
                let recoilForce = 0.5; // Significantly reduced from 2.0
                if (this.currentWeapon === 'shotgun') recoilForce = 3.0; // Reduced from 12.0
                if (this.currentWeapon === 'smg') recoilForce = 0.2; // Reduced from 1.0
                if (this.currentWeapon === 'rifle') recoilForce = 1.5; // Reduced from 6.0

                this.recoilVelocity.x -= Math.cos(baseAngle) * recoilForce;
                this.recoilVelocity.y -= Math.sin(baseAngle) * recoilForce;

                AudioManager.playShoot();

                if (this.ammo <= 0) {
                    this.reloadTimer = this.weaponReloadTime;
                    AudioManager.playReload();
                }
            }
        }

        // 3. Normal Movement
        const axis = input.getAxis();
        this.isWalking = (axis.x !== 0 || axis.y !== 0);
        if (this.isWalking) {
            this.lastMoveAngle = Math.atan2(axis.y, axis.x);
            this.walkTimer += dt * 12;
            // Check for Dash Input (Shift or Space or Virtual Button)
            if ((input.keys['shift'] || input.keys[' '] || input.buttons.dash) &&
                this.dashCooldownTimer <= 0 &&
                this.stamina >= config.abilities.dash.stamina_cost) {

                // Trigger Dash
                this.isDashing = true;
                this.dashTimer = config.abilities.dash.duration;
                this.dashCooldownTimer = config.abilities.dash.cooldown;
                this.dashVector = { ...axis };
                this.stamina -= config.abilities.dash.stamina_cost;
            } else {
                // Move
                const moveSpeed = config.hero.move_speed;
                this.x += axis.x * moveSpeed * dt;
                this.y += axis.y * moveSpeed * dt;
            }
        } else {
            this.walkTimer = 0;
        }

        // Apply Recoil Physics
        this.x += this.recoilVelocity.x * dt;
        this.y += this.recoilVelocity.y * dt;
        // Dampen recoil
        this.recoilVelocity.x *= 0.85;
        this.recoilVelocity.y *= 0.85;

        // 4. Stamina Regen
        if (!this.isDashing) {
            if (this.staminaRegenTimer > 0) {
                this.staminaRegenTimer -= dt;
            } else if (this.stamina < this.maxStamina) {
                this.stamina += config.hero.stamina.regen_rate * dt;
                if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
            }
        }

        // Dashing afterimages
        if (this.isDashing) {
            this.afterimages.push({ x: this.x, y: this.y, alpha: config.ui.hero.afterimage_alpha });
        }
        for (let i = this.afterimages.length - 1; i >= 0; i--) {
            this.afterimages[i].alpha -= dt * config.ui.hero.afterimage_fade_rate;
            if (this.afterimages[i].alpha <= 0) this.afterimages.splice(i, 1);
        }

        // Health Regen
        if (this.hp < this.maxHp && this.hpRegen > 0) {
            this.hp += this.hpRegen * dt;
            if (this.hp > this.maxHp) this.hp = this.maxHp;
        }
    }



    private damageFlashTimer: number = 0;

    public takeDamage(amount: number, source?: Bomb) {
        // Global safety: don't take damage if hero is already dead
        if (this.isDead) return;

        const config = ConfigManager.getConfig();
        const reduction = config.hero.armor.damage_reduction_percent;
        const finalDamage = amount * (1.0 - reduction);

        this.hp -= finalDamage;
        this.damageFlashTimer = config.ui.hero.damage_flash_duration;
        AudioManager.playHit();

        if (this.hp <= 0 && !this.isDying && !this.isDead) {
            this.hp = 0;
            this.isDying = true;
            this.deathAnimationTimer = 2.0; // 2 seconds of funny death
            AudioManager.playDeath(); // Assuming this exists or plays a funny sound

            if (source) {
                // ... same info for death clarity screen later ...
                const originalParent = (source as any).originalParent;
                this.killingBlow = {
                    explosionX: source.x,
                    explosionY: source.y,
                    bombId: source.id,
                    radius: (source as any).radiusExplosion,
                    isDetached: !originalParent,
                    enemyInfo: originalParent ? {
                        x: originalParent.x,
                        y: originalParent.y,
                        angle: originalParent.angle
                    } : undefined
                };
            }
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        if (this.isDead) return;


        // Define colors here so they are available for death animation
        // Define colors here so they are available for death animation

        if (this.isDying) {
            const progress = (2.0 - this.deathAnimationTimer) / 2.0;

            const easeIn = Math.pow(progress, 2.5);
            const opacity = 1.0 - easeIn;

            // Fixed colors for death - no flashing
            const dClothes = '#2F80FF';
            const dSkin = '#FFDAB9';

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.globalAlpha = opacity;
            ctx.scale(1.6, 1.6);

            // 1. Flickering Core
            const corePulse = (Math.sin(performance.now() / 30) + 1) / 2;
            ctx.fillStyle = `rgba(0, 255, 255, ${0.4 + corePulse * 0.6})`;
            ctx.beginPath();
            ctx.arc(0, -0.1, 0.2, 0, Math.PI * 2);
            ctx.fill();

            // --- TORSO ---
            ctx.fillStyle = dClothes;
            ctx.beginPath();
            ctx.roundRect(-0.35, -0.4, 0.7, 0.75, 0.1);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.05;
            ctx.stroke();

            // --- HEAD (Launch) ---
            ctx.save();
            const hDist = progress * 15;
            ctx.translate(Math.cos(progress * 12) * hDist, -0.6 - hDist * 2);
            ctx.rotate(progress * 40);
            ctx.fillStyle = dSkin;
            ctx.beginPath();
            ctx.arc(0, 0, 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Dead X Eyes
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.06;
            const xS = 0.1;
            ctx.beginPath();
            ctx.moveTo(-xS, -xS); ctx.lineTo(xS, xS);
            ctx.moveTo(xS, -xS); ctx.lineTo(-xS, xS);
            ctx.stroke();
            ctx.restore();

            // --- LIMBS ---
            const drawLimbExp = (angle: number, length: number, color: string, speed: number) => {
                ctx.save();
                const lDist = progress * speed;
                ctx.translate(Math.cos(angle) * lDist, Math.sin(angle) * lDist - lDist * 0.5);
                ctx.rotate(progress * 50 + angle);
                ctx.fillStyle = color;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 0.05;
                ctx.beginPath();
                ctx.roundRect(-0.1, 0, 0.2, length, 0.05);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            };

            drawLimbExp(Math.PI * 1.1, 0.6, dSkin, 18); // L Arm
            drawLimbExp(Math.PI * 1.9, 0.6, dSkin, 22); // R Arm
            drawLimbExp(Math.PI * 0.2, 0.7, '#1A365D', 15); // L Leg
            drawLimbExp(Math.PI * 0.8, 0.7, '#1A365D', 20); // R Leg

            ctx.restore();
            return;
        }

        for (const img of this.afterimages) {
            ctx.save();
            ctx.translate(img.x, img.y);
            ctx.globalAlpha = img.alpha;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.roundRect(-0.4, -0.6, 0.8, 1.2, 0.4);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1.6, 1.6); // Hero is now BIGGER

        if (this.isDashing) {
            const angle = Math.atan2(this.dashVector.y, this.dashVector.x);
            ctx.rotate(angle);
            ctx.scale(1.2, 0.85);
            ctx.rotate(-angle);
        }

        const input = InputManager.getInstance();
        let aimAngle = 0;
        if (input.isTouchDevice && input.stickRight.active) {
            aimAngle = Math.atan2(input.stickRight.y, input.stickRight.x);
        } else {
            aimAngle = Math.atan2(input.mouseWorld.y - this.y, input.mouseWorld.x - this.x);
        }

        // --- DRAW BROTATO-STYLE PROCEDURAL BODY ---
        ctx.save();
        
        let shouldFlip = false;
        // Determine whether to face left or right based on the aim direction, NOT movement!
        if (Math.abs(aimAngle) > Math.PI / 2) {
            shouldFlip = true;
        }

        // Only lean (rotate slightly) if actively walking
        let leanAngle = 0;
        if (this.isWalking) {
             // 0.2 radians is a nice subtle leaning forward stance
             leanAngle = 0.2; 
        }

        if (shouldFlip) {
            ctx.scale(-1, 1);
        }
        ctx.rotate(leanAngle);

        // Subtly bob up and down while walking
        const bob = this.isWalking ? Math.abs(Math.sin(this.walkTimer)) * 0.1 : 0;
        ctx.translate( bob, 0);
        
        // We will draw facing "Right" (0 angle), since rotation handles the direction.
        // Scale him up so he's nice and chunky as requested
        ctx.scale(1.5, 1.5);

        // Body / Shirt (Red)
        ctx.fillStyle = '#FF3333';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.roundRect(-0.2, -0.25, 0.4, 0.5, 0.1);
        ctx.fill(); ctx.stroke();
        
        // Tiny feet underneath
        ctx.fillStyle = '#222';
        const walkCycle = this.isWalking ? Math.sin(this.walkTimer * 1.5) : 0;
        // Left foot
        ctx.save();
        ctx.translate(-0.1, 0.2);
        ctx.rotate(walkCycle * 0.5);
        ctx.beginPath();
        ctx.roundRect(-0.1, 0, 0.2, 0.15, 0.05);
        ctx.fill(); ctx.stroke();
        ctx.restore();
        // Right foot
        ctx.save();
        ctx.translate(0.1, 0.2);
        ctx.rotate(-walkCycle * 0.5);
        ctx.beginPath();
        ctx.roundRect(-0.1, 0, 0.2, 0.15, 0.05);
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Big oval Brotato head (White)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(0, -0.3, 0.35, 0.45, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Sweatband (Blue)
        ctx.fillStyle = '#3388FF';
        ctx.beginPath();
        // Curve it slightly around the head
        ctx.ellipse(0, -0.45, 0.34, 0.1, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Face - Eyes track aim direction
        // Calculate eye offset based on aim
        const maxEyeOffset = 0.08;
        let eyeOffsetX = Math.cos(aimAngle) * maxEyeOffset;
        let eyeOffsetY = Math.sin(aimAngle) * maxEyeOffset;
        
        if (shouldFlip) {
            eyeOffsetX *= -1; // Invert local X so eyes track correctly when the canvas is flipped horizontally
        }

        ctx.save();
        ctx.translate(eyeOffsetX, eyeOffsetY);

        // Angry Eyes
        ctx.fillStyle = '#000';
        
        // Left Eye Shape (angry slant)
        ctx.beginPath();
        ctx.moveTo(0.15, -0.35); // outer
        ctx.lineTo(0.25, -0.4);  // inner top
        ctx.lineTo(0.25, -0.3);  // inner bottom
        ctx.fill();
        
        // Right Eye Shape
        ctx.beginPath();
        ctx.moveTo(0.15, -0.15); // outer
        ctx.lineTo(0.25, -0.1);  // inner top
        ctx.lineTo(0.25, -0.2);  // inner bottom
        ctx.fill();

        ctx.restore(); // Undo eye tracking translation
        
        ctx.restore(); // Undo body rotation and bob

        // --- RENDER WEAPON SEPARATELY ---

        this.drawWeapon(ctx, aimAngle);

        ctx.restore(); // End Main Transform (this.x, this.y)
    }

    private drawWeapon(ctx: CanvasRenderingContext2D, aimAngle: number): void {
        ctx.save();
        
        // Push the weapon out from the center slightly so it orbits the hero
        const weaponOrbitDistance = 0.4;
        ctx.translate(Math.cos(aimAngle) * weaponOrbitDistance, Math.sin(aimAngle) * weaponOrbitDistance);
        ctx.rotate(aimAngle);

        // Flip gun vertically if aiming left so it's not upside down
        const flipY = Math.abs(aimAngle) > Math.PI / 2 ? -1 : 1;
        if (flipY === -1) {
            ctx.scale(1, -1);
        }

        const gunImg = (window as any).__GUN_IMG;
        
        // Weapon size scale
        let scaleX = 2.0;
        let scaleY = 2.0;
        
        if (this.currentWeapon === 'smg') {
            scaleX = 2.4; scaleY = 2.4;
        } else if (this.currentWeapon === 'shotgun') {
            scaleX = 3.6; scaleY = 2.8;
        } else if (this.currentWeapon === 'rifle') {
            scaleX = 3.2; scaleY = 2.4;
        } else {
            scaleX = 2.0; scaleY = 2.0; // Pistol baseline
        }

        // Apply visual kick to the weapon explicitly!
        // We will pull the weapon back significantly based on the recent firing of a shot.
        const vKick = this.fireTimer > 0 ? (this.fireTimer / this.weaponFireRate) * 0.25 * scaleX : 0; // Downplay from 0.4
        ctx.translate(-vKick, 0);

        if (gunImg && gunImg.width > 0) {
            ctx.save();
            ctx.scale(scaleX, scaleY);
            // The AI image is 16x10 roughly. 
            // We want it to be roughly 1.3 units long in game space for a pistol.
            // (1.3 / 16) is the scale factor we need.
            const drawW = 0.6;
            const drawH = drawW * (gunImg.height / gunImg.width);
            
            // Offset it so the grip is roughly at the rotation origin
            ctx.drawImage(gunImg, -drawW * 0.2, -drawH * 0.4, drawW, drawH);
            ctx.restore();
        } else {
             // Fallback minimal gun if image fails to load
             ctx.fillStyle = '#222';
             ctx.beginPath();
             ctx.roundRect(-0.1, -0.1, 0.4 * scaleX, 0.18 * scaleY, 0.02);
             ctx.fill();
        }

        // --- MASSIVE MUZZLE FLASH ---
        if ((this as any).muzzleFlashTimer > 0) {
            (this as any).muzzleFlashTimer -= 1/60; // Approximate dt locally for flash fade out
            
            ctx.save();
            
            // Move to the tip of the gun (which is scaled up now)
            // drawW is 0.6, so tip is roughly at 0.6 * scaleX
            const tipX = 0.5 * scaleX;
            ctx.translate(tipX, -0.05 * scaleY);
            
            // Randomize size slightly, heavily scaled down!
            const fScale = (0.2 + Math.random() * 0.2) * scaleX; // Back down from 1.5
            let flashSize = 0.6 * fScale;
            if (this.currentWeapon === 'shotgun') flashSize = 1.0 * fScale;
            if (this.currentWeapon === 'rifle') flashSize = 0.8 * fScale;
            if (this.currentWeapon === 'smg') flashSize = 0.5 * fScale;

            // Flash Core (White Star)
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.moveTo(0, -flashSize * 0.2);
            ctx.lineTo(flashSize, 0);
            ctx.lineTo(0, flashSize * 0.2);
            ctx.lineTo(flashSize * 0.2, flashSize * 0.6);
            ctx.lineTo(-flashSize * 0.2, flashSize * 0.2);
            ctx.lineTo(-flashSize * 0.6, 0);
            ctx.lineTo(-flashSize * 0.2, -flashSize * 0.2);
            ctx.lineTo(0, -flashSize * 0.8);
            ctx.closePath();
            ctx.fill();

            // Flash Outer Layer (Huge Orange Blast)
            ctx.fillStyle = 'rgba(255, 120, 0, 0.7)';
            ctx.beginPath();
            ctx.moveTo(0, -flashSize * 0.4);
            ctx.lineTo(flashSize * 1.8, 0);
            ctx.lineTo(0, flashSize * 0.4);
            ctx.lineTo(flashSize * 0.4, flashSize * 1.5);
            ctx.lineTo(-flashSize * 0.4, flashSize * 0.4);
            ctx.lineTo(-flashSize * 1.4, 0);
            ctx.lineTo(-flashSize * 0.4, -flashSize * 0.4);
            ctx.lineTo(0, -flashSize * 1.5);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        ctx.restore();
    }
}
