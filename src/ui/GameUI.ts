import { sound } from '../audio/SoundEffects';
import { DEFAULT_CHALLENGES, DEFAULT_TRACKS, DEFAULT_VEHICLES } from '../data/GameData';
import { DeviceSpecs } from '../graphics/DeviceBenchmark';
import { MultiplayerRoomManager } from '../multiplayer/MultiplayerRoom';
import {
  AuthUserProfile,
  getCurrentUserProfile,
  googleSignIn,
  googleSignOut,
  initAuth,
} from '../services/firebaseAuth';
import { GameSaveData, GoogleDriveSaveService } from '../services/googleDriveSave';
import { GlobalRacerEntry, GoogleSheetsRankingService } from '../services/googleSheetsRanking';
import { STORY_CHAPTERS } from '../story/StoryData';
import {
  CharacterProfile,
  DialogueLine,
  GameDifficulty,
  GameMode,
  GraphicsQuality,
  LeaderboardEntry,
  PlayerControls,
  StoryChapter,
  TimeOfDay,
  TrackConfig,
  VehicleConfig,
  WeatherType,
} from '../types';

export class GameUI {
  public root: HTMLElement;
  public deviceSpecs?: DeviceSpecs;
  public controls: PlayerControls = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitro: false,
    resetVehicle: false,
    switchCamera: false,
  };

  // State
  public currentMode: GameMode = 'title';
  public quality: GraphicsQuality = 'high';
  public weather: WeatherType = 'night' as unknown as WeatherType; // default rainy/night city
  public timeOfDay: TimeOfDay = 'night';
  public gyroActive: boolean = false;
  private gyroPermitted: boolean = false;

  // Google Authentication & Cloud Save State
  public googleUser: AuthUserProfile | null = null;
  public onCloudSaveRestored?: (saveData: GameSaveData) => void;
  private authUnsubscribe?: () => void;

  // Callbacks to main game
  public onStartMode?: (mode: GameMode, chapter?: StoryChapter, trackId?: string) => void;
  public onApplySettings?: (quality: GraphicsQuality, weather: WeatherType, timeOfDay: TimeOfDay) => void;
  public onVehicleChanged?: (vehicle: VehicleConfig) => void;
  public onTrackChanged?: (track: TrackConfig) => void;
  public onPlayCinematicScene?: (type: 'purchase' | 'upgrade' | 'paint' | 'neon', vehicle: VehicleConfig, detailText: string) => void;
  public onDifficultyChanged?: (diff: GameDifficulty) => void;

  // Active dialogue
  private activeDialogueLines: DialogueLine[] = [];
  private dialogueIndex: number = 0;
  private dialogueResolve?: () => void;

  // Cached DOM elements for 60FPS HUD updates
  private cachedHud: {
    speedEl: HTMLElement | null;
    gearEl: HTMLElement | null;
    rpmFill: HTMLElement | null;
    nitroFill: HTMLElement | null;
    healthFill: HTMLElement | null;
    heatStarsEl: HTMLElement | null;
    statusEl: HTMLElement | null;
    driftBadge: HTMLElement | null;
    driftPointsEl: HTMLElement | null;
    minimapCanvas: HTMLCanvasElement | null;
    minimapCtx: CanvasRenderingContext2D | null;
    roomRankingBox: HTMLElement | null;
    roomEntries: HTMLElement | null;
    offroadWarningEl: HTMLElement | null;
    offroadRateEl: HTMLElement | null;
  } | null = null;
  private minimapFrameSkip: number = 0;
  private static readonly STAR_STRINGS = ['☆☆☆☆☆', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★'];

  constructor(
    public profile: CharacterProfile,
    public mpManager: MultiplayerRoomManager
  ) {
    this.root = document.createElement('div');
    this.root.id = 'GameUIRoot';
    this.root.className = 'game-ui-container';
    document.body.appendChild(this.root);

    this.setupKeyboardListeners();
    this.setupGyroscope();

    this.authUnsubscribe = initAuth((_user, _token) => {
      this.googleUser = getCurrentUserProfile();
      if (this.googleUser?.displayName && this.profile.name === 'Piloto Fugitivo') {
        this.profile.name = this.googleUser.displayName;
      }
      if (this.currentMode === 'title') {
        this.renderTitleScreen();
      }
    });

    this.renderTitleScreen();
  }

  // --- Keyboard Handling (WASD / Arrows / Space / Shift) ---
  private setupKeyboardListeners() {
    const keys: Record<string, boolean> = {};

    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.updateKeyboardControls(keys);

      if (e.code === 'KeyC') {
        this.controls.switchCamera = true;
      }
      if (e.code === 'KeyR') {
        this.controls.resetVehicle = true;
      }
      if (e.code === 'KeyM') {
        sound.toggleMute();
      }
    });

    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
      this.updateKeyboardControls(keys);
    });

    window.addEventListener('blur', () => {
      Object.keys(keys).forEach((k) => (keys[k] = false));
      this.controls.throttle = 0;
      this.controls.brake = 0;
      this.controls.steer = 0;
      this.controls.handbrake = false;
      this.controls.nitro = false;
    });
  }

  private updateKeyboardControls(keys: Record<string, boolean>) {
    if (this.currentMode === 'title') return;

    // Throttle & Brake
    const up = keys['KeyW'] || keys['ArrowUp'];
    const down = keys['KeyS'] || keys['ArrowDown'];
    this.controls.throttle = up ? 1 : 0;
    this.controls.brake = down ? 1 : 0;

    // Steer (if not using gyroscope)
    if (!this.gyroActive) {
      const left = keys['KeyA'] || keys['ArrowLeft'];
      const right = keys['KeyD'] || keys['ArrowRight'];
      this.controls.steer = left ? -1 : right ? 1 : 0;
    }

    // Handbrake & Nitro
    this.controls.handbrake = Boolean(keys['Space']);
    this.controls.nitro = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyN']);
  }

  // --- Gyroscope / DeviceOrientation Steering ---
  private setupGyroscope() {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (!this.gyroActive) return;
      // In landscape, beta represents tilt left/right
      const gamma = e.gamma || 0;
      const beta = e.beta || 0;

      // Detect landscape vs portrait
      const isLandscape = Math.abs(window.orientation as number) === 90;
      const steerValue = isLandscape ? -beta / 30 : gamma / 30;

      // Deadzone and clamp
      if (Math.abs(steerValue) < 0.08) {
        this.controls.steer = 0;
      } else {
        this.controls.steer = Math.max(-1, Math.min(1, steerValue * this.profile.gyroSensitivity));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
  }

  public async enableGyroscope(): Promise<boolean> {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    ) {
      try {
        const permission = await (
          DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        this.gyroPermitted = permission === 'granted';
      } catch {
        this.gyroPermitted = false;
      }
    } else {
      this.gyroPermitted = true;
    }

    this.gyroActive = this.gyroPermitted;
    return this.gyroActive;
  }

  // ================= UI RENDERING =================

  public renderTitleScreen() {
    this.currentMode = 'title';
    this.root.innerHTML = `
      <div class="screen-backdrop title-screen">
        <div class="top-auth-bar">
          <div class="profile-pill-top">
            <span class="profile-name">👤 ${this.profile.name} (${this.profile.nickname})</span>
            <span class="profile-cash">💰 R$ ${this.profile.cash.toLocaleString()}</span>
            <span class="profile-rep">⭐ Nível ${this.profile.repLevel}</span>
          </div>

          ${
            this.googleUser
              ? `
            <div class="google-account-pill">
              <img src="${this.googleUser.photoURL || 'https://lh3.googleusercontent.com/a/default-user'}" alt="Avatar" class="google-user-avatar" referrerpolicy="no-referrer" />
              <div class="google-user-info">
                <span class="google-user-name">${this.googleUser.displayName || 'Piloto Google'}</span>
                <span class="google-user-badge">✅ Google Verificado · ☁️ Drive Ativo</span>
              </div>
              <button class="google-signout-btn" id="btnGoogleSignOut" title="Desconectar do Google">Sair</button>
            </div>
          `
              : `
            <div class="google-login-box">
              <button class="gsi-material-button" id="btnGoogleSignIn" type="button">
                <div class="gsi-material-button-state"></div>
                <div class="gsi-material-button-content-wrapper">
                  <div class="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="display: block;">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.79l7.97-6.2z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span class="gsi-material-button-contents">Entrar com Google</span>
                </div>
              </button>
              <span class="google-login-hint">1-Clique: Salva no Drive & Ranking</span>
            </div>
          `
          }
        </div>

        <div class="title-header">
          <div class="badge-tag">3D POLICE PURSUIT RACING</div>
          <h1 class="game-logo">OUTLAW <span>VELOCITY</span></h1>
          <p class="tagline">Perseguição Policial · Física Realista · Modo História com Luca & Miguel</p>
          <div class="device-preset-tag">
            <span>📱 <strong>Gráfico Padrão:</strong> ${this.quality === 'low' ? 'Baixo' : this.quality === 'medium' ? 'Médio' : this.quality === 'high' ? 'Alto' : 'Ultra (Realista)'}</span>
            <span class="preset-tag-desc">(${this.deviceSpecs?.recommendationReason || 'Auto-calibrado para o seu aparelho'})</span>
          </div>
        </div>

        <div class="main-menu-grid">
          <button class="menu-btn primary-btn" id="btnStory">
            <span class="btn-icon">🎬</span>
            <div class="btn-info">
              <span class="btn-title">MODO HISTÓRIA</span>
              <span class="btn-sub">A Carreira de Luca & Miguel com Cutscenes</span>
            </div>
          </button>

          <button class="menu-btn" id="btnCareer">
            <span class="btn-icon">🏆</span>
            <div class="btn-info">
              <span class="btn-title">MODO CARREIRA</span>
              <span class="btn-sub">Crie seu Piloto e Vença Street Racings</span>
            </div>
          </button>

          <button class="menu-btn" id="btnChallenge">
            <span class="btn-icon">⚡</span>
            <div class="btn-info">
              <span class="btn-title">MODO DESAFIO</span>
              <span class="btn-sub">Missões Extremas e Evasão 5 Estrelas</span>
            </div>
          </button>

          <button class="menu-btn" id="btnFreeRoam">
            <span class="btn-icon">🏙️</span>
            <div class="btn-info">
              <span class="btn-title">MODO LIVRE</span>
              <span class="btn-sub">Passeio Livre · Lei Dinâmica da Cidade</span>
            </div>
          </button>

          <button class="menu-btn" id="btnTutorial">
            <span class="btn-icon">🎓</span>
            <div class="btn-info">
              <span class="btn-title">MODO TUTORIAL</span>
              <span class="btn-sub">Aprenda Drift, Nitro e Fuga Policial</span>
            </div>
          </button>

          <button class="menu-btn highlight-btn" id="btnMultiplayer">
            <span class="btn-icon">🌐</span>
            <div class="btn-info">
              <span class="btn-title">MULTIPLAYER ONLINE</span>
              <span class="btn-sub">Salas Privadas com Código de 4 Números</span>
            </div>
          </button>
        </div>

        <div class="bottom-dock-nav">
          <button class="dock-btn" id="btnGarage">🚗 Garagem & Tuning</button>
          <button class="dock-btn cloud-dock-btn" id="btnDriveCloud">☁️ Salvar no Drive</button>
          <button class="dock-btn ranking-dock-btn" id="btnLiveRanking">🏆 Ranking Global</button>
          <button class="dock-btn" id="btnLeaderboard">🏅 Salas Locais</button>
          <button class="dock-btn" id="btnSettings">⚙️ Gráficos & Clima</button>
        </div>
      </div>
    `;

    // Event Bindings
    document.getElementById('btnGoogleSignIn')?.addEventListener('click', async () => {
      try {
        const { user } = await googleSignIn();
        sound.playSuccessFanfare();
        this.googleUser = getCurrentUserProfile();
        if (user.displayName) {
          this.profile.name = user.displayName;
        }
        this.renderTitleScreen();
        this.showToast(`Conectado como ${user.displayName || user.email}! ☁️ Salve seus dados no Drive.`);
      } catch (err: unknown) {
        console.error('Google Sign-In error:', err);
        alert(`Não foi possível conectar com o Google: ${(err as Error).message || err}`);
      }
    });

    document.getElementById('btnGoogleSignOut')?.addEventListener('click', async () => {
      try {
        await googleSignOut();
        this.googleUser = null;
        this.renderTitleScreen();
        this.showToast('Desconectado da conta Google. O jogo continua disponível offline.');
      } catch (err) {
        console.error('Sign out error:', err);
      }
    });

    document.getElementById('btnDriveCloud')?.addEventListener('click', () => this.showDriveCloudSaveModal());
    document.getElementById('btnLiveRanking')?.addEventListener('click', () => this.showLiveRankingModal());
    document.getElementById('btnStory')?.addEventListener('click', () => this.showStoryChaptersModal());
    document.getElementById('btnCareer')?.addEventListener('click', () => this.showCareerModal());
    document.getElementById('btnChallenge')?.addEventListener('click', () => this.showChallengesModal());
    document.getElementById('btnFreeRoam')?.addEventListener('click', () => {
      this.currentMode = 'free_roam';
      this.onStartMode?.('free_roam', undefined, this.profile.selectedTrackId);
      this.renderHUD();
    });
    document.getElementById('btnTutorial')?.addEventListener('click', () => {
      this.currentMode = 'tutorial';
      this.onStartMode?.('tutorial', undefined, 'track_city');
      this.renderHUD();
      this.showTutorialDialogue();
    });
    document.getElementById('btnMultiplayer')?.addEventListener('click', () => this.showMultiplayerModal());
    document.getElementById('btnGarage')?.addEventListener('click', () => this.showGarageModal());
    document.getElementById('btnLeaderboard')?.addEventListener('click', () => this.showLeaderboardModal());
    document.getElementById('btnSettings')?.addEventListener('click', () => this.showSettingsModal());
  }

  // --- Story Chapters Modal ---
  private showStoryChaptersModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card large-modal">
        <div class="modal-header">
          <h2>🎬 MODO HISTÓRIA: A FUGA DE LUCA & MIGUEL</h2>
          <button class="close-modal-btn">&times;</button>
        </div>
        <p class="modal-desc">Acompanhe a trajetória da dupla mais procurada do submundo. Encare perseguições intensas e viaturas de elite comandadas pelo Capitão Ramos.</p>
        <div class="chapters-grid">
          ${STORY_CHAPTERS.map(
            (ch) => `
            <div class="chapter-card ${this.profile.storyChapter >= ch.id ? 'unlocked' : 'locked'}">
              <div class="ch-badge">${ch.id <= this.profile.storyChapter ? 'DESBLOQUEADO' : 'BLOQUEADO'}</div>
              <h3 class="ch-title">${ch.title}</h3>
              <p class="ch-sub">${ch.subtitle}</p>
              <p class="ch-briefing">${ch.briefing}</p>
              <div class="ch-meta">
                <span>⭐ Heat Inicial: ${'★'.repeat(ch.initialHeat)}</span>
                <span>💰 Recompensa: R$ ${ch.rewardCash.toLocaleString()}</span>
              </div>
              <button class="start-ch-btn ${this.profile.storyChapter >= ch.id ? 'btn-active' : 'btn-disabled'}" data-id="${ch.id}">
                ${this.profile.storyChapter >= ch.id ? 'INICIAR MISSÃO' : 'BLOQUEADO'}
              </button>
            </div>
          `
          ).join('')}
        </div>
      </div>
    `;
    this.root.appendChild(modal);

    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelectorAll('.start-ch-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).getAttribute('data-id') || '1');
        if (this.profile.storyChapter >= id) {
          modal.remove();
          const chapter = STORY_CHAPTERS.find((c) => c.id === id);
          if (chapter) {
            this.currentMode = 'story';
            this.onStartMode?.('story', chapter, chapter.trackId);
            this.renderHUD();
            this.triggerDialogue(chapter.dialogueIntro);
          }
        }
      });
    });
  }

  // --- Career Modal ---
  private showCareerModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2>🏆 MODO CARREIRA: SEU PILOTO</h2>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="career-form">
          <div class="form-group">
            <label>Nome do Piloto:</label>
            <input type="text" id="careerName" value="${this.profile.name}" class="text-input" />
          </div>
          <div class="form-group">
            <label>Apelido nas Ruas:</label>
            <input type="text" id="careerNick" value="${this.profile.nickname}" class="text-input" />
          </div>
          <div class="form-group">
            <label>Equipe / Facção:</label>
            <input type="text" id="careerTeam" value="${this.profile.team}" class="text-input" />
          </div>
          <div class="career-stats-box">
            <div><strong>Vitórias em Corridas:</strong> ${this.profile.careerWins}</div>
            <div><strong>Fugas com Sucesso:</strong> ${this.profile.totalEscapes}</div>
            <div><strong>Viaturas Policiais Destruídas:</strong> ${this.profile.copsDestroyed}</div>
            <div><strong>Reputação:</strong> ${this.profile.repPoints} RP (Nível ${this.profile.repLevel})</div>
          </div>
          <div class="modal-actions">
            <button class="primary-btn save-career-btn">SALVAR E CORRER</button>
          </div>
        </div>
      </div>
    `;
    this.root.appendChild(modal);

    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.save-career-btn')?.addEventListener('click', () => {
      this.profile.name = (document.getElementById('careerName') as HTMLInputElement).value || this.profile.name;
      this.profile.nickname = (document.getElementById('careerNick') as HTMLInputElement).value || this.profile.nickname;
      this.profile.team = (document.getElementById('careerTeam') as HTMLInputElement).value || this.profile.team;
      modal.remove();
      this.currentMode = 'career';
      this.onStartMode?.('career', undefined, this.profile.selectedTrackId);
      this.renderHUD();
    });
  }

  // --- Challenges Modal ---
  private showChallengesModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card large-modal">
        <div class="modal-header">
          <h2>⚡ MODO DESAFIO</h2>
          <button class="close-modal-btn">&times;</button>
        </div>
        <p class="modal-desc">Teste suas habilidades extremas de piloto contra a polícia e o relógio para ganhar recompensas épicas.</p>
        <div class="challenges-list">
          ${DEFAULT_CHALLENGES.map(
            (c) => `
            <div class="challenge-row ${c.completed ? 'completed' : ''}">
              <div class="ch-info">
                <h3>${c.title} ${c.completed ? '✅' : ''}</h3>
                <p>${c.description}</p>
              </div>
              <div class="ch-rewards">
                <span>💰 R$ ${c.reward.toLocaleString()}</span>
                <span>⭐ +${c.rewardRep} RP</span>
              </div>
              <button class="play-challenge-btn primary-btn" data-id="${c.id}">JOGAR DESAFIO</button>
            </div>
          `
          ).join('')}
        </div>
      </div>
    `;
    this.root.appendChild(modal);

    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelectorAll('.play-challenge-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).getAttribute('data-id') || '1');
        modal.remove();
        this.currentMode = 'challenge';
        this.onStartMode?.('challenge', undefined, 'track_city');
        this.renderHUD();
      });
    });
  }

  // --- Multiplayer Modal (4-Digit Room Codes) ---
  private showMultiplayerModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2>🌐 MULTIPLAYER: SALAS PRIVADAS</h2>
          <button class="close-modal-btn">&times;</button>
        </div>
        <p class="modal-desc">Crie uma sala privada para receber um código automático de 4 números ou digite o código de um amigo para correrem juntos!</p>
        
        <div class="mp-tabs">
          <div class="mp-box">
            <h3>CRIAR UMA NOVA SALA</h3>
            <p>Gere um código de 4 números aleatório para sua sala:</p>
            <button class="primary-btn" id="btnCreateRoom">CRIAR SALA PRIVADA</button>
          </div>

          <div class="mp-box">
            <h3>ENTRAR EM SALA POR CÓDIGO</h3>
            <p>Digite a sequência de 4 números:</p>
            <div class="code-input-row">
              <input type="text" maxlength="4" placeholder="Ex: 4829" id="roomCodeInput" class="code-input" />
              <button class="primary-btn" id="btnJoinRoom">ENTRAR</button>
            </div>
          </div>
        </div>

        <div id="roomDetailsArea" style="display:none;" class="room-details-area">
          <div class="room-code-badge">CÓDIGO DA SALA: <span id="displayRoomCode">----</span></div>
          <h4>PILOTOS CONECTADOS NA SALA</h4>
          <div id="roomPlayersList" class="players-list-box"></div>
          <button class="primary-btn start-mp-btn" id="btnLaunchMpRace">INICIAR CORRIDA NA SALA</button>
        </div>
      </div>
    `;
    this.root.appendChild(modal);

    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());

    const roomDetailsArea = modal.querySelector('#roomDetailsArea') as HTMLElement;
    const displayRoomCode = modal.querySelector('#displayRoomCode') as HTMLElement;
    const roomPlayersList = modal.querySelector('#roomPlayersList') as HTMLElement;

    const updateRoomUI = () => {
      if (!this.mpManager.currentRoom) return;
      roomDetailsArea.style.display = 'block';
      displayRoomCode.innerText = this.mpManager.currentRoom.code;
      roomPlayersList.innerHTML = this.mpManager.currentRoom.players
        .map(
          (p, idx) => `
        <div class="player-entry">
          <span>#${idx + 1} <strong>${p.name}</strong> ${p.isHost ? '(Líder)' : ''}</span>
          <span>Carro: ${p.carName}</span>
          <span class="status-ready">${p.isReady ? 'PRONTO' : 'AGUARDANDO'}</span>
        </div>
      `
        )
        .join('');
    };

    modal.querySelector('#btnCreateRoom')?.addEventListener('click', () => {
      const activeCar = DEFAULT_VEHICLES.find((v) => v.id === this.profile.selectedCarId) || DEFAULT_VEHICLES[0];
      this.mpManager.createRoom(this.profile.name, activeCar.name, activeCar.color, this.profile.selectedTrackId);
      updateRoomUI();
    });

    modal.querySelector('#btnJoinRoom')?.addEventListener('click', () => {
      const code = (modal.querySelector('#roomCodeInput') as HTMLInputElement).value;
      const activeCar = DEFAULT_VEHICLES.find((v) => v.id === this.profile.selectedCarId) || DEFAULT_VEHICLES[0];
      const res = this.mpManager.joinRoom(code, this.profile.name, activeCar.name, activeCar.color);
      if (res.success) {
        updateRoomUI();
      } else {
        alert(res.error || 'Código de sala inválido.');
      }
    });

    modal.querySelector('#btnLaunchMpRace')?.addEventListener('click', () => {
      modal.remove();
      this.currentMode = 'multiplayer';
      this.onStartMode?.('multiplayer', undefined, this.mpManager.currentRoom?.trackId || 'track_city');
      this.renderHUD();
    });

    this.mpManager.onRoomUpdate = () => updateRoomUI();
  }

  // --- Garage & Customization Modal ---
  private showGarageModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    let selectedVehicle = DEFAULT_VEHICLES.find((v) => v.id === this.profile.selectedCarId) || DEFAULT_VEHICLES[0];

    const renderGarageContent = () => {
      modal.innerHTML = `
        <div class="modal-card extra-large-modal">
          <div class="modal-header">
            <h2>🚗 GARAGEM & PERSONALIZAÇÃO DE CARRO</h2>
            <button class="close-modal-btn">&times;</button>
          </div>
          <div class="garage-layout">
            <div class="vehicle-picker-col">
              <h3>MODELOS DE CARROS</h3>
              <div class="cars-scroller">
                ${DEFAULT_VEHICLES.map(
                  (v) => `
                  <div class="car-card-select ${v.id === selectedVehicle.id ? 'selected' : ''}" data-id="${v.id}">
                    <h4>${v.name}</h4>
                    <p>Cat: ${v.category.toUpperCase()} | Top: ${v.topSpeed} km/h</p>
                    <span class="price-tag">${v.unlocked ? 'ADQUIRIDO' : `R$ ${v.price.toLocaleString()}`}</span>
                  </div>
                `
                ).join('')}
              </div>
            </div>

            <div class="vehicle-tuning-col">
              <h3>CUSTOMIZAÇÃO: ${selectedVehicle.name}</h3>
              
              <div class="tuning-section">
                <label>Cor da Pintura:</label>
                <div class="color-swatches">
                  ${['#e63946', '#00f0ff', '#ffd60a', '#9d4edd', '#2b2d42', '#ffffff', '#00ff88', '#ff0055']
                    .map(
                      (c) => `
                    <div class="color-dot ${selectedVehicle.color === c ? 'active' : ''}" style="background:${c};" data-color="${c}"></div>
                  `
                    )
                    .join('')}
                </div>
              </div>

              <div class="tuning-section">
                <label>Luz Neon Sub-carro (Underglow):</label>
                <div class="toggle-row">
                  <button class="toggle-btn ${selectedVehicle.neonEnabled ? 'active' : ''}" id="toggleNeon">
                    ${selectedVehicle.neonEnabled ? 'NEON: LIGADO' : 'NEON: DESLIGADO'}
                  </button>
                  <div class="color-swatches">
                    ${['#00f0ff', '#ff0055', '#ffd60a', '#00ff88', '#aa00ff']
                      .map(
                        (c) => `
                      <div class="neon-dot ${selectedVehicle.neonColor === c ? 'active' : ''}" style="background:${c};" data-neon="${c}"></div>
                    `
                      )
                      .join('')}
                  </div>
                </div>
              </div>

              <div class="tuning-section">
                <label>Aerofólio Traseiro (Spoiler):</label>
                <div class="spoilers-row">
                  ${['Sem Aerofólio', 'Sport Wing', 'GT Carbon Wing', 'Drag Wing']
                    .map(
                      (name, idx) => `
                    <button class="option-btn ${selectedVehicle.spoilerStyle === idx ? 'active' : ''}" data-spoiler="${idx}">${name}</button>
                  `
                    )
                    .join('')}
                </div>
              </div>

              <div class="tuning-section">
                <label>Upgrades Mecânicos (Nível Máximo 5):</label>
                <div class="upgrades-grid">
                  <div class="upgrade-item">
                    <span>Motor Turbo (Nível ${selectedVehicle.levelEngine})</span>
                    <button class="upgrade-btn" data-upgrade="engine">MELHORAR (R$ 8.000)</button>
                  </div>
                  <div class="upgrade-item">
                    <span>Suspensão & Grip (Nível ${selectedVehicle.levelHandling})</span>
                    <button class="upgrade-btn" data-upgrade="handling">MELHORAR (R$ 6.500)</button>
                  </div>
                  <div class="upgrade-item">
                    <span>Blindagem / Carroceria (Nível ${selectedVehicle.levelArmor})</span>
                    <button class="upgrade-btn" data-upgrade="armor">MELHORAR (R$ 7.000)</button>
                  </div>
                </div>
              </div>

              <div class="garage-footer-actions">
                ${
                  selectedVehicle.unlocked
                    ? `<button class="primary-btn equip-car-btn">EQUIPAR ESTE CARRO</button>`
                    : `<button class="primary-btn buy-car-btn">COMPRAR POR R$ ${selectedVehicle.price.toLocaleString()}</button>`
                }
              </div>
            </div>
          </div>
        </div>
      `;

      // Bindings
      modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());

      modal.querySelectorAll('.car-card-select').forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-id');
          selectedVehicle = DEFAULT_VEHICLES.find((v) => v.id === id) || selectedVehicle;
          renderGarageContent();
        });
      });

      modal.querySelectorAll('.color-dot').forEach((el) => {
        el.addEventListener('click', () => {
          selectedVehicle.color = el.getAttribute('data-color') || selectedVehicle.color;
          this.onVehicleChanged?.(selectedVehicle);
          renderGarageContent();
        });
      });

      modal.querySelectorAll('.neon-dot').forEach((el) => {
        el.addEventListener('click', () => {
          selectedVehicle.neonColor = el.getAttribute('data-neon') || selectedVehicle.neonColor;
          this.onVehicleChanged?.(selectedVehicle);
          renderGarageContent();
        });
      });

      modal.querySelector('#toggleNeon')?.addEventListener('click', () => {
        selectedVehicle.neonEnabled = !selectedVehicle.neonEnabled;
        this.onVehicleChanged?.(selectedVehicle);
        renderGarageContent();
      });

      modal.querySelectorAll('.option-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedVehicle.spoilerStyle = parseInt(btn.getAttribute('data-spoiler') || '0');
          this.onVehicleChanged?.(selectedVehicle);
          renderGarageContent();
        });
      });

      modal.querySelectorAll('.upgrade-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-upgrade');
          if (this.profile.cash >= 7000) {
            this.profile.cash -= 7000;
            let upgradeName = 'Upgrade Mecânico';
            if (type === 'engine' && selectedVehicle.levelEngine < 5) {
              selectedVehicle.levelEngine++;
              upgradeName = `Motor Turbo Nível ${selectedVehicle.levelEngine}`;
            }
            if (type === 'handling' && selectedVehicle.levelHandling < 5) {
              selectedVehicle.levelHandling++;
              upgradeName = `Suspensão & Pneus Nível ${selectedVehicle.levelHandling}`;
            }
            if (type === 'armor' && selectedVehicle.levelArmor < 5) {
              selectedVehicle.levelArmor++;
              upgradeName = `Blindagem Nível ${selectedVehicle.levelArmor}`;
            }
            this.onVehicleChanged?.(selectedVehicle);
            modal.remove();
            this.onPlayCinematicScene?.('upgrade', selectedVehicle, upgradeName);
          } else {
            alert('Dinheiro insuficiente para realizar este upgrade!');
          }
        });
      });

      modal.querySelector('.equip-car-btn')?.addEventListener('click', () => {
        this.profile.selectedCarId = selectedVehicle.id;
        this.onVehicleChanged?.(selectedVehicle);
        modal.remove();
        this.renderTitleScreen();
      });

      modal.querySelector('.buy-car-btn')?.addEventListener('click', () => {
        if (this.profile.cash >= selectedVehicle.price) {
          this.profile.cash -= selectedVehicle.price;
          selectedVehicle.unlocked = true;
          this.profile.selectedCarId = selectedVehicle.id;
          this.onVehicleChanged?.(selectedVehicle);
          modal.remove();
          this.onPlayCinematicScene?.('purchase', selectedVehicle, `Novo Carro Adquirido: ${selectedVehicle.name}`);
        } else {
          alert('Dinheiro insuficiente para comprar este veículo!');
        }
      });
    };

    this.root.appendChild(modal);
    renderGarageContent();
  }

  // --- Leaderboards Modal (Global & Local Room) ---
  private showLeaderboardModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    const globalBoard = MultiplayerRoomManager.getGlobalLeaderboard();

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2>🏅 SALAS MULTIPLAYER & RANKING LOCAL</h2>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="leaderboard-tabs">
          <h3>SESSÕES RECENTES E SALAS LOCAIS</h3>
          <div class="leaderboard-table-wrap">
            <table class="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Piloto</th>
                  <th>Carro</th>
                  <th>Pista</th>
                  <th>Tempo / Pontos</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                ${globalBoard
                  .map(
                    (entry) => `
                  <tr>
                    <td>${entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}</td>
                    <td><strong>${entry.pilotName}</strong></td>
                    <td>${entry.car}</td>
                    <td>${entry.track}</td>
                    <td>${entry.scoreOrTime}</td>
                    <td>${entry.date}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    this.root.appendChild(modal);
    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
  }

  // --- Google Drive Cloud Save Modal ---
  public showDriveCloudSaveModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    const renderContent = async () => {
      if (!this.googleUser) {
        modal.innerHTML = `
          <div class="modal-card">
            <div class="modal-header">
              <h2>☁️ SALVAR NA NUVEM · GOOGLE DRIVE</h2>
              <button class="close-modal-btn">&times;</button>
            </div>
            <div class="cloud-auth-prompt">
              <div class="cloud-hero-icon">🔒</div>
              <h3>CONECTE SUA CONTA GOOGLE (1-CLIQUE)</h3>
              <p class="modal-desc">
                Substituímos o cadastro manual por autenticação segura do Google. Conecte sua conta para salvar suas moedas, carros tunados e capítulos da história diretamente no seu <strong>Google Drive</strong> e competir no ranking do <strong>Google Sheets</strong>.
              </p>
              <div class="cloud-benefits-grid">
                <div class="benefit-item">
                  <span class="benefit-icon">☁️</span>
                  <div>
                    <strong>Backup Seguro no Drive</strong>
                    <p>O jogo grava apenas seu arquivo de save <code>outlaw_velocity_cloud_save.json</code> na pasta privada do app.</p>
                  </div>
                </div>
                <div class="benefit-item">
                  <span class="benefit-icon">📱</span>
                  <div>
                    <strong>Jogue em Qualquer Lugar</strong>
                    <p>Acesse seu progresso em qualquer celular ou PC com seu login Google.</p>
                  </div>
                </div>
                <div class="benefit-item">
                  <span class="benefit-icon">📊</span>
                  <div>
                    <strong>Ranking Global em Tempo Real</strong>
                    <p>Participe do ranking mundial transmitido via Google Sheets API com selo de piloto verificado.</p>
                  </div>
                </div>
              </div>
              <div class="cloud-login-action">
                <button class="gsi-material-button large-google-btn" id="btnModalGoogleLogin" type="button">
                  <div class="gsi-material-button-state"></div>
                  <div class="gsi-material-button-content-wrapper">
                    <div class="gsi-material-button-icon">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="display: block;">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.79l7.97-6.2z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span class="gsi-material-button-contents">Conectar com Google e Ativar Nuvem</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        `;
        modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#btnModalGoogleLogin')?.addEventListener('click', async () => {
          try {
            const { user } = await googleSignIn();
            sound.playSuccessFanfare();
            this.googleUser = getCurrentUserProfile();
            if (user.displayName) this.profile.name = user.displayName;
            this.showToast(`Conectado com sucesso como ${user.displayName || user.email}!`);
            renderContent();
            this.renderTitleScreen();
          } catch (err) {
            alert(`Falha no login Google: ${(err as Error).message || err}`);
          }
        });
        return;
      }

      // Logged in user: Show Drive Cloud Save Hub
      modal.innerHTML = `
        <div class="modal-card large-modal">
          <div class="modal-header">
            <h2>☁️ PAINEL DE SINCRONIZAÇÃO · GOOGLE DRIVE</h2>
            <button class="close-modal-btn">&times;</button>
          </div>
          
          <div class="cloud-user-header">
            <img src="${this.googleUser.photoURL || 'https://lh3.googleusercontent.com/a/default-user'}" alt="Avatar" class="cloud-user-pic" referrerpolicy="no-referrer" />
            <div class="cloud-user-details">
              <h3>${this.googleUser.displayName || 'Piloto Google'}</h3>
              <p>${this.googleUser.email || 'Conta Google'} · <span class="text-neon-cyan">Sessão Segura Google Auth</span></p>
            </div>
            <button class="small-btn-secondary" id="btnModalDisconnect">Trocar Conta</button>
          </div>

          <div class="cloud-sync-status-grid">
            <div class="sync-card">
              <h4>📱 PROGRESSO LOCAL ATUAL</h4>
              <ul class="sync-info-list">
                <li><span>Piloto:</span> <strong>${this.profile.name} (${this.profile.nickname})</strong></li>
                <li><span>Dinheiro Disponível:</span> <strong>R$ ${this.profile.cash.toLocaleString()}</strong></li>
                <li><span>Reputação:</span> <strong>Nível ${this.profile.repLevel} (${this.profile.repPoints} pts)</strong></li>
                <li><span>Capítulo da História:</span> <strong>Capítulo ${this.profile.storyChapter}</strong></li>
                <li><span>Garagem:</span> <strong>${DEFAULT_VEHICLES.filter((v) => v.unlocked).length} de ${DEFAULT_VEHICLES.length} carros desbloqueados</strong></li>
              </ul>
            </div>

            <div class="sync-card" id="driveCloudStatusCard">
              <h4>☁️ BACKUP NO GOOGLE DRIVE</h4>
              <div id="driveFileLoading" class="drive-loading-state">
                <span class="mini-spinner"></span> Consultando Google Drive...
              </div>
              <div id="driveFileDetails" style="display:none;"></div>
            </div>
          </div>

          <div class="cloud-actions-row">
            <button class="primary-btn cloud-action-btn" id="btnSaveToCloud">
              💾 SALVAR PROGRESSO NO GOOGLE DRIVE
            </button>
            <button class="secondary-btn cloud-action-btn" id="btnLoadFromCloud">
              📥 CARREGAR DO GOOGLE DRIVE
            </button>
          </div>
        </div>
      `;

      modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
      modal.querySelector('#btnModalDisconnect')?.addEventListener('click', async () => {
        await googleSignOut();
        this.googleUser = null;
        this.renderTitleScreen();
        renderContent();
      });

      // Query Drive File in background
      try {
        const fileInfo = await GoogleDriveSaveService.findSaveFile();
        const loadingEl = modal.querySelector('#driveFileLoading') as HTMLElement;
        const detailsEl = modal.querySelector('#driveFileDetails') as HTMLElement;
        if (loadingEl && detailsEl) {
          loadingEl.style.display = 'none';
          detailsEl.style.display = 'block';
          if (fileInfo) {
            const dateStr = fileInfo.modifiedTime
              ? new Date(fileInfo.modifiedTime).toLocaleString('pt-BR')
              : 'Recentemente';
            detailsEl.innerHTML = `
              <div class="cloud-file-found">
                <span class="file-status-badge">✅ BACKUP ENCONTRADO</span>
                <p><strong>Arquivo:</strong> <code>${fileInfo.name}</code></p>
                <p><strong>Última Sincronização:</strong> ${dateStr}</p>
                <p><strong>ID Drive:</strong> <code>${fileInfo.id.slice(0, 12)}...</code></p>
                <span class="cloud-ready-badge">Disponível para restaurar a qualquer momento</span>
              </div>
            `;
          } else {
            detailsEl.innerHTML = `
              <div class="cloud-file-empty">
                <span class="file-status-badge badge-warning">ℹ️ NENHUM BACKUP AINDA</span>
                <p>Ainda não há save gravado no seu Google Drive.</p>
                <p>Clique em <strong>"Salvar Progresso no Google Drive"</strong> para criar sua primeira cópia segura.</p>
              </div>
            `;
          }
        }
      } catch (err) {
        const loadingEl = modal.querySelector('#driveFileLoading') as HTMLElement;
        if (loadingEl) {
          loadingEl.innerHTML = `⚠️ Não foi possível verificar o Drive: ${(err as Error).message || err}`;
        }
      }

      // Save Action with Mandatory User Confirmation
      modal.querySelector('#btnSaveToCloud')?.addEventListener('click', () => {
        this.showConfirmationModal(
          '💾 Salvar no Google Drive',
          `Deseja salvar seu progresso atual no Google Drive da conta <strong>${this.googleUser?.email || ''}</strong>?<br><br>Isso atualizará o arquivo <code>outlaw_velocity_cloud_save.json</code> com seu saldo atual de R$ ${this.profile.cash.toLocaleString()}, veículos desbloqueados e conquistas.`,
          async () => {
            try {
              const saveBtn = modal.querySelector('#btnSaveToCloud') as HTMLButtonElement;
              if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Enviando ao Drive...';
              }
              const result = await GoogleDriveSaveService.saveToDrive(
                this.profile,
                DEFAULT_VEHICLES,
                DEFAULT_TRACKS,
                DEFAULT_CHALLENGES,
                this.googleUser?.email || null
              );
              sound.playSuccessFanfare();
              this.showToast(`✅ Progresso salvo no Google Drive! (ID: ${result.fileId.slice(0, 8)}...)`);
              renderContent();
            } catch (err) {
              alert(`Erro ao salvar no Drive: ${(err as Error).message || err}`);
              renderContent();
            }
          }
        );
      });

      // Load Action with Mandatory User Confirmation
      modal.querySelector('#btnLoadFromCloud')?.addEventListener('click', () => {
        this.showConfirmationModal(
          '📥 Carregar do Google Drive',
          '<strong>Atenção:</strong> Restaurar o save do Google Drive substituirá os dados locais atuais (dinheiro, carros equipados e capítulos) pelo backup da nuvem.<br><br>Deseja continuar?',
          async () => {
            try {
              const loadBtn = modal.querySelector('#btnLoadFromCloud') as HTMLButtonElement;
              if (loadBtn) {
                loadBtn.disabled = true;
                loadBtn.textContent = 'Baixando do Drive...';
              }
              const data = await GoogleDriveSaveService.loadFromDrive();
              this.profile = data.profile;
              // Synchronize default vehicles if present in save
              if (data.vehicles && data.vehicles.length > 0) {
                data.vehicles.forEach((savedV) => {
                  const localV = DEFAULT_VEHICLES.find((v) => v.id === savedV.id);
                  if (localV) {
                    Object.assign(localV, savedV);
                  }
                });
              }
              if (data.tracks && data.tracks.length > 0) {
                data.tracks.forEach((savedT) => {
                  const localT = DEFAULT_TRACKS.find((t) => t.id === savedT.id);
                  if (localT) Object.assign(localT, savedT);
                });
              }
              if (data.challenges && data.challenges.length > 0) {
                data.challenges.forEach((savedC) => {
                  const localC = DEFAULT_CHALLENGES.find((c) => c.id === savedC.id);
                  if (localC) Object.assign(localC, savedC);
                });
              }

              this.onCloudSaveRestored?.(data);
              sound.playSuccessFanfare();
              modal.remove();
              this.renderTitleScreen();
              this.showToast('✅ Progresso restaurado do Google Drive com sucesso!');
            } catch (err) {
              alert(`Erro ao carregar do Drive: ${(err as Error).message || err}`);
              renderContent();
            }
          }
        );
      });
    };

    this.root.appendChild(modal);
    renderContent();
  }

  // --- Live Google Sheets Leaderboard Modal ---
  public showLiveRankingModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    const renderRanking = async () => {
      const activeCar = DEFAULT_VEHICLES.find((v) => v.id === this.profile.selectedCarId) || DEFAULT_VEHICLES[0];
      modal.innerHTML = `
        <div class="modal-card extra-large-modal">
          <div class="modal-header">
            <h2>🏆 RANKING GLOBAL AO VIVO · GOOGLE SHEETS</h2>
            <button class="close-modal-btn">&times;</button>
          </div>
          
          <div class="ranking-header-bar">
            <div>
              <p class="modal-desc">
                Placar mundial sincronizado via <strong>Google Sheets API</strong> e <strong>Google Auth</strong>. Ganhe pontos de reputação vencendo perseguições e Street Racings para subir no ranking.
              </p>
              ${
                this.googleUser
                  ? `<span class="ranking-auth-badge">✅ Conectado como <strong>${this.googleUser.displayName}</strong> (${this.googleUser.email})</span>`
                  : `<span class="ranking-auth-badge badge-warning">ℹ️ Modo Convidado. Conecte com o Google para registrar seu nome e avatar oficial.</span>`
              }
            </div>
            <button class="primary-btn" id="btnRefreshRanking">🔄 Atualizar Placar</button>
          </div>

          <div class="leaderboard-table-wrap">
            <div id="rankingLoading" class="drive-loading-state">
              <span class="mini-spinner"></span> Carregando placar global ao vivo...
            </div>
            <table class="leaderboard-table" id="liveRankingTable" style="display:none;">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Piloto</th>
                  <th>País</th>
                  <th>Carro Favorito</th>
                  <th>Pontos Rep</th>
                  <th>Vel. Máx</th>
                  <th>Viaturas Destruídas</th>
                  <th>Status / Título</th>
                </tr>
              </thead>
              <tbody id="rankingTableBody"></tbody>
            </table>
          </div>

          <div class="ranking-footer-actions">
            <button class="dock-btn" id="btnOpenLocalRooms">📋 Ver Salas Privadas (4 Dígitos)</button>
            ${
              !this.googleUser
                ? `<button class="gsi-material-button" id="btnRankingGoogleLogin">
                    <div class="gsi-material-button-state"></div>
                    <div class="gsi-material-button-content-wrapper">
                      <div class="gsi-material-button-icon">
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="display: block;">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.79l7.97-6.2z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                          <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                      </div>
                      <span class="gsi-material-button-contents">Entrar com Google para Salvar Posição</span>
                    </div>
                  </button>`
                : ''
            }
          </div>
        </div>
      `;

      modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());
      modal.querySelector('#btnRefreshRanking')?.addEventListener('click', () => renderRanking());
      modal.querySelector('#btnOpenLocalRooms')?.addEventListener('click', () => {
        modal.remove();
        this.showLeaderboardModal();
      });
      modal.querySelector('#btnRankingGoogleLogin')?.addEventListener('click', async () => {
        try {
          const { user } = await googleSignIn();
          sound.playSuccessFanfare();
          this.googleUser = getCurrentUserProfile();
          if (user.displayName) this.profile.name = user.displayName;
          this.renderTitleScreen();
          renderRanking();
        } catch (err) {
          alert(`Login Google cancelado: ${(err as Error).message || err}`);
        }
      });

      try {
        const racers = await GoogleSheetsRankingService.fetchLiveRanking(
          this.profile.repPoints,
          this.profile.name,
          activeCar.name,
          activeCar.topSpeed,
          this.profile.copsDestroyed
        );

        const loadingEl = modal.querySelector('#rankingLoading') as HTMLElement;
        const tableEl = modal.querySelector('#liveRankingTable') as HTMLElement;
        const tbody = modal.querySelector('#rankingTableBody') as HTMLElement;

        if (loadingEl && tableEl && tbody) {
          loadingEl.style.display = 'none';
          tableEl.style.display = 'table';
          tbody.innerHTML = racers
            .map((r) => {
              const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`;
              const isMe = r.isCurrentUser;
              return `
                <tr class="${isMe ? 'current-user-row' : ''}">
                  <td class="rank-num">${medal}</td>
                  <td>
                    <div class="pilot-cell">
                      ${
                        r.avatarUrl
                          ? `<img src="${r.avatarUrl}" class="pilot-avatar" referrerpolicy="no-referrer" alt="" />`
                          : `<span class="pilot-avatar-placeholder">👤</span>`
                      }
                      <span class="pilot-cell-name ${isMe ? 'me-name' : ''}">${r.pilotName}</span>
                    </div>
                  </td>
                  <td><span class="country-flag">${r.country}</span></td>
                  <td>${r.carName}</td>
                  <td><strong class="text-neon-cyan">${r.repPoints.toLocaleString()}</strong></td>
                  <td>${r.topSpeedKmh} km/h</td>
                  <td>${r.copsDestroyed} 💥</td>
                  <td><span class="racer-badge-pill">${r.badge}</span></td>
                </tr>
              `;
            })
            .join('');
        }
      } catch (err) {
        const loadingEl = modal.querySelector('#rankingLoading') as HTMLElement;
        if (loadingEl) {
          loadingEl.innerHTML = `⚠️ Erro ao consultar ranking: ${(err as Error).message || err}`;
        }
      }
    };

    this.root.appendChild(modal);
    renderRanking();
  }

  // --- Confirmation Modal with Safe User Confirmation ---
  private showConfirmationModal(title: string, messageHtml: string, onConfirm: () => void) {
    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal-backdrop confirm-backdrop';
    confirmModal.innerHTML = `
      <div class="modal-card confirm-modal-card">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="close-confirm-btn">&times;</button>
        </div>
        <div class="confirm-body">
          <p>${messageHtml}</p>
        </div>
        <div class="confirm-actions">
          <button class="secondary-btn" id="btnCancelConfirm">Cancelar</button>
          <button class="primary-btn" id="btnAcceptConfirm">Confirmar</button>
        </div>
      </div>
    `;

    this.root.appendChild(confirmModal);
    confirmModal.querySelector('.close-confirm-btn')?.addEventListener('click', () => confirmModal.remove());
    confirmModal.querySelector('#btnCancelConfirm')?.addEventListener('click', () => confirmModal.remove());
    confirmModal.querySelector('#btnAcceptConfirm')?.addEventListener('click', () => {
      confirmModal.remove();
      onConfirm();
    });
  }

  // --- Floating Toast Notification ---
  public showToast(message: string) {
    const toast = document.createElement('div');
    toast.className = 'game-toast-notification';
    toast.innerHTML = `<span>${message}</span>`;
    this.root.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 400);
    }, 3800);
  }

  // --- Settings Modal (Graphics, Weather, Time of Day, Gyro, Google Account) ---
  private showSettingsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card large-modal">
        <div class="modal-header">
          <h2>⚙️ CONFIGURAÇÕES DE CONTA, GRÁFICOS & CLIMA</h2>
          <button class="close-modal-btn">&times;</button>
        </div>
        
        <div class="settings-content">
          <!-- Google Account Management Section -->
          <div class="setting-group google-settings-group">
            <div class="device-spec-box google-settings-box">
              <div class="settings-sec-header">
                <h4>👤 GERENCIAMENTO DA CONTA GOOGLE</h4>
                <span class="settings-subdesc">Acesso seguro 1-clique, backup de saves no Drive e ranking no Sheets</span>
              </div>

              ${
                this.googleUser
                  ? `
                <div class="google-settings-connected">
                  <div class="google-settings-user-info">
                    <img src="${this.googleUser.photoURL || 'https://lh3.googleusercontent.com/a/default-user'}" alt="Avatar" class="google-settings-avatar" referrerpolicy="no-referrer" />
                    <div>
                      <h3 class="google-settings-name">${this.googleUser.displayName || 'Piloto Google'}</h3>
                      <p class="google-settings-email">${this.googleUser.email || ''}</p>
                      <div class="google-settings-badge-row">
                        <span class="badge-pill-verified">✅ Google Verificado</span>
                        <span class="badge-pill-drive">☁️ Google Drive Ativo</span>
                      </div>
                    </div>
                  </div>
                  <div class="google-settings-btns">
                    <button class="primary-btn small-btn" id="btnSettingsDriveSync">
                      ☁️ Gerenciar Saves no Drive
                    </button>
                    <button class="secondary-btn small-btn" id="btnSettingsGoogleSignOut">
                      Sair da Conta Google
                    </button>
                  </div>
                </div>
              `
                  : `
                <div class="google-settings-disconnected">
                  <p class="google-login-promo">
                    Sua sessão atual está em <strong>Modo Local Offline</strong>. Conecte sua conta do Google com apenas 1 clique para manter seus carros e moedas salvos no <strong>Google Drive</strong> e competir com sua foto no placar ao vivo.
                  </p>
                  <button class="gsi-material-button large-google-btn" id="btnSettingsGoogleSignIn" type="button">
                    <div class="gsi-material-button-state"></div>
                    <div class="gsi-material-button-content-wrapper">
                      <div class="gsi-material-button-icon">
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="display: block;">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.79l7.97-6.2z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                          <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                      </div>
                      <span class="gsi-material-button-contents">Conectar Conta Google (1-Clique)</span>
                    </div>
                  </button>
                </div>
              `
              }
            </div>
          </div>

          <div class="setting-group">
            <div class="device-spec-box">
              <h4>📱 DIAGNÓSTICO DO SEU APARELHO</h4>
              <p><strong>Dispositivo:</strong> ${this.deviceSpecs?.isMobile ? 'Celular / Tablet Móvel' : 'Computador Desktop'}</p>
              <p><strong>Memória RAM:</strong> ${this.deviceSpecs?.deviceMemoryGb || 4} GB | <strong>CPU:</strong> ${this.deviceSpecs?.cpuCores || 4} núcleos</p>
              <p><strong>GPU Render:</strong> ${this.deviceSpecs?.gpuName || 'Padrão'}</p>
              <p><strong>Diagnóstico:</strong> ${this.deviceSpecs?.recommendationReason || 'Desempenho Otimizado'}</p>
              <button class="primary-btn auto-preset-btn" id="btnRestoreAutoPreset">
                RESTAURAR GRÁFICO PADRÃO RECOMENDADO (${(this.deviceSpecs?.recommendedQuality || 'medium').toUpperCase()})
              </button>
            </div>
          </div>

          <div class="setting-group">
            <label>Nível Gráfico Manual:</label>
            <div class="btn-group">
              ${['low', 'medium', 'high', 'ultra']
                .map(
                  (q) => `
                <button class="setting-choice ${this.quality === q ? 'active' : ''}" data-type="quality" data-val="${q}">
                  ${q === 'low' ? 'Baixo' : q === 'medium' ? 'Médio' : q === 'high' ? 'Alto' : 'Ultra (Realista)'}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="setting-group">
            <label>Clima do Mundo:</label>
            <div class="btn-group">
              ${['sunny', 'rain', 'storm', 'fog']
                .map(
                  (w) => `
                <button class="setting-choice ${this.weather === w ? 'active' : ''}" data-type="weather" data-val="${w}">
                  ${w === 'sunny' ? '☀️ Ensolarado' : w === 'rain' ? '🌧️ Chuva (Asfalto Molhado)' : w === 'storm' ? '⛈️ Tempestade com Raios' : '🌫️ Neblina Densa'}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="setting-group">
            <label>Horário do Dia:</label>
            <div class="btn-group">
              ${['day', 'sunset', 'night', 'midnight']
                .map(
                  (t) => `
                <button class="setting-choice ${this.timeOfDay === t ? 'active' : ''}" data-type="timeOfDay" data-val="${t}">
                  ${t === 'day' ? '☀️ Dia Claro' : t === 'sunset' ? '🌅 Pôr do Sol Dourado' : t === 'night' ? '🌃 Noite Neon' : '🌌 Madrugada'}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="setting-group">
            <label>Dificuldade do Jogo (Intensidade Policial & Penalidade de Pista):</label>
            <div class="btn-group difficulty-btn-group">
              ${[
                { id: 'very_easy', label: 'Muito fácil' },
                { id: 'easy', label: 'Fácil' },
                { id: 'amateur', label: 'Amador' },
                { id: 'normal', label: 'Normal' },
                { id: 'hard', label: 'Difícil' },
                { id: 'legendary', label: 'Lendário' },
                { id: 'professional', label: 'Profissional' },
              ]
                .map(
                  (d) => `
                <button class="setting-choice difficulty-choice ${this.profile.difficulty === d.id ? 'active' : ''}" data-type="difficulty" data-val="${d.id}">
                  ${d.label}
                </button>
              `
                )
                .join('')}
            </div>
            <p class="setting-sub-info">
              ${
                this.profile.difficulty === 'very_easy'
                  ? '🛡️ Muito fácil: Cops mais lentos, evasão rápida, penalidade fora da pista: -20 pts/s.'
                  : this.profile.difficulty === 'easy'
                    ? '🟢 Fácil: Patrulha leve, bloqueios esparsos, penalidade fora da pista: -25 pts/s.'
                    : this.profile.difficulty === 'amateur'
                      ? '🟡 Amador: Cops atentos com manobras de cerco, penalidade fora da pista: -30 pts/s.'
                      : this.profile.difficulty === 'normal'
                        ? '🟠 Normal: Cerco agressivo, barreiras policiais na pista, penalidade: -35 pts/s.'
                        : this.profile.difficulty === 'hard'
                          ? '🔴 Difícil: Cops ultra-rápidos com viaturas pesadas SWAT e barreiras frequentes, penalidade: -45 pts/s.'
                          : this.profile.difficulty === 'legendary'
                            ? '🔥 Lendário: Perseguição brutal, helicóptero e barreiras com spike strip, penalidade: -55 pts/s.'
                            : '⚡ Profissional (Extremo): Perseguição implacável, sem trégua, barreiras duplas e penalidade máxima: -70 pts/s!'
              }
            </p>
          </div>

          <div class="setting-group">
            <label>Modo Giroscópio (Controle por Inclinação):</label>
            <button class="toggle-btn ${this.gyroActive ? 'active' : ''}" id="toggleGyroBtn">
              ${this.gyroActive ? 'GIROSCÓPIO ATIVADO' : 'GIROSCÓPIO DESATIVADO'}
            </button>
          </div>
        </div>
      </div>
    `;
    this.root.appendChild(modal);

    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());

    modal.querySelector('#btnSettingsGoogleSignIn')?.addEventListener('click', async () => {
      try {
        const { user } = await googleSignIn();
        sound.playSuccessFanfare();
        this.googleUser = getCurrentUserProfile();
        if (user.displayName) this.profile.name = user.displayName;
        this.showToast(`Conectado como ${user.displayName || user.email}!`);
        this.renderTitleScreen();
        modal.remove();
        this.showSettingsModal();
      } catch (err) {
        alert(`Falha no login Google: ${(err as Error).message || err}`);
      }
    });

    modal.querySelector('#btnSettingsGoogleSignOut')?.addEventListener('click', async () => {
      try {
        await googleSignOut();
        this.googleUser = null;
        this.showToast('Desconectado da conta Google.');
        this.renderTitleScreen();
        modal.remove();
        this.showSettingsModal();
      } catch (err) {
        console.error('Sign out error:', err);
      }
    });

    modal.querySelector('#btnSettingsDriveSync')?.addEventListener('click', () => {
      modal.remove();
      this.showDriveCloudSaveModal();
    });

    modal.querySelectorAll('.setting-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const val = btn.getAttribute('data-val') as string;
        if (type === 'quality') this.quality = val as GraphicsQuality;
        if (type === 'weather') this.weather = val as WeatherType;
        if (type === 'timeOfDay') this.timeOfDay = val as TimeOfDay;
        if (type === 'difficulty') {
          this.profile.difficulty = val as GameDifficulty;
          this.onDifficultyChanged?.(this.profile.difficulty);
          this.showToast(`Dificuldade alterada para: ${val.replace('_', ' ').toUpperCase()}`);
        }
        this.onApplySettings?.(this.quality, this.weather, this.timeOfDay);
        modal.remove();
        this.showSettingsModal();
      });
    });

    modal.querySelector('#btnRestoreAutoPreset')?.addEventListener('click', () => {
      this.quality = this.deviceSpecs?.recommendedQuality || 'medium';
      this.onApplySettings?.(this.quality, this.weather, this.timeOfDay);
      modal.remove();
      this.showSettingsModal();
    });

    modal.querySelector('#toggleGyroBtn')?.addEventListener('click', async () => {
      if (this.gyroActive) {
        this.gyroActive = false;
      } else {
        await this.enableGyroscope();
      }
      modal.remove();
      this.showSettingsModal();
    });
  }

  // --- Dialogue / Cutscene Presentation ---
  public triggerDialogue(lines: DialogueLine[]): Promise<void> {
    return new Promise((resolve) => {
      this.activeDialogueLines = lines;
      this.dialogueIndex = 0;
      this.dialogueResolve = resolve;
      this.renderDialogueBox();
    });
  }

  private renderDialogueBox() {
    let box = document.getElementById('DialogueBoxOverlay');
    if (!box) {
      box = document.createElement('div');
      box.id = 'DialogueBoxOverlay';
      box.className = 'dialogue-box-overlay';
      this.root.appendChild(box);
    }

    const currentLine = this.activeDialogueLines[this.dialogueIndex];
    if (!currentLine) {
      box.remove();
      this.dialogueResolve?.();
      return;
    }

    sound.playPoliceRadioChirp();

    const portraitEmoji =
      currentLine.portrait === 'luca'
        ? '🏎️'
        : currentLine.portrait === 'miguel'
          ? '🎧'
          : currentLine.portrait === 'cop'
            ? '👮'
            : currentLine.portrait === 'dispatch'
              ? '📻'
              : '🔥';

    box.innerHTML = `
      <div class="dialogue-card">
        <div class="speaker-avatar ${currentLine.radioEffect ? 'radio-static' : ''}">
          <span class="avatar-icon">${portraitEmoji}</span>
        </div>
        <div class="dialogue-content">
          <div class="speaker-header">
            <span class="speaker-name">${currentLine.speaker}</span>
            ${currentLine.radioEffect ? '<span class="radio-tag">RÁDIO POLICIAL</span>' : ''}
          </div>
          <p class="speaker-text">${currentLine.text}</p>
          <div class="dialogue-actions">
            <button class="dialogue-skip-btn" id="btnSkipDialogue">Pular Cena</button>
            <button class="dialogue-next-btn primary-btn" id="btnNextDialogue">Avançar ❯</button>
          </div>
        </div>
      </div>
    `;

    box.querySelector('#btnNextDialogue')?.addEventListener('click', () => {
      this.dialogueIndex++;
      this.renderDialogueBox();
    });

    box.querySelector('#btnSkipDialogue')?.addEventListener('click', () => {
      box?.remove();
      this.dialogueResolve?.();
    });
  }

  private showTutorialDialogue() {
    this.triggerDialogue([
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Bem-vindo ao treinamento de rua, piloto! Eu sou o Miguel, seu copiloto e navegador.',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'No celular, use os pedais à direita para Acelerar e Frear/Ré. À esquerda, vire o carro ou ative o Giroscópio!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'O segredo da curva é o Freio de Mão. Puxe antes de entrar na curva pra jogar a traseira em drift!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Se a polícia aparecer, quebre a linha de visão nas esquinas e use o Nitro na reta pra sumir!',
      },
    ]);
  }

  // --- In-Game HUD & Mobile Touch Controls ---
  public renderHUD() {
    this.root.innerHTML = `
      <div class="hud-overlay">
        <!-- Top Status Cluster -->
        <div class="hud-top-bar">
          <div class="heat-cluster" id="hudHeatCluster">
            <span class="heat-label">PROCURADO:</span>
            <span class="heat-stars" id="hudHeatStars">☆☆☆☆☆</span>
          </div>

          <div class="pursuit-status-badge" id="hudPursuitStatus">PATRULHA DA CIDADE</div>

          <div class="top-quick-actions">
            <button class="hud-icon-btn" id="hudGyroToggle" title="Alternar Giroscópio">📱 GIRO: ${this.gyroActive ? 'ON' : 'OFF'}</button>
            <button class="hud-icon-btn" id="hudCamBtn" title="Mudar Câmera">🎥 CÂMERA</button>
            <button class="hud-icon-btn" id="hudAudioBtn" title="Som">🔊</button>
            <button class="hud-icon-btn" id="hudExitBtn" title="Voltar ao Menu">✕ SAIR</button>
          </div>
        </div>

        <!-- Center Notification Banner -->
        <div class="hud-center-alert" id="hudCenterAlert" style="display:none;"></div>

        <!-- Off-road Score Penalty Indicator -->
        <div class="hud-offroad-warning" id="hudOffroadWarning" style="display:none;">
          <span class="offroad-icon">⚠️</span>
          <div class="offroad-text-block">
            <span class="offroad-title">FORA DA PISTA!</span>
            <span class="offroad-rate" id="hudOffroadRate">-20 PTS/S</span>
          </div>
        </div>

        <!-- Left Minimapa / Room Ranking -->
        <div class="hud-left-panel">
          <div class="minimap-box">
            <canvas id="minimapCanvas" width="130" height="130"></canvas>
          </div>
          <div id="roomRankingBox" class="room-ranking-hud" style="display:none;">
            <h4>SALA LOCAL (${this.mpManager.currentRoom?.code || '----'})</h4>
            <div id="roomRankingEntries"></div>
          </div>
        </div>

        <!-- Right Speedometer & Gauges -->
        <div class="hud-right-panel">
          <div class="speed-cluster">
            <div class="gear-display" id="hudGear">1</div>
            <div class="speed-digits">
              <span class="speed-number" id="hudSpeed">0</span>
              <span class="speed-unit">KM/H</span>
            </div>
            <!-- RPM Bar -->
            <div class="rpm-meter">
              <div class="rpm-fill" id="hudRpmFill" style="width: 20%;"></div>
            </div>
          </div>

          <!-- Nitro & Damage Bars -->
          <div class="meter-bars">
            <div class="meter-row">
              <span class="meter-label">NITRO:</span>
              <div class="meter-track">
                <div class="meter-fill nitro-fill" id="hudNitroFill" style="width: 100%;"></div>
              </div>
            </div>
            <div class="meter-row">
              <span class="meter-label">INTEGRIDADE:</span>
              <div class="meter-track">
                <div class="meter-fill health-fill" id="hudHealthFill" style="width: 100%;"></div>
              </div>
            </div>
          </div>

          <!-- Drift Score Badge -->
          <div class="drift-score-badge" id="hudDriftBadge" style="display:none;">
            DRIFT: <span id="hudDriftPoints">0</span> PTS
          </div>
        </div>

        <!-- Mobile Touch Controls Layout (Responsive on touch devices) -->
        <div class="touch-controls-container">
          <!-- Left Steering Zone -->
          <div class="touch-zone-left">
            <button class="touch-btn steer-btn" id="touchSteerLeft">◀</button>
            <button class="touch-btn steer-btn" id="touchSteerRight">▶</button>
          </div>

          <!-- Right Pedals Zone -->
          <div class="touch-zone-right">
            <button class="touch-btn nitro-touch-btn" id="touchNitro">⚡ NITRO</button>
            <button class="touch-btn handbrake-touch-btn" id="touchHandbrake">🛑 DRIFT</button>
            <button class="touch-btn brake-touch-btn" id="touchBrake">FREIO / RÉ</button>
            <button class="touch-btn gas-touch-btn" id="touchGas">ACELERAR</button>
          </div>
        </div>
      </div>
    `;

    // Event Listeners for Top HUD
    document.getElementById('hudExitBtn')?.addEventListener('click', () => {
      this.mpManager.leaveRoom();
      this.renderTitleScreen();
    });

    document.getElementById('hudCamBtn')?.addEventListener('click', () => {
      this.controls.switchCamera = true;
    });

    document.getElementById('hudAudioBtn')?.addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      const btn = document.getElementById('hudAudioBtn');
      if (btn) btn.innerText = isMuted ? '🔇' : '🔊';
    });

    document.getElementById('hudGyroToggle')?.addEventListener('click', async () => {
      if (this.gyroActive) {
        this.gyroActive = false;
      } else {
        await this.enableGyroscope();
      }
      const btn = document.getElementById('hudGyroToggle');
      if (btn) btn.innerText = `📱 GIRO: ${this.gyroActive ? 'ON' : 'OFF'}`;
    });

    // Touch Pedals Bindings (Passive pointer handlers to prevent scroll/delay)
    const bindTouch = (id: string, onDown: () => void, onUp: () => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(
        'pointerdown',
        (e) => {
          e.preventDefault();
          onDown();
        },
        { passive: false }
      );
      el.addEventListener(
        'pointerup',
        (e) => {
          e.preventDefault();
          onUp();
        },
        { passive: false }
      );
      el.addEventListener(
        'pointerleave',
        (e) => {
          e.preventDefault();
          onUp();
        },
        { passive: false }
      );
    };

    bindTouch(
      'touchSteerLeft',
      () => (this.controls.steer = -1),
      () => {
        if (this.controls.steer === -1) this.controls.steer = 0;
      }
    );
    bindTouch(
      'touchSteerRight',
      () => (this.controls.steer = 1),
      () => {
        if (this.controls.steer === 1) this.controls.steer = 0;
      }
    );
    bindTouch(
      'touchGas',
      () => (this.controls.throttle = 1),
      () => (this.controls.throttle = 0)
    );
    bindTouch(
      'touchBrake',
      () => (this.controls.brake = 1),
      () => (this.controls.brake = 0)
    );
    bindTouch(
      'touchHandbrake',
      () => (this.controls.handbrake = true),
      () => (this.controls.handbrake = false)
    );
    bindTouch(
      'touchNitro',
      () => (this.controls.nitro = true),
      () => (this.controls.nitro = false)
    );

    // Cache HUD DOM queries once on render to avoid 60fps getElementById calls
    const canvas = document.getElementById('minimapCanvas') as HTMLCanvasElement;
    this.cachedHud = {
      speedEl: document.getElementById('hudSpeed'),
      gearEl: document.getElementById('hudGear'),
      rpmFill: document.getElementById('hudRpmFill'),
      nitroFill: document.getElementById('hudNitroFill'),
      healthFill: document.getElementById('hudHealthFill'),
      heatStarsEl: document.getElementById('hudHeatStars'),
      statusEl: document.getElementById('hudPursuitStatus'),
      driftBadge: document.getElementById('hudDriftBadge'),
      driftPointsEl: document.getElementById('hudDriftPoints'),
      minimapCanvas: canvas,
      minimapCtx: canvas ? canvas.getContext('2d') : null,
      roomRankingBox: document.getElementById('roomRankingBox'),
      roomEntries: document.getElementById('roomRankingEntries'),
      offroadWarningEl: document.getElementById('hudOffroadWarning'),
      offroadRateEl: document.getElementById('hudOffroadRate'),
    };
    this.minimapFrameSkip = 0;
  }

  public showOffroadWarning(ratePerSec: number) {
    if (this.currentMode === 'title') return;
    const warnEl = this.cachedHud?.offroadWarningEl || document.getElementById('hudOffroadWarning');
    const rateEl = this.cachedHud?.offroadRateEl || document.getElementById('hudOffroadRate');
    if (warnEl) {
      warnEl.style.display = 'flex';
    }
    if (rateEl) {
      rateEl.innerText = `-${ratePerSec} PTS/S`;
    }
  }

  public hideOffroadWarning() {
    const warnEl = this.cachedHud?.offroadWarningEl || document.getElementById('hudOffroadWarning');
    if (warnEl && warnEl.style.display !== 'none') {
      warnEl.style.display = 'none';
    }
  }

  // --- Real-Time HUD Update per Frame (Zero DOM thrashing & throttled radar) ---
  public updateHUD(
    speedKmh: number,
    gear: number,
    rpm: number,
    nitro: number,
    health: number,
    heatLevel: number,
    pursuitStatus: string,
    isDrifting: boolean,
    driftPoints: number,
    playerX: number,
    playerZ: number,
    copPositions: { x: number; z: number }[]
  ) {
    if (this.currentMode === 'title') return;

    if (!this.cachedHud) {
      const canvas = document.getElementById('minimapCanvas') as HTMLCanvasElement;
      this.cachedHud = {
        speedEl: document.getElementById('hudSpeed'),
        gearEl: document.getElementById('hudGear'),
        rpmFill: document.getElementById('hudRpmFill'),
        nitroFill: document.getElementById('hudNitroFill'),
        healthFill: document.getElementById('hudHealthFill'),
        heatStarsEl: document.getElementById('hudHeatStars'),
        statusEl: document.getElementById('hudPursuitStatus'),
        driftBadge: document.getElementById('hudDriftBadge'),
        driftPointsEl: document.getElementById('hudDriftPoints'),
        minimapCanvas: canvas,
        minimapCtx: canvas ? canvas.getContext('2d') : null,
        roomRankingBox: document.getElementById('roomRankingBox'),
        roomEntries: document.getElementById('roomRankingEntries'),
        offroadWarningEl: document.getElementById('hudOffroadWarning'),
        offroadRateEl: document.getElementById('hudOffroadRate'),
      };
    }

    const hud = this.cachedHud;

    // 1. Speed & Gauges
    if (hud.speedEl) hud.speedEl.innerText = speedKmh.toString();
    if (hud.gearEl) hud.gearEl.innerText = gear.toString();
    if (hud.rpmFill) hud.rpmFill.style.width = `${Math.min(100, Math.round(rpm * 100))}%`;
    if (hud.nitroFill) hud.nitroFill.style.width = `${Math.min(100, Math.round(nitro))}%`;
    if (hud.healthFill) hud.healthFill.style.width = `${Math.min(100, Math.round(health))}%`;

    // 2. Heat Stars (Pre-built lookup table)
    if (hud.heatStarsEl) {
      const clampedHeat = Math.max(0, Math.min(5, heatLevel));
      hud.heatStarsEl.innerText = GameUI.STAR_STRINGS[clampedHeat];
      hud.heatStarsEl.style.color = clampedHeat > 0 ? '#ff0055' : '#888888';
    }

    // 3. Pursuit Status
    if (hud.statusEl) {
      hud.statusEl.innerText = pursuitStatus;
      if (pursuitStatus.includes('EVADINDO')) {
        hud.statusEl.className = 'pursuit-status-badge evading';
      } else if (pursuitStatus.includes('PRESO')) {
        hud.statusEl.className = 'pursuit-status-badge busted';
      } else if (heatLevel > 0) {
        hud.statusEl.className = 'pursuit-status-badge active-chase';
      } else {
        hud.statusEl.className = 'pursuit-status-badge';
      }
    }

    // 4. Drift Badge
    if (hud.driftBadge && hud.driftPointsEl) {
      if (isDrifting && driftPoints > 0) {
        hud.driftBadge.style.display = 'block';
        hud.driftPointsEl.innerText = driftPoints.toLocaleString();
      } else {
        hud.driftBadge.style.display = 'none';
      }
    }

    // 5. Minimap Radar Drawing (Throttled to run at ~20Hz instead of 60Hz to save CPU)
    this.minimapFrameSkip = (this.minimapFrameSkip + 1) % 3;
    if (this.minimapFrameSkip === 0 && hud.minimapCtx) {
      const ctx = hud.minimapCtx;
      ctx.clearRect(0, 0, 130, 130);
      ctx.fillStyle = 'rgba(10, 15, 24, 0.75)';
      ctx.beginPath();
      ctx.arc(65, 65, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#223344';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Range scale: 120m radius
      const scale = 55 / 120;

      // Draw Police Dots (Red)
      ctx.fillStyle = '#ff0044';
      for (let i = 0; i < copPositions.length; i++) {
        const cop = copPositions[i];
        const dx = (cop.x - playerX) * scale;
        const dz = (cop.z - playerZ) * scale;
        if (dx * dx + dz * dz < 55 * 55) {
          ctx.beginPath();
          ctx.arc(65 + dx, 65 + dz, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Player Dot (Cyan) in center
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(65, 65, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Multiplayer Room Ranking Update if in room
    if (hud.roomRankingBox && hud.roomEntries && this.mpManager.currentRoom) {
      hud.roomRankingBox.style.display = 'block';
      hud.roomEntries.innerHTML = this.mpManager.currentRoom.players
        .slice(0, 4)
        .map(
          (p, idx) => `
        <div class="mini-rank-row ${p.isLocal ? 'is-local' : ''}">
          <span>#${idx + 1} ${p.name}</span>
          <span>${p.currentSpeed} km/h</span>
        </div>
      `
        )
        .join('');
    }
  }

  public showGameResultModal(
    type: 'escaped' | 'busted' | 'victory',
    title: string,
    message: string,
    rewardCash: number,
    rewardRep: number
  ) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card result-modal">
        <h2 class="${type === 'busted' ? 'text-busted' : 'text-victory'}">${title}</h2>
        <p class="modal-desc">${message}</p>
        <div class="result-rewards">
          <div class="reward-box">💰 Recompensa: R$ ${rewardCash.toLocaleString()}</div>
          <div class="reward-box">⭐ Reputação: +${rewardRep} RP</div>
        </div>
        <div class="modal-actions">
          <button class="primary-btn" id="btnResultContinue">CONTINUAR</button>
        </div>
      </div>
    `;
    this.root.appendChild(modal);

    this.profile.cash += rewardCash;
    this.profile.repPoints += rewardRep;
    if (this.profile.repPoints >= this.profile.repLevel * 1000) {
      this.profile.repLevel++;
    }

    modal.querySelector('#btnResultContinue')?.addEventListener('click', () => {
      modal.remove();
      this.renderTitleScreen();
    });
  }
}
