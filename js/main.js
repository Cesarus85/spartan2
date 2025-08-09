// Three.js wird über CDN geladen

class SpartanVRShooter {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controllers = [];
        this.player = {
            position: new THREE.Vector3(0, 1.6, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.6
        };
        this.weapon = null;
        this.terrain = null;
        this.fortress = null;
        this.bullets = [];
        
        this.settings = {
            gravity: -9.81 * 0.3, // Reduzierte Schwerkraft (30% der Erdgravitation)
            jumpForce: 8.0,
            moveSpeed: 5.0,
            turnSpeed: 2.0,
            bulletSpeed: 50.0
        };
        
        this.init();
    }
    
    init() {
        this.setupScene();
        this.setupRenderer();
        this.setupCamera();
        this.setupLighting();
        this.setupControllers();
        this.createTerrain();
        this.createFortress();
        this.createSkybox();
        this.setupEventListeners();
        this.animate();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a2a);
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Quest 3 Optimierung
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.xr.enabled = true;
        
        document.body.appendChild(this.renderer.domElement);
        
        // VR Button zum Container hinzufügen
        const vrButton = THREE.VRButton.createButton(this.renderer);
        vrButton.style.position = 'relative';
        vrButton.style.margin = '10px auto';
        vrButton.style.display = 'block';
        
        const vrContainer = document.getElementById('vrButtonContainer');
        if (vrContainer) {
            vrContainer.appendChild(vrButton);
        } else {
            document.body.appendChild(vrButton);
        }
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.copy(this.player.position);
    }
    
    setupLighting() {
        // Ambient light für Grundbeleuchtung
        const ambientLight = new THREE.AmbientLight(0x404080, 0.3);
        this.scene.add(ambientLight);
        
        // Direktionales Licht (Sonne)
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(50, 100, 50);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        this.scene.add(sunLight);
        
        // Punktlicht in der Festung
        const fortressLight = new THREE.PointLight(0xff6600, 2.0, 50);
        fortressLight.position.set(0, 15, 0);
        fortressLight.castShadow = true;
        this.scene.add(fortressLight);
    }
    
    setupControllers() {
        const controllerModelFactory = new THREE.XRControllerModelFactory();
        
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            controller.userData.index = i;
            this.scene.add(controller);
            
            const controllerGrip = this.renderer.xr.getControllerGrip(i);
            controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
            this.scene.add(controllerGrip);
            
            this.controllers.push({
                controller: controller,
                grip: controllerGrip,
                gamepad: null,
                index: i
            });
        }
        
        // Waffe an linken Controller anhängen
        this.createWeapon();
    }
    
    createWeapon() {
        // Master Chief Assault Rifle (vereinfacht)
        const weaponGroup = new THREE.Group();
        
        // Hauptkörper der Waffe
        const bodyGeometry = new THREE.BoxGeometry(0.8, 0.15, 0.08);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x2a2a2a });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        weaponGroup.add(body);
        
        // Lauf
        const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.025, 0.4, 8);
        const barrelMaterial = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(0.5, 0, 0);
        weaponGroup.add(barrel);
        
        // Griff
        const gripGeometry = new THREE.BoxGeometry(0.08, 0.25, 0.12);
        const gripMaterial = new THREE.MeshPhongMaterial({ color: 0x3a3a3a });
        const grip = new THREE.Mesh(gripGeometry, gripMaterial);
        grip.position.set(-0.2, -0.15, 0);
        weaponGroup.add(grip);
        
        // Visier
        const sightGeometry = new THREE.BoxGeometry(0.15, 0.05, 0.03);
        const sightMaterial = new THREE.MeshPhongMaterial({ color: 0x4a4a4a });
        const sight = new THREE.Mesh(sightGeometry, sightMaterial);
        sight.position.set(0.2, 0.1, 0);
        weaponGroup.add(sight);
        
        weaponGroup.position.set(0.1, -0.1, -0.3);
        weaponGroup.rotation.set(0, 0, -0.2);
        
        this.weapon = weaponGroup;
        
        // Waffe an linken Controller anhängen (Index 0)
        if (this.controllers[0]) {
            this.controllers[0].grip.add(this.weapon);
        }
    }
    
    createTerrain() {
        // 20x20 Terrain mit Höhenvariation
        const size = 200; // 20x20 Einheiten, skaliert auf 200x200 für Details
        const segments = 50; // Weniger Segmente für Quest 3 Performance
        
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        const vertices = geometry.attributes.position.array;
        
        // Höhenvariation hinzufügen
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 1];
            
            // Perlin-ähnliche Höhenvariation
            let height = Math.sin(x * 0.02) * Math.cos(z * 0.02) * 3;
            height += Math.sin(x * 0.05) * Math.cos(z * 0.05) * 1.5;
            height += Math.random() * 0.5;
            
            vertices[i + 2] = height;
        }
        
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshLambertMaterial({ 
            color: 0x4a6741,
            wireframe: false
        });
        
        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);
        
        // Hindernisse und Felsen hinzufügen
        this.addObstacles();
    }
    
    addObstacles() {
        const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
        
        for (let i = 0; i < 20; i++) {
            const rockGeometry = new THREE.SphereGeometry(
                Math.random() * 2 + 1, 
                8, 6
            );
            
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            rock.position.set(
                (Math.random() - 0.5) * 180,
                Math.random() * 2 + 1,
                (Math.random() - 0.5) * 180
            );
            rock.castShadow = true;
            rock.receiveShadow = true;
            
            // Zufällige Skalierung und Rotation
            rock.scale.setScalar(Math.random() * 0.8 + 0.5);
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            
            this.scene.add(rock);
        }
    }
    
    createFortress() {
        const fortressGroup = new THREE.Group();
        const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
        const metalMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
        
        // Hauptturm
        const towerGeometry = new THREE.CylinderGeometry(8, 10, 25, 8);
        const tower = new THREE.Mesh(towerGeometry, darkMaterial);
        tower.position.y = 12.5;
        tower.castShadow = true;
        tower.receiveShadow = true;
        fortressGroup.add(tower);
        
        // Mauern
        const wallGeometry = new THREE.BoxGeometry(30, 15, 2);
        const positions = [
            { x: 0, z: 15 }, { x: 0, z: -15 },
            { x: 15, z: 0 }, { x: -15, z: 0 }
        ];
        
        positions.forEach((pos, i) => {
            const wall = new THREE.Mesh(wallGeometry, darkMaterial);
            wall.position.set(pos.x, 7.5, pos.z);
            if (i >= 2) wall.rotation.y = Math.PI / 2;
            wall.castShadow = true;
            wall.receiveShadow = true;
            fortressGroup.add(wall);
        });
        
        // Eingangstor (Öffnung in vorderer Mauer)
        const gateGeometry = new THREE.BoxGeometry(8, 12, 3);
        const gate = new THREE.Mesh(gateGeometry, metalMaterial);
        gate.position.set(0, 6, 13);
        fortressGroup.add(gate);
        
        // Türme an den Ecken
        const cornerPositions = [
            { x: 15, z: 15 }, { x: -15, z: 15 },
            { x: 15, z: -15 }, { x: -15, z: -15 }
        ];
        
        cornerPositions.forEach(pos => {
            const cornerTower = new THREE.Mesh(
                new THREE.CylinderGeometry(3, 4, 20, 6), 
                darkMaterial
            );
            cornerTower.position.set(pos.x, 10, pos.z);
            cornerTower.castShadow = true;
            cornerTower.receiveShadow = true;
            fortressGroup.add(cornerTower);
        });
        
        this.fortress = fortressGroup;
        this.scene.add(this.fortress);
    }
    
    createSkybox() {
        // Halo-Ring am Himmel
        const ringGeometry = new THREE.TorusGeometry(400, 50, 8, 50);
        const ringMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x8899ff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        
        const haloRing = new THREE.Mesh(ringGeometry, ringMaterial);
        haloRing.position.set(200, 300, -300);
        haloRing.rotation.x = Math.PI / 4;
        haloRing.rotation.z = Math.PI / 6;
        this.scene.add(haloRing);
        
        // Sterne
        const starGeometry = new THREE.SphereGeometry(0.5, 6, 6);
        const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        for (let i = 0; i < 200; i++) {
            const star = new THREE.Mesh(starGeometry, starMaterial);
            const distance = 800 + Math.random() * 200;
            
            star.position.set(
                (Math.random() - 0.5) * distance * 2,
                Math.random() * distance,
                (Math.random() - 0.5) * distance * 2
            );
            
            this.scene.add(star);
        }
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Start Button Event Listener
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.addEventListener('click', () => {
                console.log('Start button clicked!');
                startButton.style.display = 'none';
                document.getElementById('instructions').style.display = 'none';
                
                // Zeige VR Button
                const vrContainer = document.getElementById('vrButtonContainer');
                if (vrContainer) {
                    vrContainer.style.display = 'block';
                }
                
                // Starte das Spiel auch im Desktop-Modus
                this.startGame();
            });
        }
        
        // VR Session Events
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('VR session started');
            document.getElementById('ui').style.display = 'none';
        });
        
        this.renderer.xr.addEventListener('sessionend', () => {
            console.log('VR session ended');
            document.getElementById('ui').style.display = 'block';
        });
    }
    
    startGame() {
        console.log('Game started!');
        // Hier können später Spielstart-Logiken hinzugefügt werden
        // Zum Beispiel: Spawn-Punkt setzen, Musik starten, etc.
    }
    
    handleControllerInput() {
        if (!this.renderer.xr.isPresenting) return;
        
        const session = this.renderer.xr.getSession();
        if (!session) return;
        
        // Controller Input verarbeiten
        for (let i = 0; i < this.controllers.length; i++) {
            const controller = this.controllers[i];
            const gamepad = session.inputSources[i]?.gamepad;
            
            if (!gamepad) continue;
            
            if (i === 0) { // Linker Controller
                // Bewegung mit Thumbstick
                const moveX = gamepad.axes[2] || 0;
                const moveZ = gamepad.axes[3] || 0;
                
                if (Math.abs(moveX) > 0.1 || Math.abs(moveZ) > 0.1) {
                    const moveVector = new THREE.Vector3(moveX, 0, moveZ);
                    moveVector.multiplyScalar(this.settings.moveSpeed * 0.016);
                    this.player.position.add(moveVector);
                }
                
                // Feuern mit Trigger
                if (gamepad.buttons[0]?.pressed) {
                    this.fireWeapon();
                }
            }
            
            if (i === 1) { // Rechter Controller
                // Drehung mit Thumbstick
                const turnX = gamepad.axes[2] || 0;
                if (Math.abs(turnX) > 0.1) {
                    // Kamera-Drehung implementieren
                    this.camera.rotation.y -= turnX * this.settings.turnSpeed * 0.016;
                }
                
                // Springen mit A-Taste
                if (gamepad.buttons[4]?.pressed && this.player.onGround) {
                    this.player.velocity.y = this.settings.jumpForce;
                    this.player.onGround = false;
                }
            }
        }
    }
    
    fireWeapon() {
        if (!this.weapon) return;
        
        // Muzzle Flash
        const flash = new THREE.PointLight(0xffaa00, 5, 10);
        flash.position.copy(this.weapon.position);
        this.scene.add(flash);
        
        setTimeout(() => {
            this.scene.remove(flash);
        }, 50);
        
        // Projektil erstellen
        const bulletGeometry = new THREE.SphereGeometry(0.05, 8, 6);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        
        bullet.position.copy(this.weapon.getWorldPosition(new THREE.Vector3()));
        const direction = new THREE.Vector3(0, 0, -1);
        this.weapon.getWorldDirection(direction);
        
        bullet.userData = {
            velocity: direction.multiplyScalar(this.settings.bulletSpeed),
            life: 3.0
        };
        
        this.bullets.push(bullet);
        this.scene.add(bullet);
    }
    
    updatePhysics(deltaTime) {
        // Schwerkraft anwenden
        if (!this.player.onGround) {
            this.player.velocity.y += this.settings.gravity * deltaTime;
        }
        
        // Position aktualisieren
        this.player.position.add(
            this.player.velocity.clone().multiplyScalar(deltaTime)
        );
        
        // Bodenkollision (vereinfacht)
        if (this.player.position.y <= this.player.height) {
            this.player.position.y = this.player.height;
            this.player.velocity.y = 0;
            this.player.onGround = true;
        }
        
        // Kamera Position aktualisieren (für Non-VR Fallback)
        if (!this.renderer.xr.isPresenting) {
            this.camera.position.copy(this.player.position);
        }
        
        // Projektile aktualisieren
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.position.add(
                bullet.userData.velocity.clone().multiplyScalar(deltaTime)
            );
            
            bullet.userData.life -= deltaTime;
            if (bullet.userData.life <= 0 || bullet.position.y < -10) {
                this.scene.remove(bullet);
                this.bullets.splice(i, 1);
            }
        }
    }
    
    animate() {
        this.renderer.setAnimationLoop((time, frame) => {
            const deltaTime = Math.min(0.05, time / 1000 - (this.lastTime || 0));
            this.lastTime = time / 1000;
            
            this.handleControllerInput();
            this.updatePhysics(deltaTime);
            
            // FPS Counter
            if (Math.floor(time / 1000) !== this.lastSecond) {
                document.getElementById('fps').textContent = Math.round(1 / deltaTime);
                this.lastSecond = Math.floor(time / 1000);
            }
            
            this.renderer.render(this.scene, this.camera);
        });
    }
}

// Spiel starten
const game = new SpartanVRShooter();