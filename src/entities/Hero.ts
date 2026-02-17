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
        this.weaponBulletSpeed = ws.bulletSpeed;

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

                for (let i = 0; i < totalMultishot; i++) {
                    const offset = (i - (totalMultishot - 1) / 2) * spread;
                    const angle = baseAngle + offset;
                    const targetX = spawnX + Math.cos(angle) * config.blaster.multishot_target_distance;
                    const targetY = spawnY + Math.sin(angle) * config.blaster.multishot_target_distance;

                    game.bullets.push(new Bullet(spawnX, spawnY, targetX, targetY, this.critChance, this.currentWeapon, this.weaponDamage, this.weaponBulletSpeed, this.weaponRange));
                }

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
        const skinColor = '#FFDAB9';
        const clothesColor = this.damageFlashTimer > 0 ? (Math.floor(this.damageFlashTimer * 100) % 2 === 0 ? '#FFFFFF' : '#2F80FF') : '#2F80FF';
        const outlineColor = this.damageFlashTimer > 0 ? '#FFFFFF' : '#0B3D91';

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
            ctx.fillStyle = '#2F80FF';
            ctx.fillRect(-0.5, -0.7, 1.0, 1.4);
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

        // --- SUBTLE BODY GLOW ---
        ctx.fillStyle = 'rgba(47, 128, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(0, -0.1, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // --- DRAW HUMAN FIGURE ---
        ctx.lineWidth = 0.04;
        ctx.strokeStyle = outlineColor;

        // Legs (Walking Animation)
        const legSwing = Math.sin(this.walkTimer) * 0.4;

        // Left Leg
        ctx.save();
        ctx.translate(-0.18, 0.2);
        ctx.rotate(this.isWalking ? -legSwing : 0);
        // Pants with gradient
        const pantsGradL = ctx.createLinearGradient(-0.12, 0, 0.12, 0);
        pantsGradL.addColorStop(0, '#0F2847');
        pantsGradL.addColorStop(0.5, '#1A365D');
        pantsGradL.addColorStop(1, '#0F2847');
        ctx.fillStyle = pantsGradL;
        ctx.beginPath();
        ctx.roundRect(-0.12, 0, 0.24, 0.4, 0.03);
        ctx.fill();
        ctx.stroke();
        // Boot
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.roundRect(-0.13, 0.38, 0.26, 0.14, [0, 0, 0.04, 0.04]);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.stroke();
        ctx.strokeStyle = outlineColor;
        ctx.restore();

        // Right Leg
        ctx.save();
        ctx.translate(0.18, 0.2);
        ctx.rotate(this.isWalking ? legSwing : 0);
        const pantsGradR = ctx.createLinearGradient(-0.12, 0, 0.12, 0);
        pantsGradR.addColorStop(0, '#0F2847');
        pantsGradR.addColorStop(0.5, '#1A365D');
        pantsGradR.addColorStop(1, '#0F2847');
        ctx.fillStyle = pantsGradR;
        ctx.beginPath();
        ctx.roundRect(-0.12, 0, 0.24, 0.4, 0.03);
        ctx.fill();
        ctx.stroke();
        // Boot
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.roundRect(-0.13, 0.38, 0.26, 0.14, [0, 0, 0.04, 0.04]);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.stroke();
        ctx.strokeStyle = outlineColor;
        ctx.restore();

        // Torso (tactical vest with gradient)
        const vestGrad = ctx.createLinearGradient(-0.35, -0.4, 0.35, 0.35);
        vestGrad.addColorStop(0, '#4A9EFF');
        vestGrad.addColorStop(0.4, clothesColor);
        vestGrad.addColorStop(1, '#1A5ABF');
        ctx.fillStyle = vestGrad;
        ctx.beginPath();
        ctx.roundRect(-0.35, -0.4, 0.7, 0.75, 0.1);
        ctx.fill();
        ctx.stroke();

        // Vest chest highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(-0.28, -0.35, 0.56, 0.25, 0.06);
        ctx.fill();

        // Vest pocket detail (left)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.roundRect(-0.25, -0.05, 0.2, 0.18, 0.03);
        ctx.stroke();

        // Vest pocket detail (right)
        ctx.beginPath();
        ctx.roundRect(0.05, -0.05, 0.2, 0.18, 0.03);
        ctx.stroke();

        // Belt
        ctx.fillStyle = '#222';
        ctx.fillRect(-0.34, 0.2, 0.68, 0.08);
        ctx.fillStyle = '#C0A040';
        ctx.fillRect(-0.04, 0.21, 0.08, 0.06); // Belt buckle

        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 0.04;

        // Arms (skin colored, slightly behind torso)
        const armSwing = this.isWalking ? Math.sin(this.walkTimer) * 0.2 : 0;

        // Left Arm
        ctx.save();
        ctx.translate(-0.38, -0.25);
        ctx.rotate(armSwing);
        const armGradL = ctx.createLinearGradient(-0.09, 0, 0.09, 0);
        armGradL.addColorStop(0, '#E8C4A0');
        armGradL.addColorStop(0.5, skinColor);
        armGradL.addColorStop(1, '#E8C4A0');
        ctx.fillStyle = armGradL;
        ctx.beginPath();
        ctx.roundRect(-0.09, 0, 0.18, 0.5, 0.05);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Right Arm
        ctx.save();
        ctx.translate(0.38, -0.25);
        ctx.rotate(-armSwing);
        const armGradR = ctx.createLinearGradient(-0.09, 0, 0.09, 0);
        armGradR.addColorStop(0, '#E8C4A0');
        armGradR.addColorStop(0.5, skinColor);
        armGradR.addColorStop(1, '#E8C4A0');
        ctx.fillStyle = armGradR;
        ctx.beginPath();
        ctx.roundRect(-0.09, 0, 0.18, 0.5, 0.05);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Head
        const headGrad = ctx.createRadialGradient(0, -0.6, 0, 0, -0.6, 0.28);
        headGrad.addColorStop(0, '#FFE4CC');
        headGrad.addColorStop(0.7, skinColor);
        headGrad.addColorStop(1, '#E8B898');
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.arc(0, -0.6, 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Hair (top of head)
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(0, -0.68, 0.26, Math.PI, 0);
        ctx.fill();

        // Eyes (facing aim direction)
        const input = InputManager.getInstance();
        let aimAngle = 0;
        if (input.isTouchDevice && input.stickRight.active) {
            aimAngle = Math.atan2(input.stickRight.y, input.stickRight.x);
        } else {
            aimAngle = Math.atan2(input.mouseWorld.y - this.y, input.mouseWorld.x - this.x);
        }

        ctx.save();
        ctx.translate(0, -0.55);
        ctx.rotate(aimAngle);
        // Eye whites
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(0.1, -0.07, 0.055, 0.04, 0, 0, Math.PI * 2);
        ctx.ellipse(0.1, 0.07, 0.055, 0.04, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupils
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(0.13, -0.07, 0.03, 0, Math.PI * 2);
        ctx.arc(0.13, 0.07, 0.03, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // --- RENDER WEAPON ---
        this.drawWeapon(ctx, aimAngle);

        ctx.restore(); // End Main Transform (this.x, this.y)
    }

    private drawWeapon(ctx: CanvasRenderingContext2D, aimAngle: number): void {
        ctx.save();
        ctx.rotate(aimAngle);

        // Flip gun vertically if aiming left so it's not upside down
        const flipY = Math.abs(aimAngle) > Math.PI / 2 ? -1 : 1;
        if (flipY === -1) {
            ctx.scale(1, -1);
        }

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.03;

        switch (this.currentWeapon) {
            case 'smg':
                // --- SMG MODEL (Tactical PDW Style) ---
                // Upper Receiver
                ctx.fillStyle = '#2a2a2a';
                ctx.beginPath();
                ctx.roundRect(0.1, -0.2, 0.55, 0.24, 0.04);
                ctx.fill(); ctx.stroke();

                // Rail/Top detail
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(0.15, -0.24, 0.45, 0.06);

                // Curved Vertical Magazine
                ctx.fillStyle = '#151515';
                ctx.save();
                ctx.translate(0.42, 0.04);
                ctx.rotate(0.05);
                ctx.beginPath();
                ctx.roundRect(-0.06, 0, 0.14, 0.42, 0.03);
                ctx.fill(); ctx.stroke();
                ctx.restore();

                // Tactical Grip
                ctx.save();
                ctx.translate(0.18, 0.04);
                ctx.rotate(0.15);
                ctx.fillStyle = '#1a1a1a';
                ctx.roundRect(-0.07, 0, 0.15, 0.32, 0.03);
                ctx.fill(); ctx.stroke();
                ctx.restore();

                // Barrel with Muzzle Brake
                ctx.fillStyle = '#111';
                ctx.fillRect(0.65, -0.14, 0.15, 0.1);
                ctx.fillStyle = '#222';
                ctx.fillRect(0.8, -0.16, 0.08, 0.14); // Brake
                break;

            case 'shotgun':
                // --- SHOTGUN MODEL (Heavy Duty Pump) ---
                // Main Body / Receiver
                ctx.fillStyle = '#3a3a3a';
                ctx.beginPath();
                ctx.roundRect(-0.1, -0.18, 0.6, 0.22, 0.02);
                ctx.fill(); ctx.stroke();

                // Dual Barrel Setup (implied)
                ctx.fillStyle = '#222';
                ctx.beginPath();
                ctx.roundRect(0.5, -0.16, 0.8, 0.16, 0.01);
                ctx.fill(); ctx.stroke();

                // Pump / Forend (Ribbed)
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.roundRect(0.45, 0, 0.4, 0.16, 0.04);
                ctx.fill(); ctx.stroke();
                for (let i = 0; i < 3; i++) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                    ctx.beginPath();
                    ctx.moveTo(0.55 + i * 0.1, 0.02);
                    ctx.lineTo(0.55 + i * 0.1, 0.14);
                    ctx.stroke();
                }

                // Pistol Grip and Stock base
                ctx.fillStyle = '#111';
                ctx.beginPath();
                ctx.moveTo(0, 0.04);
                ctx.lineTo(-0.25, 0.25);
                ctx.lineTo(0.1, 0.25);
                ctx.lineTo(0.18, 0.04);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                break;

            case 'rifle':
                // --- RIFLE MODEL (Modern Assault Rifle) ---
                // Upper Receiver
                ctx.fillStyle = '#3a3a3a';
                ctx.beginPath();
                ctx.roundRect(0, -0.24, 0.7, 0.22, 0.05);
                ctx.fill(); ctx.stroke();

                // Long Barrel with Suppressor style tip
                ctx.fillStyle = '#111';
                ctx.fillRect(0.7, -0.16, 0.65, 0.08);
                ctx.fillStyle = '#1a1a1a';
                ctx.roundRect(1.1, -0.19, 0.3, 0.14, 0.02); // Muzzle device
                ctx.fill(); ctx.stroke();

                // Handguard (Vented)
                ctx.fillStyle = '#222';
                ctx.roundRect(0.45, -0.05, 0.35, 0.18, 0.02);
                ctx.fill(); ctx.stroke();

                // Long Stamped Magazine
                ctx.save();
                ctx.translate(0.4, 0.05);
                ctx.rotate(-0.15);
                ctx.fillStyle = '#1a1a1a';
                ctx.roundRect(-0.07, 0, 0.16, 0.5, 0.05);
                ctx.fill(); ctx.stroke();
                ctx.restore();

                // Adjustable Stock
                ctx.beginPath();
                ctx.moveTo(0, -0.24);
                ctx.lineTo(-0.45, 0.15);
                ctx.lineTo(-0.2, 0.15);
                ctx.lineTo(0.1, -0.02);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                break;

            default:
                // --- PISTOL MODEL (Modern Sidearm) ---
                // Grip
                ctx.save();
                ctx.translate(0.18, 0.0);
                ctx.rotate(0.2);
                ctx.fillStyle = '#151515';
                ctx.roundRect(-0.09, -0.02, 0.2, 0.42, 0.04);
                ctx.fill(); ctx.stroke();
                ctx.restore();

                // Frame
                ctx.fillStyle = '#2a2a2a';
                ctx.beginPath();
                ctx.roundRect(0.08, -0.05, 0.55, 0.15, 0.02);
                ctx.fill(); ctx.stroke();

                // Slide (Two-tone look)
                ctx.fillStyle = '#3a3a3a';
                ctx.beginPath();
                ctx.roundRect(0.05, -0.26, 0.85, 0.22, 0.04);
                ctx.fill(); ctx.stroke();

                // Slide Detail (Ejection Port)
                ctx.fillStyle = '#111';
                ctx.fillRect(0.35, -0.22, 0.15, 0.06);
                break;
        }

        // Common Muzzle Detail (Hole with glow)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        let mX = 0.88;
        if (this.currentWeapon === 'smg') mX = 0.85;
        if (this.currentWeapon === 'shotgun') mX = 1.25;
        if (this.currentWeapon === 'rifle') mX = 1.35;
        ctx.arc(mX, -0.1, 0.04, 0, Math.PI * 2);
        ctx.fill();

        // Subtle barrel glint
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.moveTo(0.2, -0.2);
        ctx.lineTo(mX - 0.2, -0.2);
        ctx.stroke();

        ctx.restore();
    }
}
