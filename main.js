document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements & Loading Manager ---
    const loadingContainer = document.getElementById('loading-container');
    const progressBar = document.getElementById('progress-bar-inner');
    const errorScreen = document.getElementById('error-screen');
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onLoad = () => { loadingContainer.style.display = 'none'; animate(); };
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => { progressBar.style.width = `${(itemsLoaded / itemsTotal) * 100}%`; };
    loadingManager.onError = (url) => {
        errorScreen.style.display = 'block';
        loadingContainer.style.display = 'none';
        errorScreen.innerHTML = `<h2>Loading Failed</h2><p>Could not load asset: <strong>${url}</strong></p><p>Please check file path and names.</p>`;
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0x8899aa, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, 100, 30);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 100; dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -100; dirLight.shadow.camera.right = 100;
    scene.add(dirLight);
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 100, 8000);

    // --- Models & Environment ---
    let localPlayer = { mesh: new THREE.Group(), velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3() };
    scene.add(localPlayer.mesh);
    let airport;
    const loader = new THREE.GLTFLoader(loadingManager);
    
    loader.load('models/airport.glb', (gltf) => {
        airport = gltf.scene;
        airport.traverse(node => { if (node.isMesh) node.receiveShadow = true; });
        scene.add(airport);
        createRunwayDetails();
    });

    loader.load('models/airplane.glb', (gltf) => {
        localPlayer.mesh.add(gltf.scene);
        localPlayer.mesh.traverse(node => { if (node.isMesh) node.castShadow = true; });
        localPlayer.mesh.position.set(0, 5, -500);
    });

    function createRunwayDetails() {
        const runwayDetails = new THREE.Group();
        const baseGeo = new THREE.PlaneGeometry(65, 1600);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x333338 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.rotation.x = -Math.PI / 2;
        base.position.y = -0.1;
        runwayDetails.add(base);
        const dashGeo = new THREE.PlaneGeometry(1, 20);
        const dashMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        for (let i = 0; i < 45; i++) {
            const dash = new THREE.Mesh(dashGeo, dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.y = 0.01;
            dash.position.z = -800 + i * 35 + 10;
            runwayDetails.add(dash);
        }
        scene.add(runwayDetails);
    }

    // --- Physics & Game State ---
    const MAX_SPEED_KTS = 500;
    const MAX_SPEED_INTERNAL = MAX_SPEED_KTS / 200;
    const raycaster = new THREE.Raycaster();
    const gearHeight = 3.5;
    const gearPositions = [
        new THREE.Vector3(0, -gearHeight, 15),
        new THREE.Vector3(-5, -gearHeight, -5),
        new THREE.Vector3(5, -gearHeight, -5),
    ];
    const PHYSICS_CONSTANTS = {
        thrustMultiplier: 0.01,
        dragCoefficient: 0.0001,
        liftCoefficient: 0.07,
        angularDrag: 0.97,
        stallAngle: 0.4,
        sensitivity: { pitch: 0.001, roll: 0.0008, yaw: 0.0005 }
    };
    let gameState = { onGround: true, isGearDown: true, engine1On: false, engine2On: false, engine1Prc: 0, engine2Prc: 0 };
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    const keys = {};

    // --- Input Listeners (Complete) ---
    const joystickContainer = document.getElementById('joystick-container');
    const joystickNub = document.getElementById('joystick-nub');
    let joystickActive = false, isDraggingCamera = false;
    let lastMousePos = { x: 0, y: 0 };
    let cameraAzimuth = Math.PI, cameraElevation = 0.2;
    const cameraDistance = 25;
    document.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
    function handleJoystick(event) { event.preventDefault(); const rect = joystickContainer.getBoundingClientRect(); const touch = event.touches ? event.touches[0] : event; let x = (touch.clientX - rect.left - rect.width / 2) / (rect.width / 2); let y = (touch.clientY - rect.top - rect.height / 2) / (rect.height / 2); const mag = Math.sqrt(x * x + y * y); if (mag > 1) { x /= mag; y /= mag; } joystickNub.style.left = `${50 + x * 50}%`; joystickNub.style.top = `${50 + y * 50}%`; controls.roll = x; controls.pitch = -y; }
    joystickContainer.addEventListener('touchstart', (e) => { joystickActive = true; handleJoystick(e); }, { passive: false });
    joystickContainer.addEventListener('touchmove', (e) => { if (joystickActive) handleJoystick(e); }, { passive: false });
    joystickContainer.addEventListener('touchend', () => { joystickActive = false; joystickNub.style.left = '50%'; joystickNub.style.top = '50%'; controls.pitch = 0; controls.roll = 0; });
    function handleCameraDragStart(e) { if (e.target.closest('.hud')) return; isDraggingCamera = true; const currentPos = e.touches ? e.touches[0] : e; lastMousePos.x = currentPos.clientX; lastMousePos.y = currentPos.clientY; }
    function handleCameraDragMove(e) { if (!isDraggingCamera) return; e.preventDefault(); const currentPos = e.touches ? e.touches[0] : e; const deltaX = currentPos.clientX - lastMousePos.x; const deltaY = currentPos.clientY - lastMousePos.y; cameraAzimuth -= deltaX * 0.005; cameraElevation -= deltaY * 0.005; cameraElevation = Math.max(-Math.PI / 4, Math.min(Math.PI / 2, cameraElevation)); lastMousePos.x = currentPos.clientX; lastMousePos.y = currentPos.clientY; }
    window.addEventListener('mousedown', handleCameraDragStart);
    window.addEventListener('mousemove', handleCameraDragMove);
    window.addEventListener('mouseup', () => isDraggingCamera = false);
    window.addEventListener('touchstart', handleCameraDragStart, { passive: false });
    window.addEventListener('touchmove', handleCameraDragMove, { passive: false });
    window.addEventListener('touchend', () => isDraggingCamera = false);
    document.getElementById('btn-gears').addEventListener('click', () => { gameState.isGearDown = !gameState.isGearDown; document.getElementById('btn-gears').classList.toggle('active', gameState.isGearDown); });
    document.getElementById('btn-engine-1').addEventListener('click', () => { gameState.engine1On = !gameState.engine1On; document.getElementById('btn-engine-1').classList.toggle('engine-on', gameState.engine1On); });
    document.getElementById('btn-engine-2').addEventListener('click', () => { gameState.engine2On = !gameState.engine2On; document.getElementById('btn-engine-2').classList.toggle('engine-on', gameState.engine2On); });

    // --- GAME LOOP ---
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const deltaTime = Math.min(0.05, clock.getDelta());
        if (deltaTime <= 0) return;

        // --- Engine & Throttle Logic ---
        const spoolRate = 0.5;
        if (gameState.engine1On && gameState.engine1Prc < 100) gameState.engine1Prc += spoolRate; else if (!gameState.engine1On && gameState.engine1Prc > 0) gameState.engine1Prc -= spoolRate * 2;
        if (gameState.engine2On && gameState.engine2Prc < 100) gameState.engine2Prc += spoolRate; else if (!gameState.engine2On && gameState.engine2Prc > 0) gameState.engine2Prc -= spoolRate * 2;
        gameState.engine1Prc = Math.max(0, Math.min(100, gameState.engine1Prc));
        gameState.engine2Prc = Math.max(0, Math.min(100, gameState.engine2Prc));
        
        // --- Physics Calculation ---
        const forwardVector = localPlayer.mesh.getWorldDirection(new THREE.Vector3());
        const airspeed = localPlayer.velocity.length();
        const planeUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(localPlayer.mesh.quaternion);

        const totalForces = new THREE.Vector3(0, -9.81, 0);

        // Target-Speed Acceleration Model
        const throttleLevel = parseInt(document.getElementById('throttle-slider').value) / 100;
        const targetAirspeed = MAX_SPEED_INTERNAL * throttleLevel;
        if (gameState.engine1Prc >= 100 && gameState.engine2Prc >= 100) {
            const thrustMagnitude = (targetAirspeed - airspeed) * PHYSICS_CONSTANTS.thrustMultiplier;
            const thrustForce = forwardVector.clone().multiplyScalar(thrustMagnitude);
            totalForces.add(thrustForce);
        }
        
        // Aerodynamic forces only apply if moving
        if (airspeed > 1.0) {
            const velocityDirection = localPlayer.velocity.clone().normalize();
            const dot = THREE.MathUtils.clamp(planeUpVector.dot(velocityDirection), -1, 1);
            let aoa = Math.acos(dot) - Math.PI / 2;
            let stallEffect = 1.0;
            if (Math.abs(aoa) > PHYSICS_CONSTANTS.stallAngle) stallEffect = Math.max(0, 1 - (Math.abs(aoa) - PHYSICS_CONSTANTS.stallAngle) / 0.1);
            let liftMagnitude = airspeed * airspeed * (PHYSICS_CONSTANTS.liftCoefficient + Math.abs(aoa)) * stallEffect;
            const liftForce = planeUpVector.clone().multiplyScalar(liftMagnitude);
            totalForces.add(liftForce);

            const dragMagnitude = airspeed * airspeed * PHYSICS_CONSTANTS.dragCoefficient * (gameState.isGearDown ? 5 : 1);
            const dragForce = velocityDirection.multiplyScalar(-dragMagnitude);
            totalForces.add(dragForce);
        }

        // Apply forces to velocity
        localPlayer.velocity.add(totalForces.clone().multiplyScalar(deltaTime));

        // Rotational Physics (Torque)
        const aeroForce = airspeed;
        controls.yaw = keys['q'] ? 1.0 : (keys['e'] ? -1.0 : 0);
        const controlTorque = new THREE.Vector3(controls.pitch * PHYSICS_CONSTANTS.sensitivity.pitch * aeroForce, controls.yaw * PHYSICS_CONSTANTS.sensitivity.yaw * aeroForce, controls.roll * PHYSICS_CONSTANTS.sensitivity.roll * aeroForce);
        if (gameState.onGround) controlTorque.multiplyScalar(0.2);
        localPlayer.angularVelocity.add(controlTorque.clone().multiplyScalar(deltaTime));
        const angularDrag = gameState.onGround ? 0.9 : PHYSICS_CONSTANTS.angularDrag;
        localPlayer.angularVelocity.multiplyScalar(1 - ((1 - angularDrag) * deltaTime * 60));
        const deltaRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(localPlayer.angularVelocity.x * deltaTime, localPlayer.angularVelocity.y * deltaTime, localPlayer.angularVelocity.z * deltaTime));
        localPlayer.mesh.quaternion.multiply(deltaRotation);
        
        // Update Position
        localPlayer.mesh.position.add(localPlayer.velocity.clone().multiplyScalar(deltaTime));
        
        // --- DEFINITIVE GROUND COLLISION (Position & Velocity Correction) ---
        gameState.onGround = false;
        if (gameState.isGearDown && airport) {
            let maxPenetration = 0;
            gearPositions.forEach(gearPos => {
                const worldPos = localPlayer.mesh.localToWorld(gearPos.clone());
                raycaster.set(worldPos, new THREE.Vector3(0, -1, 0));
                const intersects = raycaster.intersectObject(airport, true);
                if (intersects.length > 0) {
                    const hit = intersects[0];
                    const penetration = hit.distance;
                    if (penetration < gearHeight) {
                        maxPenetration = Math.max(maxPenetration, gearHeight - penetration);
                        gameState.onGround = true;
                    }
                }
            });

            if (maxPenetration > 0) {
                // Instantly correct position to stop sinking
                localPlayer.mesh.position.y += maxPenetration;
                // Instantly cancel vertical velocity to stop bouncing/sinking further
                localPlayer.velocity.y = Math.max(0, localPlayer.velocity.y);
            }
        }
        
        // --- Camera & HUD Update ---
        const cameraOffset = new THREE.Vector3(cameraDistance * Math.sin(cameraAzimuth) * Math.cos(cameraElevation), cameraDistance * Math.sin(cameraElevation), cameraDistance * Math.cos(cameraAzimuth) * Math.cos(cameraElevation));
        camera.position.lerp(localPlayer.mesh.position.clone().add(cameraOffset), 0.1);
        camera.lookAt(localPlayer.mesh.position);
        
        document.getElementById('airspeed-value').textContent = Math.round(airspeed * 200);
        const euler = new THREE.Euler().setFromQuaternion(localPlayer.mesh.quaternion, 'YXZ');
        document.getElementById('heading-value').textContent = `${(Math.round(THREE.MathUtils.radToDeg(euler.y)) + 360) % 360}°`;
        const altitudeMSL = localPlayer.mesh.position.y;
        document.getElementById('altitude-value').textContent = Math.round(altitudeMSL * 3.28);
        document.getElementById('engine-1-percent').textContent = `${Math.round(gameState.engine1Prc)}%`;
        document.getElementById('engine-2-percent').textContent = `${Math.round(gameState.engine2Prc)}%`;
        document.getElementById('btn-engine-1').classList.toggle('engine-ready', gameState.engine1Prc >= 100);
        document.getElementById('btn-engine-2').classList.toggle('engine-ready', gameState.engine2Prc >= 100);
        
        renderer.render(scene, camera);
    }
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
