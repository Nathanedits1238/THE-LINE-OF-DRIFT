import * as THREE from 'three';
import { VehicleConfig } from '../types';

export class VehicleMeshBuilder {
  private static tireTexture: THREE.CanvasTexture | null = null;
  private static headlightTexture: THREE.CanvasTexture | null = null;

  public static getTireTexture(): THREE.CanvasTexture {
    if (!this.tireTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#222225';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#111113';
      for (let y = 0; y < 128; y += 16) {
        ctx.fillRect(0, y, 128, 6);
        ctx.fillRect(y, 0, 6, 128);
      }
      this.tireTexture = new THREE.CanvasTexture(canvas);
      this.tireTexture.wrapS = THREE.RepeatWrapping;
      this.tireTexture.wrapT = THREE.RepeatWrapping;
      this.tireTexture.repeat.set(2, 4);
      this.tireTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return this.tireTexture;
  }

  /**
   * Builds a high-fidelity procedural 3D vehicle composite.
   */
  public static createVehicleGroup(
    config: VehicleConfig,
    isPolice: boolean = false,
    policeVariant: 'cruiser' | 'interceptor' | 'swat' = 'cruiser'
  ): {
    group: THREE.Group;
    bodyMesh: THREE.Mesh;
    wheels: THREE.Group[];
    neonMesh: THREE.Mesh | null;
    headlights: THREE.Mesh[];
    taillights: THREE.Mesh[];
    policeLights?: { blue: THREE.Mesh; red: THREE.Mesh };
    updatePoliceLights?: (time: number) => void;
    updateCustomization?: (newConfig: VehicleConfig) => void;
    applyDamageDeformation?: (damageRatio: number) => void;
  } {
    const root = new THREE.Group();
    root.name = `Vehicle_${config.name}`;

    // Dimensions
    const isSwat = isPolice && policeVariant === 'swat';
    const isJDM = config.category === 'jdm';
    const isSuper = config.category === 'super' || config.category === 'hyper';

    const length = isSwat ? 4.9 : isSuper ? 4.6 : 4.4;
    const width = isSwat ? 2.2 : isSuper ? 2.05 : 1.95;
    const height = isSwat ? 1.7 : isSuper ? 1.15 : 1.32;
    const groundClearance = isSwat ? 0.38 : isSuper ? 0.22 : 0.26;

    // Body Material
    const bodyColor = isPolice ? (isSwat ? 0x111622 : 0x0c0d12) : parseInt(config.color.replace('#', '0x'));
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: isSwat ? 0.4 : 0.85,
      roughness: isSwat ? 0.6 : 0.18,
      envMapIntensity: 1.2,
    });

    const blackTrimMat = new THREE.MeshStandardMaterial({
      color: 0x141518,
      roughness: 0.6,
      metalness: 0.3,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.95,
      roughness: 0.08,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: isPolice ? 0x1a2230 : 0x11151c,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });

    // 1. Lower Chassis & Side Skirts (Subdivided 4x2x8 for progressive crumple deformation)
    const chassisGeo = new THREE.BoxGeometry(width, height * 0.42, length, 4, 2, 8);
    const origChassisPos = (chassisGeo.attributes.position.array as Float32Array).slice();
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = groundClearance + height * 0.21;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    root.add(chassis);

    // Police White Door Panels / Stripes if Cruiser
    if (isPolice && !isSwat) {
      const doorPanelGeo = new THREE.BoxGeometry(width + 0.02, height * 0.38, length * 0.44);
      const doorPanelMat = new THREE.MeshStandardMaterial({
        color: 0xf0f3f8,
        roughness: 0.3,
        metalness: 0.2,
      });
      const doorPanel = new THREE.Mesh(doorPanelGeo, doorPanelMat);
      doorPanel.position.set(0, chassis.position.y, 0);
      root.add(doorPanel);
    }

    // 2. Cabin / Greenhouse (Windshield, Roof, Windows)
    const cabinWidth = width * (isSwat ? 0.92 : 0.82);
    const cabinLength = length * (isSwat ? 0.62 : isSuper ? 0.48 : 0.54);
    const cabinHeight = height * (isSwat ? 0.55 : isSuper ? 0.42 : 0.48);

    const cabinGeo = new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinLength);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(
      0,
      groundClearance + height * 0.42 + cabinHeight * 0.5 - 0.02,
      isSuper ? 0.15 : -0.1
    );
    cabin.castShadow = true;
    root.add(cabin);

    // Roof cover
    const roofGeo = new THREE.BoxGeometry(cabinWidth * 0.96, 0.04, cabinLength * 0.88);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, cabin.position.y + cabinHeight * 0.5, cabin.position.z);
    roof.castShadow = true;
    root.add(roof);

    // Front Hood & Aerodynamic Slope (Subdivided 4x2x6 for buckling)
    const hoodLength = length * (isSuper ? 0.38 : 0.34);
    const hoodGeo = new THREE.BoxGeometry(width * 0.92, height * 0.12, hoodLength, 4, 2, 6);
    const origHoodPos = (hoodGeo.attributes.position.array as Float32Array).slice();
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, chassis.position.y + height * 0.14, length * 0.3);
    hood.rotation.x = -0.05;
    hood.castShadow = true;
    root.add(hood);

    const initHoodPos = hood.position.clone();
    const initHoodRot = hood.rotation.clone();

    // Front Splitter / Pushbar (for Cops)
    let pushbarMesh: THREE.Mesh | null = null;
    let splitterMesh: THREE.Mesh | null = null;

    if (isPolice) {
      // Heavy Steel Pushbar
      const pushbarGeo = new THREE.BoxGeometry(width * 0.75, height * 0.35, 0.12);
      const pushbarMat = new THREE.MeshStandardMaterial({
        color: 0x050505,
        roughness: 0.8,
        metalness: 0.2,
      });
      const pushbar = new THREE.Mesh(pushbarGeo, pushbarMat);
      pushbar.position.set(0, groundClearance + height * 0.2, length * 0.52);
      root.add(pushbar);
      pushbarMesh = pushbar;
    } else {
      // Sport Front Splitter
      const splitterGeo = new THREE.BoxGeometry(width * 1.02, 0.05, 0.3);
      const splitter = new THREE.Mesh(splitterGeo, blackTrimMat);
      splitter.position.set(0, groundClearance + 0.05, length * 0.5);
      root.add(splitter);
      splitterMesh = splitter;
    }

    // Rear Diffuser
    const diffuserGeo = new THREE.BoxGeometry(width * 0.94, 0.1, 0.25);
    const diffuser = new THREE.Mesh(diffuserGeo, blackTrimMat);
    diffuser.position.set(0, groundClearance + 0.08, -length * 0.5);
    root.add(diffuser);

    // Dual Exhaust Pipes
    const exhaustGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.2, 16);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaustL = new THREE.Mesh(exhaustGeo, chromeMat);
    exhaustL.position.set(-width * 0.32, groundClearance + 0.12, -length * 0.51);
    const exhaustR = new THREE.Mesh(exhaustGeo, chromeMat);
    exhaustR.position.set(width * 0.32, groundClearance + 0.12, -length * 0.51);
    root.add(exhaustL, exhaustR);

    // Headlights (LED Glow)
    const headlightGeo = new THREE.BoxGeometry(0.28, 0.09, 0.08);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xddeeff,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });
    const headlightL = new THREE.Mesh(headlightGeo, headlightMat);
    headlightL.position.set(-width * 0.38, chassis.position.y + height * 0.08, length * 0.505);
    const headlightR = new THREE.Mesh(headlightGeo, headlightMat);
    headlightR.position.set(width * 0.38, chassis.position.y + height * 0.08, length * 0.505);
    root.add(headlightL, headlightR);

    // Taillights (Neon Red LED Strip)
    const taillightGeo = new THREE.BoxGeometry(0.38, 0.07, 0.06);
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff1122,
      emissive: 0xff0022,
      emissiveIntensity: 2.5,
      roughness: 0.2,
    });
    const taillightL = new THREE.Mesh(taillightGeo, taillightMat);
    taillightL.position.set(-width * 0.36, chassis.position.y + height * 0.12, -length * 0.505);
    const taillightR = new THREE.Mesh(taillightGeo, taillightMat);
    taillightR.position.set(width * 0.36, chassis.position.y + height * 0.12, -length * 0.505);
    root.add(taillightL, taillightR);

    // Spoiler / Rear Wing
    let spoilerMesh: THREE.Group | null = null;
    if (config.spoilerStyle > 0 && !isPolice) {
      spoilerMesh = new THREE.Group();
      const wingMat = config.spoilerStyle === 3 ? blackTrimMat : bodyMat;
      const wingWidth = width * (config.spoilerStyle === 2 ? 1.08 : 0.95);
      const wingGeo = new THREE.BoxGeometry(wingWidth, 0.04, 0.26);
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.castShadow = true;

      // Stems
      const stemHeight = config.spoilerStyle === 2 ? 0.28 : 0.16;
      const stemGeo = new THREE.BoxGeometry(0.04, stemHeight, 0.1);
      const stemL = new THREE.Mesh(stemGeo, blackTrimMat);
      stemL.position.set(-wingWidth * 0.32, -stemHeight * 0.5, 0);
      const stemR = new THREE.Mesh(stemGeo, blackTrimMat);
      stemR.position.set(wingWidth * 0.32, -stemHeight * 0.5, 0);

      spoilerMesh.add(wing, stemL, stemR);
      spoilerMesh.position.set(0, chassis.position.y + height * 0.25 + stemHeight, -length * 0.44);
      root.add(spoilerMesh);
    }

    // Police Emergency Lightbar on Roof
    let policeLightsObj: { blue: THREE.Mesh; red: THREE.Mesh } | undefined;
    let updatePoliceLightsFn: ((time: number) => void) | undefined;

    if (isPolice) {
      const lightbarBaseGeo = new THREE.BoxGeometry(width * 0.65, 0.05, 0.18);
      const lightbarBase = new THREE.Mesh(lightbarBaseGeo, blackTrimMat);
      lightbarBase.position.set(0, roof.position.y + 0.04, roof.position.z);

      const lightGeo = new THREE.BoxGeometry(width * 0.28, 0.08, 0.14);
      const redMat = new THREE.MeshStandardMaterial({
        color: 0xff0022,
        emissive: 0xff0022,
        emissiveIntensity: 3.5,
        roughness: 0.1,
      });
      const blueMat = new THREE.MeshStandardMaterial({
        color: 0x0066ff,
        emissive: 0x0088ff,
        emissiveIntensity: 3.5,
        roughness: 0.1,
      });

      const redLight = new THREE.Mesh(lightGeo, redMat);
      redLight.position.set(-width * 0.16, 0.05, 0);
      const blueLight = new THREE.Mesh(lightGeo, blueMat);
      blueLight.position.set(width * 0.16, 0.05, 0);

      lightbarBase.add(redLight, blueLight);
      root.add(lightbarBase);

      policeLightsObj = { blue: blueLight, red: redLight };
      updatePoliceLightsFn = (time: number) => {
        // High-speed emergency strobe pattern
        const flashPhase = Math.floor(time * 12) % 4;
        const redOn = flashPhase === 0 || flashPhase === 1;
        const blueOn = flashPhase === 2 || flashPhase === 3;
        redMat.emissiveIntensity = redOn ? 4.5 : 0.2;
        blueMat.emissiveIntensity = blueOn ? 4.5 : 0.2;
      };
    }

    // 4 Wheels (with independent rotation groups)
    const wheelRadius = isSwat ? 0.44 : isSuper ? 0.34 : 0.36;
    const wheelWidth = isSwat ? 0.32 : isSuper ? 0.3 : 0.26;
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      map: this.getTireTexture(),
      roughness: 0.88,
      metalness: 0.05,
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: config.wheelsStyle === 2 ? 0xf0f0f5 : config.wheelsStyle === 3 ? 0x00e5ff : 0x27272a,
      metalness: 0.9,
      roughness: 0.15,
    });

    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xff1122,
      metalness: 0.7,
      roughness: 0.3,
    });

    const wheelOffsetX = width * 0.48;
    const wheelOffsetZ = length * 0.32;
    const wheelY = wheelRadius;

    const wheels: THREE.Group[] = [];
    const wheelPositions = [
      { x: -wheelOffsetX, z: wheelOffsetZ, isFront: true }, // Front Left
      { x: wheelOffsetX, z: wheelOffsetZ, isFront: true }, // Front Right
      { x: -wheelOffsetX, z: -wheelOffsetZ, isFront: false }, // Rear Left
      { x: wheelOffsetX, z: -wheelOffsetZ, isFront: false }, // Rear Right
    ];

    wheelPositions.forEach((pos, idx) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(pos.x, wheelY, pos.z);

      // Tire cylinder
      const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;

      // Rim spokes
      const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.72, wheelRadius * 0.72, wheelWidth * 1.02, 16);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, rimMat);

      // Brake Caliper
      const caliperGeo = new THREE.BoxGeometry(0.08, wheelRadius * 0.45, 0.12);
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(pos.x > 0 ? -wheelWidth * 0.35 : wheelWidth * 0.35, wheelRadius * 0.25, 0);

      wheelGroup.add(tire, rim, caliper);
      root.add(wheelGroup);
      wheels.push(wheelGroup);
    });

    // Underglow Neon Glow Plane
    let neonMesh: THREE.Mesh | null = null;
    if (config.neonEnabled && !isPolice) {
      const neonGeo = new THREE.PlaneGeometry(width * 0.9, length * 0.85);
      neonGeo.rotateX(-Math.PI / 2);
      const neonMat = new THREE.MeshBasicMaterial({
        color: parseInt(config.neonColor.replace('#', '0x')),
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      });
      neonMesh = new THREE.Mesh(neonGeo, neonMat);
      neonMesh.position.set(0, 0.04, 0);
      root.add(neonMesh);
    }

    // Soft Contact Shadow Plane Grounding
    const shadowGeo = new THREE.PlaneGeometry(width * 1.25, length * 1.15);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, 0.015, 0);
    root.add(shadowMesh);

    // Radiator Damage Steam & Smoke Puffs
    const damageSmokeGroup = new THREE.Group();
    damageSmokeGroup.position.set(0, groundClearance + height * 0.28, length * 0.46);
    damageSmokeGroup.visible = false;
    const smokeGeo = new THREE.DodecahedronGeometry(0.18, 1);
    const smokePuffs: THREE.Mesh[] = [];
    for (let p = 0; p < 4; p++) {
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      puff.position.set((Math.random() - 0.5) * 0.35, Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
      puff.scale.setScalar(0.7);
      damageSmokeGroup.add(puff);
      smokePuffs.push(puff);
    }
    root.add(damageSmokeGroup);

    // Customization update callback
    const updateCustomization = (newConfig: VehicleConfig) => {
      bodyMat.color.set(newConfig.color);
      if (neonMesh) {
        neonMesh.visible = newConfig.neonEnabled;
        (neonMesh.material as THREE.MeshBasicMaterial).color.set(newConfig.neonColor);
      }
    };

    // Dynamic Lightweight Damage Deformation (100% integrity -> 0% integrity)
    const applyDamageDeformation = (damageRatio: number) => {
      const d = Math.max(0, Math.min(1.0, damageRatio));

      // 1. Deform Chassis Geometry Vertices (Smooth front crush & side dents)
      const cPos = chassisGeo.attributes.position;
      const cArr = cPos.array as Float32Array;
      const halfLen = length * 0.5;

      for (let i = 0; i < cArr.length; i += 3) {
        const ox = origChassisPos[i];
        const oy = origChassisPos[i + 1];
        const oz = origChassisPos[i + 2];

        if (oz > 0) {
          const frontWeight = Math.max(0, oz / halfLen);
          const zCrumple = d * 0.35 * frontWeight * frontWeight;
          const yDent = (Math.sin(ox * 7) * 0.05 - 0.02) * d * frontWeight;
          cArr[i] = ox + (Math.sin(oz * 6) * 0.03) * d * frontWeight;
          cArr[i + 1] = oy + yDent;
          cArr[i + 2] = oz - zCrumple;
        } else {
          cArr[i] = ox;
          cArr[i + 1] = oy;
          cArr[i + 2] = oz;
        }

        if (Math.abs(ox) > width * 0.38) {
          const sideDent = Math.abs(Math.sin(oz * 4)) * 0.05 * d;
          cArr[i] = ox > 0 ? ox - sideDent : ox + sideDent;
        }
      }
      cPos.needsUpdate = true;
      chassisGeo.computeVertexNormals();

      // 2. Deform Hood Geometry Vertices (Center buckle & front dent)
      const hPos = hoodGeo.attributes.position;
      const hArr = hPos.array as Float32Array;
      const hHalfLen = hoodLength * 0.5;

      for (let i = 0; i < hArr.length; i += 3) {
        const ox = origHoodPos[i];
        const oy = origHoodPos[i + 1];
        const oz = origHoodPos[i + 2];

        const centerDist = Math.max(0, 1 - Math.abs(ox) / (width * 0.45));
        const buckleY = Math.sin((oz / hHalfLen + 1) * Math.PI * 0.5) * 0.16 * d * centerDist;
        const crushZ = oz > 0 ? (oz / hHalfLen) * 0.14 * d : 0;

        hArr[i] = ox + (Math.sin(oz * 8) * 0.03) * d;
        hArr[i + 1] = oy + buckleY;
        hArr[i + 2] = oz - crushZ;
      }
      hPos.needsUpdate = true;
      hoodGeo.computeVertexNormals();

      // 3. Shift Hood Object (popped hood & twisted panel gaps)
      hood.position.z = initHoodPos.z - d * 0.16;
      hood.position.y = initHoodPos.y + d * 0.06;
      hood.rotation.x = initHoodRot.x + d * 0.22;
      hood.rotation.z = initHoodRot.z + d * 0.04;

      // 4. Pushbar / Splitter Impact Deformation
      if (pushbarMesh) {
        pushbarMesh.position.z = length * 0.52 - d * 0.22;
        pushbarMesh.position.y = groundClearance + height * 0.2 - d * 0.04;
        pushbarMesh.rotation.x = -d * 0.18;
        pushbarMesh.rotation.y = d * 0.09;
      }
      if (splitterMesh) {
        splitterMesh.position.z = length * 0.5 - d * 0.16;
        splitterMesh.position.y = groundClearance + 0.05 - d * 0.06;
        splitterMesh.rotation.z = -d * 0.1;
      }

      // 5. Headlight damage & cracking
      const headMatL = headlightL.material as THREE.MeshStandardMaterial;
      const headMatR = headlightR.material as THREE.MeshStandardMaterial;
      if (d > 0.3) {
        headMatL.emissiveIntensity = Math.max(0.05, 2.2 * (1.0 - d * 1.4));
        headlightL.rotation.y = -d * 0.22;
        headlightL.position.z = length * 0.505 - d * 0.12;
      } else {
        headMatL.emissiveIntensity = 2.2;
        headlightL.rotation.y = 0;
        headlightL.position.z = length * 0.505;
      }
      if (d > 0.6) {
        headMatR.emissiveIntensity = Math.max(0.02, 2.2 * (1.0 - d * 1.5));
        headlightR.rotation.y = d * 0.18;
        headlightR.position.z = length * 0.505 - d * 0.1;
      } else {
        headMatR.emissiveIntensity = 2.2;
        headlightR.rotation.y = 0;
        headlightR.position.z = length * 0.505;
      }

      // 6. Taillight Damage
      const tailMatL = taillightL.material as THREE.MeshStandardMaterial;
      if (d > 0.5) {
        tailMatL.emissiveIntensity = Math.max(0.1, 1.8 * (1.0 - d));
        taillightL.rotation.z = d * 0.15;
      }

      // 7. Spoiler Damage (loosened, tilted or dangling)
      if (spoilerMesh) {
        spoilerMesh.rotation.z = -d * 0.35;
        spoilerMesh.rotation.x = d * 0.25;
        spoilerMesh.position.y = (chassis.position.y + height * 0.25 + 0.16) - d * 0.08;
      }

      // 8. Paint Scratches & Dullness
      bodyMat.roughness = THREE.MathUtils.lerp(0.35, 0.85, d);
      bodyMat.metalness = THREE.MathUtils.lerp(0.7, 0.25, d);

      // 9. Radiator Steam & Heavy Engine Smoke
      if (d > 0.25) {
        damageSmokeGroup.visible = true;
        const smokeIntensity = Math.min(1.0, (d - 0.25) / 0.75);
        const nowTime = performance.now() * 0.003;
        for (let p = 0; p < smokePuffs.length; p++) {
          const puff = smokePuffs[p];
          const pMat = puff.material as THREE.MeshBasicMaterial;
          // Smoke turns from white steam to dark thick smoke at high damage
          const smokeDarkness = d > 0.65 ? Math.max(0.15, 0.9 - (d - 0.65) * 2.0) : 0.85;
          pMat.color.setRGB(smokeDarkness, smokeDarkness, smokeDarkness);
          pMat.opacity = smokeIntensity * 0.65;
          puff.position.y = 0.15 + Math.sin(nowTime * 2 + p) * 0.22;
          puff.position.x = (Math.sin(nowTime + p * 1.5) * 0.15);
          puff.scale.setScalar(0.7 + smokeIntensity * 1.2 + Math.sin(nowTime * 1.2 + p * 2) * 0.3);
        }
      } else {
        damageSmokeGroup.visible = false;
      }
    };

    return {
      group: root,
      bodyMesh: chassis,
      wheels,
      neonMesh,
      headlights: [headlightL, headlightR],
      taillights: [taillightL, taillightR],
      policeLights: policeLightsObj,
      updatePoliceLights: updatePoliceLightsFn,
      updateCustomization,
      applyDamageDeformation,
    };
  }
}
