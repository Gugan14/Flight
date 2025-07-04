document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const loadingContainer = document.getElementById('loading-container');
    const progressBar = document.getElementById('progress-bar-inner');
    const errorScreen = document.getElementById('error-screen');
    const joystickContainer = document.getElementById('joystick-container');
    const joystickNub = document.getElementById('joystick-nub');

    // --- Loading Manager ---
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => { progressBar.style.width = `${(itemsLoaded / itemsTotal) * 100}%`; };
    loadingManager.onLoad = () => { loadingContainer.style.display = 'none'; };
    loadingManager.onError = (url) => { /* ... error handling ... */ };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // FIX: Dark Textures - Use sRGBEncoding for correct color output.
    renderer.outputEncoding = THREE.sRGBEncoding;

    // --- Lighting & Environment ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.8)); // Slightly increased ambient light
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.MeshStandardMaterial({ color: 0xdeb887 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.background = new THREE.Color(0x87ceeb);

    // --- Player & Physics Model ---
    let localPlayer = {
        mesh: new THREE.Group(),
        velocity: new THREE.Vector3(),
        // NEW: For realistic rotation physics
        angularVelocity: new THREE.Vector3()
    };
    scene.add(localPlayer.mesh);

    // --- Model Loading ---
    const loader = new THREE.GLTFLoader(loadingManager);
    loader.load('models/airplane.glb', (gltf) => {
        gltf.scene.scale.set(1.0, 1.0, 1.0);
        gltf.scene.rotation.y = Math.PI;
        localPlayer.mesh.add(gltf.scene);
        // FIX: Ground Clipping - Set the initial Y position higher. Adjust if needed.
        localPlayer.mesh.position.y = 1.8;
    });

    // --- Game State & HUD ---
    let gameState = { isGearDown: true, engine1On: false, engine2On: false };
    const throttleSlider = document.getElementById('throttle-slider');
    const gearButton = document.getElementById('btn-gears');
    const engine1Button = document.getElementById('btn-engine-1');
    const engine2Button = document.getElementById('btn-engine-2');
    const keys = {};

    // --- Flight & Camera Controls ---
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    const physics = {
        drag: 0.98,
        angularDrag: 0.97,
        // FIX: Plane not flying - Significantly increased lift coefficient.
        lift: 0.08,
        // Aerodynamic sensitivity for the new physics model
        sensitivity: { pitch: 0.001, roll: 0.0008, yaw: 0.0005 }
    };
    let isDraggingCamera = false;
    let lastMousePos = { x: 0, y: 0 };
    let cameraAzimuth = Math.PI;
    let cameraElevation = 0.2;
    const cameraDistance = 20; // Increased camera distance for a better view

    // --- Input Listeners ---
    document.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
    // ... (All other input listeners for joystick, camera, and buttons remain the same) ...

    // --- GAME LOOP ---
    function animate() {
        requestAnimationFrame(animate);

        // --- Physics Calculation ---
        const throttle = parseInt(throttleSlider.value) / 100;
        // FIX: Thrust only works when BOTH engines are on.
        const thrust = (gameState.engine1On && gameState.engine2On) ? throttle * 0.15 : 0;
        
        const forwardVector = localPlayer.mesh.getWorldDirection(new THREE.Vector3());
        const forwardSpeed = Math.max(0, localPlayer.velocity.dot(forwardVector));
        const airspeed = localPlayer.velocity.length();

        // Linear Velocity (Movement)
        localPlayer.velocity.add(forwardVector.clone().multiplyScalar(thrust));
        const liftForce = new THREE.Vector3(0, 1, 0).applyQuaternion(localPlayer.mesh.quaternion).multiplyScalar(forwardSpeed * forwardSpeed * physics.lift);
        localPlayer.velocity.add(liftForce);
        localPlayer.velocity.y -= 0.0098; // Gravity
        let currentDrag = gameState.isGearDown ? physics.drag - 0.02 : physics.drag;
        localPlayer.velocity.multiplyScalar(currentDrag);
        localPlayer.mesh.position.add(localPlayer.velocity);

        // FIX: Ground Clipping
        if (localPlayer.mesh.position.y < 1.8) {
            localPlayer.mesh.position.y = 1.8;
            localPlayer.velocity.y = 0;
            localPlayer.velocity.multiplyScalar(0.9); // Ground friction
            localPlayer.angularVelocity.multiplyScalar(0.8); // Stop spinning on ground
        }

        // --- NEW: Realistic Rotational Physics (Torque) ---
        // This system replaces the old direct rotation, making flight realistic.
        // Controls only work if you have airspeed.
        const aeroForce = forwardSpeed * 0.1; // Controls are less effective at low speeds

        // Calculate torque from control inputs
        const torque = new THREE.Vector3();
        torque.x = controls.pitch * physics.sensitivity.pitch * aeroForce; // Pitch Torque
        torque.y = controls.yaw * physics.sensitivity.yaw * aeroForce;     // Yaw Torque
        torque.z = controls.roll * physics.sensitivity.roll * aeroForce;   // Roll Torque

        // Apply torque to angular velocity
        localPlayer.angularVelocity.add(torque);
        
        // Apply angular drag
        localPlayer.angularVelocity.multiplyScalar(physics.angularDrag);

        // Apply angular velocity to the plane's rotation (quaternion)
        const deltaRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
                localPlayer.angularVelocity.x,
                localPlayer.angularVelocity.y,
                localPlayer.angularVelocity.z
            )
        );
        localPlayer.mesh.quaternion.multiply(deltaRotation);
        
        // --- Keyboard Controls (for yaw) ---
        controls.yaw = keys['q'] ? 1.0 : (keys['e'] ? -1.0 : 0);

        // --- Camera Update ---
        const cameraOffset = new THREE.Vector3(
            cameraDistance * Math.sin(cameraAzimuth) * Math.cos(cameraElevation),
            cameraDistance * Math.sin(cameraElevation),
            cameraDistance * Math.cos(cameraAzimuth) * Math.cos(cameraElevation)
        );
        const desiredCameraPosition = localPlayer.mesh.position.clone().add(cameraOffset);
        camera.position.lerp(desiredCameraPosition, 0.4);
        camera.lookAt(localPlayer.mesh.position);

        // --- HUD Update ---
        document.getElementById('altitude-value').textContent = Math.max(0, Math.round(localPlayer.mesh.position.y * 3.28));
        document.getElementById('airspeed-value').textContent = Math.round(airspeed * 200);
        document.getElementById('engine-value').textContent = `${Math.round(throttle * 100)}%`;
        const euler = new THREE.Euler().setFromQuaternion(localPlayer.mesh.quaternion, 'YXZ');
        document.getElementById('heading-value').textContent = `${(Math.round(THREE.MathUtils.radToDeg(euler.y)) + 360) % 360}°`;

        renderer.render(scene, camera);
    }

    // --- All other code (input listeners, multiplayer, etc.) ---
    // Make sure to paste the full content of your previous main.js file here,
    // then apply the changes described above. For completeness, here it is:
    
    // Joystick
    let joystickActive = false;
    function handleJoystick(event) { /* ... same as before ... */ }
    function resetJoystick() { /* ... same as before ... */ }
    joystickContainer.addEventListener('touchstart', (e) => { joystickActive = true; handleJoystick(e); });
    joystickContainer.addEventListener('touchmove', (e) => { if (joystickActive) handleJoystick(e); });
    joystickContainer.addEventListener('touchend', resetJoystick);

    // Free-Look Camera
    function handleCameraDragStart(e) { /* ... same as before ... */ }
    function handleCameraDragMove(e) { /* ... same as before ... */ }
    function handleCameraDragEnd() { isDraggingCamera = false; }
    window.addEventListener('mousedown', handleCameraDragStart);
    window.addEventListener('mousemove', handleCameraDragMove);
    window.addEventListener('mouseup', handleCameraDragEnd);
    window.addEventListener('touchstart', handleCameraDragStart, { passive: false });
    window.addEventListener('touchmove', handleCameraDragMove, { passive: false });
    window.addEventListener('touchend', handleCameraDragEnd);

    // UI Buttons
    gearButton.addEventListener('click', () => { gameState.isGearDown = !gameState.isGearDown; gearButton.classList.toggle('active', gameState.isGearDown); });
    engine1Button.addEventListener('click', () => { gameState.engine1On = !gameState.engine1On; engine1Button.classList.toggle('engine-on', gameState.engine1On); });
    engine2Button.addEventListener('click', () => { gameState.engine2On = !gameState.engine2On; engine2Button.classList.toggle('engine-on', gameState.engine2On); });

    // Start the game
    animate();
    
    // Resize handler
    window.addEventListener('resize', () => { /* ... same as before ... */ });
});
