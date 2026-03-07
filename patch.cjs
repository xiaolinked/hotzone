const fs = require('fs');
let code = fs.readFileSync('src/entities/Hero.ts', 'utf8');
const searchString = '        // --- SUBTLE BODY GLOW ---';
const index = code.indexOf(searchString);

if (index !== -1) {
    const newCode = `        // --- SUBTLE BODY GLOW ---
        ctx.fillStyle = 'rgba(47, 128, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(0, -0.1, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // --- DETERMINE FACING DIRECTION ---
        const input = InputManager.getInstance();
        let aimAngle = 0;
        if (input.isTouchDevice && input.stickRight.active) {
            aimAngle = Math.atan2(input.stickRight.y, input.stickRight.x);
        } else {
            aimAngle = Math.atan2(input.mouseWorld.y - this.y, input.mouseWorld.x - this.x);
        }

        // Determine Row (0: Down, 1: Up, 2: Right, 3: Left)
        let facingRow = 0; // Default down
        if (aimAngle >= -Math.PI/4 && aimAngle < Math.PI/4) {
            facingRow = 2; // Right
        } else if (aimAngle >= Math.PI/4 && aimAngle < 3*Math.PI/4) {
            facingRow = 0; // Down
        } else if (aimAngle >= -3*Math.PI/4 && aimAngle < -Math.PI/4) {
            facingRow = 1; // Up
        } else {
            facingRow = 3; // Left
        }

        // Apply 360-degree visual recoil to the entire hero sprite!
        const vR = this.visualRecoil || 0;
        const vRecoilX = -Math.cos(aimAngle) * vR;
        const vRecoilY = -Math.sin(aimAngle) * vR;
        ctx.translate(vRecoilX, vRecoilY);

        // --- RENDER 4-DIR SPRITE ---
        const img = (window as any).__HERO_IMG;
        if (img && img.width > 0) {
            const totalCols = 4;
            const totalRows = 4;
            const frameWidth = Math.floor(img.width / totalCols);
            const frameHeight = Math.floor(img.height / totalRows);

            // Animate if walking
            let frameCol = 0;
            if (this.isWalking) {
                frameCol = Math.floor(this.walkTimer * 0.4) % totalCols;
            }

            const sx = frameCol * frameWidth;
            const sy = facingRow * frameHeight;

            // Flash effect if taking damage
            if (this.damageFlashTimer > 0) {
                ctx.save();
                ctx.filter = 'brightness(200%) contrast(150%) drop-shadow(0 0 5px white)';
                ctx.drawImage(img, sx, sy, frameWidth, frameHeight, -0.8, -0.8, 1.6, 1.6);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy, frameWidth, frameHeight, -0.8, -0.8, 1.6, 1.6);
            }
        }

        // --- MUZZLE FLASH ---
        if (this.muzzleFlashTimer > 0) {
            ctx.save();
            
            // Offset flash to the gun barrel based on the discrete sprite facing direction
            let mX = 0;
            let mY = 0;
            if (facingRow === 0) { mX = -0.25; mY = 0.5; }     // Down
            else if (facingRow === 1) { mX = 0.35; mY = -0.4; } // Up
            else if (facingRow === 2) { mX = 0.8; mY = 0.1; }   // Right
            else if (facingRow === 3) { mX = -0.8; mY = 0.1; }  // Left
            
            ctx.translate(mX, mY);
            
            // Randomize flash rotation for variety
            ctx.rotate(Math.random() * Math.PI * 2);
            
            // Randomize size slightly
            const fScale = 0.8 + Math.random() * 0.4;
            let flashSize = 0.3 * fScale;
            if (this.currentWeapon === 'shotgun') flashSize = 0.6 * fScale;
            if (this.currentWeapon === 'rifle') flashSize = 0.45 * fScale;
            if (this.currentWeapon === 'smg') flashSize = 0.2 * fScale;

            // Flash Core
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

            // Flash Outer Layer (Yellow/Orange glow)
            ctx.fillStyle = 'rgba(255, 150, 0, 0.6)';
            ctx.beginPath();
            ctx.moveTo(0, -flashSize * 0.4);
            ctx.lineTo(flashSize * 1.5, 0);
            ctx.lineTo(0, flashSize * 0.4);
            ctx.lineTo(flashSize * 0.4, flashSize * 1.2);
            ctx.lineTo(-flashSize * 0.4, flashSize * 0.4);
            ctx.lineTo(-flashSize * 1.2, 0);
            ctx.lineTo(-flashSize * 0.4, -flashSize * 0.4);
            ctx.lineTo(0, -flashSize * 1.2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        ctx.restore(); // End Main Transform (this.x, this.y)
    }
}
`;
    code = code.substring(0, index) + newCode;
    fs.writeFileSync('src/entities/Hero.ts', code);
    console.log("SUCCESS");
} else {
    console.log("FAIL - Could not find SUBTLE BODY GLOW");
}
