export type GameMode =
  | 'title'
  | 'story'
  | 'career'
  | 'challenge'
  | 'free_roam'
  | 'tutorial'
  | 'multiplayer';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export type WeatherType = 'sunny' | 'rain' | 'storm' | 'fog';
export type TimeOfDay = 'day' | 'sunset' | 'night' | 'midnight';

export interface VehicleConfig {
  id: string;
  name: string;
  category: 'muscle' | 'jdm' | 'super' | 'hyper' | 'police' | 'swat';
  price: number;
  topSpeed: number; // km/h max
  acceleration: number; // 0-100 factor
  handling: number; // cornering grip factor
  braking: number;
  healthMax: number;
  unlocked: boolean;
  color: string;
  neonColor: string;
  neonEnabled: boolean;
  spoilerStyle: number; // 0: none, 1: sport, 2: GT wing, 3: carbon drag
  wheelsStyle: number; // 0: stock, 1: racing, 2: chrome, 3: neon rims
  levelEngine: number; // 1 to 5
  levelHandling: number;
  levelNitro: number;
  levelArmor: number;
}

export interface TrackConfig {
  id: string;
  name: string;
  location: string;
  difficulty: 'Fácil' | 'Médio' | 'Difícil' | 'Extremo';
  price: number;
  unlocked: boolean;
  lapLengthMeters: number;
  ambientColor: number;
  fogColor: number;
  fogDensity: number;
  description: string;
}

export type GameDifficulty =
  | 'very_easy'
  | 'easy'
  | 'amateur'
  | 'normal'
  | 'hard'
  | 'legendary'
  | 'professional';

export interface CharacterProfile {
  name: string;
  nickname: string;
  avatarId: number;
  team: string;
  cash: number;
  repLevel: number;
  repPoints: number;
  selectedCarId: string;
  selectedTrackId: string;
  careerWins: number;
  totalEscapes: number;
  copsDestroyed: number;
  storyChapter: number;
  unlockedChallenges: number;
  controlsMode: 'touch' | 'gyro' | 'keyboard';
  gyroSensitivity: number;
  difficulty: GameDifficulty;
}

export interface StoryChapter {
  id: number;
  title: string;
  subtitle: string;
  briefing: string;
  trackId: string;
  initialHeat: number;
  objectiveText: string;
  targetEscapes?: number;
  timeLimitSec?: number;
  dialogueIntro: DialogueLine[];
  dialogueMidList?: { triggerSec: number; triggered?: boolean; lines: DialogueLine[] }[];
  dialogueOutro: DialogueLine[];
  rewardCash: number;
  rewardRep: number;
}

export interface DialogueLine {
  speaker: 'Luca' | 'Miguel' | 'Capitão Ramos' | 'Central Policial' | 'Piloto Rival' | 'Don Salieri';
  portrait: 'luca' | 'miguel' | 'cop' | 'dispatch' | 'rival';
  text: string;
  radioEffect?: boolean;
}

export interface ChallengeItem {
  id: number;
  title: string;
  description: string;
  reward: number;
  rewardRep: number;
  targetType: 'survive_time' | 'destroy_cops' | 'drift_score' | 'top_speed';
  targetValue: number;
  completed: boolean;
}

export interface MultiplayerPlayer {
  id: string;
  name: string;
  carName: string;
  carColor: string;
  isHost: boolean;
  isReady: boolean;
  currentSpeed: number;
  lap: number;
  progress: number;
  lapTime: number;
  isLocal: boolean;
}

export interface MultiplayerRoom {
  code: string; // 4 digits e.g. "4829"
  trackId: string;
  hostName: string;
  status: 'lobby' | 'racing' | 'finished';
  players: MultiplayerPlayer[];
  createdAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  pilotName: string;
  car: string;
  scoreOrTime: string;
  track: string;
  mode: string;
  date: string;
}

export interface PlayerControls {
  throttle: number; // 0 to 1
  brake: number; // 0 to 1
  steer: number; // -1 to 1
  handbrake: boolean;
  nitro: boolean;
  resetVehicle: boolean;
  switchCamera: boolean;
}
