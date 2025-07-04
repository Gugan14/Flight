document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements & Loading Manager ---
    const loadingContainer = document.getElementById('loading-container');
    const progressBar = document.getElementById('progress-bar-inner');
    const errorScreen = document.getElementById('error-screen');
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onLoad = () => { loadingContainer.style.display = 'none'; animate(); };
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => { progressBar.style.width = `${(itemsLoaded / itemsTotal) * 100}%`; };
    loadingManager.onError = (url) => { /* ... error handling ... */ };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true; // Enable shadows for more realism

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0x8899aa, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 100, 30);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 200;
    scene.add(dirLight);
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 100, 5000);

    // --- Player & Airport Models ---
    let localPlayer = { mesh: new THREE.Group(), velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3() };
    scene.add(localPlayer.mesh);
    let airport; // This will hold the airport model for collision detection

    const loader = new THREE.GLTFLoader(loadingManager);
    
    // Load Airport
    loader.load('models/airport.glb', (gltf) => {
        airport = gltf.scene;
        airport.traverse(node => {
            if (node.isMesh) {
                node.receiveShadow = true;
            }
        });
        scene.add(airport);
    });

    // Load Airplane
    loader.load('models/airplane.glb', (gltf) => {
        localPlayer.mesh.add(gltf.scene);
        localPlayer.mesh.traverse(node => {
            if (node.isMesh) {
                node.castShadow = true;
            }
        });
        // Position the plane on the runway
        localPlayer.mesh.position.set(0, 5, -400); 
    });

    // --- Physics & Game State ---
    const MAX_SPEED_KTS = 500;
    const MAX_SPEED_INTERNAL = MAX_SPEED_KTS / 200;
    const raycaster = new THREE.Raycaster();
    const gearHeight = 3.5;
    const gearPositions = [
        new THREE.Vector3(0, -gearHeight + 0.1, 15),
        new THREE.Vector3(-5, -gearHeight + 0.1, -5),
        new THREE.Vector3(5, -gearHeight + 0.1, -5),
    ];
    const PHYSICS_CONSTANTS = {
        baseThrust: 0.2,
        ramAirFactor: 0.1,
        dragCoefficient: 0.00015,
        angularDrag: 0.97,
        liftCoefficient: 0.05,
        suspensionStiffness: 0.1,
        suspensionDamping: 0.2,
        stallAngle: 0.4,
        sensitivity: { pitch: 0.001, roll: 0.0008, yaw: 0.0005 }
    };
    let gameState = { onGround: true, /* ... other states ... */ };
    let targetThrust = 0, currentThrust = 0;
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    const keys = {};

    // --- Input Listeners (Complete, No Changes Needed) ---
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
        const deltaTime = Math.min(0.05, clock.getDelta()); // Prevent large physics steps

        // Engine & Throttle Logic
        const spoolRate = 0.5;
        let gameState = { isGearDown: document.getElementById('btn-gears').classList.contains('active'), engine1On: document.getElementById('btn-engine-1').classList.contains('engine-on'), engine2On: document.getElementById('btn-engine-2').classList.contains('engine-on'), engine1Prc: parseFloat(document.getElementById('engine-1-percent').textContent), engine2Prc: parseFloat(document.getElementById('engine-2-percent').textContent), onGround: true };
        if (gameState.engine1On && gameState.engine1Prc < 100) gameState.engine1Prc += spoolRate; else if (!gameState.engine1On && gameState.engine1Prc > 0) gameState.engine1Prc -= spoolRate * 2;
        if (gameState.engine2On && gameState.engine2Prc < 100) gameState.engine2Prc += spoolRate; else if (!gameState.engine2On && gameState.engine2Prc > 0) gameState.engine2Prc -= spoolRate * 2;
        gameState.engine1Prc = Math.max(0, Math.min(100, gameState.engine1Prc));
        gameState.engine2Prc = Math.max(0, Math.min(100, gameState.engine2Prc));
        targetThrust = (gameState.engine1Prc >= 100 && gameState.engine2Prc >= 100) ? parseInt(document.getElementById('throttle-slider').value) / 100 : 0;
        currentThrust += (targetThrust - currentThrust) * 0.05;

        // Physics Calculation
        const forwardVector = localPlayer.mesh.getWorldDirection(new THREE.Vector3());
        const airspeed = localPlayer.velocity.length();
        const planeUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(localPlayer.mesh.quaternion);

        // -- Forces --
        const totalForces = new THREE.Vector3(0, -9.8, 0);
        
        // Thrust (Momentum-based)
        const thrustMagnitude = currentThrust * (PHYSICS_CONSTANTS.baseThrust + airspeed * PHYSICS_CONSTANTS.ramAirFactor);
        const thrustForce = forwardVector.clone().multiplyScalar(thrustMagnitude);
        totalForces.add(thrustForce);

        // Aerodynamic forces
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

        // Ground Collision & Suspension
        gameState.onGround = false;
        if (gameState.isGearDown && airport) {
            gearPositions.forEach(gearPos => {
                const worldPos = localPlayer.mesh.localToWorld(gearPos.clone());
                raycaster.set(worldPos, new THREE.Vector3(0, -1, 0));
                const intersects = raycaster.intersectObject(airport, true);

                if (intersects.length > 0) {
                    const hit = intersects[0];
                    const suspensionTravel = worldPos.y - hit.point.y;
                    if (suspensionTravel < 0) {
                        gameState.onGround = true;
                        const springForce = -suspensionTravel * PHYSICS_CONSTANTS.suspensionStiffness;
                        const dampingForce = planeUpVector.dot(localPlayer.velocity) * PHYSICS_CONSTANTS.suspensionDamping;
                        const totalSuspension = Math.max(0, springForce - dampingForce);
                        totalForces.add(planeUpVector.clone().multiplyScalar(totalSuspension));
                    }
                }
            });
        }

        localPlayer.velocity.add(totalForces.clone().multiplyScalar(deltaTime));

        // Rotational Physics (Torque)
        const aeroForce = airspeed;
        controls.yaw = keys['q'] ? 1.0 : (keys['e'] ? -1.0 : 0);
        const torque = new THREE.Vector3(controls.pitch * PHYSICS_CONSTANTS.sensitivity.pitch * aeroForce, controls.yaw * PHYSICS_CONSTANTS.sensitivity.yaw * aeroForce, controls.roll * PHYSICS_CONSTANTS.sensitivity.roll * aeroForce);
        if (gameState.onGround) torque.multiplyScalar(0.2);
        localPlayer.angularVelocity.add(torque.clone().multiplyScalar(deltaTime));
        localPlayer.angularVelocity.multiplyScalar(1 - (PHYSICS_CONSTANTS.angularDrag * deltaTime));
        const deltaRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(localPlayer.angularVelocity.x * deltaTime, localPlayer.angularVelocity.y * deltaTime, localPlayer.angularVelocity.z * deltaTime));
        localPlayer.mesh.quaternion.multiply(deltaRotation);

        localPlayer.mesh.position.add(localPlayer.velocity.clone().multiplyScalar(deltaTime));
        if (localPlayer.velocity.length() > MAX_SPEED_INTERNAL) localPlayer.velocity.normalize().multiplyScalar(MAX_SPEED_INTERNAL);

        // Camera & HUD Update
        const cameraOffset = new THREE.Vector3(cameraDistance * Math.sin(cameraAzimuth) * Math.cos(cameraElevation), cameraDistance * Math.sin(cameraElevation), cameraDistance * Math.cos(cameraAzimuth) * Math.cos(cameraElevation));
        camera.position.lerp(localPlayer.mesh.position.clone().add(cameraOffset), 0.1);
        camera.lookAt(localPlayer.mesh.position);
        document.getElementById('airspeed-value').textContent = Math.round(airspeed * 200);
        document.getElementById('engine-1-percent').textContent = `${Math.round(gameState.engine1Prc)}%`;
        document.getElementById('engine-2-percent').textContent = `${Math.round(gameState.engine2Prc)}`;
        document.getElementById('btn-engine-1').classList.toggle('engine-ready', gameState.engine1Prc >= 100);
        document.getElementById('btn-engine-2').classList.toggle('engine-ready', gameState.engine2Prc >= 100);
        const euler = new THREE.Euler().setFromQuaternion(localPlayer.mesh.quaternion, 'YXZ');
        document.getElementById('heading-value').textContent = `${(Math.round(THREE.MathUtils.radToDeg(euler.y)) + 360) % 360}°`;
        const altitudeMSL = localPlayer.mesh.position.y;
        document.getElementById('altitude-value').textContent = Math.round(altitudeMSL * 3.28);
        
        renderer.render(scene, camera);
    }
    window.addEventListener('resize', () => { /* ... resize handler ... */ });
});
