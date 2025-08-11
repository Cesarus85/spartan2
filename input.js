// input.js
// Robust XR-Input-System für Quest/PC-VR mit Handedness, Edge-Detect und Snap/Smooth-Turn.
// Belegung (wie gewünscht):
//  - Springen: A (right) oder X (left)
//  - Waffenwechsel: B (right) oder Y (left)
//  - Bewegen: linker Stick (x = strafen, y = vor/zurück; -y = vorwärts)
//  - Drehen: rechter Stick X (smooth) oder Snap bei Schwellwert
//  - Schießen: Trigger der aktiven Waffenhand (standard: left)

export class InputSystem {
  constructor(options = {}) {
    // Optionen
    this.snapTurnEnabled = options.snapTurnEnabled ?? true;
    this.snapTurnAngleDeg = options.snapTurnAngleDeg ?? 30; // 30° Standard
    this.snapTurnDeadzone = options.snapTurnDeadzone ?? 0.6; // Schwelle für Snap
    this.smoothTurnScale = options.smoothTurnScale ?? 1.8;   // rad/s bei vollem Ausschlag
    this.weaponHand = options.weaponHand ?? "left"; // "left" | "right"

    // XR-Quellen
    this.leftSource = null;
    this.rightSource = null;

    // Analoge States
    this.moveX = 0;   // Strafing (-1..1)
    this.moveY = 0;   // Vor/Zurück (-1..1) (negativ = vor)
    this.turnX = 0;   // Smooth-Turn Input (-1..1)

    // Diskrete Aktionen (pro Frame zurückgesetzt)
    this.jumpDown = false;
    this.switchWeaponDown = false;
    this.fireDown = false;

    // Dauer-Buttons (gehalten)
    this.fireHeld = false;

    // Snap-Turn Impuls (radians) wird pro Frame berechnet und dann wieder genullt
    this.snapTurnDelta = 0;

    // Interne Vorgängerzustände für Edge-Detect
    this._prev = {
      left: { a: false, b: false, x: false, y: false, trig: false, stickX: 0 },
      right: { a: false, b: false, x: false, y: false, trig: false, stickX: 0 }
    };

    // Cooldown gegen mehrfachen Snap-Spam (in Frames)
    this._snapCooldownFrames = 0;
    this._snapCooldownMax = 8; // ~8 Frames Sperre nach Snap
  }

  setWeaponHand(hand) {
    if (hand === "left" || hand === "right") this.weaponHand = hand;
  }

  setSnapTurn(enabled, angleDeg = this.snapTurnAngleDeg) {
    this.snapTurnEnabled = !!enabled;
    this.snapTurnAngleDeg = angleDeg;
  }

  // Hilfsfunktionen -----------------------------

  _getABXY(buttons, handedness) {
    // In WebXR variiert das Mapping je Gerät/Browser. Auf Quest ist typischerweise:
    //  - Right controller: A=0, B=1
    //  - Left controller:  X=3, Y=2
    // Wir lesen defensiv mit optional chaining.
    if (handedness === "right") {
      return {
        a: !!buttons?.[0]?.pressed,
        b: !!buttons?.[1]?.pressed,
        x: false,
        y: false
      };
    } else if (handedness === "left") {
      return {
        a: false,
        b: false,
        // Achtung: Reihenfolge auf left ist meist Y=2, X=3
        y: !!buttons?.[2]?.pressed,
        x: !!buttons?.[3]?.pressed
      };
    }
    return { a: false, b: false, x: false, y: false };
  }

  _getTrigger(buttons) {
    // Trigger ist i. d. R. buttons[0] bei den Touch-Controllern,
    // aber defensiv abfragen:
    // Falls ein anderes Mapping: nimm das erste vorhandene analoge/pressed.
    if (buttons?.[0]) return !!buttons[0].pressed;

    // Fallback: irgendein gedrückter Button als Trigger interpretieren
    if (Array.isArray(buttons)) {
      for (let i = 0; i < buttons.length; i++) {
        if (buttons[i] && buttons[i].pressed && buttons[i].value > 0.5) return true;
      }
    }
    return false;
  }

  _getStick(gamepad) {
    // Viele XR-Gamepads exposen pro Controller 2 Achsen (x,y) für den Thumbstick.
    // Manche liefern 4 Achsen (unterschiedliche Mappings). Wir priorisieren [0,1],
    // fallen zurück auf [2,3], wenn [0,1] fehlen/0 sind, aber [2,3] signifikant.
    let x = 0, y = 0;
    const axes = gamepad?.axes || [];
    if (axes.length >= 2) {
      x = axes[0] || 0;
      y = axes[1] || 0;
    }
    if (axes.length >= 4) {
      const x2 = axes[2] || 0;
      const y2 = axes[3] || 0;
      // Wenn das „obere“ Paar nahezu 0 ist, aber [2,3] nicht, nutze [2,3].
      if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05 && (Math.abs(x2) > 0.05 || Math.abs(y2) > 0.05)) {
        x = x2; y = y2;
      }
    }
    return { x, y };
  }

  // Hauptupdate: pro XR-Frame aufrufen
  update(xrSession) {
    // pro Frame zurücksetzen
    this.moveX = 0;
    this.moveY = 0;
    this.turnX = 0;
    this.snapTurnDelta = 0;
    this.jumpDown = false;
    this.switchWeaponDown = false;
    this.fireDown = false;

    if (!xrSession) {
      // Keine Session → keine Eingaben
      this.fireHeld = false;
      return;
    }

    // InputSources durchgehen und left/right einsammeln
    this.leftSource = null;
    this.rightSource = null;

    for (const src of xrSession.inputSources) {
      if (!src || !src.gamepad) continue;
      if (src.handedness === "left") this.leftSource = src;
      else if (src.handedness === "right") this.rightSource = src;
    }

    // Bewegung (linker Stick) & Drehen (rechter Stick)
    // sowie Buttons pro Hand lesen
    const L = this.leftSource?.gamepad;
    const R = this.rightSource?.gamepad;

    // Sticks
    const lStick = this._getStick(L);
    const rStick = this._getStick(R);

    // Bewegung: linker Stick
    // Strafing = x, Vor/Zurück = -y (typisch FPS)
    this.moveX = this._applyDeadzone(lStick.x, 0.15);
    this.moveY = -this._applyDeadzone(lStick.y, 0.15);

    // Drehen: rechter Stick X
    this.turnX = this._applyDeadzone(rStick.x, 0.15);

    // Buttons & Trigger
    const lBtns = this._getABXY(L?.buttons, "left");
    const rBtns = this._getABXY(R?.buttons, "right");
    const lTrig = this._getTrigger(L?.buttons);
    const rTrig = this._getTrigger(R?.buttons);

    // --- Edge-Detect für Springen (A|X) ---
    // Springen, wenn: A (right) ODER X (left)
    const jumpNow = rBtns.a || lBtns.x;
    const jumpPrev = (this._prev.right.a || this._prev.left.x);
    if (jumpNow && !jumpPrev) this.jumpDown = true;

    // --- Edge-Detect für Waffenwechsel (B|Y) ---
    // Waffenwechsel, wenn: B (right) ODER Y (left)
    const switchNow = rBtns.b || lBtns.y;
    const switchPrev = (this._prev.right.b || this._prev.left.y);
    if (switchNow && !switchPrev) this.switchWeaponDown = true;

    // --- Trigger (Feuer) je nach Waffenhand ---
    const trigNow = (this.weaponHand === "left") ? lTrig : rTrig;
    const trigPrev = (this.weaponHand === "left") ? this._prev.left.trig : this._prev.right.trig;
    this.fireHeld = !!trigNow;
    if (trigNow && !trigPrev) this.fireDown = true;

    // --- Snap-Turn vs Smooth-Turn ---
    if (this.snapTurnEnabled) {
      // Nur Snap über rechten Stick X
      if (this._snapCooldownFrames > 0) {
        this._snapCooldownFrames--;
      } else {
        const x = this.turnX;
        if (x <= -this.snapTurnDeadzone) {
          this.snapTurnDelta = -this._degToRad(this.snapTurnAngleDeg);
          this._snapCooldownFrames = this._snapCooldownMax;
        } else if (x >= this.snapTurnDeadzone) {
          this.snapTurnDelta = this._degToRad(this.snapTurnAngleDeg);
          this._snapCooldownFrames = this._snapCooldownMax;
        }
      }
      // Smooth-Turn wird bei Snap deaktiviert → turnX auf 0, nur Snap-Impulse liefern
      this.turnX = 0;
    } else {
      // Smooth-Turn aktiv: turnX bleibt erhalten, SnapDelta = 0
      // Skalierung passiert typischerweise im Player: yaw += turnX * smoothTurnScale * dt
      // (Wir geben die rohe [-1..1] Achse raus)
    }

    // Vorgängerzustände updaten (für Edge-Detect im nächsten Frame)
    this._prev.left = {
      a: lBtns.a, b: lBtns.b, x: lBtns.x, y: lBtns.y,
      trig: lTrig,
      stickX: lStick.x
    };
    this._prev.right = {
      a: rBtns.a, b: rBtns.b, x: rBtns.x, y: rBtns.y,
      trig: rTrig,
      stickX: rStick.x
    };
  }

  // Hilfswerte, die der Player/Loop nutzt -----------------------------

  // Smooth-Turn-Winkelgeschwindigkeit (rad/s) aus der aktuellen Achse
  getSmoothTurnSpeedRadPerSec() {
    // Nur sinnvoll, wenn snapTurnEnabled = false
    return this.turnX * this.smoothTurnScale;
  }

  // Snap-Turn-Impuls in Radiant (wird pro Frame neu berechnet)
  consumeSnapTurnDelta() {
    const d = this.snapTurnDelta;
    this.snapTurnDelta = 0;
    return d;
  }

  _applyDeadzone(v, dz) {
    if (Math.abs(v) < dz) return 0;
    // Optional: Re-Scale nach Deadzone
    const sign = Math.sign(v);
    const mag = (Math.abs(v) - dz) / (1 - dz);
    return sign * Math.min(1, Math.max(0, mag));
  }

  _degToRad(deg) {
    return deg * Math.PI / 180;
  }
}
