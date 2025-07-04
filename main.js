document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements for Loading and Errors ---
    const loadingContainer = document.getElementById('loading-container');
    const progressBar = document.getElementById('progress-bar-inner');
    const errorScreen = document.getElementById('error-screen');

    // --- Advanced Loading Manager ---
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        const progress = (itemsLoaded / itemsTotal) * 100;
        progressBar.style.width = progress + '%';
    };
    loadingManager.onLoad = () => {
        loadingContainer.style.display = 'none';
    };
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

    // --- Lighting & Environment ---
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

    // --- Game State & HUD Elements ---
    let gameState = { isGearDown: true };
    const throttleSlider = document.getElementById('throttle-slider');
    const airspeedValue = document.getElementById('airspeed-value');
    const altitudeValue = document.getElementById('altitude-value');
    const headingValue = document.getElementById('heading-value');
    const engineValue = document.getElementById('engine-value');
    const gearButton = document.getElementById('btn-gears');

    // --- Flight Controls & Physics ---
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    const controlSensitivity = { pitch: 0.008, roll: 0.007, yaw: 0.005 };
    const drag = { base: 0.99, gear: 0.005 };
    const lift = 0.005;

    // --- Keyboard & Joystick Controls ---
    const keys = {};
    document.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
    const joystickContainer = document.getElementById('joystick-container');
    const joystickNub = document.getElementById('joystick-nub');
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
    function resetJoystick() {
        joystickActive = false;
        joystickNub.style.left = '50%';
        joystickNub.style.top = '50%';
        controls.pitch = 0;
        controls.roll = 0;
    }
    joystickContainer.addEventListener('touchstart', (e) => { joystickActive = true; handleJoystick(e); });
    joystickContainer.addEventListener('touchmove', (e) => { if (joystickActive) handleJoystick(e); });
    joystickContainer.addEventListener('touchend', resetJoystick);
    joystickContainer.addEventListener('mousedown', (e) => { joystickActive = true; handleJoystick(e); });
    window.addEventListener('mousemove', (e) => { if (joystickActive) handleJoystick(e); });
    window.addEventListener('mouseup', () => { if (joystickActive) resetJoystick(); });

    // --- UI Buttons ---
    gearButton.addEventListener('click', () => {
        gameState.isGearDown = !gameState.isGearDown;
        gearButton.classList.toggle('active', gameState.isGearDown);
    });

    // --- Multiplayer Setup ---
    const peers = {};
    const multiplayerStatus = document.getElementById('multiplayer-status');
    const myId = Math.random().toString(36).substring(2);
    const peer = new SimplePeer({ initiator: location.hash === '#init', trickle: false });
    peer.on('error', err => console.error('Multiplayer Error:', err));
    peer.on('signal', data => {
        multiplayerStatus.innerHTML = `<b>Signal:</b><textarea rows="3" cols="25" readonly>${JSON.stringify(data)}</textarea><button onclick="connectToPeer()">Connect</button>`;
    });
    window.connectToPeer = () => {
        const otherSignal = prompt("Paste peer's signal:");
        if (otherSignal) peer.signal(otherSignal);
    };
    peer.on('connect', () => {
        multiplayerStatus.innerHTML = "<b>Status:</b> Connected!";
        setInterval(() => {
            if (!peer.destroyed) peer.send(JSON.stringify({ id: myId, p: localPlayer.mesh.position, q: localPlayer.mesh.quaternion }));
        }, 50);
    });
    peer.on('data', data => {
        const state = JSON.parse(data);
        if (state.id === myId) return;
        if (!peers[state.id]) {
            console.log("Peer joined:", state.id);
            const peerLoader = new THREE.GLTFLoader();
            peerLoader.load('models/airplane.glb', (gltf) => {
                const peerMesh = gltf.scene;
                peerMesh.scale.set(1.0, 1.0, 1.0);
                peerMesh.rotation.y = Math.PI;
                peers[state.id] = { mesh: peerMesh };
                scene.add(peerMesh);
            });
        } else {
            const peerObject = peers[state.id];
            if (peerObject && peerObject.mesh) {
                peerObject.mesh.position.lerp(state.p, 0.1);
                peerObject.mesh.quaternion.slerp(state.q, 0.1);
            }
        }
    });

    // --- Game Loop ---
    function animate() {
        requestAnimationFrame(animate);

        // Physics & Movement
        const throttle = parseInt(throttleSlider.value) / 100;
        const thrust = throttle * 0.1;
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

        // Control Application
        controls.yaw = keys['q'] ? controlSensitivity.yaw : (keys['e'] ? -controlSensitivity.yaw : 0);
        const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(controls.pitch * controlSensitivity.pitch, controls.yaw, controls.roll * controlSensitivity.roll, 'YXZ'));
        localPlayer.mesh.quaternion.multiply(new THREE.Quaternion().setFromRotationMatrix(rotMatrix));

        // Camera Update
        const cameraOffset = new THREE.Vector3(0, 5, -15).applyQuaternion(localPlayer.mesh.quaternion);
        camera.position.lerp(localPlayer.mesh.position.clone().add(cameraOffset), 0.1);
        camera.lookAt(localPlayer.mesh.position);

        // HUD Update
        altitudeValue.textContent = Math.max(0, Math.round(localPlayer.mesh.position.y * 3.28));
        airspeedValue.textContent = Math.round(localPlayer.velocity.length() * 200);
        engineValue.textContent = `${Math.round(throttle * 100)}%`;
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
