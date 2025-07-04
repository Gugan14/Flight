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
    loadingManager.onError = (url) => {
        console.error('Error loading ' + url);
        loadingContainer.style.display = 'none';
        errorScreen.style.display = 'block';
        errorScreen.innerHTML = `<h2>Loading Failed</h2><p>Could not load: <strong>${url}</strong></p><p>Check folder/file names (must be 'models/airplane.glb') and internet connection.</p>`;
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.MeshStandardMaterial({ color: 0xdeb887 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.background = new THREE.Color(0x87ceeb);

    // --- Player & Model Loading ---
    let localPlayer = { mesh: new THREE.Group(), velocity: new THREE.Vector3() };
    scene.add(localPlayer.mesh);
    const loader = new THREE.GLTFLoader(loadingManager);
    loader.load('models/airplane.glb', (gltf) => {
        gltf.scene.scale.set(1.0, 1.0, 1.0);
        gltf.scene.rotation.y = Math.PI;
        localPlayer.mesh.add(gltf.scene);
        localPlayer.mesh.position.y = 1;
    });

    // --- Game State ---
    let gameState = { isGearDown: true, engine1On: false, engine2On: false };
    
    // --- HUD Elements ---
    const throttleSlider = document.getElementById('throttle-slider');
    const gearButton = document.getElementById('btn-gears');
    const engine1Button = document.getElementById('btn-engine-1');
    const engine2Button = document.getElementById('btn-engine-2');
    const keys = {};

    // --- Flight & Camera Controls ---
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    const physics = { drag: { base: 0.99, gear: 0.005 }, lift: 0.005, sensitivity: { pitch: 0.008, roll: 0.007, yaw: 0.005 } };
    let isDraggingCamera = false;
    let lastMousePos = { x: 0, y: 0 };
    let cameraAzimuth = Math.PI;
    let cameraElevation = 0.2;
    const cameraDistance = 15;

    // --- Input Listeners ---
    document.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

    // Joystick
    let joystickActive = false;
    function handleJoystick(event) {
        event.preventDefault();
        const rect = joystickContainer.getBoundingClientRect();
        const touch = event.touches ? event.touches[0] : event;
        let x = (touch.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        let y = (touch.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        const mag = Math.sqrt(x * x + y * y);
        if (mag > 1) { x /= mag; y /= mag; }
        joystickNub.style.left = `${50 + x * 50}%`;
        joystickNub.style.top = `${50 + y * 50}%`;
        controls.roll = x;
        controls.pitch = -y;
    }
    function resetJoystick() { joystickActive = false; joystickNub.style.left = '50%'; joystickNub.style.top = '50%'; controls.pitch = 0; controls.roll = 0; }
    joystickContainer.addEventListener('touchstart', (e) => { joystickActive = true; handleJoystick(e); });
    joystickContainer.addEventListener('touchmove', (e) => { if (joystickActive) handleJoystick(e); });
    joystickContainer.addEventListener('touchend', resetJoystick);

    // Free-Look Camera
    function handleCameraDragStart(e) {
        if (e.target.closest('.hud')) return;
        isDraggingCamera = true;
        const currentPos = e.touches ? e.touches[0] : e;
        lastMousePos.x = currentPos.clientX;
        lastMousePos.y = currentPos.clientY;
    }
    function handleCameraDragMove(e) {
        if (!isDraggingCamera) return;
        const currentPos = e.touches ? e.touches[0] : e;
        const deltaX = currentPos.clientX - lastMousePos.x;
        const deltaY = currentPos.clientY - lastMousePos.y;
        cameraAzimuth -= deltaX * 0.005;
        cameraElevation -= deltaY * 0.005;
        cameraElevation = Math.max(-Math.PI / 4, Math.min(Math.PI / 2, cameraElevation));
        lastMousePos.x = currentPos.clientX;
        lastMousePos.y = currentPos.clientY;
    }
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

    // Multiplayer (Omitted for brevity, paste your previous multiplayer code here if needed)
    
    // --- Game Loop ---
    function animate() {
        requestAnimationFrame(animate);

        // Physics
        const throttle = parseInt(throttleSlider.value) / 100;
        const thrust = (gameState.engine1On || gameState.engine2On) ? throttle * 0.1 : 0;
        const forwardVector = localPlayer.mesh.getWorldDirection(new THREE.Vector3());
        localPlayer.velocity.add(forwardVector.clone().multiplyScalar(thrust));
        const forwardSpeed = Math.max(0, localPlayer.velocity.dot(forwardVector));
        const liftForce = new THREE.Vector3(0, 1, 0).applyQuaternion(localPlayer.mesh.quaternion).multiplyScalar(forwardSpeed * forwardSpeed * physics.lift);
        localPlayer.velocity.add(liftForce);
        localPlayer.velocity.y -= 0.0098;
        let currentDrag = gameState.isGearDown ? physics.drag.base - physics.drag.gear : physics.drag.base;
        localPlayer.velocity.multiplyScalar(currentDrag);
        localPlayer.mesh.position.add(localPlayer.velocity);
        if (localPlayer.mesh.position.y < 1.0) {
            localPlayer.mesh.position.y = 1.0;
            localPlayer.velocity.y = 0;
            localPlayer.velocity.multiplyScalar(0.9);
        }

        // Controls
        controls.yaw = keys['q'] ? physics.sensitivity.yaw : (keys['e'] ? -physics.sensitivity.yaw : 0);
        const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(controls.pitch * physics.sensitivity.pitch, controls.yaw, controls.roll * physics.sensitivity.roll, 'YXZ'));
        localPlayer.mesh.quaternion.multiply(new THREE.Quaternion().setFromRotationMatrix(rotMatrix));

        // Camera
        const cameraOffset = new THREE.Vector3(
            cameraDistance * Math.sin(cameraAzimuth) * Math.cos(cameraElevation),
            cameraDistance * Math.sin(cameraElevation),
            cameraDistance * Math.cos(cameraAzimuth) * Math.cos(cameraElevation)
        );
        const desiredCameraPosition = localPlayer.mesh.position.clone().add(cameraOffset);
        camera.position.lerp(desiredCameraPosition, 0.4);
        camera.lookAt(localPlayer.mesh.position);

        // HUD Update
        document.getElementById('altitude-value').textContent = Math.max(0, Math.round(localPlayer.mesh.position.y * 3.28));
        document.getElementById('airspeed-value').textContent = Math.round(localPlayer.velocity.length() * 200);
        document.getElementById('engine-value').textContent = `${Math.round(throttle * 100)}%`;
        const euler = new THREE.Euler().setFromQuaternion(localPlayer.mesh.quaternion, 'YXZ');
        document.getElementById('heading-value').textContent = `${(Math.round(THREE.MathUtils.radToDeg(euler.y)) + 360) % 360}°`;

        renderer.render(scene, camera);
    }

    animate();
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
