import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as xb from 'xrblocks';
import { sound } from './audio/SoundEffects';
import { CityGenerator } from './city/CityGenerator';
import { DEFAULT_CHALLENGES, DEFAULT_PROFILE, DEFAULT_TRACKS, DEFAULT_VEHICLES } from './data/GameData';
import { CullingManager } from './graphics/CullingManager';
import { DeviceBenchmark, DeviceSpecs } from './graphics/DeviceBenchmark';
import { MultiplayerRoomManager } from './multiplayer/MultiplayerRoom';
import { VehiclePhysics } from './physics/VehiclePhysics';
import { PolicePursuitSystem } from './police/PoliceAI';
import { GameUI } from './ui/GameUI';
import { CharacterProfile, GameDifficulty, GameMode, GraphicsQuality, StoryChapter, TimeOfDay, TrackConfig, VehicleConfig, WeatherType } from './types';
import { VehicleMeshBuilder } from './vehicles/VehicleMesh';

export class OutlawGameScene extends xb.Script {
  // Core Scene Components
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;

  // Subsystems & Optimization
  public culling: CullingManager = new CullingManager();
  public city!: CityGenerator;
  public police!: PolicePursuitSystem;
  public mpManager: MultiplayerRoomManager = new MultiplayerRoomManager();
  public ui!: GameUI;
  public deviceSpecs!: DeviceSpecs;

  // Player Vehicle
  public playerPhysics!: VehiclePhysics;
  public playerVehicleMeshGroup: THREE.Group | null = null;
  public playerWheels: THREE.Group[] = [];
  public playerNeon: THREE.Mesh | null = null;
  public playerDamageDeform?: (damageRatio: number) => void;
  public activeVehicleConfig: VehicleConfig = DEFAULT_VEHICLES[0];
  public activeTrackConfig: TrackConfig = DEFAULT_TRACKS[0];

  // Game Profile & State
  public profile: CharacterProfile = { ...DEFAULT_PROFILE };
  public currentMode: GameMode = 'title';
  public currentStoryChapter?: StoryChapter;
  public storyTimeElapsed: number = 0;
  public challengeTimer: number = 0;
  public freeRoamViolationsCount: number = 0;

  // Camera Chase Variables
  public cameraMode: 'chase' | 'hood' | 'orbit' = 'orbit';
  public cameraOffset: THREE.Vector3 = new THREE.Vector3(0, 3.2, -6.8);
  public cameraLookTarget: THREE.Vector3 = new THREE.Vector3();
  public currentCameraPos: THREE.Vector3 = new THREE.Vector3(0, 6, -10);

  // Time & Loop
  private clock: THREE.Clock = new THREE.Clock();
  private orbitAngle: number = 0;

  // Zero-GC Preallocated Math Helpers
  private static readonly _relVel = new THREE.Vector3();
  private static readonly _hitNormal = new THREE.Vector3();
  private static readonly _targetCamPos = new THREE.Vector3();
  private static readonly _targetLook = new THREE.Vector3();

  init() {
    this.scene = xb.core.scene;
    this.camera = xb.core.camera;
    this.renderer = xb.core.renderer as THREE.WebGLRenderer;

    // Handle Page Visibility to prevent background battery drain & delta spikes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        sound.stopAll();
      } else {
        this.clock.getDelta(); // flush accumulated pause time
      }
    });

    // 1. Hardware Detection & Device Benchmark
    this.deviceSpecs = DeviceBenchmark.detectOptimalSettings();
    const initialQuality = this.deviceSpecs.recommendedQuality;
    this.culling.setQuality(initialQuality);

    // Renderer & Color Pipeline Standards
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.deviceSpecs.isSoftwareGl || initialQuality === 'low'
        ? 1
        : Math.min(window.devicePixelRatio, initialQuality === 'ultra' ? 2 : 1.5)
    );
    this.renderer.shadowMap.enabled = initialQuality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Studio Environment Reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 2. Initialize City Generator with Occlusion & Frustum Culling
    this.city = new CityGenerator(this.scene, this.culling);
    this.police = new PolicePursuitSystem(this.scene);
    this.police.setDifficulty(this.profile.difficulty || 'very_easy');

    // Initial Track & Atmosphere Setup
    this.city.generateTrack(this.activeTrackConfig, initialQuality);
    this.city.applyAtmosphere('night', 'rain', initialQuality);

    // Spawn Player Vehicle
    this.setupPlayerVehicle(this.activeVehicleConfig);

    // Initialize UI with Device Specs
    this.ui = new GameUI(this.profile, this.mpManager);
    this.ui.deviceSpecs = this.deviceSpecs;
    this.ui.quality = initialQuality;
    this.ui.renderTitleScreen();
    this.bindUICallbacks();
  }

  private setupPlayerVehicle(config: VehicleConfig) {
    if (this.playerVehicleMeshGroup) {
      this.scene.remove(this.playerVehicleMeshGroup);
    }

    this.activeVehicleConfig = config;
    const meshData = VehicleMeshBuilder.createVehicleGroup(config, false);
    this.playerVehicleMeshGroup = meshData.group;
    this.playerWheels = meshData.wheels;
    this.playerNeon = meshData.neonMesh;
    this.playerDamageDeform = meshData.applyDamageDeformation;
    this.scene.add(this.playerVehicleMeshGroup);

    const startPos = this.city.waypoints[0]?.position.clone() || new THREE.Vector3(0, 0, 0);
    const startHeading = this.city.waypoints[0]?.heading || 0;

    if (!this.playerPhysics) {
      this.playerPhysics = new VehiclePhysics(config, startPos);
    } else {
      this.playerPhysics.config = config;
      this.playerPhysics.applyUpgrades();
      this.playerPhysics.reset(startPos, startHeading);
    }

    this.playerVehicleMeshGroup.position.copy(startPos);
    this.playerVehicleMeshGroup.rotation.y = startHeading;
  }

  private bindUICallbacks() {
    // Mode Selected
    this.ui.onStartMode = (mode: GameMode, chapter?: StoryChapter, trackId?: string) => {
      this.currentMode = mode;
      this.currentStoryChapter = chapter;
      this.storyTimeElapsed = 0;
      if (chapter?.dialogueMidList) {
        chapter.dialogueMidList.forEach((m) => (m.triggered = false));
      }
      this.cameraMode = 'chase';
      this.challengeTimer = 0;
      this.freeRoamViolationsCount = 0;

      // Select track
      const track = DEFAULT_TRACKS.find((t) => t.id === trackId) || DEFAULT_TRACKS[0];
      this.activeTrackConfig = track;
      this.city.generateTrack(track, this.ui.quality);
      this.city.applyAtmosphere(this.ui.timeOfDay, this.ui.weather, this.ui.quality);

      // Reset Player
      const startWp = this.city.waypoints[0] || { position: new THREE.Vector3(0, 0, 0), heading: 0 };
      this.playerPhysics.reset(startWp.position, startWp.heading);
      this.playerDamageDeform?.(0);

      // Mode-specific police configuration
      if (mode === 'story' && chapter) {
        this.police.setHeat(chapter.initialHeat, startWp.position, this.city.waypoints);
      } else if (mode === 'challenge') {
        this.police.setHeat(4, startWp.position, this.city.waypoints);
      } else if (mode === 'tutorial') {
        this.police.clearAll();
      } else if (mode === 'free_roam') {
        this.police.setHeat(0, startWp.position, this.city.waypoints);
      } else if (mode === 'multiplayer') {
        this.police.setHeat(2, startWp.position, this.city.waypoints);
      } else {
        this.police.setHeat(1, startWp.position, this.city.waypoints);
      }

      sound.ensureRunning();
      sound.playCountdownBeep(true);
    };

    // Settings Changed
    this.ui.onApplySettings = (quality: GraphicsQuality, weather: WeatherType, timeOfDay: TimeOfDay) => {
      this.culling.setQuality(quality);
      this.renderer.setPixelRatio(
        this.deviceSpecs.isSoftwareGl || quality === 'low'
          ? 1
          : Math.min(window.devicePixelRatio, quality === 'ultra' ? 2 : 1.5)
      );
      this.renderer.shadowMap.enabled = quality !== 'low';
      this.city.applyAtmosphere(timeOfDay, weather, quality);
    };

    // Customization / Vehicle Changed
    this.ui.onVehicleChanged = (newVehicle: VehicleConfig) => {
      this.setupPlayerVehicle(newVehicle);
    };

    // Track Changed
    this.ui.onTrackChanged = (track: TrackConfig) => {
      this.activeTrackConfig = track;
      this.city.generateTrack(track, this.ui.quality);
      this.city.applyAtmosphere(this.ui.timeOfDay, this.ui.weather, this.ui.quality);
    };

    // Cloud Save Restored (Google Drive)
    this.ui.onCloudSaveRestored = (saveData) => {
      this.profile = saveData.profile;
      this.police.setDifficulty(this.profile.difficulty || 'very_easy');
      const equippedCar = DEFAULT_VEHICLES.find((v) => v.id === this.profile.selectedCarId) || DEFAULT_VEHICLES[0];
      this.setupPlayerVehicle(equippedCar);
    };

    // Difficulty Changed
    this.ui.onDifficultyChanged = (diff) => {
      this.profile.difficulty = diff;
      this.police.setDifficulty(diff);
    };

    // 3D Cinematic Animation on Purchase / Modifying Car
    this.ui.onPlayCinematicScene = (type, vehicle, detailText) => {
      this.playCinematicAnimation(type, vehicle, detailText);
    };
  }

  // 3D Cinematic Showcase State
  private isCinematicActive: boolean = false;
  private cinematicTime: number = 0;
  private cinematicDuration: number = 4.5;
  private cinematicType: 'purchase' | 'upgrade' | 'paint' | 'neon' = 'purchase';
  private cinematicOverlayEl: HTMLElement | null = null;
  private showcaseSpotlight: THREE.SpotLight | null = null;
  private showcaseParticleGroup: THREE.Group | null = null;

  public playCinematicAnimation(
    type: 'purchase' | 'upgrade' | 'paint' | 'neon',
    vehicle: VehicleConfig,
    detailText: string
  ) {
    this.isCinematicActive = true;
    this.cinematicTime = 0;
    this.cinematicType = type;
    this.cinematicDuration = type === 'purchase' ? 5.2 : 4.0;

    // Reset car position to showroom center
    if (this.playerVehicleMeshGroup) {
      this.playerVehicleMeshGroup.position.set(0, 0, 0);
      this.playerVehicleMeshGroup.rotation.set(0, 0, 0);
    }
    if (this.playerPhysics) {
      this.playerPhysics.reset(new THREE.Vector3(0, 0, 0), 0);
    }

    // Audio effects
    if (type === 'purchase') {
      sound.playSuccessFanfare();
      setTimeout(() => sound.playShowroomRevSound(), 1400);
    } else {
      sound.playWrenchToolSound();
      setTimeout(() => sound.playShowroomRevSound(), 1200);
    }

    // Showroom Spotlight
    if (!this.showcaseSpotlight) {
      this.showcaseSpotlight = new THREE.SpotLight(0x00f0ff, 8, 30, Math.PI / 4, 0.4);
      this.showcaseSpotlight.position.set(0, 9, 0);
      this.showcaseSpotlight.castShadow = true;
      this.scene.add(this.showcaseSpotlight);
    }
    this.showcaseSpotlight.visible = true;
    this.showcaseSpotlight.color.set(type === 'purchase' ? 0xffd60a : 0x00f0ff);

    // Confetti / Sparks particle burst
    if (!this.showcaseParticleGroup) {
      this.showcaseParticleGroup = new THREE.Group();
      const sparkGeo = new THREE.SphereGeometry(0.08, 6, 6);
      const colors = [0xffd60a, 0x00f0ff, 0xff0055, 0x00ff88, 0xffffff];
      for (let i = 0; i < 45; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
        const p = new THREE.Mesh(sparkGeo, mat);
        p.position.set(
          (Math.random() - 0.5) * 6,
          Math.random() * 4,
          (Math.random() - 0.5) * 6
        );
        p.userData = {
          velY: 1.5 + Math.random() * 2.5,
          rotSpeed: (Math.random() - 0.5) * 5,
        };
        this.showcaseParticleGroup.add(p);
      }
      this.scene.add(this.showcaseParticleGroup);
    }
    this.showcaseParticleGroup.visible = true;

    // Overlay with cinematic title & letterbox bars
    if (this.cinematicOverlayEl) this.cinematicOverlayEl.remove();
    this.cinematicOverlayEl = document.createElement('div');
    this.cinematicOverlayEl.className = 'cinematic-3d-overlay';
    this.cinematicOverlayEl.innerHTML = `
      <div class="letterbox-bar letterbox-top"></div>
      <div class="cinematic-title-box">
        <span class="cinematic-badge">${type === 'purchase' ? '🏆 NOVO VEÍCULO NA GARAGEM' : '⚡ PERSONALIZAÇÃO DE ALTA PERFORMANCE'}</span>
        <h1 class="cinematic-car-name">${vehicle.name.toUpperCase()}</h1>
        <p class="cinematic-sub-text">${detailText}</p>
        <div class="cinematic-stats-row">
          <span>Top Speed: <strong>${vehicle.topSpeed} km/h</strong></span>
          <span>Aceleração: <strong>${vehicle.acceleration}</strong></span>
          <span>Handling: <strong>${vehicle.handling}</strong></span>
        </div>
      </div>
      <div class="cinematic-actions-row">
        <button class="cinematic-skip-btn" id="btnEndCinematic">FECHAR ANIMAÇÃO ❯</button>
      </div>
      <div class="letterbox-bar letterbox-bottom"></div>
    `;
    document.body.appendChild(this.cinematicOverlayEl);

    this.cinematicOverlayEl.querySelector('#btnEndCinematic')?.addEventListener('click', () => {
      this.endCinematic();
    });
  }

  private endCinematic() {
    this.isCinematicActive = false;
    if (this.cinematicOverlayEl) {
      this.cinematicOverlayEl.remove();
      this.cinematicOverlayEl = null;
    }
    if (this.showcaseSpotlight) {
      this.showcaseSpotlight.visible = false;
    }
    if (this.showcaseParticleGroup) {
      this.showcaseParticleGroup.visible = false;
    }
    this.ui.renderTitleScreen();
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 3D Cinematic Scene Animation Loop
    if (this.isCinematicActive) {
      this.cinematicTime += dt;
      const progress = this.cinematicTime / this.cinematicDuration;

      // Dynamic cinematic camera sweeps (Slow drone dolly zoom + 360 sweeping orbit)
      const angle = this.cinematicTime * 0.95;
      const camHeight = 1.6 + Math.sin(this.cinematicTime * 1.5) * 0.6;
      const camRadius = 5.8 - Math.sin(progress * Math.PI) * 1.4;

      this.camera.position.set(
        Math.sin(angle) * camRadius,
        camHeight,
        Math.cos(angle) * camRadius
      );
      this.camera.lookAt(0, 0.75, 0);

      // Rotate car gently on the turntable
      if (this.playerVehicleMeshGroup) {
        this.playerVehicleMeshGroup.rotation.y = this.cinematicTime * 0.45;
      }

      // Animate showcase particles
      if (this.showcaseParticleGroup) {
        for (let i = 0; i < this.showcaseParticleGroup.children.length; i++) {
          const p = this.showcaseParticleGroup.children[i];
          p.position.y += p.userData.velY * dt;
          p.rotation.y += p.userData.rotSpeed * dt;
          if (p.position.y > 5.5) p.position.y = 0.2;
        }
      }

      if (this.cinematicTime >= this.cinematicDuration) {
        this.endCinematic();
      }
      return;
    }

    // Title / Menu Orbiting Camera
    if (this.currentMode === 'title') {
      this.orbitAngle += dt * 0.35;
      const radius = 8.5;
      this.camera.position.set(
        Math.sin(this.orbitAngle) * radius,
        3.2 + Math.sin(this.orbitAngle * 2) * 0.4,
        Math.cos(this.orbitAngle) * radius
      );
      this.camera.lookAt(0, 1.2, 0);
      return;
    }

    // Camera Switch Request
    if (this.ui.controls.switchCamera) {
      this.ui.controls.switchCamera = false;
      this.cameraMode = this.cameraMode === 'chase' ? 'hood' : 'chase';
    }

    // Reset Vehicle Request
    if (this.ui.controls.resetVehicle) {
      this.ui.controls.resetVehicle = false;
      const nearestWp = this.findNearestWaypoint(this.playerPhysics.position);
      this.playerPhysics.reset(nearestWp.position, nearestWp.heading);
      this.playerDamageDeform?.(0);
    }

    // 1. Check road elevation (bridges/overpass) & stunt jump ramps
    const groundHeight = this.city.getRoadElevation(this.playerPhysics.position, this.playerPhysics.position.y);
    const rampCheck = this.city.checkJumpRamp(this.playerPhysics.position, this.playerPhysics.speedKmh);

    if (rampCheck.hit && rampCheck.launch) {
      this.playerPhysics.launchRamp(rampCheck.launchSpeedY, rampCheck.pitch);
      sound.playCountdownBeep(true);
      this.ui.showToast('🚀 SALTO ESPORTIVO! +350 PTS');
      this.profile.cash += 350;
      this.playerPhysics.driftScore += 350;
    }

    const targetHeight = rampCheck.hit ? rampCheck.height : groundHeight;
    this.playerPhysics.update(dt, this.ui.controls, targetHeight);

    // Off-road Penalty: 20 pts/s on 'very_easy', scaling up to 70 pts/s on 'professional'
    const isOnRoad = this.city.isPositionOnRoadway(this.playerPhysics.position);
    if (!isOnRoad && !this.isCinematicActive) {
      const penaltyRates: Record<GameDifficulty, number> = {
        very_easy: 20,
        easy: 25,
        amateur: 30,
        normal: 35,
        hard: 45,
        legendary: 55,
        professional: 70,
      };
      const rate = penaltyRates[this.profile.difficulty] || 20;
      const lostPoints = rate * dt;
      this.playerPhysics.driftScore = Math.max(0, this.playerPhysics.driftScore - lostPoints);
      this.ui.showOffroadWarning(rate);
    } else {
      this.ui.hideOffroadWarning();
    }

    // 2. Execute Occlusion & Frustum Culling
    this.culling.update(this.camera, this.playerPhysics.position);

    // 3. Dynamic Story Mid-Chase Dialogues
    if (this.currentMode === 'story' && this.currentStoryChapter?.dialogueMidList) {
      this.storyTimeElapsed += dt;
      for (const mid of this.currentStoryChapter.dialogueMidList) {
        if (!mid.triggered && this.storyTimeElapsed >= mid.triggerSec) {
          mid.triggered = true;
          this.ui.triggerDialogue(mid.lines);
          break;
        }
      }
    }

    // 4. City Environment / Rain update
    this.city.update(dt, this.playerPhysics.position, this.ui.weather);

    // 5. Building Collisions
    const collisionNormal = this.city.checkBuildingCollision(this.playerPhysics.position);
    if (collisionNormal) {
      const impactSpeed = this.playerPhysics.velocity.length();
      if (impactSpeed > 3.0) {
        sound.playCollisionSound(Math.min(1.0, impactSpeed / 30));
        this.playerPhysics.applyCollisionImpulse(collisionNormal, impactSpeed);

        // Infraction in Free Roam -> Triggers police attention!
        if (this.currentMode === 'free_roam' && this.police.heatLevel === 0) {
          this.freeRoamViolationsCount++;
          if (this.freeRoamViolationsCount >= 2) {
            this.police.setHeat(1, this.playerPhysics.position, this.city.waypoints);
          }
        }
      }
    }

    // Speeding violation in Free Roam
    if (this.currentMode === 'free_roam' && this.police.heatLevel === 0 && this.playerPhysics.speedKmh > 140) {
      this.police.setHeat(1, this.playerPhysics.position, this.city.waypoints);
    }

    // 4. Update Police Pursuit System
    const pursuitResult = this.police.update(
      dt,
      this.playerPhysics.position,
      this.playerPhysics.velocity,
      this.playerPhysics.speedKmh,
      this.city.waypoints
    );

    // Check collisions with Police Vehicles
    this.police.cops.forEach((cop, idx) => {
      if (cop.destroyed) return;
      const dist = cop.position.distanceTo(this.playerPhysics.position);
      if (dist < 3.2) {
        // Impact collision without allocations!
        OutlawGameScene._relVel.subVectors(this.playerPhysics.velocity, cop.velocity);
        const impactSpeed = OutlawGameScene._relVel.length();
        if (impactSpeed > 4.0) {
          sound.playCollisionSound(Math.min(1.0, impactSpeed / 25));
          OutlawGameScene._hitNormal.subVectors(this.playerPhysics.position, cop.position).normalize();
          this.playerPhysics.applyCollisionImpulse(OutlawGameScene._hitNormal, impactSpeed * 0.4);

          // Damage Cop!
          const destroyed = this.police.damageCop(idx, impactSpeed * 3.5);
          if (destroyed) {
            this.profile.copsDestroyed++;
            this.profile.cash += 2500;
          }
        }
      }
    });

    // Check collisions with Police Roadblocks (Barricades & Spike Strips)
    const rbCollision = this.police.checkRoadblockCollision(this.playerPhysics.position, 1.8);
    if (rbCollision && rbCollision.hit) {
      if (rbCollision.spikeHit) {
        this.playerPhysics.health = Math.max(0, this.playerPhysics.health - 25);
        this.playerPhysics.velocity.multiplyScalar(0.5);
        this.playerPhysics.speedKmh *= 0.5;
        sound.playCollisionSound(0.85);
        this.ui.showToast('💥 FITA DE PREGOS (SPIKE STRIP)! PNEUS FURADOS (-25% SAÚDE)');
        this.police.smashRoadblock(rbCollision.roadblockIndex);
      } else {
        const impactSpeed = this.playerPhysics.speedKmh;
        if (impactSpeed > 75) {
          // High-speed breach! Smash through the cruisers
          this.police.smashRoadblock(rbCollision.roadblockIndex);
          this.playerPhysics.applyCollisionImpulse(rbCollision.normal, impactSpeed * 0.25);
          this.playerPhysics.health = Math.max(0, this.playerPhysics.health - 12);
          this.profile.cash += 1500;
          this.playerPhysics.driftScore += 1000;
          sound.playSuccessFanfare();
          this.ui.showToast('💥 BARREIRA POLICIAL DESTRUÍDA! +R$ 1.500 (+1000 PTS)');
        } else {
          // Too slow to smash through: bounced back
          this.playerPhysics.applyCollisionImpulse(rbCollision.normal, Math.max(12, impactSpeed * 0.45));
          this.playerPhysics.health = Math.max(0, this.playerPhysics.health - 15);
          sound.playCollisionSound(0.9);
          this.ui.showToast('⚠️ BLOQUEIO POLICIAL! IMPACTO FORTE');
        }
      }
    }

    // 5. Update 3D Mesh Transformations
    if (this.playerVehicleMeshGroup) {
      this.playerVehicleMeshGroup.position.copy(this.playerPhysics.position);
      this.playerVehicleMeshGroup.rotation.y = this.playerPhysics.heading;

      // Chassis Roll and Pitch suspension tilts
      this.playerVehicleMeshGroup.rotation.z = this.playerPhysics.roll;
      this.playerVehicleMeshGroup.rotation.x = this.playerPhysics.pitch;

      // Rotate Wheels
      const wheelRollAngle = (this.playerPhysics.speedKmh / 3.6) * dt * 8;
      this.playerWheels.forEach((wheel, idx) => {
        wheel.rotation.x += wheelRollAngle;
        // Front wheels turn with steer angle
        if (idx === 0 || idx === 1) {
          wheel.rotation.y = this.playerPhysics.steerAngle;
        }
      });

      // Dynamic Lightweight Damage Deformation (100% health = factory fresh, 0% = crumpled)
      const damageRatio = Math.max(0, Math.min(1.0, 1.0 - this.playerPhysics.health / 100));
      this.playerDamageDeform?.(damageRatio);
    }

    // 6. Camera Chase Logic with Exponential Damping (Zero allocations)
    const carHeading = this.playerPhysics.heading;
    const forwardX = Math.sin(carHeading);
    const forwardZ = Math.cos(carHeading);

    if (this.cameraMode === 'chase') {
      const speedDistanceStretch = Math.min(2.5, (this.playerPhysics.speedKmh / 250) * 2.5);
      const camDist = 6.2 + speedDistanceStretch;
      const camHeight = 2.4 + (this.playerPhysics.speedKmh / 250) * 0.8;

      OutlawGameScene._targetCamPos.set(
        this.playerPhysics.position.x - forwardX * camDist,
        this.playerPhysics.position.y + camHeight,
        this.playerPhysics.position.z - forwardZ * camDist
      );

      OutlawGameScene._targetLook.set(
        this.playerPhysics.position.x + forwardX * 4.0,
        this.playerPhysics.position.y + 1.2,
        this.playerPhysics.position.z + forwardZ * 4.0
      );
    } else {
      // Hood Cam
      OutlawGameScene._targetCamPos.set(
        this.playerPhysics.position.x + forwardX * 0.8,
        this.playerPhysics.position.y + 1.35,
        this.playerPhysics.position.z + forwardZ * 0.8
      );
      OutlawGameScene._targetLook.set(
        this.playerPhysics.position.x + forwardX * 25.0,
        this.playerPhysics.position.y + 1.2,
        this.playerPhysics.position.z + forwardZ * 25.0
      );
    }

    // Smoothly damp camera movement
    this.currentCameraPos.lerp(OutlawGameScene._targetCamPos, Math.min(1, dt * 10));
    this.camera.position.copy(this.currentCameraPos);
    this.cameraLookTarget.lerp(OutlawGameScene._targetLook, Math.min(1, dt * 12));
    this.camera.lookAt(this.cameraLookTarget);

    // Dynamic FOV kick on high speeds / nitro
    const targetFOV = 60 + (this.playerPhysics.speedKmh / 280) * 18 + (this.ui.controls.nitro ? 8 : 0);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFOV, 8, dt);
    this.camera.updateProjectionMatrix();

    // 7. Update Audio Synthesizer
    sound.updateContinuousAudio(
      this.playerPhysics.speedKmh,
      this.playerPhysics.rpm,
      this.playerPhysics.driftSlip,
      this.ui.controls.nitro && this.playerPhysics.nitroReserve > 2,
      this.police.heatLevel,
      pursuitResult.closestCopDist
    );

    // 8. Update HUD & Telemetry
    const copPositions = this.police.cops
      .filter((c) => !c.destroyed)
      .map((c) => ({ x: c.position.x, z: c.position.z }));

    this.ui.updateHUD(
      this.playerPhysics.speedKmh,
      this.playerPhysics.gear,
      this.playerPhysics.rpm,
      this.playerPhysics.nitroReserve,
      this.playerPhysics.health,
      this.police.heatLevel,
      pursuitResult.statusText,
      this.playerPhysics.isDrifting,
      this.playerPhysics.driftScore,
      this.playerPhysics.position.x,
      this.playerPhysics.position.z,
      copPositions
    );

    // 9. Multiplayer Telemetry Broadcast
    if (this.currentMode === 'multiplayer') {
      const progress = this.calculateTrackProgress(this.playerPhysics.position);
      this.mpManager.updateLocalTelemetry(this.playerPhysics.speedKmh, progress, 1, 0);
    }

    // 10. Check Win / Loss / Bust conditions
    this.checkGameRules(pursuitResult.busted, pursuitResult.escaped);
  }

  private checkGameRules(isBusted: boolean, isEscaped: boolean) {
    // Health zero = Wrecked
    if (this.playerPhysics.health <= 0) {
      this.playerPhysics.health = 0;
      this.endGameRound('busted', 'VEÍCULO TOTALMENTE DESTRUÍDO', 'Seu carro não aguentou os impactos das viaturas e bateu feio.', 500, 20);
      return;
    }

    if (isBusted) {
      this.endGameRound('busted', 'PRESO PELA POLÍCIA!', 'Você foi cercado e detido pelas viaturas do Capitão Ramos.', 1000, 50);
      return;
    }

    if (isEscaped) {
      if (this.currentMode === 'story' && this.currentStoryChapter) {
        // Unlock next story chapter!
        if (this.profile.storyChapter <= this.currentStoryChapter.id) {
          this.profile.storyChapter++;
        }
        this.profile.totalEscapes++;
        this.endGameRound(
          'victory',
          'MISSÃO CUMPRIDA: FUGA BEM-SUCEDIDA!',
          `Você e Miguel escaparam com maestria do cerco policial!`,
          this.currentStoryChapter.rewardCash,
          this.currentStoryChapter.rewardRep
        );
      } else {
        this.profile.totalEscapes++;
        this.endGameRound(
          'escaped',
          'FUGA BEM-SUCEDIDA!',
          'A polícia perdeu o sinal de rastreamento. Você está livre!',
          12000,
          200
        );
      }
    }
  }

  private endGameRound(type: 'escaped' | 'busted' | 'victory', title: string, desc: string, cash: number, rep: number) {
    this.currentMode = 'title';
    this.police.clearAll();
    sound.stopAll();
    this.ui.showGameResultModal(type, title, desc, cash, rep);
  }

  private findNearestWaypoint(pos: THREE.Vector3) {
    let nearest = this.city.waypoints[0];
    let minD = 9999;
    for (const wp of this.city.waypoints) {
      const d = wp.position.distanceTo(pos);
      if (d < minD) {
        minD = d;
        nearest = wp;
      }
    }
    return nearest || { position: new THREE.Vector3(0, 0, 0), heading: 0 };
  }

  private calculateTrackProgress(pos: THREE.Vector3): number {
    if (this.city.waypoints.length === 0) return 0;
    let closestIdx = 0;
    let minD = 9999;
    for (let i = 0; i < this.city.waypoints.length; i++) {
      const d = this.city.waypoints[i].position.distanceTo(pos);
      if (d < minD) {
        minD = d;
        closestIdx = i;
      }
    }
    return closestIdx / this.city.waypoints.length;
  }
}

// App Entry Point
document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.setAppTitle('Outlaw Velocity: Perseguição Policial 3D');
  options.setAppDescription('Jogo 3D de corrida e perseguição policial com física realista, modo história com Luca & Miguel, carreira, multiplayer e giroscópio.');

  xb.add(new OutlawGameScene());
  xb.init(options);
});
