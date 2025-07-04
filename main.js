document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const loadingContainer = document.getElementById('loading-container');
    const progressBar = document.getElementById('progress-bar-inner');
    const errorScreen = document.getElementById('error-screen');

    // --- Loading Manager ---
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => progressBar.style.width = (itemsLoaded / itemsTotal) * 100 + '%';
    loadingManager.onLoad = () => loadingContainer.style.display = 'none';
    loadingManager.onError = (url) => {
        loadingContainer.style.display = 'none';
        errorScreen.style.display = 'block';
        errorScreen.innerHTML = `<h2>Loading Failed</h2><p>Could not load: <strong>${url}</strong></p><p>Check folder/file names.</p>`;
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    // --- Lighting & Environment ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.MeshStandardMaterial({ color: 0xdeb887 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.background = new THREE.Color(0x87ceeb);

    // --- Player & Model ---
    let localPlayer = { mesh: new THREE.Group(), velocity: new THREE.Vector3() };
    scene.add(localPlayer.mesh);
    const loader = new THREE.GLTFLoader(loadingManager);
    loader.load('models/airplane.glb', (gltf) => {
        gltf.scene.scale.set(1.0, 1.0, 1.0);
        gltf.scene.rotation.y = Math.PI;
        localPlayer.mesh.add(gltf.scene);
        localPlayer.mesh.position.y = 1;
    });

    // --- Game State & HUD ---
    let gameState = {
        isGearDown: true,
        engine1On: false,
        engine2On: false,
    };
    const throttleSlider = document.getElementById('throttle-slider');
    const airspeedValue = document.getElementById('airspeed-value');
    const altitudeValue = document.getElementById('altitude-value');
    const headingValue = document.getElementById('heading-value');
    const engineValue = document.getElementById('engine-value');
    const gearButton = document.getElementById('btn-gears');
    const engine1Button = document.getElementById('btn-engine-1');
    const engine2Button = document.getElementById('btn-engine-2');

    // --- Physics ---
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    const controlSensitivity = { pitch: 0.008, roll: 0.007, yaw: 0.005 };
    const drag = { base: 0.99, gear: 0.005 };
    const lift = 0.005;
    
    // --- Camera Control ---
    let cameraOrbit = { x: 0, y: 0 };
    let isDragging = false;
    let previousPointerPosition = { x: 0, y: 0 };

    // --- Event Listeners ---
    // UI Buttons
    gearButton.addEventListener('click', () => {
        gameState.isGearDown = !gameState.isGearDown;
        gearButton.classList.toggle('active', gameState.isGearDown);
    });
    engine1Button.addEventListener('click', () => {
        gameState.engine1On = !gameState.engine1On;
        engine1Button.classList.toggle('active', gameState.engine1On);
    });
    engine2Button.addEventListener('click', () => {
        gameState.engine2On = !gameState.engine2On;
        engine2Button.classList.toggle('active', gameState.engine2On);
    });
    
    // Keyboard (for Yaw)
    const keys = {};
    document.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

    // Joystick
    const joystickContainer = document.getElementById('joystick-container');
    const joystickNub = document.getElementById('joystick-nub');
    let joystickActive = false;
    function handleJoystick(event) { /* ... same as before ... */ }
    function resetJoystick() { /* ... same as before ... */ }
    // ... joystick event listeners are the same ...

    // Camera Drag Listeners
    renderer.domElement.addEventListener('pointerdown', (event) => {
        if (event.clientX > window.innerWidth / 2) { // Only drag on right half
            isDragging = true;
            previousPointerPosition = { x: event.clientX, y: event.clientY };
        }
    });
    renderer.domElement.addEventListener('pointermove', (event) => {
        if (!isDragging) return;
        const deltaX = event.clientX - previousPointerPosition.x;
        const deltaY = event.clientY - previousPointerPosition.y;
        
        cameraOrbit.x -= deltaY * 0.01;
        cameraOrbit.y -= deltaX * 0.01;

        // Clamp vertical orbit to prevent flipping
        cameraOrbit.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 2, cameraOrbit.x));
        
        previousPointerPosition = { x: event.clientX, y: event.clientY };
    });
    window.addEventListener('pointerup', () => {
        isDragging = false;
    });

    // --- Multiplayer Setup (same as before) ---
    // ... (paste the multiplayer code here if you're using it) ...

    // --- GAME LOOP ---
    function animate() {
        requestAnimationFrame(animate);

        // --- Physics & Movement ---
        const throttle = parseInt(throttleSlider.value) / 100;

        // ** CRITICAL CHANGE HERE **
        // Power is 1.0 (ON) only if BOTH engines are started, otherwise it's 0 (OFF).
        const powerFactor = (gameState.engine1On && gameState.engine2On) ? 1.0 : 0;
        
        // Thrust is now dependent on the powerFactor.
        const thrust = throttle * powerFactor * 0.1;

        const forwardVector = localPlayer.mesh.getWorldDirection(new THREE.Vector3());
        localPlayer.velocity.add(forwardVector.clone().multiplyScalar(thrust));
        const forwardSpeed = Math.max(0, localPlayer.velocity.dot(forwardVector));
        const liftForce = new THREE.Vector3(0, 1, 0).applyQuaternion(localPlayer.mesh.quaternion).multiplyScalar(forwardSpeed * forwardSpeed * lift);
        localPlayer.velocity.add(liftForce);
        localPlayer.velocity.y -= 0.0098;
        let currentDrag = gameState.isGearDown ? drag.base - drag.gear : drag.base;
        localPlayer.velocity.multiplyScalar(currentDrag);
        localPlayer.mesh.position.add(localPlayer.velocity);
        if (localPlayer.mesh.position.y < 1.0) {
            localPlayer.mesh.position.y = 1.0;
            localPlayer.velocity.y = 0;
            localPlayer.velocity.multiplyScalar(0.9);
        }

        // --- Control Application ---
        controls.yaw = keys['q'] ? controlSensitivity.yaw : (keys['e'] ? -controlSensitivity.yaw : 0);
        // ... (joystick and rotation logic is the same) ...

        // --- Camera Update ---
        if (!isDragging) {
            // Smoothly return to default chase view when not dragging
            cameraOrbit.x *= 0.95;
            cameraOrbit.y *= 0.95;
        }

        // Start with the default offset
        const baseOffset = new THREE.Vector3(0, 5, -15);
        
        // Apply the orbit rotation
        const orbitRotation = new THREE.Euler(cameraOrbit.x, cameraOrbit.y, 0, 'YXZ');
        const cameraOffset = baseOffset.clone().applyEuler(orbitRotation);
        
        // Apply the plane's rotation to the final offset
        cameraOffset.applyQuaternion(localPlayer.mesh.quaternion);

        // Calculate final camera position
        const desiredCameraPosition = localPlayer.mesh.position.clone().add(cameraOffset);
        camera.position.lerp(desiredCameraPosition, 0.1);
        camera.lookAt(localPlayer.mesh.position);
        
        // --- HUD Update ---
        // ... (HUD update logic is the same) ...
        altitudeValue.textContent = Math.max(0, Math.round(localPlayer.mesh.position.y * 3.28));
        airspeedValue.textContent = Math.round(localPlayer.velocity.length() * 200);
        engineValue.textContent = `${Math.round(throttle * powerFactor * 100)}%`; // Show effective power
        const euler = new THREE.Euler().setFromQuaternion(localPlayer.mesh.quaternion, 'YXZ');
        const heading = (THREE.MathUtils.radToDeg(euler.y) + 360) % 360;
        headingValue.textContent = `${Math.round(heading)}°`;


        renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
