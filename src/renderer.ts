import { ConfigManager } from "./config";
import { Game } from "./game";
import { InputManager } from "./input";
import { Hero } from "./entities/Hero";


export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private pixelsPerUnit: number = 20; // Zoom level

  private shakeTimer: number = 0;
  private shakeIntensity: number = 0;
  private deathFlashTimer: number = 0;

  // Background Stars (Deterministic based on coords)
  private stars: { x: number; y: number; r: number; alpha: number }[] = [];
  private rickImg: HTMLImageElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.width = canvas.width = window.innerWidth;
    this.height = canvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
      this.width = canvas.width = window.innerWidth;
      this.height = canvas.height = window.innerHeight;
    });

    // Pre-load Rick Roll GIF
    this.rickImg = new Image();
    this.rickImg.src = "/rick.gif";

    // Pre-load Gun Sprite
    const gunImg = new Image();
    gunImg.src = "/src/assets/images/gun_sprite.png";
    gunImg.onload = () => {
        (window as any).__GUN_IMG = gunImg;
    };

    // Pre-load Realistic Hero Sprite
    const heroImg = new Image();
    heroImg.src = "/src/assets/images/hero_sprite.png";
    heroImg.onload = () => {
        (window as any).__HERO_IMG = heroImg;
    };

    // Pre-generate some star data for parallax chunks
    for (let i = 0; i < 200; i++) {
      this.stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        r: 0.2 + Math.random() * 0.8,
        alpha: 0.3 + Math.random() * 0.7,
      });
    }
  }

  public render(game: Game) {
    const entities = game.getEntities();

    // Update Shake
    const dt = 1 / 60;
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
    }

    // --- NEW PREMIUM BACKGROUND (Cyberpunk Inferno) ---
    // 0. Base Nebula Gradient
    // --- NEW NIGHT-BLUEPRINT BACKGROUND ---
    this.ctx.fillStyle = "#0f172a"; // Deep Navy Slate
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Center camera on Hero if exists
    const cameraX = entities.hero ? entities.hero.x : 0;
    const cameraY = entities.hero ? entities.hero.y : 0;

    // 0.5. Parallax Starfield
    this.drawParallaxStars(cameraX, cameraY);

    // Sync InputManager with camera
    const input = InputManager.getInstance();
    input.cameraOffset.x = cameraX;
    input.cameraOffset.y = cameraY;
    input.updateMouseWorld();

    this.ctx.save();

    // 1. Screen Space to World Space Translation
    // Center of screen
    this.ctx.translate(this.width / 2, this.height / 2);

    // Screen Shake Apply
    if (this.shakeTimer > 0) {
      const sx =
        (Math.random() - 0.5) * this.shakeIntensity * this.pixelsPerUnit;
      const sy =
        (Math.random() - 0.5) * this.shakeIntensity * this.pixelsPerUnit;
      this.ctx.translate(sx, sy);
    }

    // Zoom/Scale
    this.ctx.scale(this.pixelsPerUnit, this.pixelsPerUnit);

    // Camera Offset (negative hero pos)
    this.ctx.translate(-cameraX, -cameraY);

    // Draw Arena Floor (New Brotato Style)
    this.drawArenaFloor();

    // Draw Infinite Grid
    this.drawInfiniteGrid(cameraX, cameraY);

    // Draw Arena Boundary
    this.drawArenaBoundary();

    // --- DRAW DYNAMIC DROP SHADOWS ---
    this.ctx.save();
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // Strong shadow
    
    // Enemy shadows
    for (const enemy of entities.enemies) {
      this.ctx.beginPath();
      // Most enemies have a radius property, we'll try to read it or estimate.
      const r = (enemy as any).radius || 1.0;
      this.ctx.ellipse(enemy.x, enemy.y + r * 0.8, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // Coin shadows
    if (entities.coins) {
      for (const coin of entities.coins) {
        this.ctx.beginPath();
        this.ctx.ellipse(coin.x, coin.y + 0.3, 0.4, 0.2, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Hero shadow
    if (entities.hero) {
      this.ctx.beginPath();
      // Hero base size is roughly 1.5 scale now, so a bit larger shadow
      this.ctx.ellipse(entities.hero.x, entities.hero.y + 0.7, 1.3, 0.5, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // Turret shadows
    if (game.turrets) {
        for (const turret of game.turrets) {
            this.ctx.beginPath();
            this.ctx.ellipse(turret.x, turret.y + 0.4, 0.8, 0.3, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    // Med Turret shadows
    if (game.medTurrets) {
        for (const med of game.medTurrets) {
            this.ctx.beginPath();
            this.ctx.ellipse(med.x, med.y + 0.4, 0.8, 0.3, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    // Landmine shadows
    if (game.mines) {
        for (const mine of game.mines) {
            this.ctx.beginPath();
            this.ctx.ellipse(mine.x, mine.y + 0.15, 0.5, 0.2, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    this.ctx.restore();

    // Draw Entities
    for (const enemy of entities.enemies) {
      enemy.draw(this.ctx);
    }

    if (entities.coins) {
      for (const coin of entities.coins) {
        coin.draw(this.ctx);
      }
    }

    for (const bomb of entities.bombs) {
      bomb.draw(this.ctx);
    }

    for (const bullet of entities.bullets) {
      bullet.draw(this.ctx);
    }

    if (entities.hero) {
      entities.hero.draw(this.ctx);
    }

    if (game.turrets) {
      for (const turret of game.turrets) {
        turret.draw(this.ctx);
      }
    }

    if (game.medTurrets) {
      for (const med of game.medTurrets) {
        med.draw(this.ctx);
      }
    }

    if (game.mines) {
      for (const mine of game.mines) {
        mine.draw(this.ctx);
      }
    }

    this.drawTelegraphs(game);
    this.drawEnemyBars(entities.enemies);

    // --- COMBOS (World Space Popups) ---
    for (const combo of game.combos) {
      this.ctx.save();
      this.ctx.translate(combo.x, combo.y);
      this.ctx.scale(1 / this.pixelsPerUnit, 1 / this.pixelsPerUnit);
      this.ctx.font = "bold 32px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      const alpha = Math.min(1.0, combo.timer * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      this.ctx.lineWidth = 4;
      this.ctx.strokeText(combo.text, 0, 0);
      this.ctx.fillText(combo.text, 0, 0);
      this.ctx.restore();
    }

    this.ctx.restore(); // Back to screen space

    // --- Atmospheric Dimming (Conditional) ---
    if (
      game.waveManager.isShopOpen ||
      game.waveManager.isReady ||
      game.waveManager.isIndexOpen
    ) {
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    this.drawUI(game);

    // Mobile Controls
    this.drawMobileControls();

    if (game.deathHighlightTimer > 0) {
      this.drawDeathClarity(game);
    }

    // --- DEATH FLASH ---
    if (this.deathFlashTimer > 0) {
      this.deathFlashTimer -= 0.016; // Approx dt
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.deathFlashTimer * 2})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // --- PAUSE OVERLAY ---
    if (game.isPaused) {
      this.drawPauseOverlay();
    }

    // --- ENEMY INDEX ---
    if (game.waveManager.isIndexOpen) {
      this.drawEnemyIndex();
    }

    // --- STATS OVERLAY ---
    if (game.waveManager.isStatsOpen) {
      this.drawStatsOverlay(game);
    }

    this.drawScanlines();

    // --- SCOPE CROSSHAIR CURSOR (desktop only) ---
    const cursorInput = InputManager.getInstance();
    if (!cursorInput.isTouchDevice) {
      this.drawCrosshair(cursorInput.mouse.x, cursorInput.mouse.y);
    }
  }

  private drawArenaFloor() {
    const config = ConfigManager.getConfig();
    const halfW = config.arena.width / 2;
    const halfH = config.arena.height / 2;
    const ctx = this.ctx;

    ctx.save();
    
    // Base Floor: Simple dark shade
    ctx.fillStyle = "#1e2226"; 
    ctx.fillRect(-halfW, -halfH, config.arena.width, config.arena.height);

    // Faint, clean minimalist grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let x = -halfW; x <= halfW; x += 10) {
      ctx.moveTo(x, -halfH);
      ctx.lineTo(x, halfH);
    }
    for (let y = -halfH; y <= halfH; y += 10) {
      ctx.moveTo(-halfW, y);
      ctx.lineTo(halfW, y);
    }
    ctx.stroke();

    // Minor sector lines for framing the center
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(-halfW, 0); ctx.lineTo(halfW, 0);
    ctx.moveTo(0, -halfH); ctx.lineTo(0, halfH);
    ctx.stroke();

    // Central Arena "Ring" marker
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();

    // Yellow and Black Warning Stripes along the very edge
    const stripeWidth = 1.0;
    ctx.lineWidth = stripeWidth;
    ctx.strokeStyle = "#FFCC00";
    
    // Draw inset warning line
    ctx.strokeRect(-halfW + 0.5, -halfH + 0.5, config.arena.width - 1.0, config.arena.height - 1.0);
    
    // Black dashes over the yellow line to make warning stripes
    ctx.save();
    ctx.strokeStyle = "#111111";
    ctx.setLineDash([2, 2]); // 2 units black, 2 units gap (shows yellow)
    ctx.strokeRect(-halfW + 0.5, -halfH + 0.5, config.arena.width - 1.0, config.arena.height - 1.0);
    ctx.restore();

    ctx.restore();
  }

  private drawArenaBoundary() {
    const config = ConfigManager.getConfig();
    const halfW = config.arena.width / 2;
    const halfH = config.arena.height / 2;
    const ctx = this.ctx;
    const wallThickness = 2.0;

    ctx.save();
    
    // Outer shadow (creates depth so it looks like a pit/arena)
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 10;

    // Outer Concrete Wall
    ctx.fillStyle = "#1a1b1c"; // Very dark, thick concrete
    ctx.beginPath();
    ctx.rect(-halfW - wallThickness, -halfH - wallThickness, config.arena.width + wallThickness * 2, config.arena.height + wallThickness * 2);
    // Hole for the arena floor
    ctx.rect(halfW, -halfH, -config.arena.width, config.arena.height);
    ctx.fill("evenodd");
    
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Wall Highlights & Shadows (Bevel effect)
    ctx.lineWidth = 0.2;
    // Top & Left edges catch light
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.moveTo(-halfW, halfH);
    ctx.lineTo(-halfW, -halfH);
    ctx.lineTo(halfW, -halfH);
    ctx.stroke();
    
    // Bottom & Right edges are shaded
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.beginPath();
    ctx.moveTo(halfW, -halfH);
    ctx.lineTo(halfW, halfH);
    ctx.lineTo(-halfW, halfH);
    ctx.stroke();

    ctx.restore();
  }

  private drawInfiniteGrid(cameraX: number, cameraY: number) {
    const ctx = this.ctx;
    const config = ConfigManager.getConfig();
    const gridSize = config.arena.grid_size || 2;

    const halfWidth = this.width / 2 / this.pixelsPerUnit;
    const halfHeight = this.height / 2 / this.pixelsPerUnit;

    const startX = Math.floor((cameraX - halfWidth) / gridSize) * gridSize;
    const endX = Math.ceil((cameraX + halfWidth) / gridSize) * gridSize;
    const startY = Math.floor((cameraY - halfHeight) / gridSize) * gridSize;
    const endY = Math.ceil((cameraY + halfHeight) / gridSize) * gridSize;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.03)"; // Very faint dark grid
    ctx.lineWidth = 0.02;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Functional Floor Markers (Angular/Structured)
    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        const seed = Math.sin(x * 1.5) + Math.cos(y * 1.1);
        if (seed > 0.85) {
          const glow = (Math.sin(Date.now() * 0.002 + x) + 1) / 2;
          ctx.fillStyle = `rgba(0, 255, 255, ${0.05 + glow * 0.1})`; // Cyan Node
          ctx.fillRect(x - 0.2, y - 0.2, 0.4, 0.4);

          ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + glow * 0.4})`; // White Node
          ctx.fillRect(x - 0.025, y - 0.025, 0.05, 0.05);
        }
      }
    }
    ctx.restore();
  }

  private drawParallaxStars(camX: number, camY: number) {
    const ctx = this.ctx;
    ctx.save();
    
    // Atmospheric Dust Particles
    const layers = [
      { speed: 0.05, color: "rgba(100, 100, 100, 0.4)", size: 1.5 },
      { speed: 0.1, color: "rgba(150, 150, 150, 0.6)", size: 1.0 },
      { speed: 0.2, color: "rgba(200, 200, 200, 0.8)", size: 0.5 },
    ];

    layers.forEach((layer, lIdx) => {
      ctx.fillStyle = layer.color;

      // Loop through pre-gen stars (repurposed as dust notes)
      this.stars.forEach((star, sIdx) => {
        if (sIdx % layers.length !== lIdx) return;

        // Slow organic drift
        const driftX = Math.sin(Date.now() * 0.0005 + star.y) * 20;
        const driftY = Date.now() * 0.001 * layer.speed * 50;

        let sx = (star.x - camX * layer.speed * 15 + driftX) % this.width;
        let sy = (star.y - camY * layer.speed * 15 + driftY) % this.height;
        if (sx < 0) sx += this.width;
        if (sy < 0) sy += this.height;

        // Draw soft dusty circle
        ctx.beginPath();
        ctx.arc(sx, sy, star.r * layer.size, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.restore();
  }

  private drawScanlines() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "overlay";

    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    for (let y = 0; y < this.height; y += 4) {
      ctx.fillRect(0, y, this.width, 2);
    }

    ctx.restore();
  }

  private drawCrosshair(mx: number, my: number) {
    const ctx = this.ctx;
    ctx.save();

    const innerGap = 5;
    const lineLen = 10;
    const col = 'rgba(255, 40, 40, 0.9)';

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;

    // Top
    ctx.beginPath();
    ctx.moveTo(mx, my - innerGap);
    ctx.lineTo(mx, my - innerGap - lineLen);
    ctx.stroke();

    // Bottom
    ctx.beginPath();
    ctx.moveTo(mx, my + innerGap);
    ctx.lineTo(mx, my + innerGap + lineLen);
    ctx.stroke();

    // Left
    ctx.beginPath();
    ctx.moveTo(mx - innerGap, my);
    ctx.lineTo(mx - innerGap - lineLen, my);
    ctx.stroke();

    // Right
    ctx.beginPath();
    ctx.moveTo(mx + innerGap, my);
    ctx.lineTo(mx + innerGap + lineLen, my);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawUI(game: Game) {
    const ctx = this.ctx;
    const waveMgr = game.waveManager;

    ctx.save();
    ctx.resetTransform();

    const width = this.ctx.canvas.width;
    const height = this.ctx.canvas.height;
    const centerX = width / 2;

    if (game.hero && !game.hero.isDead) {
      const hpPct = game.hero.hp / game.hero.maxHp;
      if (hpPct <= 0.3) {
        const pulse = (Math.sin(performance.now() / 200) + 1) / 2;
        const opacity = 0.1 + pulse * 0.4;

        const grad = ctx.createRadialGradient(
          centerX,
          height / 2,
          0,
          centerX,
          height / 2,
          Math.sqrt(centerX * centerX + (height / 2) * (height / 2)),
        );
        grad.addColorStop(0.6, "rgba(255, 0, 0, 0)");
        grad.addColorStop(1, `rgba(255, 0, 0, ${opacity})`);

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, width, height);
      }
    }

    // 0. Top Left HUD Plate (Premium Glassmorphism)
    ctx.save();
    ctx.textAlign = "left";

    const input = InputManager.getInstance();
    
    // Create a smooth, dark gradient for the HUD background
    const hudWidth = input.isTouchDevice ? 170 : 240;
    const hudHeight = input.isTouchDevice ? 65 : 85;
    const hudGrad = ctx.createLinearGradient(10, 10, 10, 10 + hudHeight);
    hudGrad.addColorStop(0, "rgba(20, 25, 35, 0.85)");
    hudGrad.addColorStop(1, "rgba(10, 12, 18, 0.95)");

    ctx.fillStyle = hudGrad;
    ctx.beginPath();
    ctx.roundRect(10, 10, hudWidth, hudHeight, 12);
    ctx.fill();
    
    // Add a glowing neon border to the HUD
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(0, 255, 255, 0.4)";
    ctx.strokeStyle = "rgba(0, 255, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow for text

    if (input.isTouchDevice) {
      // Mobile HUD
      ctx.font = "bold 15px 'Inter', sans-serif";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(`SCORE: ${game.score.toLocaleString()}`, 25, 35);

      ctx.font = "bold 14px 'Inter', sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.fillText(`COINS: ${game.coinCount}`, 25, 58);
    } else {
      // Desktop HUD
      ctx.font = "bold 20px 'Inter', sans-serif";
      
      // Score with slight drop shadow for readability
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(`SCORE: ${game.score.toLocaleString()}`, 30, 42);

      // Coins in Gold
      ctx.font = "bold 18px 'Inter', sans-serif";
      ctx.fillStyle = "#FFD700";
      ctx.fillText(`COINS: ${game.coinCount}`, 30, 72);
      ctx.restore(); // Custom restore to clear shadows from HUD block
      ctx.save();
    }
    ctx.restore();

    // Pause Button (HUD) - Top Right
    if (
      !game.hero.isDead &&
      !waveMgr.isReady &&
      !waveMgr.isIndexOpen &&
      !waveMgr.isShopOpen
    ) {
      this.drawButton(this.width - 80, 50, 100, 35, "PAUSE", "#FFFFFF");
    }

    ctx.textAlign = "center";
    ctx.font = "bold 34px 'Inter', sans-serif"; // Better font

    if (waveMgr.isWaveActive) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = waveMgr.stateTimer <= 5 ? "#FF0000" : "#00FFFF";
      ctx.fillStyle = waveMgr.stateTimer <= 5 ? "#FF4444" : "#FFFFFF";
      ctx.fillText(waveMgr.stateTimer.toFixed(1), centerX, 50);
      ctx.shadowBlur = 0;

      ctx.font = "bold 22px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillText(`WAVE ${waveMgr.currentWave}`, centerX, 80);
    } else if (waveMgr.isWaveComplete) {
      ctx.save();
      ctx.shadowBlur = 30;
      ctx.shadowColor = "#FFD84D";
      ctx.fillStyle = "#FFD84D";
      ctx.font = "bold 70px monospace";
      ctx.fillText("WAVE DEFEATED", centerX, height / 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 24px monospace";
      ctx.fillText("COLLECTING REMNANTS...", centerX, height / 2 + 60);
      ctx.restore();
    } else if (waveMgr.isCountdown) {
      ctx.fillStyle = "#FF4E00";
      ctx.font = "bold 100px monospace";
      ctx.fillText(
        Math.ceil(waveMgr.stateTimer).toString(),
        centerX,
        height / 2,
      );

      ctx.font = "bold 30px monospace";
      ctx.fillStyle = "#FFF";
      ctx.fillText("INITIATING WAVE INBOUND", centerX, height / 2 - 100);
    } else if (waveMgr.isReady) {
      ctx.fillStyle = "#FF0000";
      ctx.font = "bold 80px sans-serif";
      ctx.fillText("HOT ZONE", centerX, height / 2 - 120);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("MADE BY ANTON LI USING AI", centerX, height / 2 - 80);

      const startBtnY = height / 2;
      this.drawButton(centerX, startBtnY, 280, 55, "START GAME", "#00FF00");
      this.drawButton(
        centerX,
        startBtnY + 70,
        280,
        55,
        "ENEMY INDEX",
        "#FFD84D",
      );

      // --- COLOR CUSTOMIZATION SWATCHES ---
      const colors = ['#FF3333', '#3388FF', '#33FF55', '#FFCC00', '#B833FF'];
      const swatchSize = 40;
      const swatchGap = 15;
      const totalWidth = (colors.length * swatchSize) + ((colors.length - 1) * swatchGap);
      const startX = centerX - totalWidth / 2;
      const swatchY = startBtnY + 140;

      ctx.save();
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#AAA";
      ctx.fillText("SELECT HAT COLOR", centerX, swatchY - 15);

      colors.forEach((c, i) => {
          const x = startX + i * (swatchSize + swatchGap);
          
          // Selection Highlight
          if (c === Hero.defaultHatColor) {
              ctx.lineWidth = 3;
              ctx.strokeStyle = "#FFF";
              ctx.strokeRect(x - 3, swatchY - 3, swatchSize + 6, swatchSize + 6);
          }

          ctx.fillStyle = c;
          ctx.fillRect(x, swatchY, swatchSize, swatchSize);
          
          // Inner shadow for depth
          ctx.strokeStyle = "rgba(0,0,0,0.5)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, swatchY, swatchSize, swatchSize);
      });
      ctx.restore();


      const input = InputManager.getInstance();
      ctx.font = "20px sans-serif";
      ctx.fillStyle = "#666"; // Dimmed slightly to make room for swatches
      if (input.isTouchDevice) {
        ctx.fillText(
          "Touch Left Side to Move, Right Side to Aim",
          centerX,
          swatchY + 70,
        );
        ctx.fillText("Tap Buttons for Actions", centerX, swatchY + 100);
      } else {
        ctx.fillText(
          "WASD/Arrows to Move, Mouse to Aim",
          centerX,
          swatchY + 70,
        );
      }
    } else if (waveMgr.isIndexOpen) {
      // Handled in main render loop for better layering if needed
      // but we can black out here too
      ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
      ctx.fillRect(0, 0, width, height);
    }

    if (waveMgr.isIndexOpen) {
      // Handled in main render loop for better layering if needed
      // but we can black out here too
      ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
      ctx.fillRect(0, 0, width, height);
    }

    if (waveMgr.isShopOpen) {
      // Darken background more for focus
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, width, height);

      // 1. Shop Header
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = "#FF7B00";
      ctx.font = "bold 36px monospace";
      ctx.fillText("SHOP", centerX, 50);

      this.drawButton(centerX, 110, 240, 45, "DEPLOY TO NEXT WAVE", "#FF4E00");

      // 2. Upgrade Cards
      const input = InputManager.getInstance();
      let cardWidth = 260;
      let cardHeight = 360;
      let spacing = 40;
      let titleFont = "bold 24px sans-serif";
      let descFont = "16px sans-serif";
      let costFont = "bold 22px monospace";

      if (input.isTouchDevice) {
        const totalSpacing = 20; // 10px between cards
        // Reduce available width multiplier to make cards smaller relative to screen
        const availableWidth = Math.min(this.width - 20, 600);
        cardWidth = Math.floor((availableWidth - totalSpacing * 2) / 3);
        // Force max width on mobile to avoid huge cards on tablets/landscape
        if (cardWidth > 160) cardWidth = 160;

        cardHeight = cardWidth * 1.4; // Slightly shorter aspect ratio (was 1.5)
        spacing = 10;

        // Scale fonts
        const scale = cardWidth / 260;
        titleFont = `bold ${Math.max(10, Math.floor(20 * scale))}px sans-serif`;
        descFont = `${Math.max(8, Math.floor(14 * scale))}px sans-serif`;
        costFont = `bold ${Math.max(10, Math.floor(18 * scale))}px monospace`;
      }

      const cardsPerRow = 3;
      const totalWidth = cardWidth * cardsPerRow + spacing * (cardsPerRow - 1);
      const startX = centerX - totalWidth / 2;
      const startY = 180 + game.shopScrollOffset;

      // Create clipping region to prevent scrolling over the title/button
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 150, this.width, this.height - 150);
      ctx.clip();

      for (let i = 0; i < game.currentShopOptions.length; i++) {
        const opt = game.currentShopOptions[i];
        if (!opt) continue;

        const row = Math.floor(i / cardsPerRow);
        const col = i % cardsPerRow;

        const x = startX + col * (cardWidth + spacing);
        const y = startY + row * (cardHeight + spacing);

        const mx = input.mouse.x;
        const my = input.mouse.y;
        const isHovered =
          mx >= x && mx <= x + cardWidth && my >= y && my <= y + cardHeight;

        // Card lift effect
        const hoverOffset = isHovered ? -10 : 0;

        ctx.save();
        ctx.translate(0, hoverOffset);

        // Card Base (Premium Glassmorphism)
        const cardGrad = ctx.createLinearGradient(x, y, x, y + cardHeight);
        if (isHovered) {
          cardGrad.addColorStop(0, "rgba(50, 50, 60, 0.95)");
          cardGrad.addColorStop(1, "rgba(25, 25, 35, 0.98)");
        } else {
          cardGrad.addColorStop(0, "rgba(30, 30, 35, 0.9)");
          cardGrad.addColorStop(1, "rgba(15, 15, 20, 0.95)");
        }

        ctx.fillStyle = cardGrad;
        ctx.beginPath();
        ctx.roundRect(x, y, cardWidth, cardHeight, 16);
        ctx.fill();

        // Glowing Card Border
        ctx.shadowBlur = isHovered ? 15 : 0;
        ctx.shadowColor = isHovered ? "rgba(0, 255, 255, 0.5)" : "transparent";
        ctx.strokeStyle = isHovered ? "#00FFFF" : "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow for contents

        // 3. Upgrade Icon (Simplified Vector)
        ctx.save();
        ctx.translate(x + cardWidth / 2, y + cardHeight * 0.22);
        // Scale icon if card is small
        if (cardWidth < 150) ctx.scale(cardWidth / 260, cardWidth / 260);
        this.drawUpgradeIcon(ctx, opt.type, isHovered, (opt as any).weaponId);
        ctx.restore();

        // 4. Content
        ctx.textAlign = "center";

        // Name
        ctx.fillStyle = "#FFF";
        ctx.font = titleFont;
        ctx.fillText(
          opt.name.toUpperCase(),
          x + cardWidth / 2,
          y + cardHeight * 0.47,
        );

        // Description
        ctx.font = descFont;
        ctx.fillStyle = "#BBB";
        const descLines = opt.description.split("\n");
        const lineHeight = parseInt(descFont) + 4;
        descLines.forEach((line, li) => {
          ctx.fillText(
            line,
            x + cardWidth / 2,
            y + cardHeight * 0.57 + li * lineHeight,
          );
        });

        // Cost Section
        const isWeapon = opt.type === 'weapon';
        const weaponId = (opt as any).weaponId;
        const isOwned = isWeapon && game.hero.ownedWeapons.includes(weaponId);
        const isEquipped = isWeapon && game.hero.currentWeapon === weaponId;

        const afford = game.coinCount >= opt.cost;
        const costY = y + cardHeight - cardHeight * 0.14;

        // Cost bar
        ctx.fillStyle = (isOwned || afford)
          ? "rgba(0, 255, 100, 0.1)"
          : "rgba(255, 0, 0, 0.1)";
        ctx.fillRect(x + 10, costY - 20, cardWidth - 20, 40);

        ctx.font = costFont;
        if (isEquipped) {
          ctx.fillStyle = "#00FF88";
          ctx.fillText("EQUIPPED", x + cardWidth / 2, costY + 5);
        } else if (isOwned) {
          ctx.fillStyle = "#FFD84D"; // Gold
          // Adaptive font for long text
          if (cardWidth < 150) ctx.font = `bold ${Math.max(8, Math.floor(14 * (cardWidth / 260)))}px monospace`;
          ctx.fillText("ALREADY PURCHASED", x + cardWidth / 2, costY + 5);
        } else {
          ctx.fillStyle = afford ? "#00FF88" : "#FF4444";
          ctx.fillText(`COINS: ${opt.cost}`, x + cardWidth / 2, costY + 5);
        }

        ctx.restore();
      }

      // Reroll Button
      const rowCount = Math.ceil(game.currentShopOptions.length / cardsPerRow);
      const rerollBtnY = startY + rowCount * (cardHeight + spacing) - spacing + 30;
      const canAffordReroll = game.coinCount >= game.rerollCost;

      this.drawButton(
        centerX,
        rerollBtnY,
        200,
        45,
        `REROLL (${game.rerollCost})`,
        canAffordReroll ? "#FFD84D" : "#888888",
      );

      // Restore clipping context
      ctx.restore();
      // Button background
      ctx.save();
      const rBtnW = 200;
      const rBtnH = 44;
      const rBtnX = centerX - rBtnW / 2;
      const rBtnYTop = rerollBtnY - rBtnH / 2;

      const rerollGrad = ctx.createLinearGradient(rBtnX, rBtnYTop, rBtnX, rBtnYTop + rBtnH);
      if (canAffordReroll) {
        rerollGrad.addColorStop(0, "rgba(255, 165, 0, 0.3)");
        rerollGrad.addColorStop(1, "rgba(255, 100, 0, 0.3)");
      } else {
        rerollGrad.addColorStop(0, "rgba(80, 80, 80, 0.3)");
        rerollGrad.addColorStop(1, "rgba(50, 50, 50, 0.3)");
      }

      ctx.fillStyle = rerollGrad;
      ctx.beginPath();
      ctx.roundRect(rBtnX, rBtnYTop, rBtnW, rBtnH, 10);
      ctx.fill();

      // Check hover
      const rerollHovered = input.mouse.x >= rBtnX && input.mouse.x <= rBtnX + rBtnW &&
        input.mouse.y >= rBtnYTop && input.mouse.y <= rBtnYTop + rBtnH;

      ctx.strokeStyle = canAffordReroll
        ? (rerollHovered ? "#FFA500" : "rgba(255, 165, 0, 0.5)")
        : "rgba(100, 100, 100, 0.5)";
      ctx.lineWidth = rerollHovered && canAffordReroll ? 2.5 : 1.5;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 18px monospace";

      if (canAffordReroll) {
        ctx.fillStyle = "#FFA500";
        ctx.fillText(`REROLL - ${game.rerollCost} COINS`, centerX, rerollBtnY - 2);
        ctx.font = "12px monospace";
        ctx.fillStyle = "#AAA";
        ctx.fillText("(R)", centerX, rerollBtnY + 14);
      } else {
        ctx.fillStyle = "#666";
        ctx.fillText(`REROLL - ${game.rerollCost} COINS`, centerX, rerollBtnY - 2);
        ctx.font = "12px monospace";
        ctx.fillStyle = "#555";
        ctx.fillText("CAN'T AFFORD", centerX, rerollBtnY + 14);
      }

      ctx.restore();
    }

    // Only show overlay after a delay for the Rick Roll, or immediately for normal game over
    // Use deathPauseTimer to delay the overlay.
    // We set deathPauseTimer to 3.0 on death.
    // Let's say we want to show the overlay when timer < 1.5 (so 1.5s delay)

    const showOverlay = (game.hero.isDead || game.hero.isDying);

    if (showOverlay) {
      const alpha = 1.0;
      ctx.save();
      ctx.globalAlpha = alpha;

      // Lowered Button (height/2 + 150)
      this.drawButton(centerX, height / 2 + 150, 220, 60, "RESTART", "#FFFFFF");
      ctx.restore();
    }

    this.drawPermanentStatsBar(game);
    ctx.restore();
  }

  private drawPermanentStatsBar(game: Game) {
    const ctx = this.ctx;
    const config = ConfigManager.getConfig();

    const barWidth = 220; // Increased width
    const barHeight = 375; // Increased height
    const x = 15;
    const y = 230; // Anchored below score/coins box

    const input = InputManager.getInstance();

    ctx.save();

    // --- DESKTOP STATS BOX ---
    if (!input.isTouchDevice) {
      // Glassmorphism background
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)"; // Slightly darker for contrast
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 16);
      ctx.fill();

      // Border - neon blue accent
      ctx.strokeStyle = "rgba(93, 173, 226, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // --- CONSOLIDATED HERO HUD ---
    // On mobile, stick it to top left (under score/coins)
    // Desktop: Above stats box
    const isMobile = input.isTouchDevice;
    const hudH = isMobile ? 80 : 115; // Compact height for mobile
    const hudY = isMobile ? 80 : y - hudH - 12; // Moved up slightly on mobile (from 100 to 80)

    // For mobile, we also make it narrower if needed, but keeping width is usually fine if it fits.
    // Let's reduce width on mobile to avoid blocking center screen
    const effectiveBarWidth = isMobile ? 180 : barWidth;

    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.beginPath();
    // On mobile, align left with padding
    const drawX = isMobile ? 10 : x;
    ctx.roundRect(drawX, hudY, effectiveBarWidth, hudH, 12);
    ctx.fill();
    ctx.strokeStyle = "#5DADE2";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (game.hero) {
      const iW = effectiveBarWidth - (isMobile ? 20 : 30);
      const iX = drawX + (isMobile ? 10 : 15);
      const iCX = drawX + effectiveBarWidth / 2;

      // AMMO (HUD)
      const amY = hudY + (isMobile ? 20 : 28);
      const maxA = game.hero.maxAmmo;
      const curA = game.hero.ammo;
      const aGap = isMobile ? 2 : 4;
      const aBW = (iW - aGap * (maxA - 1)) / maxA;

      ctx.font = isMobile ? "bold 10px monospace" : "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFF00";
      ctx.fillText("AMMO", iCX, amY - (isMobile ? 8 : 10));

      const barH = isMobile ? 6 : 9;

      for (let i = 0; i < maxA; i++) {
        const b_x = iX + i * (aBW + aGap);
        if (game.hero.reloadTimer > 0) {
          const flash = Math.sin(performance.now() / 100) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(255, 255, 0, ${flash})`;
        } else {
          ctx.fillStyle = i < curA ? "#FFFF00" : "#333";
        }
        ctx.fillRect(b_x, amY, aBW, barH);
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1;
        ctx.strokeRect(b_x, amY, aBW, barH);
      }

      // STAMINA (HUD)
      const stY = hudY + (isMobile ? 45 : 60);
      const curS = game.hero.stamina;
      const maxS = game.hero.maxStamina;
      const sBlocks = 5;
      const sGap = isMobile ? 2 : 4;
      const sBW = (iW - sGap * (sBlocks - 1)) / sBlocks;
      const sPerB = maxS / sBlocks;

      ctx.fillStyle = "#5DADE2";
      ctx.fillText("STAMINA", iCX, stY - (isMobile ? 6 : 8));

      for (let i = 0; i < sBlocks; i++) {
        const b_x = iX + i * (sBW + sGap);
        ctx.fillStyle = "#333";
        ctx.fillRect(b_x, stY, sBW, barH - 1); // slightly thinner

        const fill = Math.max(0, Math.min(1, (curS - i * sPerB) / sPerB));
        if (fill > 0) {
          ctx.fillStyle = "#2E86C1";
          ctx.fillRect(b_x, stY, sBW * fill, barH - 1);
        }
        ctx.strokeStyle = "#FFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(b_x, stY, sBW, barH - 1);
      }

      // HEALTH (HUD)
      const heY = hudY + (isMobile ? 68 : 95);
      const hpP = Math.max(0, game.hero.hp / game.hero.maxHp);
      ctx.fillStyle = "#2ECC71";
      ctx.fillText("HEALTH", iCX, heY - (isMobile ? 6 : 8));

      const hBarH = isMobile ? 8 : 11;
      ctx.fillStyle = "#333";
      ctx.fillRect(iX, heY, iW, hBarH);
      ctx.fillStyle = hpP > 0.3 ? "#27AE60" : "#FF4444";
      ctx.fillRect(iX, heY, iW * hpP, hBarH);
      ctx.strokeStyle = "#FFF";
      ctx.lineWidth = 1;
      ctx.strokeRect(iX, heY, iW, hBarH);
    }

    // Label Header and Table - Only on Desktop
    if (!input.isTouchDevice) {
      ctx.font = "bold 18px monospace"; // Bigger header
      ctx.fillStyle = "#5DADE2";
      ctx.textAlign = "center";
      ctx.fillText("HERO STATS", x + barWidth / 2, y + 30);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 45);
      ctx.lineTo(x + barWidth - 15, y + 45);
      ctx.stroke();

      const stats = [
        {
          label: "WEAPON",
          value: game.hero.currentWeapon.toUpperCase(),
          color: "#E67E22",
        },
        {
          label: "HEALTH",
          value: `${Math.ceil(game.hero.hp)}/${game.hero.maxHp}`,
          color: "#2ECC71",
        },
        {
          label: "REGEN",
          value: `${game.hero.hpRegen.toFixed(1)}/s`,
          color: "#27AE60",
        },
        {
          label: "STAMINA",
          value: `${Math.ceil(game.hero.stamina)}/${game.hero.maxStamina}`,
          color: "#5DADE2",
        },
        {
          label: "DAMAGE",
          value: game.hero.weaponDamage,
          color: "#FF4E00",
        },
        {
          label: "FIRE RATE",
          value: `${(1 / game.hero.weaponFireRate).toFixed(1)}/s`,
          color: "#FF7B00",
        },
        { label: "SHOTS", value: `x${game.hero.weaponMultishot + (game.hero.multishot - 1)}`, color: "#F1C40F" },
        {
          label: "ARMOR",
          value: `${(config.hero.armor.damage_reduction_percent * 100).toFixed(0)}%`,
          color: "#BDC3C7",
        },
        {
          label: "SPEED",
          value: config.hero.move_speed.toFixed(1),
          color: "#9B59B6",
        },
        {
          label: "CRIT",
          value: `${(game.hero.critChance * 100).toFixed(0)}%`,
          color: "#FFD700",
        },
      ];

      ctx.font = "bold 15px monospace"; // Much bigger font for stats
      ctx.textBaseline = "middle";

      const startY = y + 75;
      const spacing = 30; // Increased spacing

      stats.forEach((stat, i) => {
        const currentY = startY + i * spacing;

        // Label
        ctx.textAlign = "left";
        ctx.fillStyle = "#CCC"; // Lighter label
        ctx.fillText(stat.label, x + 15, currentY);

        // Value
        ctx.textAlign = "right";
        ctx.fillStyle = stat.color;
        ctx.fillText(stat.value.toString(), x + barWidth - 15, currentY);
      });

      // --- ACTIVE ITEMS COUNTER ---
      if (!input.isTouchDevice) {
        const itemCount = (game.turrets?.length ?? 0) + (game.medTurrets?.length ?? 0) + (game.mines?.length ?? 0);
        if (itemCount > 0) {
          const itemY = y + barHeight + 10;
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          ctx.beginPath();
          ctx.roundRect(x, itemY, barWidth, 40, 8);
          ctx.fill();
          ctx.strokeStyle = "rgba(68, 136, 255, 0.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.textAlign = "left";
          ctx.fillStyle = "#4488FF";
          ctx.font = "bold 11px monospace";
          ctx.textBaseline = "middle";
          ctx.fillText("🔫 ACTIVE ITEMS", x + 12, itemY + 12);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "12px monospace";
          const turretCount = game.turrets?.length ?? 0;
          const medCount = game.medTurrets?.length ?? 0;
          const mineCount = game.mines?.length ?? 0;
          ctx.fillText(`${turretCount}🔫  ${medCount}❤  ${mineCount}💣`, x + 12, itemY + 28);
        }
      }
    }

    ctx.restore();
  }

  private drawEnemyBars(enemies: any[]) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "0.5px sans-serif";
    ctx.textAlign = "center";

    for (const enemy of enemies) {
      if ((enemy as any).isFadingOut) continue;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      const w = 1.0;
      const h = 0.15;
      const yOffset = -1.4; // Moved higher from -0.8
      ctx.fillStyle = "#333";
      ctx.fillRect(-w / 2, yOffset, w, h);

      if (enemy.shield > 0) {
        const shieldPct = Math.max(0, Math.min(1, enemy.shield / enemy.maxShield));
        ctx.fillStyle = "#00FFFF";
        ctx.fillRect(-w / 2, yOffset, w * shieldPct, h);
      } else {
        const hpPct = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        ctx.fillStyle = "#FF0000";
        ctx.fillRect(-w / 2, yOffset, w * hpPct, h);
      }
      ctx.strokeStyle = "#FFF";
      ctx.lineWidth = 0.02;
      ctx.strokeRect(-w / 2, yOffset, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  public triggerShake(duration: number, intensity: number) {
    this.shakeTimer = duration;
    this.shakeIntensity = intensity;
  }

  public triggerDeathFlash() {
    this.deathFlashTimer = 0.5; // Half second flash
  }

  private drawDeathClarity(game: Game) {
    const kb = game.hero.killingBlow;
    if (!kb) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.resetTransform();
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.pixelsPerUnit, this.pixelsPerUnit);

    ctx.beginPath();
    ctx.arc(kb.explosionX, kb.explosionY, kb.radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 0.15;
    ctx.stroke();

    if (kb.enemyInfo) {
      // Line from killer to death location
      ctx.beginPath();
      ctx.moveTo(kb.explosionX, kb.explosionY);
      ctx.lineTo(kb.enemyInfo.x, kb.enemyInfo.y);
      ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
      ctx.setLineDash([0.1, 0.1]);
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.translate(kb.enemyInfo.x, kb.enemyInfo.y);
      ctx.rotate(kb.enemyInfo.angle);

      // Ghosts of the killer
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.beginPath();
      ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Minimalist Highlight
      ctx.strokeStyle = "#FFD84D";
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.arc(0, 0, 0.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    } else if (kb.isDetached) {
      const pulse = 1.0 + Math.sin(performance.now() / 100) * 0.15;
      ctx.save();
      ctx.translate(kb.explosionX, kb.explosionY);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#FF3B3B";
      ctx.beginPath();
      ctx.arc(0, 0, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawTelegraphs(game: Game) {
    const ctx = this.ctx;
    const telegraphs = game.waveManager.activeTelegraphs;

    // --- Enemy Spawn X (Red) ---
    for (const t of telegraphs) {
      ctx.save();
      ctx.translate(t.x, t.y);
      const pulse = Math.sin(Date.now() * 0.015);
      const scale = 0.7 + pulse * 0.2;
      ctx.scale(scale, scale);
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth = 0.4;
      const size = 1.5;
      ctx.beginPath();
      ctx.moveTo(-size, -size);
      ctx.lineTo(size, size);
      ctx.moveTo(size, -size);
      ctx.lineTo(-size, size);
      ctx.stroke();
      ctx.globalAlpha = 0.3 + pulse * 0.1;
      ctx.fillStyle = "#FF0000";
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Item Spawn X (Blue) ---
    const itemTelegraphs = game.waveManager.activeItemTelegraphs;
    if (itemTelegraphs) {
      for (const t of itemTelegraphs) {
        ctx.save();
        ctx.translate(t.x, t.y);

        // Spin and pulse
        const elapsed = (t.maxTimer - t.timer) / t.maxTimer;
        const spin = elapsed * Math.PI * 4;
        ctx.rotate(spin);

        const pulse = 0.8 + Math.sin(Date.now() * 0.02) * 0.2;
        ctx.scale(pulse, pulse);

        // Glowing background circle
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = t.type === 'med_turret' ? '#00FF88' : (t.type === 'mine' ? '#FFAA00' : '#4488FF');
        ctx.beginPath();
        ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // X stroke
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = t.type === 'med_turret' ? '#00FF88' : (t.type === 'mine' ? '#FFAA00' : '#4488FF');
        ctx.lineWidth = 0.5;
        ctx.lineCap = 'round';
        const s = 1.2;
        ctx.beginPath();
        ctx.moveTo(-s, -s); ctx.lineTo(s, s);
        ctx.moveTo(s, -s);  ctx.lineTo(-s, s);
        ctx.stroke();

        // Label
        ctx.scale(1 / this.pixelsPerUnit, 1 / this.pixelsPerUnit);
        ctx.rotate(-spin); // Counter-rotate so text stays upright
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(
          t.type === 'turret' ? '🔫' : t.type === 'med_turret' ? '❤' : '💣',
          0, -35
        );

        ctx.restore();
      }
    }
  }

  private drawButton(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    color: string,
  ) {
    const ctx = this.ctx;
    ctx.save();

    const input = InputManager.getInstance();
    const isHover =
      input.mouse.x >= x - w / 2 &&
      input.mouse.x <= x + w / 2 &&
      input.mouse.y >= y - h / 2 &&
      input.mouse.y <= y + h / 2;

    ctx.translate(x - w / 2, y - h / 2);

    // Hover lift and glow
    if (isHover) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      ctx.translate(0, -2);
    }

    // 1. Button Background (Glassmorphism + Gradient)
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (isHover) {
      grad.addColorStop(0, `rgba(${this.hexToRgb(color)}, 0.4)`);
      grad.addColorStop(1, `rgba(${this.hexToRgb(color)}, 0.1)`);
    } else {
      grad.addColorStop(0, "rgba(30, 30, 30, 0.8)");
      grad.addColorStop(1, "rgba(10, 10, 10, 0.9)");
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    // 2. Neon Border
    ctx.strokeStyle = isHover ? color : `rgba(${this.hexToRgb(color)}, 0.4)`;
    ctx.lineWidth = isHover ? 3 : 2;
    ctx.stroke();

    // 3. Inner Shine (Top edge)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(2, 1, w - 4, h / 2, 10);
    ctx.stroke();

    // 4. Label
    ctx.fillStyle = isHover ? "#FFF" : "#AAA";
    ctx.shadowBlur = isHover ? 10 : 0;
    ctx.shadowColor = "#FFF";
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);

    ctx.restore();
  }

  private drawMobileControls() {
    const input = InputManager.getInstance();
    if (!input.isTouchDevice || input.isJoystickDisabled) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.resetTransform();

    // Left Stick
    if (input.stickLeft.active) {
      const { originX, originY, x, y } = input.stickLeft;
      ctx.beginPath();
      ctx.arc(originX, originY, 40, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();

      const stickX = originX + x * 50;
      const stickY = originY + y * 50;
      ctx.beginPath();
      ctx.arc(stickX, stickY, 20, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fill();
    }

    // Right Stick
    if (input.stickRight.active) {
      const { originX, originY, x, y } = input.stickRight;
      ctx.beginPath();
      ctx.arc(originX, originY, 40, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 50, 50, 0.1)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 50, 50, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();

      const stickX = originX + x * 50;
      const stickY = originY + y * 50;
      ctx.beginPath();
      ctx.arc(stickX, stickY, 20, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
      ctx.fill();
    }

    // Action Buttons
    const w = this.width;
    const h = this.height;
    this.drawCircleButton(
      w - 80,
      h - 80,
      45,
      "DASH",
      "#FFF",
      input.buttons.dash,
    );


    ctx.restore();
  }

  private drawCircleButton(
    x: number,
    y: number,
    r: number,
    label: string,
    color: string,
    active: boolean,
  ) {
    const ctx = this.ctx;
    ctx.save();

    if (active) {
      ctx.shadowBlur = 25;
      ctx.shadowColor = color;
      ctx.translate(0, -3);
    }

    // Outer Ring
    ctx.strokeStyle = active ? color : `rgba(${this.hexToRgb(color)}, 0.3)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Fill
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (active) {
      grad.addColorStop(0, `rgba(${this.hexToRgb(color)}, 0.6)`);
      grad.addColorStop(1, `rgba(${this.hexToRgb(color)}, 0.2)`);
    } else {
      grad.addColorStop(0, "rgba(30, 30, 30, 0.7)");
      grad.addColorStop(1, "rgba(10, 10, 10, 0.8)");
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = active ? "#FFF" : "#777";
    ctx.shadowBlur = active ? 10 : 0;
    ctx.shadowColor = "#FFF";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);

    ctx.restore();
  }

  private drawPauseOverlay() {
    const ctx = this.ctx;
    ctx.save();
    ctx.resetTransform();
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = "#FFF";
    ctx.font = "bold 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", this.width / 2, this.height / 2 - 120);

    this.drawButton(
      this.width / 2,
      this.height / 2 - 20,
      240,
      50,
      "RESUME",
      "#00FF00",
    );
    this.drawButton(
      this.width / 2,
      this.height / 2 + 50,
      240,
      50,
      "ENEMY INDEX",
      "#FFD84D",
    );

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#AAA";
    ctx.fillText(
      "Press P or ESC to Resume",
      this.width / 2,
      this.height / 2 + 190,
    );

    ctx.restore();
  }

  private drawEnemyIndex() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.resetTransform();
    ctx.fillStyle = "rgba(10, 10, 18, 0.95)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#FFD84D";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ENEMY ENCYCLOPEDIA", w / 2, 60);

    // Separator
    ctx.strokeStyle = "rgba(255, 216, 77, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 80);
    ctx.lineTo(w * 0.85, 80);
    ctx.stroke();

    const enemies = [
      {
        name: "GRUNT",
        subtitle: "Standard Infantry",
        color: "#FFD84D",
        desc: "Basic unit. Steady pace, moderate threat.",
        hp: 3, shield: 1, speed: 1, danger: "LOW",
        drawFn: (cx: CanvasRenderingContext2D) => {
          // Neon triangle
          cx.save();
          cx.shadowBlur = 8;
          cx.shadowColor = "#FFD84D";
          cx.strokeStyle = "#FFD84D";
          cx.lineWidth = 2;
          cx.beginPath();
          cx.moveTo(14, 0);
          cx.lineTo(-8, -10);
          cx.lineTo(-8, 10);
          cx.closePath();
          cx.stroke();
          cx.fillStyle = "rgba(255,216,77,0.2)";
          cx.fill();
          cx.restore();
          cx.fillStyle = "#FF3300";
          cx.beginPath();
          cx.arc(2, 0, 2, 0, Math.PI * 2);
          cx.fill();
        }
      },
      {
        name: "SCOUT",
        subtitle: "Fast Interceptor",
        color: "#FF3333",
        desc: "Agile runner. Charges at lethal speed when armed.",
        hp: 1, shield: 1, speed: 4, danger: "MEDIUM",
        drawFn: (cx: CanvasRenderingContext2D) => {
          // Neon diamond
          cx.save();
          cx.shadowBlur = 8;
          cx.shadowColor = "#FF3333";
          cx.strokeStyle = "#FF3333";
          cx.lineWidth = 2;
          cx.beginPath();
          cx.moveTo(16, 0);
          cx.lineTo(0, -7);
          cx.lineTo(-8, 0);
          cx.lineTo(0, 7);
          cx.closePath();
          cx.stroke();
          cx.fillStyle = "rgba(255,51,51,0.2)";
          cx.fill();
          cx.restore();
          cx.fillStyle = "#00FFFF";
          cx.beginPath();
          cx.arc(5, 0, 2, 0, Math.PI * 2);
          cx.fill();
        }
      },
      {
        name: "JUGGERNAUT",
        subtitle: "Heavy Tank",
        color: "#2ECC71",
        desc: "Massive armor and shields. Very slow but devastating.",
        hp: 5, shield: 5, speed: 1, danger: "HIGH",
        drawFn: (cx: CanvasRenderingContext2D) => {
          // Neon hexagon
          cx.save();
          cx.shadowBlur = 10;
          cx.shadowColor = "#2ECC71";
          cx.strokeStyle = "#2ECC71";
          cx.lineWidth = 2.5;
          cx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const px = Math.cos(a) * 14;
            const py = Math.sin(a) * 14;
            if (i === 0) cx.moveTo(px, py);
            else cx.lineTo(px, py);
          }
          cx.closePath();
          cx.stroke();
          cx.fillStyle = "rgba(46,204,113,0.15)";
          cx.fill();
          cx.restore();
          // Inner hex
          cx.strokeStyle = "#2ECC71";
          cx.lineWidth = 1;
          cx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const px = Math.cos(a) * 8;
            const py = Math.sin(a) * 8;
            if (i === 0) cx.moveTo(px, py);
            else cx.lineTo(px, py);
          }
          cx.closePath();
          cx.stroke();
        }
      },
      {
        name: "PHANTOM",
        subtitle: "Blink Assassin",
        color: "#A020F0",
        desc: "Teleports toward you. Blinks faster when armed.",
        hp: 2, shield: 1, speed: 2, danger: "HIGH",
        drawFn: (cx: CanvasRenderingContext2D) => {
          // Neon square
          cx.save();
          cx.shadowBlur = 8;
          cx.shadowColor = "#A020F0";
          cx.strokeStyle = "#A020F0";
          cx.lineWidth = 2;
          cx.strokeRect(-10, -10, 20, 20);
          cx.fillStyle = "rgba(160,32,240,0.15)";
          cx.fillRect(-10, -10, 20, 20);
          cx.restore();
          // Inner diamond
          cx.strokeStyle = "#A020F0";
          cx.lineWidth = 1;
          cx.beginPath();
          cx.moveTo(0, -7);
          cx.lineTo(7, 0);
          cx.lineTo(0, 7);
          cx.lineTo(-7, 0);
          cx.closePath();
          cx.stroke();
        }
      },
      {
        name: "HIVE MOTHER",
        subtitle: "Splitter Drone",
        color: "#FF69B4",
        desc: "Splits into 3 spider-bots on death. Kill from range.",
        hp: 4, shield: 1, speed: 1, danger: "EXTREME",
        drawFn: (cx: CanvasRenderingContext2D) => {
          // Neon octagon
          cx.save();
          cx.shadowBlur = 8;
          cx.shadowColor = "#FF69B4";
          cx.strokeStyle = "#FF69B4";
          cx.lineWidth = 2;
          cx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI / 4) * i;
            const px = Math.cos(a) * 12;
            const py = Math.sin(a) * 12;
            if (i === 0) cx.moveTo(px, py);
            else cx.lineTo(px, py);
          }
          cx.closePath();
          cx.stroke();
          cx.fillStyle = "rgba(255,105,180,0.15)";
          cx.fill();
          cx.restore();
          // 3 dots showing split
          cx.fillStyle = "#FFA500";
          for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 / 3) * i;
            cx.beginPath();
            cx.arc(Math.cos(a) * 6, Math.sin(a) * 6, 2, 0, Math.PI * 2);
            cx.fill();
          }
        }
      },
      {
        name: "SPIDER-BOT",
        subtitle: "Mini Swarm Unit",
        color: "#FFA500",
        desc: "Spawned from Hive Mothers. Small, fast, pre-armed.",
        hp: 1, shield: 0, speed: 3, danger: "MEDIUM",
        drawFn: (cx: CanvasRenderingContext2D) => {
          // Small neon circle with legs
          cx.save();
          cx.shadowBlur = 6;
          cx.shadowColor = "#FFA500";
          cx.strokeStyle = "#FFA500";
          cx.lineWidth = 1.5;
          cx.beginPath();
          cx.arc(0, 0, 7, 0, Math.PI * 2);
          cx.stroke();
          cx.fillStyle = "rgba(255,165,0,0.2)";
          cx.fill();
          cx.restore();
          // Spike legs
          cx.strokeStyle = "#FFA500";
          cx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const a = (Math.PI / 2) * i + Math.PI / 4;
            cx.beginPath();
            cx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
            cx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
            cx.stroke();
          }
          cx.fillStyle = "#FF0000";
          cx.beginPath();
          cx.arc(2, 0, 1.5, 0, Math.PI * 2);
          cx.fill();
        }
      },
    ];

    const startY = 110;
    const cardH = (h - startY - 70) / enemies.length;
    const maxCardH = 80;
    const spacingY = Math.min(cardH, maxCardH);
    const col1 = 100;

    enemies.forEach((en, i) => {
      const y = startY + i * spacingY + spacingY / 2;

      // Card background
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      ctx.beginPath();
      ctx.roundRect(w * 0.05, y - spacingY / 2 + 5, w * 0.9, spacingY - 10, 8);
      ctx.fill();
      ctx.strokeStyle = `rgba(${this.hexToRgb(en.color)}, 0.2)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Illustration
      ctx.save();
      ctx.translate(col1, y);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      en.drawFn(ctx);
      ctx.restore();

      // Name & subtitle
      const textX = col1 + 60;
      ctx.textAlign = "left";
      ctx.fillStyle = en.color;
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(en.name, textX, y - 12);

      ctx.fillStyle = "#777";
      ctx.font = "italic 13px sans-serif";
      ctx.fillText(en.subtitle, textX + ctx.measureText(en.name).width + 10, y - 12);

      // Description
      ctx.fillStyle = "#AAA";
      ctx.font = "14px sans-serif";
      ctx.fillText(en.desc, textX, y + 8);

      // Stat bars
      const barX = w * 0.62;
      const barW = 60;
      const barH2 = 6;
      const stats = [
        { label: "HP", value: en.hp, max: 5, color: "#2ECC71" },
        { label: "SHD", value: en.shield, max: 5, color: "#00FFFF" },
        { label: "SPD", value: en.speed, max: 5, color: "#FF4E00" },
      ];

      stats.forEach((s, si) => {
        const sy = y - 16 + si * 14;
        ctx.fillStyle = "#666";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(s.label, barX - 5, sy + 5);

        ctx.fillStyle = "#222";
        ctx.fillRect(barX, sy, barW, barH2);
        ctx.fillStyle = s.color;
        ctx.fillRect(barX, sy, barW * (s.value / s.max), barH2);
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(barX, sy, barW, barH2);
      });

      // Danger rating
      const dangerColors: Record<string, string> = {
        "LOW": "#2ECC71", "MEDIUM": "#F1C40F",
        "HIGH": "#FF4E00", "EXTREME": "#FF0000"
      };
      ctx.textAlign = "right";
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = dangerColors[en.danger] || "#FFF";
      ctx.fillText(`⚠ ${en.danger}`, w * 0.92, y + 8);
    });

    // Close Button
    this.drawButton(w - 100, h - 50, 160, 50, "CLOSE", "#FF5555");

    ctx.restore();
  }

  private drawStatsOverlay(game: Game) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const config = ConfigManager.getConfig();

    ctx.save();
    ctx.resetTransform();
    ctx.fillStyle = "rgba(10, 18, 14, 0.95)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#5DADE2";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("COMBAT STATISTICS", w / 2, 80);

    const stats = [
      {
        label: "MAX HEALTH",
        value: game.hero.maxHp.toFixed(0),
        color: "#2ECC71",
      },
      {
        label: "HEALTH REGEN",
        value: `${game.hero.hpRegen.toFixed(1)}/sec`,
        color: "#27AE60",
      },
      {
        label: "MAX STAMINA",
        value: game.hero.maxStamina.toFixed(0),
        color: "#5DADE2",
      },
      {
        label: "STAMINA REGEN",
        value: `${config.hero.stamina.regen_rate}/sec`,
        color: "#2E86C1",
      },
      {
        label: "WEAPON",
        value: game.hero.currentWeapon.toUpperCase(),
        color: "#E67E22",
      },
      {
        label: "BLASTER DAMAGE",
        value: game.hero.weaponDamage.toString(),
        color: "#FF4E00",
      },
      {
        label: "FIRE RATE",
        value: `${(1 / game.hero.weaponFireRate).toFixed(1)} shots/sec`,
        color: "#FF7B00",
      },
      {
        label: "ARMOR",
        value: `${(config.hero.armor.damage_reduction_percent * 100).toFixed(0)}% Reduction`,
        color: "#BDC3C7",
      },
      {
        label: "CRIT CHANCE",
        value: `${(game.hero.critChance * 100).toFixed(0)}%`,
        color: "#FFD700",
      },
    ];

    const startY = 180;
    const spacingY = 50;

    stats.forEach((stat, i) => {
      const y = startY + i * spacingY;
      ctx.textAlign = "right";
      ctx.fillStyle = "#AAA";
      ctx.font = "24px monospace";
      ctx.fillText(stat.label + ":", w / 2 - 20, y);

      ctx.textAlign = "left";
      ctx.fillStyle = stat.color;
      ctx.font = "bold 24px monospace";
      ctx.fillText(stat.value, w / 2 + 20, y);
    });

    this.drawButton(w / 2, h - 80, 200, 60, "BACK", "#5DADE2");
    ctx.restore();
  }

  private drawUpgradeIcon(
    ctx: CanvasRenderingContext2D,
    type: string,
    isHovered: boolean,
    weaponId?: string,
  ) {
    ctx.save();
    const pulse = (Math.sin(Date.now() * 0.008) + 1) / 2;
    const scale = isHovered ? 1.0 + pulse * 0.1 : 1.0;
    ctx.scale(scale, scale);

    ctx.strokeStyle = isHovered ? "#FF7B00" : "#FFF";
    ctx.lineWidth = 3;
    // ctx.shadowBlur = isHovered ? 15 + pulse * 10 : 0;
    // ctx.shadowColor = '#FF7B00';

    switch (type) {
      case "damage":
        // Crosshair / Burst
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.moveTo(-30, 0);
        ctx.lineTo(30, 0);
        ctx.moveTo(0, -30);
        ctx.lineTo(0, 30);
        ctx.stroke();
        break;
      case "firerate":
        // Bullets / Lightning
        ctx.beginPath();
        ctx.moveTo(-15, -20);
        ctx.lineTo(15, 0);
        ctx.lineTo(-15, 20);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.stroke();
        break;
      case "multishot":
        // Shards / Multiple lines
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-20, -25);
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -30);
        ctx.moveTo(0, 0);
        ctx.lineTo(20, -25);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "health":
        // Plus sign
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(20, 0);
        ctx.moveTo(0, -20);
        ctx.lineTo(0, 20);
        ctx.stroke();
        break;
      case "stamina":
        // Bolt / Wing
        ctx.beginPath();
        ctx.moveTo(10, -25);
        ctx.lineTo(-15, 5);
        ctx.lineTo(5, 5);
        ctx.lineTo(-10, 25);
        ctx.stroke();
        break;
      case "ammo":
        // Magazine / Box
        ctx.beginPath();
        ctx.rect(-15, -20, 30, 40);
        // Bullet lines
        ctx.moveTo(-8, -10);
        ctx.lineTo(8, -10);
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(-8, 10);
        ctx.lineTo(8, 10);
        ctx.stroke();
        break;
      case "regen":
        // Heartbeat / Wave
        ctx.beginPath();
        ctx.moveTo(-25, 0);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-5, -20);
        ctx.lineTo(5, 20);
        ctx.lineTo(10, 0);
        ctx.lineTo(25, 0);
        ctx.stroke();
        break;
      case "armor":
        // Shield / Plate
        ctx.beginPath();
        ctx.moveTo(-20, -25);
        ctx.lineTo(20, -25);
        ctx.lineTo(20, 5);
        ctx.lineTo(0, 25);
        ctx.lineTo(-20, 5);
        ctx.closePath();
        ctx.stroke();
        // Inner Detail
        ctx.beginPath();
        ctx.moveTo(-10, -15);
        ctx.lineTo(10, -15);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 15);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        ctx.stroke();
        break;
      case "crit":
        // Star / Crit
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const outerA = (Math.PI * 2 / 5) * i - Math.PI / 2;
          const innerA = outerA + Math.PI / 5;
          ctx.lineTo(Math.cos(outerA) * 22, Math.sin(outerA) * 22);
          ctx.lineTo(Math.cos(innerA) * 10, Math.sin(innerA) * 10);
        }
        ctx.closePath();
        ctx.stroke();
        break;
      case "weapon":
        // Gun silhouettes
        ctx.lineWidth = 3;
        if (weaponId === 'smg') {
          // SMG silhouette (Stocky, vertical mag)
          ctx.beginPath();
          ctx.roundRect(-22, -6, 40, 10, 2); // Main body
          ctx.roundRect(-5, 4, 8, 18, 1);    // Grip
          ctx.roundRect(5, 4, 6, 12, 1);     // Mag
          ctx.stroke();
        } else if (weaponId === 'shotgun') {
          // Shotgun silhouette (Long, pump action)
          ctx.beginPath();
          ctx.roundRect(-28, -5, 55, 8, 1);  // Length
          ctx.roundRect(-28, 3, 15, 6, 2);   // Stock
          ctx.roundRect(0, 4, 20, 5, 2);     // Pump
          ctx.stroke();
        } else if (weaponId === 'rifle') {
          // Rifle silhouette (Longest, sleek)
          ctx.beginPath();
          ctx.roundRect(-30, -6, 65, 9, 2);  // Body/Barrel
          ctx.roundRect(-30, 3, 20, 10, 1);  // Full stock
          ctx.roundRect(-5, 3, 8, 15, 1);    // Grip
          ctx.roundRect(10, 3, 6, 14, 1);    // Curved-ish mag
          ctx.stroke();
        } else {
          // Default Pistol
          ctx.beginPath();
          ctx.roundRect(-20, -8, 35, 12, 3); // Slide
          ctx.roundRect(-5, 4, 10, 18, 2);   // Grip
          ctx.stroke();
        }

        // Muzzle flash for all weapons
        ctx.strokeStyle = isHovered ? "#FFD700" : "#FF8800";
        ctx.beginPath();
        ctx.moveTo(15, -4); ctx.lineTo(24, -12);
        ctx.moveTo(18, 0); ctx.lineTo(28, 0);
        ctx.moveTo(15, 4); ctx.lineTo(24, 12);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  private hexToRgb(hex: string): string {
    // Handle common hex codes used in UI
    const colors: Record<string, string> = {
      "#FFF": "255, 255, 255",
      "#FFFFFF": "255, 255, 255",
      "#FF4E00": "255, 78, 0",
      "#00FF00": "0, 255, 0",
      "#FFD84D": "255, 216, 77",
      "#5DADE2": "93, 173, 226",
      "#00FFFF": "0, 255, 255",
      "#FF3B3B": "255, 59, 59",
      "#2ECC71": "46, 204, 113",
      "#FF7B00": "255, 123, 0",
    };
    return colors[hex.toUpperCase()] || "255, 255, 255";
  }
}
