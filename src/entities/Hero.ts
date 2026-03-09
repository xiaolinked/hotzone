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
    
    // Cosmetics
    public static defaultHatColor: string = '#FF3333';
    public hatColor: string = Hero.defaultHatColor; // Assigned from default

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
        this.hatColor = Hero.defaultHatColor; // Apply global choice on instantiate
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
        
        // Update 4-way facing based on movement.
        // This prevents snapping when moving purely diagonally or stopping.
        if (this.isWalking) {
            // Get angle in degrees for easier cardinal direction slicing
            let deg = (this.lastMoveAngle * 180) / Math.PI;
            if (deg < 0) deg += 360; // Normalize to 0-360

            // Slices: 
            // Right: 315-360, 0-45
            // Down: 45-135 
            // Left: 135-225
            // Up: 225-315
            
            // Adjust slices to give horizontal movement slightly more priority over pure vertical 
            // to make diagonal aiming feel more natural
            if (deg >= 55 && deg < 125) {
                (this as any).facingDir = 'DOWN';
            } else if (deg >= 125 && deg < 235) {
                (this as any).facingDir = 'LEFT';
            } else if (deg >= 235 && deg < 305) {
                (this as any).facingDir = 'UP';
            } else {
                (this as any).facingDir = 'RIGHT';
            }
        }
        
        const facing = (this as any).facingDir || 'RIGHT';

        // Only lean (rotate slightly) if actively walking horizontally
        let leanAngle = 0;
        if (this.isWalking) {
             if (facing === 'RIGHT' || facing === 'LEFT') {
                 leanAngle = 0.2; 
             }
        }

        if (facing === 'LEFT') {
            ctx.scale(-1, 1);
        }
        ctx.rotate(leanAngle);

        // Subtly bob up and down while walking
        const bob = this.isWalking ? Math.abs(Math.sin(this.walkTimer)) * 0.1 : 0;
        ctx.translate(0, bob);
        
        // --- Z-SORTING WEAPON ---
        // If facing UP, draw the weapon BEFORE the body so it appears behind the hero.
        const isWeaponBehind = facing === 'UP';

        if (isWeaponBehind) {
            ctx.save();
            ctx.translate(0, -bob); // Undo bob for weapon orbit stability
            ctx.rotate(-leanAngle); // Undo lean
            if (facing === 'LEFT') ctx.scale(-1, 1); // Undo facing flip
            this.drawWeapon(ctx, aimAngle);
            ctx.restore();
        }

        // --- DRAW BODY ---    // Scale him up so he's nice and chunky as requested
        ctx.scale(1.5, 1.5);

        // Create a 3D spherical/pillowed radial gradient for the body
        const bodyGrd = ctx.createRadialGradient(0, -0.4, 0.05, 0, -0.2, 0.5);
        bodyGrd.addColorStop(0, '#ff7a7a'); // Lighter highlight towards top left
        bodyGrd.addColorStop(0.6, '#FF3333');  // Base red
        bodyGrd.addColorStop(1, '#990000'); // Darker shadow at the edges

        // Body / Shirt (Red)
        ctx.fillStyle = bodyGrd;
        ctx.strokeStyle = '#220000';
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.roundRect(-0.2, -0.25, 0.4, 0.5, 0.1);
        ctx.fill(); ctx.stroke();
        
        // Tiny feet underneath
        ctx.fillStyle = '#222';
        const walkCycle = this.isWalking ? Math.sin(this.walkTimer * 1.5) : 0;
        
        // Adjust feet animation slightly if walking UP/DOWN (simulate waddling instead of striding)
        const footCycleL = (facing === 'UP' || facing === 'DOWN') ? Math.abs(walkCycle) * 0.5 : walkCycle * 0.5;
        const footCycleR = (facing === 'UP' || facing === 'DOWN') ? Math.abs(-walkCycle) * 0.5 : -walkCycle * 0.5;

        // Left foot
        ctx.save();
        ctx.translate(-0.1, 0.2);
        ctx.rotate(footCycleL);
        ctx.beginPath();
        ctx.roundRect(-0.1, 0, 0.2, 0.15, 0.05);
        ctx.fill(); ctx.stroke();
        ctx.restore();
        
        // Right foot
        ctx.save();
        ctx.translate(0.1, 0.2);
        ctx.rotate(footCycleR);
        ctx.beginPath();
        ctx.roundRect(-0.1, 0, 0.2, 0.15, 0.05);
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Big oval Brotato head (White)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(0, -0.3, 0.35, 0.45, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // --- DRAW HAT ---
        ctx.save();
        ctx.fillStyle = this.hatColor; // Customizable!
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.03;
        
        let hatOffset = 0;
        if (facing === 'RIGHT' || facing === 'LEFT') hatOffset = 0.05;

        // Hat dome
        ctx.beginPath();
        ctx.arc(0 + hatOffset, -0.65, 0.25, Math.PI, 0); // half circle on top
        ctx.fill(); ctx.stroke();
        
        // Hat Brim
        if (facing !== 'UP') {
            ctx.beginPath();
            if (facing === 'RIGHT' || facing === 'LEFT') {
                // Bill facing forward (left is flipped earlier so local forward is right)
                ctx.roundRect(-0.15 + hatOffset, -0.68, 0.55, 0.08, 0.04);
            } else if (facing === 'DOWN') {
                // Forward facing brim, narrower horizontally than the main head
                ctx.roundRect(-0.25, -0.65, 0.5, 0.06, 0.03);
            }
            ctx.fill(); ctx.stroke();
        }
        ctx.restore();

        // --- FACE & EYES ---
        // Only draw face if NOT facing away from the camera (UP)
        if (facing !== 'UP') {
            
            // Base White Eyes (Locked to head, side-by-side horizontally)
            ctx.fillStyle = '#FFF';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.02;
            
            // Eye Y coordinate (Higher up on the face)
            const eyeY = -0.35;
            // Eye X offset from center
            let eyeSpread = 0.14; 
            
            // If facing down, shift eyes to be centered on the face.
            // If facing right (or flipped left), shift eyes forward so they are on the edge of the face.
            let faceOffsetX = 0;
            if (facing === 'RIGHT' || facing === 'LEFT') {
                 faceOffsetX = 0.18; // Shift eyes forward in profile
                 eyeSpread = 0.12;  // Bring them closer together in profile
            }

            // Calculate white eye offset based on aim (moves less than pupil)
            const maxEyeOffset = 0.02;
            let eyeOffsetX = Math.cos(aimAngle) * maxEyeOffset;
            let eyeOffsetY = Math.sin(aimAngle) * maxEyeOffset;
            
            if (facing === 'LEFT') {
                eyeOffsetX *= -1; // Invert local X for flipped canvas
            }
            
            // Apply slight tilt to eyes if looking far up/down
            const lookTilt = Math.sin(aimAngle) * 0.1;

            ctx.save();
            ctx.translate(eyeOffsetX, eyeOffsetY);
            ctx.rotate(lookTilt);

            // Left Eye Base
            ctx.beginPath();
            ctx.ellipse(faceOffsetX - eyeSpread, eyeY, 0.09, 0.14, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            
            // Right Eye Base
            ctx.beginPath();
            ctx.ellipse(faceOffsetX + eyeSpread, eyeY, 0.09, 0.14, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            
            // Calculate pupil offset based on aim
            const maxPupilOffset = 0.05; // Pupils move around inside the eye (slightly more now)
            let pupilOffsetX = Math.cos(aimAngle) * maxPupilOffset;
            let pupilOffsetY = Math.sin(aimAngle) * maxPupilOffset;
            
            if (facing === 'LEFT') {
                pupilOffsetX *= -1; // Invert local X so pupils track aim when canvas is flipped
            }

            ctx.save();
            ctx.translate(pupilOffsetX, pupilOffsetY);

            // Black Pupils (Move to track aim)
            ctx.fillStyle = '#000';
            
            // Left Pupil
            ctx.beginPath();
            ctx.arc(faceOffsetX - eyeSpread, eyeY, 0.055, 0, Math.PI * 2); // slightly bigger pupils
            ctx.fill();
            
            // Right Pupil
            ctx.beginPath();
            ctx.arc(faceOffsetX + eyeSpread, eyeY, 0.055, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore(); // Undo pupil tracking translation
            ctx.restore(); // Undo white eye translation/rotation
        }
        
        ctx.restore(); // Undo body rotation and bob

        // --- RENDER WEAPON SEPARATELY (If aiming DOWN/FORWARD) ---
        if (!isWeaponBehind) {
            this.drawWeapon(ctx, aimAngle);
        }

        ctx.restore(); // End Main Transform (this.x, this.y)
    }

    private drawWeapon(ctx: CanvasRenderingContext2D, aimAngle: number): void {
        ctx.save();
        
        // Push the weapon out from the center slightly so it orbits the hero
        const weaponOrbitDistance = 0.45; // Slightly pushed out for hand clearance
        ctx.translate(Math.cos(aimAngle) * weaponOrbitDistance, Math.sin(aimAngle) * weaponOrbitDistance);
        ctx.rotate(aimAngle);

        // Flip gun vertically if aiming left so it's not upside down
        const flipY = Math.abs(aimAngle) > Math.PI / 2 ? -1 : 1;
        if (flipY === -1) {
            ctx.scale(1, -1);
        }

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

        // // Apply visual kick directly 
        const kickRatio = this.fireTimer / this.weaponFireRate;
        // Smoother, less drastic recoil curve (pow 3 instead of 8)
        const kickPower = Math.pow(kickRatio, 3); 
        
        // Muzzle flip: Gun rotates up moderately
        const flipAngle = kickPower * -0.2; // Reduced from -0.5
        ctx.rotate(flipAngle);
        
        // Backward kick: Gun pushes back into the hand gently
        const vKick = kickPower * 0.25 * scaleX; // Reduced from 0.45
        ctx.translate(-vKick, 0);
        ctx.save();
        ctx.scale(scaleX, scaleY);
        
        // --- DRAW WEAPON (VECTOR) ---
        // Offset so the back hand holds the primary grip
        ctx.translate(-0.15, -0.05);

        // Slide flex / firing animation common values
        const slideFlex = this.fireTimer > 0 ? kickRatio * 0.05 : 0;
        const slideKick = this.fireTimer > 0 ? kickRatio * 0.15 : 0;
        const triggerPull = this.fireTimer > 0 ? 0.02 : 0; 

        if (this.currentWeapon === 'pistol') {
            const gripW = 0.12; const gripH = 0.28;
            const slideW = 0.45 - slideFlex; const slideH = 0.14;

            // Grip
            ctx.fillStyle = '#1A1C1E'; ctx.strokeStyle = '#0B0C0D'; ctx.lineWidth = 0.015;
            ctx.save(); ctx.translate(0, slideH * 0.5); ctx.rotate(0.15);
            ctx.beginPath(); ctx.roundRect(-gripW/2, 0, gripW, gripH, [0.02, 0.02, 0.05, 0.05]); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#2A2C2E';
            for(let i=0; i<4; i++) ctx.fillRect(-gripW/2 + 0.02 + i*0.02, 0.05, 0.01, gripH - 0.1);
            ctx.restore();

            // Trigger Guard & Cutout
            ctx.fillStyle = '#1A1C1E';
            ctx.beginPath(); ctx.roundRect(0.06, slideH * 0.5, 0.14, 0.08, 0.04); ctx.fill(); ctx.stroke();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.roundRect(0.08, slideH * 0.5 + 0.02, 0.08, 0.04, 0.01); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            // Trigger
            ctx.strokeStyle = '#555'; ctx.lineWidth = 0.015;
            ctx.beginPath(); ctx.moveTo(0.1 + triggerPull, slideH * 0.5 + 0.02); ctx.lineTo(0.12 + triggerPull, slideH * 0.5 + 0.05); ctx.stroke();

            // Slide
            ctx.save(); ctx.translate(-0.05 - slideKick, -slideH/2);
            ctx.fillStyle = '#222529'; ctx.strokeStyle = '#050505';
            ctx.beginPath(); ctx.roundRect(0, 0, slideW, slideH, [0.03, 0.03, 0.01, 0.01]); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#111'; ctx.lineWidth = 0.01;
            for(let i=0; i<5; i++) { ctx.beginPath(); ctx.moveTo(0.05 + i*0.015, 0.02); ctx.lineTo(0.05 + i*0.015, slideH - 0.02); ctx.stroke(); }
            for(let i=0; i<3; i++) { ctx.beginPath(); ctx.moveTo(slideW - 0.08 - i*0.015, 0.02); ctx.lineTo(slideW - 0.08 - i*0.015, slideH - 0.02); ctx.stroke(); }
            ctx.fillStyle = '#777'; ctx.fillRect(slideW * 0.5, 0.02, 0.08, 0.03); // Port
            ctx.fillStyle = '#111'; ctx.fillRect(0.02, -0.02, 0.03, 0.02); ctx.fillRect(slideW - 0.04, -0.02, 0.02, 0.02); // Sights
            ctx.fillStyle = '#888'; ctx.fillRect(slideW, 0.04, 0.02, 0.06); // Barrel Let
            ctx.restore();

            // Hands (Pistol) - Both on grip
            ctx.fillStyle = '#FFCDB2'; ctx.strokeStyle = '#E5989B'; ctx.lineWidth = 0.01;
            ctx.beginPath(); ctx.arc(0.02, slideH * 0.5 + 0.05, 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Back hand
            ctx.beginPath(); ctx.arc(0.05, slideH * 0.5 + 0.07, 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Front hand (also on grip)
        } 
        else if (this.currentWeapon === 'smg') {
            // SMG: Compact, boxy, extended mag (like a MAC-10)
            const bodyW = 0.35; const bodyH = 0.16;
            
            // Grip
            ctx.fillStyle = '#111'; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.015;
            ctx.beginPath(); ctx.roundRect(-0.04, bodyH/2, 0.1, 0.25, 0.02); ctx.fill(); ctx.stroke();
            
            // Extended Mag (In front of grip)
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.roundRect(0.14, bodyH/2, 0.12, 0.4, 0.01); ctx.fill(); ctx.stroke();
            
            // Receiver (Boxy)
            ctx.save(); ctx.translate(-0.05 - slideKick*0.5, -bodyH/2);
            ctx.fillStyle = '#2A2C2E';
            ctx.beginPath(); ctx.roundRect(0, 0, bodyW, bodyH, 0.02); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#111'; ctx.fillRect(0.05, -0.03, 0.04, 0.03); ctx.fillRect(bodyW - 0.05, -0.03, 0.02, 0.03); // Sights
            // Short barrel
            ctx.fillStyle = '#444'; ctx.fillRect(bodyW, 0.04, 0.1, 0.08);
            ctx.restore();

            // Hands (SMG) - Both on grip
            ctx.fillStyle = '#FFCDB2'; ctx.strokeStyle = '#E5989B'; ctx.lineWidth = 0.01;
            ctx.beginPath(); ctx.arc(0.02, 0.15, 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Back grip
            ctx.beginPath(); ctx.arc(0.05, 0.18, 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Front grip
        }
        else if (this.currentWeapon === 'shotgun') {
            // Shotgun: Long, wood furniture, pump action
            // Stock & Grip
            ctx.fillStyle = '#8B5A2B'; ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 0.015;
            ctx.beginPath(); ctx.moveTo(0.08, 0.05); ctx.lineTo(-0.25, 0.15); ctx.lineTo(-0.25, 0.02); ctx.lineTo(0.08, -0.05); ctx.fill(); ctx.stroke(); // Stock

            // Receiver
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.roundRect(0.04, -0.05, 0.2, 0.12, 0.02); ctx.fill(); ctx.stroke();

            // Barrel
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.roundRect(0.24, -0.02, 0.5, 0.06, 0.01); ctx.fill(); ctx.stroke();
            // Tube underneath
            ctx.fillRect(0.24, 0.04, 0.45, 0.04);

            // Pump (Moves backwards slightly when firing)
            const pumpKick = this.fireTimer > 0 ? kickRatio * 0.1 : 0;
            ctx.fillStyle = '#8B5A2B'; 
            ctx.beginPath(); ctx.roundRect(0.35 - pumpKick, 0.03, 0.2, 0.07, 0.02); ctx.fill(); ctx.stroke();
            
            // Serrations on pump
            ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 0.01;
            for(let i=0; i<6; i++) {
                ctx.beginPath(); ctx.moveTo(0.38 - pumpKick + i*0.03, 0.04); ctx.lineTo(0.38 - pumpKick + i*0.03, 0.09); ctx.stroke();
            }

            // Hands (Shotgun)
            ctx.fillStyle = '#FFCDB2'; ctx.strokeStyle = '#E5989B'; ctx.lineWidth = 0.01;
            ctx.beginPath(); ctx.arc(0.05, 0.06, 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Back trigger
            ctx.beginPath(); ctx.arc(0.45 - pumpKick, 0.08, 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Front pump
        }
        else if (this.currentWeapon === 'rifle') {
            // Rifle: Assault rifle style (M4), handguard, curved mag
            // Stock
            ctx.fillStyle = '#111'; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.015;
            ctx.beginPath(); ctx.moveTo(0.05, 0); ctx.lineTo(-0.2, 0.1); ctx.lineTo(-0.2, -0.05); ctx.lineTo(0.05, -0.05); ctx.fill(); ctx.stroke();

            // Grip
            ctx.beginPath(); ctx.roundRect(-0.04, 0.05, 0.08, 0.2, 0.02); ctx.fill(); ctx.stroke();

            // Receiver
            ctx.fillStyle = '#2A2C2E';
            ctx.beginPath(); ctx.roundRect(0.02, -0.08, 0.25, 0.15, 0.01); ctx.fill(); ctx.stroke();
            
            // Carry Handle / Sight
            ctx.fillRect(0.05, -0.12, 0.15, 0.04);
            
            // Curved Mag
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.moveTo(0.18, 0.07); ctx.lineTo(0.24, 0.35); ctx.lineTo(0.14, 0.32); ctx.lineTo(0.12, 0.07);
            ctx.fill(); ctx.stroke();
            
            // Barrel & Handguard
            ctx.fillStyle = '#1A1C1E';
            ctx.beginPath(); ctx.roundRect(0.27, -0.05, 0.3, 0.1, 0.01); ctx.fill(); ctx.stroke(); // Handguard
            ctx.fillStyle = '#333';
            ctx.fillRect(0.57, -0.02, 0.15, 0.04); // Exposed Barrel

            // Handguard Vents
            ctx.fillStyle = '#000';
            for(let i=0; i<5; i++) {
                ctx.fillRect(0.3 + i*0.05, -0.03, 0.03, 0.06);
            }

            // Hands (Rifle) - Both on grip
            ctx.fillStyle = '#FFCDB2'; ctx.strokeStyle = '#E5989B'; ctx.lineWidth = 0.01;
            ctx.beginPath(); ctx.arc(0.02, 0.12, 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Back grip
            ctx.beginPath(); ctx.arc(0.05, 0.15, 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // Front hand (also on grip)
        }

        ctx.restore(); // End Weapon Scale

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
