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

    // --- Lighting ---
    const hemiLight = new THREE.HemisphereLight(0xadd8e6, 0x444444, 0.9);
    scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);
    scene.background = new THREE.Color(0x87ceeb);

    // --- Procedural Runway ---
    const runwayGroup = new THREE.Group();
    const runwayMaterial = new THREE.MeshStandardMaterial({ color: 0x404040 });
    const runwayGeometry = new THREE.PlaneGeometry(80, 3000);
    const runwayMesh = new THREE.Mesh(runwayGeometry, runwayMaterial);
    runwayMesh.rotation.x = -Math.PI / 2;
    runwayGroup.add(runwayMesh);
    const markingsMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const centerlineDashGeometry = new THREE.PlaneGeometry(1, 40);
    const numDashes = Math.floor(3000 / 75);
    for (let i = 0; i < numDashes; i++) {
        const centerlineDash = new THREE.Mesh(centerlineDashGeometry, markingsMaterial);
        centerlineDash.rotation.x = -Math.PI / 2;
        centerlineDash.position.y = 0.01;
        centerlineDash.position.z = -1500 + i * 75 + 20;
        runwayGroup.add(centerlineDash);
    }
    scene.add(runwayGroup);

    // --- Player & Physics Model ---
    let localPlayer = { mesh: new THREE.Group(), velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3() };
    scene.add(localPlayer.mesh);
    const MAX_SPEED_KTS = 500;
    const MAX_SPEED_INTERNAL = MAX_SPEED_KTS / 200;

    // --- Ground Collision & Physics Constants ---
    // DEFINITIVE FIX: Use reliable attachment points, not wheel names.
    const gearHeight = 3.5;
    const gearPositions = [
        new THREE.Vector3(0, 0, 15),   // Nose gear (relative to plane center)
        new THREE.Vector3(-5, 0, -5),  // Left main gear
        new THREE.Vector3(5, 0, -5),   // Right main gear
    ];
    const PHYSICS_CONSTANTS = {
        thrustMultiplier: 0.015,
        dragCoefficient: 0.0001,
        liftCoefficient: 0.07,
        angularDrag: 0.97,
        stallAngle: 0.4,
        sensitivity: { pitch: 0.001, roll: 0.0008, yaw: 0.0005 }
    };

    // --- Model Loading ---
    const loader = new THREE.GLTFLoader(loadingManager);
    loader.load('models/airplane.glb', (gltf) => {
        localPlayer.mesh.add(gltf.scene);
        localPlayer.mesh.position.y = gearHeight + 2; // Spawn safely above the ground
    });

    // --- Game State & HUD ---
    let gameState = { isGearDown: true, onGround: true, engine1On: false, engine2On: false, engine1Prc: 0, engine2Prc: 0 };
    const throttleSlider = document.getElementById('throttle-slider');
    const gearButton = document.getElementById('btn-gears');
    const engine1Button = document.getElementById('btn-engine-1');
    const engine2Button = document.getElementById('btn-engine-2');
    const engine1Percent = document.getElementById('engine-1-percent');
    const engine2Percent = document.getElementById('engine-2-percent');
    const keys = {};

    // --- Flight & Camera Controls ---
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    let joystickActive = false, isDraggingCamera = false;
    let lastMousePos = { x: 0, y: 0 };
    let cameraAzimuth = Math.PI, cameraElevation = 0.2;
    const cameraDistance = 25;

    // --- Input Listeners (Complete) ---
    const joystickContainer = document.getElementById('joystick-container');
    const joystickNub = document.getElementById('joystick-nub');
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
    gearButton.addEventListener('click', () => { gameState.isGearDown = !gameState.isGearDown; gearButton.classList.toggle('active', gameState.isGearDown); });
    engine1Button.addEventListener('click', () => { gameState.engine1On = !gameState.engine1On; engine1Button.classList.toggle('engine-on', gameState.engine1On); });
    engine2Button.addEventListener('click', () => { gameState.engine2On = !gameState.engine2On; engine2Button.classList.toggle('engine-on', gameState.engine2On); });

    // --- GAME LOOP ---
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const deltaTime = clock.getDelta();
        if (deltaTime > 0.1) return;

        // --- Engine Spool Logic ---
        const spoolRate = 0.5;
        if (gameState.engine1On && gameState.engine1Prc < 100) gameState.engine1Prc += spoolRate; else if (!gameState.engine1On && gameState.engine1Prc > 0) gameState.engine1Prc -= spoolRate * 2;
        if (gameState.engine2On && gameState.engine2Prc < 100) gameState.engine2Prc += spoolRate; else if (!gameState.engine2On && gameState.engine2Prc > 0) gameState.engine2Prc -= spoolRate * 2;
        gameState.engine1Prc = Math.max(0, Math.min(100, gameState.engine1Prc));
        gameState.engine2Prc = Math.max(0, Math.min(100, gameState.engine2Prc));
        
        // --- Target-Speed Based Acceleration ---
        const throttleLevel = parseInt(throttleSlider.value) / 100;
        const targetAirspeed = MAX_SPEED_INTERNAL * throttleLevel;
        const airspeed = localPlayer.velocity.length();
        const thrustMagnitude = (targetAirspeed - airspeed) * PHYSICS_CONSTANTS.thrustMultiplier;
        let thrustForce = localPlayer.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(thrustMagnitude);
        if (gameState.engine1Prc < 100 || gameState.engine2Prc < 100) {
            thrustForce.multiplyScalar(0);
        }
        
        // --- Physics Calculation ---
        const planeUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(localPlayer.mesh.quaternion);
        const totalForces = new THREE.Vector3(0, -9.8, 0);
        
        if (airspeed > 0.5) {
            const velocityDirection = localPlayer.velocity.clone().normalize();
            const dot = THREE.MathUtils.clamp(planeUpVector.dot(velocityDirection), -1, 1);
            let aoa = Math.acos(dot) - Math.PI / 2;
            let stallEffect = 1.0;
            if (Math.abs(aoa) > PHYSICS_CONSTANTS.stallAngle) stallEffect = Math.max(0, 1 - (Math.abs(aoa) - PHYSICS_CONSTANTS.stallAngle) / 0.1);
            let liftMagnitude = airspeed * airspeed * (PHYSICS_CONSTANTS.liftCoefficient + Math.abs(aoa)) * stallEffect;
            if (localPlayer.mesh.position.y < gearHeight + 10) liftMagnitude *= 1.2;
            const liftForce = planeUpVector.clone().multiplyScalar(liftMagnitude);
            totalForces.add(liftForce);
            const dragMagnitude = airspeed * airspeed * PHYSICS_CONSTANTS.dragCoefficient * (gameState.isGearDown ? 5 : 1);
            const dragForce = velocityDirection.clone().multiplyScalar(-dragMagnitude);
            totalForces.add(dragForce);
        }

        totalForces.add(thrustForce);
        localPlayer.velocity.add(totalForces.clone().multiplyScalar(deltaTime));

        // Rotational Physics
        const aeroForce = airspeed;
        controls.yaw = keys['q'] ? 1.0 : (keys['e'] ? -1.0 : 0);
        const torque = new THREE.Vector3(controls.pitch * PHYSICS_CONSTANTS.sensitivity.pitch * aeroForce, controls.yaw * PHYSICS_CONSTANTS.sensitivity.yaw * aeroForce, controls.roll * PHYSICS_CONSTANTS.sensitivity.roll * aeroForce);
        if (gameState.onGround) torque.multiplyScalar(0.2);
        localPlayer.angularVelocity.add(torque.clone().multiplyScalar(deltaTime));
        const angularDrag = gameState.onGround ? 0.9 : PHYSICS_CONSTANTS.angularDrag;
        localPlayer.angularVelocity.multiplyScalar(1 - ((1 - angularDrag) * deltaTime * 60));
        const deltaRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(localPlayer.angularVelocity.x * deltaTime, localPlayer.angularVelocity.y * deltaTime, localPlayer.angularVelocity.z * deltaTime));
        localPlayer.mesh.quaternion.multiply(deltaRotation);
        
        // Update Position
        localPlayer.mesh.position.add(localPlayer.velocity.clone().multiplyScalar(deltaTime));

        // --- THE DEFINITIVE "HARD FLOOR" GROUND COLLISION ---
        gameState.onGround = false;
        if (gameState.isGearDown) {
            let maxPenetration = 0;
            gearPositions.forEach(gearPos => {
                const worldPos = localPlayer.mesh.localToWorld(gearPos.clone());
                if (worldPos.y < gearHeight) { 
                    maxPenetration = Math.max(maxPenetration, gearHeight - worldPos.y);
                    gameState.onGround = true;
                }
            });

            if (maxPenetration > 0) {
                localPlayer.mesh.position.y += maxPenetration;
                localPlayer.velocity.y = Math.max(0, localPlayer.velocity.y);
            }
        }
        
        // --- Camera & HUD Update ---
        const cameraOffset = new THREE.Vector3(cameraDistance * Math.sin(cameraAzimuth) * Math.cos(cameraElevation), cameraDistance * Math.sin(cameraElevation), cameraDistance * Math.cos(cameraAzimuth) * Math.cos(cameraElevation));
        camera.position.lerp(localPlayer.mesh.position.clone().add(cameraOffset), 0.1);
        camera.lookAt(localPlayer.mesh.position);
        const altitude = localPlayer.mesh.position.y;
        document.getElementById('altitude-value').textContent = Math.max(0, Math.round(altitude * 3.28));
        document.getElementById('airspeed-value').textContent = Math.round(airspeed * 200);
        document.getElementById('engine-1-percent').textContent = `${Math.round(gameState.engine1Prc)}%`;
        document.getElementById('engine-2-percent').textContent = `${Math.round(gameState.engine2Prc)}%`;
        document.getElementById('btn-engine-1').classList.toggle('engine-ready', gameState.engine1Prc >= 100);
        document.getElementById('btn-engine-2').classList.toggle('engine-ready', gameState.engine2Prc >= 100);
        const euler = new THREE.Euler().setFromQuaternion(localPlayer.mesh.quaternion, 'YXZ');
        document.getElementById('heading-value').textContent = `${(Math.round(THREE.MathUtils.radToDeg(euler.y)) + 360) % 360}°`;

        renderer.render(scene, camera);
    }
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
