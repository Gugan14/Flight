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
        errorScreen.style.display = 'block';
        loadingContainer.style.display = 'none';
        errorScreen.innerHTML = `<h2>Loading Failed</h2><p>Could not load: <strong>${url}</strong></p><p>Please check file path and names.</p>`;
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;

    // --- Lighting ---
    const hemiLight = new THREE.HemisphereLight(0add8e6, 0x444444, 0.9);
    scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: 0xdeb887 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.background = new THREE.Color(0x87ceeb);

    // --- Player & Physics Model ---
    let localPlayer = {
        mesh: new THREE.Group(),
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3()
    };
    scene.add(localPlayer.mesh);
    const GROUND_LEVEL = 1.8;

    // --- Model Loading ---
    const loader = new THREE.GLTFLoader(loadingManager);
    loader.load('models/airplane.glb', (gltf) => {
        gltf.scene.scale.set(1.0, 1.0, 1.0);
        gltf.scene.rotation.y = Math.PI;
        localPlayer.mesh.add(gltf.scene);
        localPlayer.mesh.position.y = GROUND_LEVEL;
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
        drag: 0.985,
        angularDrag: 0.98,
        liftCoefficient: 0.1,
        sensitivity: { pitch: 0.001, roll: 0.0008, yaw: 0.0005 },
        stallAngle: 0.3,
    };
    let joystickActive = false;
    let isDraggingCamera = false;
    let lastMousePos = { x: 0, y: 0 };
    let cameraAzimuth = Math.PI;
    let cameraElevation = 0.2;
    const cameraDistance = 25;

    // --- Input Listeners ---
    document.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

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
    joystickContainer.addEventListener('touchstart', (e) => { joystickActive = true; handleJoystick(e); }, { passive: false });
    joystickContainer.addEventListener('touchmove', (e) => { if (joystickActive) handleJoystick(e); }, { passive: false });
    joystickContainer.addEventListener('touchend', () => { joystickActive = false; joystickNub.style.left = '50%'; joystickNub.style.top = '50%'; controls.pitch = 0; controls.roll = 0; });

    function handleCameraDragStart(e) {
        // Only start camera drag if not touching the joystick or other UI
        if (e.target.closest('.hud')) return;
        isDraggingCamera = true;
        const currentPos = e.touches ? e.touches[0] : e;
        lastMousePos.x = currentPos.clientX; lastMousePos.y = currentPos.clientY;
    }
    function handleCameraDragMove(e) {
        if (!isDraggingCamera) return;
        e.preventDefault();
        const currentPos = e.touches ? e.touches[0] : e;
        const deltaX = currentPos.clientX - lastMousePos.x;
        const deltaY = currentPos.clientY - lastMousePos.y;
        cameraAzimuth -= deltaX * 0.005;
        cameraElevation -= deltaY * 0.005;
        cameraElevation = Math.max(-Math.PI / 4, Math.min(Math.PI / 2, cameraElevation));
        lastMousePos.x = currentPos.clientX; lastMousePos.y = currentPos.clientY;
    }
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
    function animate() {
        requestAnimationFrame(animate);

        const throttle = parseInt(throttleSlider.value) / 100;
        const thrust = (gameState.engine1On && gameState.engine2On) ? throttle * 0.2 : 0;
        
        const forwardVector = localPlayer.mesh.getWorldDirection(new THREE.Vector3());
        const airspeed = localPlayer.velocity.length();

        // Realistic Lift based on Angle of Attack (AoA)
        const planeUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(localPlayer.mesh.quaternion);
        const velocityDirection = localPlayer.velocity.clone().normalize();
        let aoa = Math.acos(planeUpVector.dot(velocityDirection)) - Math.PI / 2;
        if (airspeed < 1) aoa = 0;

        let stallEffect = 1.0;
        if (Math.abs(aoa) > physics.stallAngle) {
            stallEffect = Math.max(0.1, 1 - (Math.abs(aoa) - physics.stallAngle) / 0.1);
        }

        let liftMagnitude = airspeed * airspeed * (physics.liftCoefficient + Math.abs(aoa) * 0.5) * stallEffect;
        
        if (localPlayer.mesh.position.y < GROUND_LEVEL + 5) {
            liftMagnitude *= 1.2;
        }

        const liftForce = planeUpVector.multiplyScalar(liftMagnitude);

        // Forces
        localPlayer.velocity.add(forwardVector.clone().multiplyScalar(thrust));
        localPlayer.velocity.add(liftForce);
        localPlayer.velocity.y -= 0.0098;
        const currentDrag = gameState.isGearDown ? physics.drag - 0.025 : physics.drag;
        localPlayer.velocity.multiplyScalar(currentDrag);
        localPlayer.mesh.position.add(localPlayer.velocity);

        // Ground Collision
        if (localPlayer.mesh.position.y < GROUND_LEVEL) {
            localPlayer.mesh.position.y = GROUND_LEVEL;
            localPlayer.velocity.y = 0;
            localPlayer.velocity.multiplyScalar(0.95);
            localPlayer.angularVelocity.multiplyScalar(0.8);
        }

        // Rotational Physics (Torque)
        const aeroForce = airspeed * 0.1;
        controls.yaw = keys['q'] ? 1.0 : (keys['e'] ? -1.0 : 0);
        const torque = new THREE.Vector3(
            controls.pitch * physics.sensitivity.pitch * aeroForce,
            controls.yaw * physics.sensitivity.yaw * aeroForce,
            controls.roll * physics.sensitivity.roll * aeroForce
        );
        localPlayer.angularVelocity.add(torque);
        localPlayer.angularVelocity.multiplyScalar(physics.angularDrag);
        const deltaRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(localPlayer.angularVelocity.x, localPlayer.angularVelocity.y, localPlayer.angularVelocity.z));
        localPlayer.mesh.quaternion.multiply(deltaRotation);

        // Camera Update
        const cameraOffset = new THREE.Vector3(
            cameraDistance * Math.sin(cameraAzimuth) * Math.cos(cameraElevation),
            cameraDistance * Math.sin(cameraElevation),
            cameraDistance * Math.cos(cameraAzimuth) * Math.cos(cameraElevation)
        );
        camera.position.lerp(localPlayer.mesh.position.clone().add(cameraOffset), 0.1);
        camera.lookAt(localPlayer.mesh.position);

        // HUD Update
        document.getElementById('altitude-value').textContent = Math.max(0, Math.round((localPlayer.mesh.position.y - GROUND_LEVEL) * 3.28));
        document.getElementById('airspeed-value').textContent = Math.round(airspeed * 200);
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
