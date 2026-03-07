
export class InputManager {
    private static instance: InputManager;
    public keys: { [key: string]: boolean } = {};
    public mouse: { x: number; y: number; leftDown: boolean } = { x: 0, y: 0, leftDown: false };
    public clickOccurred: boolean = false;
    public mouseWorld: { x: number; y: number } = { x: 0, y: 0 };
    public cameraOffset: { x: number; y: number } = { x: 0, y: 0 };

    public isTouchDevice: boolean = false;
    public scrollDeltaY: number = 0;

    // Joystick State
    public stickLeft: { x: number, y: number, active: boolean, id: number | null, originX: number, originY: number } = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 };
    public stickRight: { x: number, y: number, active: boolean, id: number | null, originX: number, originY: number } = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 };

    // Virtual Buttons
    public buttons: { [key: string]: boolean } = { dash: false };

    public isJoystickDisabled: boolean = false;

    private constructor() {
        // More strict Mobile UI detection to avoid false positives on touchscreen laptops (Chromebooks)
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.isTouchDevice = isMobileUA || (window.innerWidth < 800 && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0));

        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.updateMouseWorld();
        });
        window.addEventListener('mousedown', () => {
            this.mouse.leftDown = true;
            this.clickOccurred = true;
        });
        window.addEventListener('mouseup', () => this.mouse.leftDown = false);
        window.addEventListener('resize', () => this.updateMouseWorld());
        
        // Scrolling
        window.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaY) > 0) {
                this.scrollDeltaY += e.deltaY;
            }
        });

        // Touch Listeners
        if (this.isTouchDevice) {
            this.initTouch();
        }
    }

    private initTouch() {
        // Prevent default browser gestures
        window.addEventListener('touchstart', (e) => {
            // Only prevent if we handle it or if it's on the canvas
            for (let i = 0; i < e.changedTouches.length; i++) {
                this.handleTouchStart(e.changedTouches[i]);
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                this.handleTouchMove(e.changedTouches[i]);
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                this.handleTouchEnd(e.changedTouches[i]);
            }
        }, { passive: false });
    }

    private handleTouchStart(touch: Touch) {
        const x = touch.clientX;
        const y = touch.clientY;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Common mobile button zones (matching current Renderer coordinates)
        // DASH: (w-80, h-80), r=45
        // RELOAD: (w-80, h-190), r=40
        // PUSH: (w-180, h-80), r=40

        // Check Dash
        if (Math.hypot(x - (width - 80), y - (height - 80)) < 50) {
            this.buttons.dash = true;
            this.clickOccurred = true; // Still trigger click for UI consumption if needed
            return;
        }



        // Left Half for Movement Stick
        if (x < width / 2 && !this.isJoystickDisabled) {
            if (!this.stickLeft.active) {
                this.stickLeft.active = true;
                this.stickLeft.id = touch.identifier;
                this.stickLeft.originX = x;
                this.stickLeft.originY = y;
                this.stickLeft.x = 0;
                this.stickLeft.y = 0;
            }
        }
        // Right Half for Aim Stick + Clicks
        else if (!this.isJoystickDisabled) {
            if (!this.stickRight.active) {
                this.stickRight.active = true;
                this.stickRight.id = touch.identifier;
                this.stickRight.originX = x;
                this.stickRight.originY = y;
                this.stickRight.x = 0;
                this.stickRight.y = 0;
            }
            this.mouse.leftDown = true;
        }

        // Always update mouse pos for UI clicks
        this.mouse.x = x;
        this.mouse.y = y;
        this.clickOccurred = true;
        this.updateMouseWorld();
    }

    private handleTouchMove(touch: Touch) {
        // Left Stick
        if (this.stickLeft.active && this.stickLeft.id === touch.identifier) {
            const dx = touch.clientX - this.stickLeft.originX;
            const dy = touch.clientY - this.stickLeft.originY;
            const maxDist = 50;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clampedDist = Math.min(dist, maxDist);
            const angle = Math.atan2(dy, dx);

            this.stickLeft.x = Math.cos(angle) * (clampedDist / maxDist);
            this.stickLeft.y = Math.sin(angle) * (clampedDist / maxDist);
        }

        // Right Stick (Aiming)
        if (this.stickRight.active && this.stickRight.id === touch.identifier) {
            const dx = touch.clientX - this.stickRight.originX;
            const dy = touch.clientY - this.stickRight.originY;
            const maxDist = 50;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clampedDist = Math.min(dist, maxDist);
            const angle = Math.atan2(dy, dx);

            this.stickRight.x = Math.cos(angle) * (clampedDist / maxDist);
            this.stickRight.y = Math.sin(angle) * (clampedDist / maxDist);

            // Update mouse pos for aim calculations if needed
            this.mouse.x = touch.clientX;
            this.mouse.y = touch.clientY;
            this.updateMouseWorld();
        }
    }

    private handleTouchEnd(touch: Touch) {
        if (this.stickLeft.active && this.stickLeft.id === touch.identifier) {
            this.stickLeft.active = false;
            this.stickLeft.id = null;
            this.stickLeft.x = 0;
            this.stickLeft.y = 0;
        }

        if (this.stickRight.active && this.stickRight.id === touch.identifier) {
            this.stickRight.active = false;
            this.stickRight.id = null;
            this.stickRight.x = 0;
            this.stickRight.y = 0;
            this.mouse.leftDown = false;
        }

        // Release buttons - we can check ID if we want to be more precise, 
        // but typically touch buttons are tap-based or release-on-end.
        this.buttons.dash = false;

    }

    public isNewClick(): boolean {
        if (this.clickOccurred) {
            this.clickOccurred = false;
            return true;
        }
        return false;
    }

    public updateMouseWorld() {
        // Pixel to Units conversion including Camera
        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelsPerUnit = 20;

        this.mouseWorld.x = this.cameraOffset.x + (this.mouse.x - width / 2) / pixelsPerUnit;
        this.mouseWorld.y = this.cameraOffset.y + (this.mouse.y - height / 2) / pixelsPerUnit;
    }

    public static getInstance(): InputManager {
        if (!InputManager.instance) {
            InputManager.instance = new InputManager();
        }
        return InputManager.instance;
    }

    public getAxis(): { x: number; y: number } {
        let x = 0;
        let y = 0;

        // Stick Left
        if (this.stickLeft.active) {
            x = this.stickLeft.x;
            y = this.stickLeft.y;
        }

        if (this.keys['w'] || this.keys['arrowup']) y -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) y += 1;
        if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
        if (this.keys['d'] || this.keys['arrowright']) x += 1;

        // Normalize
        if (x !== 0 || y !== 0) {
            const len = Math.sqrt(x * x + y * y);
            if (len > 1) {
                x /= len;
                y /= len;
            }
        }
        return { x, y };
    }
}
