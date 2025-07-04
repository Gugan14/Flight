document.addEventListener('DOMContentLoaded', () => {
    // --- SCENE SETUP ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    // --- LIGHTING & ENVIRONMENT ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    const groundGeometry = new THREE.PlaneGeometry(10000, 10000);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xdeb887, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.background = new THREE.Color(0x87ceeb);

    // --- PLAYER & MODEL LOADING ---
    let localPlayer = { mesh: new THREE.Group(), velocity: new THREE.Vector3() };
    scene.add(localPlayer.mesh);
    const loader = new THREE.GLTFLoader();
    const loadingManager = new THREE.LoadingManager(() => {
        document.getElementById('loading-screen').style.display = 'none';
    });
    loader.setLoadingManager(loadingManager);
    loader.load('models/airplane.glb', (gltf) => {
        gltf.scene.scale.set(0.5, 0.5, 0.5);
        gltf.scene.rotation.y = Math.PI;
        localPlayer.mesh.add(gltf.scene);
        localPlayer.mesh.position.y = 1; // Start on the ground
    });

    // --- GAME STATE & HUD ELEMENTS ---
    let gameState = { isGearDown: true, isLightsOn: false };
    const throttleSlider = document.getElementById('throttle-slider');
    const airspeedValue = document.getElementById('airspeed-value');
    const altitudeValue = document.getElementById('altitude-value');
    const headingValue = document.getElementById('heading-value');
    const engineValue = document.getElementById('engine-value');
    const gearButton = document.getElementById('btn-gears');

    // --- FLIGHT CONTROLS & PHYSICS ---
    const controls = { pitch: 0, roll: 0, yaw: 0 };
    const controlSensitivity = { pitch: 0.008, roll: 0.007, yaw: 0.005 };
    const drag = { base: 0.99, gear: 0.005 };
    const lift = 0.005;

    // --- KEYBOARD & JOYSTICK CONTROLS ---
    const keys = {};
    document.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
    const joystickContainer = document.getElementById('joystick-container');
    const joystickNub = document.getElementById('joystick-nub');
    let joystickActive = false;
    const joystickDeadZone = 0.1;

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
        controls.roll = Math.abs(x) > joystickDeadZone ? x : 0;
        controls.pitch = Math.abs(y) > joystickDeadZone ? -y : 0;
    }
    joystickContainer.addEventListener('touchstart', (e) => { joystickActive = true; handleJoystick(e); });
    joystickContainer.addEventListener('touchmove', (e) => { if (joystickActive) handleJoystick(e); });
    joystickContainer.addEventListener('touchend', (e) => { joystickActive = false; joystickNub.style.left = '50%'; joystickNub.style.top = '50%'; controls.pitch = 0; controls.roll = 0; });
    joystickContainer.addEventListener('mousedown', (e) => { joystickActive = true; handleJoystick(e); });
    window.addEventListener('mousemove', (e) => { if (joystickActive) handleJoystick(e); });
    window.addEventListener('mouseup', (e) => { if (joystickActive) { joystickActive = false; joystickNub.style.left = '50%'; joystickNub.style.top = '50%'; controls.pitch = 0; controls.roll = 0; } });

    // --- UI BUTTONS ---
    gearButton.addEventListener('click', () => {
        gameState.isGearDown = !gameState.isGearDown;
        gearButton.classList.toggle('active', gameState.isGearDown);
        console.log(`Gears are now ${gameState.isGearDown ? 'DOWN' : 'UP'}`);
    });

    // --- MULTIPLAYER SETUP ---
    const peers = {};
    const multiplayerStatus = document.getElementById('multiplayer-status');
    const myId = Math.random().toString(36).substring(2);
    console.log("Your ID:", myId);

    const peer = new SimplePeer({
        initiator: location.hash === '#init',
        trickle: false,
    });

    peer.on('error', err => console.error('Multiplayer Error:', err));

    peer.on('signal', data => {
        console.log('SIGNAL', JSON.stringify(data));
        multiplayerStatus.innerHTML = `
            <b>Connection Signal:</b><br>
            <textarea rows="4" cols="30" readonly>${JSON.stringify(data)}</textarea><br>
            <button onclick="connectToPeer()">Connect to Peer</button>`;
    });
    
    window.connectToPeer = function() {
        const otherSignal = prompt("Paste the other peer's signal here:");
        if (otherSignal) {
            try {
                peer.signal(JSON.parse(otherSignal));
            } catch (err) {
                alert("Invalid signal format!");
            }
        }
    }

    peer.on('connect', () => {
        console.log('CONNECTED!');
        multiplayerStatus.innerHTML = "<b>Status:</b> Connected to peer!";
        setInterval(() => {
            if (!peer.destroyed) {
                const state = {
                    id: myId,
                    position: localPlayer.mesh.position,
                    quaternion: localPlayer.mesh.quaternion,
                };
                peer.send(JSON.stringify(state));
            }
        }, 50); // Send data 20 times per second for smooth movement
    });

    peer.on('data', data => {
        const state = JSON.parse(data);
        if (state.id === myId) return; // Ignore our own data broadcasts

        if (!peers[state.id]) {
            console.log("New peer joined:", state.id);
            loader.load('models/airplane.glb', (gltf) => {
                const peerMesh = gltf.scene;
                peerMesh.scale.set(0.5, 0.5, 0.5);
                peerMesh.rotation.y = Math.PI;
                peers[state.id] = { mesh: peerMesh };
                scene.add(peerMesh);
            });
        } else {
            const peerObject = peers[state.id];
            if (peerObject && peerObject.mesh) {
                peerObject.mesh.position.lerp(new THREE.Vector3(state.position.x, state.position.y, state.position.z), 0.1);
                peerObject.mesh.quaternion.slerp(new THREE.Quaternion(state.quaternion._x, state.quaternion._y, state.quaternion._z, state.quaternion._w), 0.1);
            }
        }
    });

    // --- GAME LOOP ---
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
            localPlayer.velocity.x *= 0.9;
            localPlayer.velocity.z *= 0.9;
        }

        // Control Application
        controls.yaw = keys['q'] ? controlSensitivity.yaw : (keys['e'] ? -controlSensitivity.yaw : 0);
        const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(controls.pitch * controlSensitivity.pitch, controls.yaw, controls.roll * controlSensitivity.roll, 'YXZ'));
        localPlayer.mesh.quaternion.multiply(new THREE.Quaternion().setFromRotationMatrix(rotationMatrix));

        // Camera Update
        const cameraOffset = new THREE.Vector3(0, 5, -15);
        const desiredCameraPosition = localPlayer.mesh.position.clone().add(cameraOffset.applyQuaternion(localPlayer.mesh.quaternion));
        camera.position.lerp(desiredCameraPosition, 0.1);
        camera.lookAt(localPlayer.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)));

        // HUD Update
        altitudeValue.textContent = Math.max(0, Math.round(localPlayer.mesh.position.y * 3.28));
        airspeedValue.textContent = Math.round(localPlayer.velocity.length() * 200);
        engineValue.textContent = `${Math.round(throttle * 100)}%`;
        const euler = new THREE.Euler().setFromQuaternion(localPlayer.mesh.quaternion, 'YXZ');
        const heading = (THREE.MathUtils.radToDeg(euler.y) + 360) % 360;
        headingValue.textContent = `${Math.round(heading)}°`;

        // Render the final scene
        renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
