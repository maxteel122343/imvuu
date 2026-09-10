// ==========================================================================
// SCENE 3D FEATURES: CENÁRIO AMPLO, DANÇAS DE 1 MINUTO, BALÕES 3D & SUPABASE
// ==========================================================================

window.interactiveFurniture = [];
window.currentSatFurniture = null;
window.danceTimerSeconds = 0;
window.dancePlaybackActive = true;
window.isGhostMode = false;
window.remoteAvatars = new Map();
window.localSpeechSprite = null;
window.localSpeechTimer = null;
window.multiUserPollingActive = false;

// --------------------------------------------------------------------------
// 1. CENÁRIO AMPLO COM ÁRVORES, SOFÁS INTERATIVOS E TERRAÇO
// --------------------------------------------------------------------------
window.buildExtended3DScene = function(scene) {
	if (!scene || !window.THREE) return;

	// Remover chão antigo pequeno se existir
	if (window.groundPlaneMesh) {
		scene.remove(window.groundPlaneMesh);
	}

	// 1. Chão Amplo (80x80m) com textura de praça noturna, caminhos e limites distantes
	const groundGeo = new THREE.PlaneGeometry(80, 80, 40, 40);
	const groundMat = new THREE.MeshStandardMaterial({
		color: 0x090c15,
		roughness: 0.85,
		metalness: 0.15
	});
	const largeGround = new THREE.Mesh(groundGeo, groundMat);
	largeGround.rotation.x = -Math.PI / 2;
	largeGround.position.y = -1.05;
	largeGround.receiveShadow = true;
	scene.add(largeGround);
	window.groundPlaneMesh = largeGround; // Raycasting alvo para click-to-move amplo

	// Grade de piso externo iluminada (Grid amplo)
	const outerGrid = new THREE.GridHelper(80, 40, 0x3b82f6, 0x1e1b4b);
	outerGrid.position.y = -1.04;
	scene.add(outerGrid);

	// 2. Pista Central de Dança (16x16m) em mármore escuro com borda neon
	const danceFloorGeo = new THREE.BoxGeometry(16, 0.08, 16);
	const danceFloorMat = new THREE.MeshStandardMaterial({
		color: 0x131722,
		roughness: 0.25,
		metalness: 0.6
	});
	const danceFloor = new THREE.Mesh(danceFloorGeo, danceFloorMat);
	danceFloor.position.set(0, -1.01, 0);
	danceFloor.receiveShadow = true;
	scene.add(danceFloor);

	// Grid neon estilizado sobre a pista
	const danceGrid = new THREE.GridHelper(16, 16, 0x8b5cf6, 0x312e81);
	danceGrid.position.y = -0.96;
	scene.add(danceGrid);

	// Anel de Neon no centro da pista
	const centerRingGeo = new THREE.RingGeometry(1.8, 2.0, 48);
	const centerRingMat = new THREE.MeshBasicMaterial({ color: 0xec4899, side: THREE.DoubleSide });
	const centerRing = new THREE.Mesh(centerRingGeo, centerRingMat);
	centerRing.rotation.x = Math.PI / 2;
	centerRing.position.y = -0.95;
	scene.add(centerRing);

	// Luzes pontuais coloridas de pista (DJ Stage lights)
	const lightPurple = new THREE.PointLight(0x8b5cf6, 2.2, 18);
	lightPurple.position.set(0, 4.5, 0);
	scene.add(lightPurple);

	const lightPink = new THREE.PointLight(0xf43f5e, 1.6, 15);
	lightPink.position.set(-6, 3, -6);
	scene.add(lightPink);

	const lightCyan = new THREE.PointLight(0x06b6d4, 1.6, 15);
	lightCyan.position.set(6, 3, 6);
	scene.add(lightCyan);

	// 3. Árvores 3D Low-Poly ao redor do cenário
	const treeCoords = [
		[-12, -12], [12, -12], [-12, 12], [12, 12],
		[-15, 0], [15, 0], [0, -15], [0, 15]
	];
	treeCoords.forEach(([tx, tz]) => {
		const treeGroup = new THREE.Group();
		treeGroup.position.set(tx, -1.05, tz);

		// Tronco
		const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3.5, 8);
		const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
		const trunk = new THREE.Mesh(trunkGeo, trunkMat);
		trunk.position.y = 1.75;
		treeGroup.add(trunk);

		// Folhagens esféricas/dodecaédricas
		const foliageMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6 });
		const foliage1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6), foliageMat);
		foliage1.position.y = 3.8;
		treeGroup.add(foliage1);

		const foliage2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2), foliageMat);
		foliage2.position.set(0.5, 4.7, 0.3);
		treeGroup.add(foliage2);

		scene.add(treeGroup);
	});

	// 4. Móveis Interativos (Sofás e Bancos) com hitboxes e múltiplos assentos por móvel
	window.interactiveFurniture = [];

	function calculateSpotWorldPos(baseX, baseZ, rotY, localX, localZ) {
		const cosY = Math.cos(rotY);
		const sinY = Math.sin(rotY);
		return {
			x: baseX + (cosY * localX + sinY * localZ),
			y: -0.6,
			z: baseZ + (-sinY * localX + cosY * localZ)
		};
	}

	function createSofa(id, name, x, z, rotY, colorHex = 0x6366f1) {
		const group = new THREE.Group();
		group.position.set(x, -1.05, z);
		group.rotation.y = rotY;

		const sofaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4, metalness: 0.3 });
		const cushionMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.5 });

		// Base assento
		const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.9), sofaMat);
		seatMesh.position.set(0, 0.25, 0);
		group.add(seatMesh);

		// Almofada
		const cushionMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.8), cushionMat);
		cushionMesh.position.set(0, 0.52, 0.05);
		group.add(cushionMesh);

		// Encosto
		const backMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.25), sofaMat);
		backMesh.position.set(0, 0.8, -0.35);
		group.add(backMesh);

		// Braço esquerdo
		const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.65, 0.9), sofaMat);
		armL.position.set(-1.15, 0.5, 0);
		group.add(armL);

		// Braço direito
		const armR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.65, 0.9), sofaMat);
		armR.position.set(1.15, 0.5, 0);
		group.add(armR);

		// Mesa de Centro à frente
		const tableMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 });
		const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.6), tableMat);
		table.position.set(0, 0.15, 0.9);
		group.add(table);

		// Copo de drink neon sobre a mesa
		const glassMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.1, metalness: 0.9 });
		const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.18, 12), glassMat);
		cup.position.set(0.2, 0.38, 0.9);
		group.add(cup);

		// Múltiplos Spots de Assento (3 lugares no sofá grande: Esquerda, Meio, Direita)
		const spots = [
			{ spotIndex: 0, label: 'Lugar Esquerdo', localOffset: { x: -0.7, z: 0.1 }, occupiedBy: null, worldPos: calculateSpotWorldPos(x, z, rotY, -0.7, 0.1) },
			{ spotIndex: 1, label: 'Lugar Central', localOffset: { x: 0.0, z: 0.1 }, occupiedBy: null, worldPos: calculateSpotWorldPos(x, z, rotY, 0.0, 0.1) },
			{ spotIndex: 2, label: 'Lugar Direito', localOffset: { x: 0.7, z: 0.1 }, occupiedBy: null, worldPos: calculateSpotWorldPos(x, z, rotY, 0.7, 0.1) }
		];

		// Hitbox para clique de raycasting
		const hitBoxGeo = new THREE.BoxGeometry(2.6, 1.4, 1.4);
		const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
		const hitMesh = new THREE.Mesh(hitBoxGeo, hitBoxMat);
		hitMesh.position.set(0, 0.7, 0.1);
		hitMesh.userData = { isFurniture: true, id, name, group, x, z, rotY, capacity: 3, spots };
		group.add(hitMesh);

		scene.add(group);

		const furnitureData = {
			id,
			name,
			type: 'sofa',
			capacity: 3,
			spots,
			mesh: hitMesh,
			group,
			x,
			z,
			rotY,
			sitPos: spots[1].worldPos, // fallback central
			sitRotY: rotY
		};
		hitMesh.userData.furnitureData = furnitureData;
		window.interactiveFurniture.push(furnitureData);
		return furnitureData;
	}

	function createBench(id, name, x, z, rotY) {
		const group = new THREE.Group();
		group.position.set(x, -1.05, z);
		group.rotation.y = rotY;

		const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
		const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });

		// Tábuas assento
		const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), woodMat);
		seat.position.set(0, 0.45, 0);
		group.add(seat);

		// Encosto
		const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.08), woodMat);
		back.position.set(0, 0.85, -0.25);
		group.add(back);

		// Pés de ferro
		const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45), ironMat);
		leg1.position.set(-0.95, 0.22, 0.2);
		group.add(leg1);
		const leg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45), ironMat);
		leg2.position.set(0.95, 0.22, 0.2);
		group.add(leg2);

		// Múltiplos Spots de Assento (2 lugares no banco da praça: Esquerda e Direita)
		const spots = [
			{ spotIndex: 0, label: 'Assento Esquerdo', localOffset: { x: -0.6, z: 0.0 }, occupiedBy: null, worldPos: calculateSpotWorldPos(x, z, rotY, -0.6, 0.0) },
			{ spotIndex: 1, label: 'Assento Direito', localOffset: { x: 0.6, z: 0.0 }, occupiedBy: null, worldPos: calculateSpotWorldPos(x, z, rotY, 0.6, 0.0) }
		];

		// Hitbox para clique
		const hitMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.0), new THREE.MeshBasicMaterial({ visible: false }));
		hitMesh.position.set(0, 0.6, 0);
		hitMesh.userData = { isFurniture: true, id, name, group, x, z, rotY, capacity: 2, spots };
		group.add(hitMesh);

		scene.add(group);

		const benchData = {
			id,
			name,
			type: 'bench',
			capacity: 2,
			spots,
			mesh: hitMesh,
			group,
			x,
			z,
			rotY,
			sitPos: spots[0].worldPos, // fallback
			sitRotY: rotY
		};
		hitMesh.userData.furnitureData = benchData;
		window.interactiveFurniture.push(benchData);
		return benchData;
	}

	// Criar os 4 conjuntos
	createSofa('vip_sofa_1', 'Sofá VIP Lounge Esquerdo (3 Lugares)', -5.2, -4.5, 0, 0x8b5cf6);
	createSofa('vip_sofa_2', 'Sofá Neon Club Direito (3 Lugares)', 5.2, -4.5, 0, 0xec4899);
	createBench('bench_garden_1', 'Banco da Praça Esquerdo (2 Lugares)', -5.2, 4.5, Math.PI);
	createBench('bench_garden_2', 'Banco da Praça Direito (2 Lugares)', 5.2, 4.5, Math.PI);
};

// --------------------------------------------------------------------------
// 2. DANÇAS COMPLEXAS DE 1 MINUTO COM ARTICULAÇÃO TOTAL
// --------------------------------------------------------------------------
window.applyComplex1MinDance = function(poseName, t, timeSeconds, rig) {
	if (!rig || !rig.root) return;

	const j = rig;
	const phase = Math.floor(timeSeconds / 15); // 0, 1, 2, 3
	const phaseProgress = (timeSeconds % 15) / 15; // 0.0 a 1.0

	// Atualizar nome da fase na barra UI
	const phaseBadge = document.getElementById('dancePhaseBadge');

	if (poseName === 'passinho_funk') {
		// Passinho do Funk Carioca / BR (1 Minuto)
		if (phase === 0) {
			if (phaseBadge) phaseBadge.textContent = 'Fase 1 (0-15s): Ombros Sincopados & Groove no Beat';
			// Ombros vibrando e alternando velozes
			const shrugSpeed = 9.0;
			const shoulderL = Math.sin(t * shrugSpeed) * 0.28;
			const shoulderR = -Math.sin(t * shrugSpeed) * 0.28;
			if (j.leftShoulder) j.leftShoulder.rotation.z = shoulderL;
			if (j.rightShoulder) j.rightShoulder.rotation.z = shoulderR;

			// Movimento de cabeça sincopado
			const headSnap = Math.sin(t * 4.5) * 0.35;
			if (j.head) {
				j.head.rotation.y = headSnap;
				j.head.rotation.z = -shoulderL * 0.5;
			}

			// Braços no balanço
			if (j.leftArm) j.leftArm.rotation.set(0.3 + Math.sin(t * 4.5) * 0.4, 0, 0.4);
			if (j.rightArm) j.rightArm.rotation.set(0.3 - Math.sin(t * 4.5) * 0.4, 0, -0.4);
			if (j.leftForearm) j.leftForearm.rotation.x = 0.8 + Math.sin(t * 9.0) * 0.3;
			if (j.rightForearm) j.rightForearm.rotation.x = 0.8 - Math.sin(t * 9.0) * 0.3;

			// Pernas com flexão rápida
			const legHop = Math.abs(Math.sin(t * 4.5)) * 0.08;
			if (j.pelvis) j.pelvis.position.y = 0.95 - legHop;
			if (j.leftThigh) j.leftThigh.rotation.x = Math.sin(t * 4.5) * 0.4;
			if (j.rightThigh) j.rightThigh.rotation.x = -Math.sin(t * 4.5) * 0.4;

		} else if (phase === 1) {
			if (phaseBadge) phaseBadge.textContent = 'Fase 2 (15-30s): Elevação de Braço & Antebraço Estalado';
			// Braço esquerdo levanta alto e antebraço estala a 90 graus
			const armRaise = Math.sin(t * 3.5);
			if (j.leftArm) j.leftArm.rotation.set(-2.4 + armRaise * 0.3, 0, 0.3);
			if (j.leftForearm) j.leftForearm.rotation.set(1.4 + Math.cos(t * 7.0) * 0.4, 0, 0);

			if (j.rightArm) j.rightArm.rotation.set(0.2, 0, -0.8 - armRaise * 0.2);
			if (j.rightForearm) j.rightForearm.rotation.set(0.9, 0, 0);

			if (j.head) j.head.rotation.set(0.1, -0.3 + armRaise * 0.2, 0.15);
			if (j.torso) j.torso.rotation.y = Math.sin(t * 3.5) * 0.3;
			if (j.pelvis) j.pelvis.position.y = 0.95 + Math.abs(Math.sin(t * 7.0)) * 0.05;

		} else if (phase === 2) {
			if (phaseBadge) phaseBadge.textContent = 'Fase 3 (30-45s): Head Snaps Rápidos & Cruzamento em X';
			// Braços cruzando em X na frente do peito
			const crossCycle = Math.sin(t * 5.0);
			if (j.leftArm) j.leftArm.rotation.set(-0.6, 0.4, 0.8 + crossCycle * 0.5);
			if (j.rightArm) j.rightArm.rotation.set(-0.6, -0.4, -0.8 - crossCycle * 0.5);
			if (j.leftForearm) j.leftForearm.rotation.set(1.2, 0, -0.3);
			if (j.rightForearm) j.rightForearm.rotation.set(1.2, 0, 0.3);

			// Cabeça olhando rápido para esquerda e direita
			const quickLook = Math.sign(Math.sin(t * 2.5)) * 0.5;
			if (j.head) j.head.rotation.y = quickLook;
			if (j.leftShoulder) j.leftShoulder.rotation.x = Math.sin(t * 5.0) * 0.2;
			if (j.rightShoulder) j.rightShoulder.rotation.x = -Math.sin(t * 5.0) * 0.2;

		} else {
			if (phaseBadge) phaseBadge.textContent = 'Fase 4 (45-60s): Clímax Triunfante & Freeze Pose';
			if (timeSeconds < 58.5) {
				// Giro de braços e celebração
				const wave = Math.sin(t * 6.0);
				if (j.leftArm) j.leftArm.rotation.set(0, 0, 2.3 + wave * 0.3);
				if (j.rightArm) j.rightArm.rotation.set(0, 0, -2.3 - wave * 0.3);
				if (j.head) j.head.rotation.set(-0.3, Math.sin(t * 3.0) * 0.3, 0);
				if (j.pelvis) j.pelvis.position.y = 0.95 + Math.abs(wave) * 0.07;
			} else {
				// Pose de estátua final (Freeze!)
				if (j.leftArm) j.leftArm.rotation.set(-2.5, 0, 0.5);
				if (j.rightArm) j.rightArm.rotation.set(0.3, 0, -0.9);
				if (j.leftForearm) j.leftForearm.rotation.set(1.8, 0, 0);
				if (j.head) j.head.rotation.set(0.2, 0.4, 0.1);
				if (j.torso) j.torso.rotation.set(0.1, -0.2, 0);
			}
		}

	} else if (poseName === 'kpop_master') {
		// K-Pop Urban Master (1 Minuto)
		if (phaseBadge) phaseBadge.textContent = `K-Pop Urban • Fase ${phase + 1}: Articulações Geométricas`;
		const beat = Math.sin(t * 4.0);
		const sharpCut = Math.floor((t * 2.5) % 4);

		if (sharpCut === 0) {
			if (j.leftArm) j.leftArm.rotation.set(-1.57, 0, 0);
			if (j.leftForearm) j.leftForearm.rotation.set(0, 1.57, 0);
			if (j.rightArm) j.rightArm.rotation.set(0, 0, -1.57);
			if (j.head) j.head.rotation.set(0.2, -0.4, 0);
		} else if (sharpCut === 1) {
			if (j.leftArm) j.leftArm.rotation.set(0, 0, 1.57);
			if (j.rightArm) j.rightArm.rotation.set(-1.57, 0, 0);
			if (j.rightForearm) j.rightForearm.rotation.set(0, -1.57, 0);
			if (j.head) j.head.rotation.set(-0.1, 0.4, 0);
		} else if (sharpCut === 2) {
			if (j.leftArm) j.leftArm.rotation.set(-2.2, 0, 0.4);
			if (j.rightArm) j.rightArm.rotation.set(-2.2, 0, -0.4);
			if (j.leftForearm) j.leftForearm.rotation.set(1.5, 0, 0);
			if (j.rightForearm) j.rightForearm.rotation.set(1.5, 0, 0);
			if (j.head) j.head.rotation.set(0.3, 0, 0);
		} else {
			if (j.leftArm) j.leftArm.rotation.set(0.4, 0, 0.6);
			if (j.rightArm) j.rightArm.rotation.set(0.4, 0, -0.6);
			if (j.torso) j.torso.rotation.y = 0.3 * beat;
		}

	} else if (poseName === 'vogue_imvu') {
		// Vogue IMVU (Poses de Passarela e Geometrias de Mão no Rosto)
		if (phaseBadge) phaseBadge.textContent = `Vogue IMVU • Fase ${phase + 1}: Poses Angulares & Rosto`;
		const poseStep = Math.floor((t * 1.5) % 5);
		if (poseStep === 0) {
			// Mão direita sob o queixo
			if (j.rightArm) j.rightArm.rotation.set(-1.8, -0.3, -0.5);
			if (j.rightForearm) j.rightForearm.rotation.set(2.0, 0.4, 0);
			if (j.leftArm) j.leftArm.rotation.set(0.3, 0, 0.8);
			if (j.head) j.head.rotation.set(-0.2, 0.3, -0.15);
		} else if (poseStep === 1) {
			// Mão esquerda sobre a cabeça
			if (j.leftArm) j.leftArm.rotation.set(-2.6, 0, 0.6);
			if (j.leftForearm) j.leftForearm.rotation.set(1.9, 0, 0);
			if (j.rightArm) j.rightArm.rotation.set(0.2, 0, -1.2);
			if (j.head) j.head.rotation.set(0.2, -0.3, 0.2);
		} else if (poseStep === 2) {
			// Braços em ângulo reto no peito
			if (j.leftArm) j.leftArm.rotation.set(-1.2, 0.6, 0);
			if (j.rightArm) j.rightArm.rotation.set(-1.2, -0.6, 0);
			if (j.head) j.head.rotation.set(0, 0, 0);
		} else {
			// Inclinação dramática de passarela
			if (j.torso) j.torso.rotation.set(0.1, 0.4, -0.2);
			if (j.leftArm) j.leftArm.rotation.set(-0.4, 0, 1.4);
			if (j.rightArm) j.rightArm.rotation.set(-0.4, 0, -1.4);
		}

	} else if (poseName === 'electro_wave') {
		// Electro Pop Wave (Onda contínua que viaja de ombro a ombro)
		if (phaseBadge) phaseBadge.textContent = `Electro Wave • Fase ${phase + 1}: Body & Arm Wave`;
		const waveSpeed = t * 4.0;
		const waveL_Arm = Math.sin(waveSpeed);
		const waveL_Forearm = Math.sin(waveSpeed + 0.6);
		const waveShoulderL = Math.sin(waveSpeed + 1.2);
		const waveHead = Math.sin(waveSpeed + 1.8);
		const waveShoulderR = Math.sin(waveSpeed + 2.4);
		const waveR_Arm = Math.sin(waveSpeed + 3.0);
		const waveR_Forearm = Math.sin(waveSpeed + 3.6);

		if (j.leftArm) j.leftArm.rotation.set(-0.5 + waveL_Arm * 0.4, 0, 0.8 + waveL_Arm * 0.4);
		if (j.leftForearm) j.leftForearm.rotation.x = 0.8 + waveL_Forearm * 0.5;
		if (j.leftShoulder) j.leftShoulder.rotation.z = waveShoulderL * 0.25;
		if (j.head) j.head.rotation.z = waveHead * 0.25;
		if (j.rightShoulder) j.rightShoulder.rotation.z = -waveShoulderR * 0.25;
		if (j.rightArm) j.rightArm.rotation.set(-0.5 + waveR_Arm * 0.4, 0, -0.8 - waveR_Arm * 0.4);
		if (j.rightForearm) j.rightForearm.rotation.x = 0.8 + waveR_Forearm * 0.5;

	} else if (poseName === 'sync_groove') {
		// Dança em Dupla / Sync (Ritmo harmônico)
		if (phaseBadge) phaseBadge.textContent = `Dança em Dupla • Fase ${phase + 1}: Sincronia de Casal`;
		const syncBeat = Math.sin(t * 3.2);
		if (j.leftArm) j.leftArm.rotation.set(-1.0 + syncBeat * 0.4, 0, 0.5);
		if (j.rightArm) j.rightArm.rotation.set(-1.0 - syncBeat * 0.4, 0, -0.5);
		if (j.head) j.head.rotation.y = syncBeat * 0.35;
		if (j.torso) j.torso.rotation.y = -syncBeat * 0.2;
		if (j.pelvis) j.pelvis.position.y = 0.95 + Math.abs(syncBeat) * 0.06;
	}
};

// --------------------------------------------------------------------------
// 3. CONTROLE DA TIMELINE SCRUBBER DE 1 MINUTO
// --------------------------------------------------------------------------
window.toggleDancePlayPause = function() {
	window.dancePlaybackActive = !window.dancePlaybackActive;
	const btn = document.getElementById('btnDancePlayPause');
	if (btn) {
		btn.textContent = window.dancePlaybackActive ? '⏸️ Pausar' : '▶️ Continuar';
	}
};

window.seekDanceTimeline = function(event) {
	const track = document.getElementById('danceProgressTrack');
	if (!track) return;
	const rect = track.getBoundingClientRect();
	const clickX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
	const ratio = clickX / rect.width;
	window.danceTimerSeconds = ratio * 60;
	window.updateDanceScrubberUI(window.danceTimerSeconds);
};

window.updateDanceScrubberUI = function(sec) {
	const fill = document.getElementById('danceProgressFill');
	const timerDisplay = document.getElementById('danceTimerDisplay');
	if (fill) fill.style.width = ((sec / 60) * 100) + '%';
	if (timerDisplay) {
		const s = Math.floor(sec);
		const formatted = (s < 10 ? '0' : '') + s;
		timerDisplay.textContent = `⏱️ 00:${formatted} / 01:00`;
	}
};

// --------------------------------------------------------------------------
// 4. BALÃO DE FALA ESTILO QUADRINHOS 3D
// --------------------------------------------------------------------------
window.createComicSpeechSprite = function(text, speakerName) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');

	// Fundo transparente
	ctx.clearRect(0, 0, 512, 256);

	// Desenhar balão de quadrinhos arredondado
	const x = 16, y = 16, w = 480, h = 160, r = 24;
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	// Rabicho do balão apontando para a cabeça do avatar
	ctx.lineTo(280, y + h);
	ctx.lineTo(256, y + h + 50);
	ctx.lineTo(232, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();

	// Preenchimento branco brilhante com borda preta de HQ
	ctx.fillStyle = '#ffffff';
	ctx.fill();
	ctx.lineWidth = 8;
	ctx.strokeStyle = '#0f172a';
	ctx.stroke();

	// Faixa superior do nome do avatar
	ctx.fillStyle = '#8b5cf6';
	ctx.font = 'bold 24px sans-serif';
	ctx.fillText(`💬 @${speakerName || 'Avatar'}:`, 36, 56);

	// Texto da mensagem (com quebra de linha)
	ctx.fillStyle = '#0f172a';
	ctx.font = 'bold 28px sans-serif';

	const words = text.split(' ');
	let line = '';
	let lineY = 100;
	for (let n = 0; n < words.length; n++) {
		const testLine = line + words[n] + ' ';
		const metrics = ctx.measureText(testLine);
		if (metrics.width > 420 && n > 0) {
			ctx.fillText(line, 36, lineY);
			line = words[n] + ' ';
			lineY += 36;
			if (lineY > 150) break;
		} else {
			line = testLine;
		}
	}
	ctx.fillText(line, 36, lineY);

	const texture = new THREE.CanvasTexture(canvas);
	const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
	const sprite = new THREE.Sprite(spriteMat);
	sprite.scale.set(2.4, 1.2, 1);
	sprite.position.set(0, 1.6, 0); // Acima da cabeça
	return sprite;
};

window.send3dChatMessage = function() {
	const input = document.getElementById('scene3dChatInput');
	if (!input) return;
	const text = input.value.trim();
	if (!text) return;
	input.value = '';

	const speaker = window.activeUser || 'Visitante';

	// Exibir balão no avatar local
	if (window.avatarRig && window.avatarRig.head) {
		if (window.localSpeechSprite) {
			window.avatarRig.head.remove(window.localSpeechSprite);
		}
		window.localSpeechSprite = window.createComicSpeechSprite(text, speaker);
		window.avatarRig.head.add(window.localSpeechSprite);

		if (window.localSpeechTimer) clearTimeout(window.localSpeechTimer);
		window.localSpeechTimer = setTimeout(() => {
			if (window.localSpeechSprite && window.avatarRig.head) {
				window.avatarRig.head.remove(window.localSpeechSprite);
				window.localSpeechSprite = null;
			}
		}, 8000);
	}

	// Registrar mensagem no HUD integrado do 3D
	if (window.addMessageTo3dChatHud) {
		window.addMessageTo3dChatHud(speaker, text);
	}

	// Enviar para servidor sync
	fetch('/api/3d/speech', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'x-active-user': speaker },
		body: JSON.stringify({
			username: speaker,
			text: text,
			x: window.avatarRig?.root?.position?.x || 0,
			z: window.avatarRig?.root?.position?.z || 0
		})
	}).catch(() => {});

	if (window.showLiveToast) {
		window.showLiveToast('Balão 3D Enviado!', `"${text}" está visível acima do seu avatar.`, '', 'online');
	}
};

// HUD de Mensagens do Cenário 3D
window.toggle3dChatHud = function() {
	const hud = document.getElementById('scene3dChatHud');
	const openBtn = document.getElementById('btnOpenChatHud');
	const ctrlBtn = document.getElementById('btnToggleChatHud');
	if (!hud) return;

	const isCurrentlyHidden = hud.style.display === 'none';
	if (isCurrentlyHidden) {
		hud.style.display = 'flex';
		if (openBtn) openBtn.style.display = 'none';
		if (ctrlBtn) {
			ctrlBtn.textContent = '💬 Chat HUD: ON';
			ctrlBtn.style.borderColor = 'rgba(139, 92, 246, 0.5)';
		}
	} else {
		hud.style.display = 'none';
		if (openBtn) {
			openBtn.style.display = 'block';
			const badge = document.getElementById('chatHudBadge');
			if (badge) badge.style.display = 'none';
		}
		if (ctrlBtn) {
			ctrlBtn.textContent = '💬 Chat HUD: Off';
			ctrlBtn.style.borderColor = '';
		}
	}
};

window.addMessageTo3dChatHud = function(author, text, time) {
	const hudBody = document.getElementById('scene3dChatHudBody');
	if (!hudBody) return;

	const timeStr = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const item = document.createElement('div');
	item.className = 'scene3d-chat-hud-item';
	item.innerHTML = `
		<span class="scene3d-chat-hud-time">${timeStr}</span>
		<span class="scene3d-chat-hud-author">@${escapeSafe(author)}:</span>
		<span style="color: #f1f5f9;">${escapeSafe(text)}</span>
	`;
	hudBody.appendChild(item);
	hudBody.scrollTop = hudBody.scrollHeight;

	// Se o HUD estiver oculto, mostrar contador de mensagens não lidas
	const hud = document.getElementById('scene3dChatHud');
	if (hud && hud.style.display === 'none') {
		const badge = document.getElementById('chatHudBadge');
		if (badge) {
			badge.style.display = 'inline-block';
			const current = parseInt(badge.textContent || '0', 10) || 0;
			badge.textContent = current + 1;
		}
	}
};

function escapeSafe(str) {
	if (!str) return '';
	return String(str).replace(/[&<>"']/g, m => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[m]);
}

// --------------------------------------------------------------------------
// 5. SOFÁS INTERATIVOS COM MÚLTIPLOS ASSENTOS (SENTAR E LEVANTAR)
// --------------------------------------------------------------------------
window.currentSatSpot = null;

window.sitOnFurniture = function(furniture, requestedSpotIndex = null) {
	if (!furniture || !window.avatarRig?.root) return;

	const me = window.activeUser || 'Visitante';

	// Se já está sentado exatamente neste móvel, levantar
	if (window.currentSatFurniture && window.currentSatFurniture.id === furniture.id) {
		window.standUpFromSofa();
		return;
	}

	// Se estava sentado em outro móvel, levantar primeiro
	if (window.currentSatFurniture) {
		window.standUpFromSofa();
	}

	const spots = furniture.spots || [
		{ spotIndex: 0, label: 'Lugar Central', worldPos: furniture.sitPos, occupiedBy: null }
	];

	// Selecionar lugar
	let chosenSpot = null;
	if (requestedSpotIndex !== null && spots[requestedSpotIndex] && !spots[requestedSpotIndex].occupiedBy) {
		chosenSpot = spots[requestedSpotIndex];
	} else {
		// Pega a primeira vaga livre
		chosenSpot = spots.find(s => !s.occupiedBy);
	}

	if (!chosenSpot) {
		if (window.showLiveToast) {
			window.showLiveToast('Móvel Lotado', `Todos os ${spots.length} lugares no ${furniture.name} estão ocupados no momento.`, '', 'offline');
		}
		return;
	}

	chosenSpot.occupiedBy = me;
	window.currentSatFurniture = furniture;
	window.currentSatSpot = chosenSpot;

	// Posicionar avatar exatamente no spot escolhido
	window.avatarRig.root.position.x = chosenSpot.worldPos.x;
	window.avatarRig.root.position.z = chosenSpot.worldPos.z;
	window.avatarRig.root.rotation.y = furniture.rotY;
	window.isAvatarMoving = false;

	// Aplicar pose de sentar
	if (window.setAvatarPose) {
		window.setAvatarPose('sit');
	}

	// Sincronizar seletor de poses
	const poseSelect = document.getElementById('dancePoseSelect');
	if (poseSelect) poseSelect.value = 'sit';

	const btnSit = document.getElementById('btnSitActionText');
	if (btnSit) btnSit.textContent = 'Levantar 🧍';

	const occupiedCount = spots.filter(s => s.occupiedBy).length;
	if (window.showLiveToast) {
		window.showLiveToast(
			'Sentou no Sofá!',
			`Você está no ${chosenSpot.label} do ${furniture.name} (${occupiedCount}/${spots.length} lugares ocupados).`,
			'',
			'online'
		);
	}
};

window.standUpFromSofa = function() {
	if (window.currentSatSpot) {
		window.currentSatSpot.occupiedBy = null;
		window.currentSatSpot = null;
	}
	window.currentSatFurniture = null;

	const btnSit = document.getElementById('btnSitActionText');
	if (btnSit) btnSit.textContent = 'Sentar no Sofá 🛋️';

	if (window.setAvatarPose) {
		window.setAvatarPose('idle');
	}

	const poseSelect = document.getElementById('dancePoseSelect');
	if (poseSelect) poseSelect.value = 'idle';

	if (window.showLiveToast) {
		window.showLiveToast('Levantou!', 'Você se levantou do assento. Clique no chão para andar livremente.', '', 'online');
	}
};

window.toggleSitNearestSofa = function() {
	if (window.currentSatFurniture) {
		window.standUpFromSofa();
		return;
	}
	if (!window.interactiveFurniture || window.interactiveFurniture.length === 0) return;

	// Achar o móvel mais próximo que tenha lugar vago
	const curX = window.avatarRig?.root?.position?.x || 0;
	const curZ = window.avatarRig?.root?.position?.z || 0;
	let nearest = null;
	let minDist = 99999;

	window.interactiveFurniture.forEach(f => {
		const spots = f.spots || [{ worldPos: f.sitPos, occupiedBy: null }];
		const hasFreeSpot = spots.some(s => !s.occupiedBy);
		if (hasFreeSpot) {
			const d = Math.hypot(f.x - curX, f.z - curZ);
			if (d < minDist) {
				minDist = d;
				nearest = f;
			}
		}
	});

	if (nearest) {
		window.sitOnFurniture(nearest);
	} else {
		window.sitOnFurniture(window.interactiveFurniture[0]);
	}
};

window.teleportToCenter = function() {
	if (window.currentSatFurniture) window.standUpFromSofa();
	if (window.avatarRig?.root) {
		window.avatarRig.root.position.set(0, -1.05, 0);
		window.avatarRig.root.rotation.set(0, 0, 0);
	}
	if (window.showLiveToast) {
		window.showLiveToast('Teleportado!', 'Você voltou ao centro da pista de dança 3D.', '', 'online');
	}
};

window.syncDanceWithOthers = function() {
	window.setAvatarPose('sync_groove');
	if (window.showLiveToast) {
		window.showLiveToast('Dança em Sincronia!', 'Iniciando coreografia em sincronia com os outros avatares do cenário.', '', 'online');
	}
};

// --------------------------------------------------------------------------
// 6. TOGGLE VISIBILIDADE / MODO OCULTO (GHOST MODE)
// --------------------------------------------------------------------------
window.toggleVisibilityMode = function() {
	window.isGhostMode = !window.isGhostMode;
	const isVisible = !window.isGhostMode;

	// Atualizar botões na UI
	const btnHeader = document.getElementById('btnHeaderVisibility');
	const headerText = document.getElementById('headerVisibilityText');
	const btn3d = document.getElementById('btn3dVisibility');
	const btn3dText = document.getElementById('btn3dVisibilityText');

	if (isVisible) {
		if (btnHeader) {
			btnHeader.className = 'visibility-pill-btn visible-mode';
			if (headerText) headerText.textContent = 'Visível no App 🟢';
		}
		if (btn3d) {
			btn3d.className = 'visibility-pill-btn visible-mode';
			if (btn3dText) btn3dText.textContent = 'Modo Visível no 3D 🟢';
		}
		if (window.showLiveToast) {
			window.showLiveToast('Modo Visível Ativo 🟢', 'Outros usuários do app agora podem ver você online e no cenário 3D!', '', 'online');
		}
	} else {
		if (btnHeader) {
			btnHeader.className = 'visibility-pill-btn ghost-mode';
			if (headerText) headerText.textContent = 'Modo Oculto 🟡';
		}
		if (btn3d) {
			btn3d.className = 'visibility-pill-btn ghost-mode';
			if (btn3dText) btn3dText.textContent = 'Modo Oculto no 3D 🟡';
		}
		if (window.showLiveToast) {
			window.showLiveToast('Modo Oculto / Fantasma 👻', 'Você está invisível para outros usuários no cenário 3D e listas online.', '', 'offline');
		}
	}

	// Persistir configuração
	fetch('/api/user/settings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'x-active-user': window.activeUser || '' },
		body: JSON.stringify({ is_visible: isVisible })
	}).catch(() => {});
};

// --------------------------------------------------------------------------
// 7. MULTIPLAYER 3D AVATARS NO CENÁRIO
// --------------------------------------------------------------------------
window.start3dMultiplayerLoop = function(scene) {
	if (!scene || !window.THREE) return;

	const sync3dAvatarsNow = async () => {
		if (!scene || !window.THREE) return;
		const activeUser = window.activeUser || 'Visitante_Checker';

		// 1. Enviar presença local
		const myPos = window.avatarRig?.root?.position || { x: 0, z: 0 };
		fetch('/api/3d/heartbeat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-active-user': activeUser },
			body: JSON.stringify({
				username: activeUser,
				x: myPos.x,
				z: myPos.z,
				pose: window.activePoseName || 'idle',
				is_visible: !window.isGhostMode
			})
		}).catch(() => {});

		// 2. Buscar outros avatares
		try {
			const res = await fetch('/api/3d/users', { headers: { 'x-active-user': activeUser } });
			const { data } = await res.json();
			const users = data || [];

			// Atualizar contador da badge
			const countBadge = document.getElementById('online3dBadge');
			if (countBadge) {
				const visibleCount = users.filter(u => u.is_visible !== false).length;
				countBadge.textContent = `👥 ${visibleCount + 1} no Cenário`;
			}

			// Renderizar ou atualizar avatares remotos
			users.forEach(u => {
				if (u.username.toLowerCase() === activeUser.toLowerCase()) return;
				if (u.is_visible === false) {
					// Remover se ficou oculto
					if (window.remoteAvatars.has(u.username)) {
						const remoteRig = window.remoteAvatars.get(u.username);
						scene.remove(remoteRig.root);
						window.remoteAvatars.delete(u.username);
					}
					return;
				}

				if (!window.remoteAvatars.has(u.username)) {
					// Criar novo avatar remoto imediatamente no cenário
					const remoteRig = window.createRemoteAvatarRig(u.username, scene);
					if (remoteRig && remoteRig.root) {
						remoteRig.root.position.set(u.x || 2.5, u.y || -1.05, u.z || 0);
						remoteRig.root.rotation.y = u.rotY || 0;
					}
					window.remoteAvatars.set(u.username, remoteRig);
				}

				const rig = window.remoteAvatars.get(u.username);
				if (rig && rig.root) {
					// Suavizar interpolação de posição
					rig.root.position.x += ((u.x || 2.5) - rig.root.position.x) * 0.3;
					rig.root.position.z += ((u.z || 0) - rig.root.position.z) * 0.3;

					// Exibir balão de fala se houver mensagem recente
					const speechText = (typeof u.lastSpeech === 'string' ? u.lastSpeech : u.lastSpeech?.text) || '';
					const speechTime = (typeof u.lastSpeech === 'object' ? u.lastSpeech?.time : u.lastSpeechTime) || Date.now();
					if (speechText && (!rig.lastSpeechId || rig.lastSpeechId !== speechTime)) {
						rig.lastSpeechId = speechTime;
						if (window.addMessageTo3dChatHud) {
							window.addMessageTo3dChatHud(u.username, speechText);
						}
						if (rig.speechSprite) rig.head.remove(rig.speechSprite);
						rig.speechSprite = window.createComicSpeechSprite(speechText, u.username);
						rig.head.add(rig.speechSprite);
						setTimeout(() => {
							if (rig.speechSprite && rig.head) {
								rig.head.remove(rig.speechSprite);
								rig.speechSprite = null;
							}
						}, 9000);
					}
				}
			});
		} catch (e) {}
	};

	// Executar imediatamente na hora em que o usuário entra no app
	sync3dAvatarsNow();

	if (!window.multiUserPollingActive) {
		window.multiUserPollingActive = true;
		setInterval(sync3dAvatarsNow, 2500);
	}
};

window.animateRemoteAvatars = function(clock) {
	if (!window.remoteAvatars) return;
	let idx = 0;
	window.remoteAvatars.forEach((rig, username) => {
		if (!rig || !rig.root) return;
		idx++;
		const offset = idx * 1.5;
		const armSwing = Math.sin(clock * 3.5 + offset) * 0.4;
		const legSwing = Math.sin(clock * 3.5 + offset) * 0.3;
		if (rig.leftArm) rig.leftArm.rotation.x = armSwing;
		if (rig.rightArm) rig.rightArm.rotation.x = -armSwing;
		if (rig.leftLeg) rig.leftLeg.rotation.x = -legSwing;
		if (rig.rightLeg) rig.rightLeg.rotation.x = legSwing;
		if (rig.head) rig.head.rotation.y = Math.sin(clock * 1.8 + offset) * 0.25;
		if (rig.torso) rig.torso.rotation.y = Math.sin(clock * 2.5 + offset) * 0.15;
	});
};

window.createRemoteAvatarRig = function(username, scene) {
	const root = new THREE.Group();
	root.position.set(2.5, -1.05, 0);

	const skinMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.4 });
	const outfitMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.3, metalness: 0.4 });
	const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b });

	const pelvis = new THREE.Group();
	pelvis.position.y = 0.95;
	root.add(pelvis);
	pelvis.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.2, 16), pantsMat));

	const torso = new THREE.Group();
	torso.position.y = 0.1;
	pelvis.add(torso);
	const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 16), outfitMat);
	torsoMesh.position.y = 0.25;
	torso.add(torsoMesh);

	const head = new THREE.Group();
	head.position.y = 0.62;
	torso.add(head);
	const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
	headMesh.position.y = 0.18;
	head.add(headMesh);

	// Placa do nome do avatar (Nametag billboard)
	const nametagCanvas = document.createElement('canvas');
	nametagCanvas.width = 256;
	nametagCanvas.height = 64;
	const nctx = nametagCanvas.getContext('2d');
	nctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
	if (typeof nctx.roundRect === 'function') {
		nctx.roundRect(4, 4, 248, 56, 12);
	} else {
		nctx.rect(4, 4, 248, 56);
	}
	nctx.fill();
	nctx.strokeStyle = '#ec4899';
	nctx.lineWidth = 3;
	nctx.stroke();
	nctx.fillStyle = '#ffffff';
	nctx.font = 'bold 20px sans-serif';
	nctx.textAlign = 'center';
	nctx.fillText(`@${username} • AP`, 128, 38);

	const nametagTex = new THREE.CanvasTexture(nametagCanvas);
	const nametagSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nametagTex, transparent: true }));
	nametagSprite.scale.set(1.4, 0.35, 1);
	nametagSprite.position.y = 0.6;
	head.add(nametagSprite);

	// Braço Esquerdo
	const leftArm = new THREE.Group();
	leftArm.position.set(-0.32, 0.45, 0);
	torso.add(leftArm);
	leftArm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.55), outfitMat));

	// Braço Direito
	const rightArm = new THREE.Group();
	rightArm.position.set(0.32, 0.45, 0);
	torso.add(rightArm);
	rightArm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.55), outfitMat));

	// Pernas
	const leftLeg = new THREE.Group();
	leftLeg.position.set(-0.14, -0.05, 0);
	pelvis.add(leftLeg);
	leftLeg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.8), pantsMat));

	const rightLeg = new THREE.Group();
	rightLeg.position.set(0.14, -0.05, 0);
	pelvis.add(rightLeg);
	rightLeg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.8), pantsMat));

	scene.add(root);

	return {
		root,
		pelvis,
		torso,
		head,
		leftArm,
		rightArm,
		leftLeg,
		rightLeg,
		speechSprite: null
	};
};

// --------------------------------------------------------------------------
// 8. MODAL SUPABASE & ESQUEMA SQL COMPLETO
// --------------------------------------------------------------------------
window.openSupabaseModal = async function() {
	const modal = document.getElementById('supabaseSqlModal');
	if (!modal) return;
	modal.style.display = 'flex';

	const sqlPre = document.getElementById('supabaseSqlPre');
	if (sqlPre && (sqlPre.textContent.includes('Carregando') || !sqlPre.textContent.includes('CREATE TABLE'))) {
		try {
			const res = await fetch('/api/supabase-sql');
			const json = await res.json();
			sqlPre.textContent = json.sql || '-- SQL indisponível';
		} catch (e) {
			sqlPre.textContent = '-- Erro ao carregar script SQL.';
		}
	}
};

window.closeSupabaseModal = function() {
	const modal = document.getElementById('supabaseSqlModal');
	if (modal) modal.style.display = 'none';
};

window.copySupabaseSql = function() {
	const sqlPre = document.getElementById('supabaseSqlPre');
	if (!sqlPre) return;
	navigator.clipboard.writeText(sqlPre.textContent).then(() => {
		const btn = document.getElementById('btnCopySql');
		if (btn) {
			const original = btn.textContent;
			btn.textContent = '✓ Código SQL Copiado com Sucesso!';
			btn.style.background = '#22c55e';
			setTimeout(() => {
				btn.textContent = original;
				btn.style.background = '';
			}, 3000);
		}
	});
};

// --------------------------------------------------------------------------
// 9. AMIGOS DO APP (LISTA DE AMIGOS NO MESMO APLICATIVO)
// --------------------------------------------------------------------------
window.addAppFriend = async function() {
	const input = document.getElementById('addFriendUsernameInput');
	if (!input) return;
	const friendUsername = input.value.trim();
	if (!friendUsername) {
		alert('Digite o nome de usuário para adicionar aos amigos.');
		return;
	}

	try {
		const res = await fetch('/api/app-friends/add', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-active-user': window.activeUser || '' },
			body: JSON.stringify({ friendUsername })
		});
		const json = await res.json();
		if (json.success) {
			input.value = '';
			if (window.showLiveToast) {
				window.showLiveToast('Amigo Adicionado!', `@${friendUsername} agora está na sua lista de amigos do app.`, '', 'online');
			}
			window.loadAppFriends();
		} else {
			alert(json.message || 'Erro ao adicionar amigo.');
		}
	} catch (e) {
		alert('Erro de conexão ao adicionar amigo.');
	}
};

window.loadAppFriends = async function() {
	const area = document.getElementById('friendsListArea');
	if (!area) return;

	area.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Carregando seus amigos do Checker PartnerVU...</div>';

	try {
		const res = await fetch('/api/app-friends', {
			headers: { 'x-active-user': window.activeUser || '' }
		});
		const { data } = await res.json();
		const friends = data || [];

		const badge = document.getElementById('appFriendsCountBadge');
		if (badge) badge.textContent = friends.length;

		if (friends.length === 0) {
			area.innerHTML = `
				<div style="background: var(--bg-card); border: 1px dashed var(--panel-border); padding: 30px; text-align: center; border-radius: 12px; color: var(--text-secondary);">
					Nenhum amigo do app adicionado ainda.<br>Digite o nome de um usuário acima para adicioná-lo à sua rede do Checker PartnerVU.
				</div>
			`;
			return;
		}

		const safeFallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
		area.innerHTML = `
			<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;">
				${friends.map(f => {
					const imgSrc = f.avatarImage || safeFallbackSvg;
					return `
					<div class="friend-card-box" style="background: #181b24; border: 1px solid var(--panel-border); border-radius: 12px; padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
						<div style="display: flex; align-items: center; gap: 10px;">
							<div style="position: relative; width: 44px; height: 44px;">
								<img src="${imgSrc}" onerror="this.onerror=null; this.src='${safeFallbackSvg}';" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="Avatar">
								<div style="position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; border-radius: 50%; background: ${f.isOnline ? '#22c55e' : '#64748b'}; border: 2px solid #181b24;"></div>
							</div>
							<div>
								<div style="font-size: 13.5px; font-weight: 700; color: var(--text-primary);">${f.friendUsername}</div>
								<div style="font-size: 11px; color: ${f.isOnline ? '#86efac' : '#94a3b8'};">${f.isOnline ? 'Online no App' : 'Desconectado'}</div>
							</div>
						</div>
						<div style="display: flex; gap: 6px;">
							<button class="tag-btn" onclick="openChatWith('${f.friendUsername}')" style="font-size: 11px; padding: 4px 8px;">
								💬 Chat
							</button>
							<button class="tag-btn" onclick="switchTab('outfits')" style="font-size: 11px; padding: 4px 8px;">
								👗 Ver 3D
							</button>
						</div>
					</div>
				`;
				}).join('')}
			</div>
		`;
	} catch (e) {
		area.innerHTML = '<div style="color: #ef4444;">Erro ao carregar amigos do app.</div>';
	}
};
