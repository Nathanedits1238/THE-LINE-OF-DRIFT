import { LeaderboardEntry, MultiplayerPlayer, MultiplayerRoom } from '../types';

export class MultiplayerRoomManager {
  private channel: BroadcastChannel | null = null;
  public currentRoom: MultiplayerRoom | null = null;
  public localPlayerId: string;
  public onRoomUpdate?: (room: MultiplayerRoom) => void;

  constructor() {
    this.localPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);
    try {
      this.channel = new BroadcastChannel('outlaw_velocity_mp');
      this.channel.onmessage = (event) => {
        this.handleNetworkMessage(event.data);
      };
    } catch {
      // BroadcastChannel fallback if not supported
    }
  }

  /**
   * Generates a 4-digit code e.g. "4829"
   */
  public generate4DigitCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Creates a new private room with automatically generated 4-digit code.
   */
  public createRoom(hostName: string, carName: string, carColor: string, trackId: string): MultiplayerRoom {
    const code = this.generate4DigitCode();
    const hostPlayer: MultiplayerPlayer = {
      id: this.localPlayerId,
      name: hostName || 'Piloto Anfitrião',
      carName: carName || 'Viper GT',
      carColor: carColor || '#e63946',
      isHost: true,
      isReady: true,
      currentSpeed: 0,
      lap: 1,
      progress: 0,
      lapTime: 0,
      isLocal: true,
    };

    // AI Network Competitors in the room for dynamic multiplayer action
    const aiRivals: MultiplayerPlayer[] = [
      {
        id: 'ai_1',
        name: 'ShadowDrifter',
        carName: 'Kuro RX',
        carColor: '#00f0ff',
        isHost: false,
        isReady: true,
        currentSpeed: 180,
        lap: 1,
        progress: 0,
        lapTime: 0,
        isLocal: false,
      },
      {
        id: 'ai_2',
        name: 'Apex_Ghost',
        carName: 'Apex Phantom',
        carColor: '#ff0055',
        isHost: false,
        isReady: true,
        currentSpeed: 195,
        lap: 1,
        progress: 0,
        lapTime: 0,
        isLocal: false,
      },
      {
        id: 'ai_3',
        name: 'NightCrawler',
        carName: 'Nebula RS',
        carColor: '#ffdd00',
        isHost: false,
        isReady: true,
        currentSpeed: 170,
        lap: 1,
        progress: 0,
        lapTime: 0,
        isLocal: false,
      },
    ];

    const room: MultiplayerRoom = {
      code,
      trackId,
      hostName: hostPlayer.name,
      status: 'lobby',
      players: [hostPlayer, ...aiRivals],
      createdAt: Date.now(),
    };

    this.currentRoom = room;
    this.saveRoomToStorage(room);
    this.broadcastMessage({ type: 'ROOM_CREATED', room });
    return room;
  }

  /**
   * Joins an existing room by its 4-digit code.
   */
  public joinRoom(
    code: string,
    playerName: string,
    carName: string,
    carColor: string
  ): { success: boolean; room?: MultiplayerRoom; error?: string } {
    const cleanCode = code.trim();
    if (!/^\d{4}$/.test(cleanCode)) {
      return { success: false, error: 'O código da sala deve ter exatamente 4 números.' };
    }

    let room = this.loadRoomFromStorage(cleanCode);
    if (!room) {
      // Auto-create room for code if remote host hasn't broadcast yet
      room = {
        code: cleanCode,
        trackId: 'track_city',
        hostName: 'Piloto Host',
        status: 'lobby',
        players: [
          {
            id: 'host_' + cleanCode,
            name: 'Piloto Host',
            carName: 'Viper GT',
            carColor: '#3a86ff',
            isHost: true,
            isReady: true,
            currentSpeed: 0,
            lap: 1,
            progress: 0,
            lapTime: 0,
            isLocal: false,
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Add local player if not already in room
    const existingIdx = room.players.findIndex((p) => p.id === this.localPlayerId);
    const localP: MultiplayerPlayer = {
      id: this.localPlayerId,
      name: playerName || 'Piloto Visitante',
      carName: carName || 'Kuro RX',
      carColor: carColor || '#00e5ff',
      isHost: false,
      isReady: true,
      currentSpeed: 0,
      lap: 1,
      progress: 0,
      lapTime: 0,
      isLocal: true,
    };

    if (existingIdx >= 0) {
      room.players[existingIdx] = localP;
    } else {
      room.players.push(localP);
    }

    this.currentRoom = room;
    this.saveRoomToStorage(room);
    this.broadcastMessage({ type: 'PLAYER_JOINED', room, player: localP });
    return { success: true, room };
  }

  public updateLocalTelemetry(speed: number, progress: number, lap: number, lapTime: number) {
    if (!this.currentRoom) return;
    const localP = this.currentRoom.players.find((p) => p.id === this.localPlayerId);
    if (localP) {
      localP.currentSpeed = speed;
      localP.progress = progress;
      localP.lap = lap;
      localP.lapTime = lapTime;
    }

    // Simulate AI rival progress if active
    for (const p of this.currentRoom.players) {
      if (!p.isLocal) {
        p.progress += 0.0018 + Math.random() * 0.0012;
        p.currentSpeed = Math.round(160 + Math.sin(Date.now() * 0.002 + p.name.length) * 40);
        if (p.progress >= 1.0) {
          p.progress = 0;
          p.lap++;
        }
      }
    }

    // Sort room ranking by lap desc, then progress desc
    this.currentRoom.players.sort((a, b) => {
      if (b.lap !== a.lap) return b.lap - a.lap;
      return b.progress - a.progress;
    });

    this.broadcastMessage({ type: 'TELEMETRY_UPDATE', room: this.currentRoom });
  }

  public leaveRoom() {
    if (this.currentRoom) {
      this.currentRoom.players = this.currentRoom.players.filter((p) => p.id !== this.localPlayerId);
      this.saveRoomToStorage(this.currentRoom);
      this.broadcastMessage({ type: 'PLAYER_LEFT', room: this.currentRoom, playerId: this.localPlayerId });
      this.currentRoom = null;
    }
  }

  // --- Broadcast & Storage ---
  private broadcastMessage(msg: unknown) {
    try {
      this.channel?.postMessage(msg);
    } catch {}
  }

  private handleNetworkMessage(data: { type: string; room?: MultiplayerRoom }) {
    if (!data || !data.room) return;
    if (this.currentRoom && data.room.code === this.currentRoom.code) {
      // Merge remote players
      this.currentRoom.players = data.room.players.map((p) => {
        if (p.id === this.localPlayerId) {
          return { ...p, isLocal: true };
        }
        return { ...p, isLocal: false };
      });
      this.currentRoom.status = data.room.status;
      this.onRoomUpdate?.(this.currentRoom);
    }
  }

  private saveRoomToStorage(room: MultiplayerRoom) {
    try {
      localStorage.setItem(`outlaw_room_${room.code}`, JSON.stringify(room));
    } catch {}
  }

  private loadRoomFromStorage(code: string): MultiplayerRoom | null {
    try {
      const data = localStorage.getItem(`outlaw_room_${code}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  // --- Global Leaderboard ---
  public static getGlobalLeaderboard(): LeaderboardEntry[] {
    const defaultLeaderboard: LeaderboardEntry[] = [
      {
        rank: 1,
        pilotName: 'Luca "Outlaw"',
        car: 'Viper GT Twin-Turbo',
        scoreOrTime: '01:14.28',
        track: 'Metrópole Neon',
        mode: 'Fuga 5 Estrelas',
        date: 'Hoje',
      },
      {
        rank: 2,
        pilotName: 'Phantom_Racer',
        car: 'Apex Phantom RS',
        scoreOrTime: '01:16.85',
        track: 'Rodovia Costeira',
        mode: 'Multiplayer',
        date: 'Ontem',
      },
      {
        rank: 3,
        pilotName: 'DriftQueen_BR',
        car: 'Kuro RX Spec-D',
        scoreOrTime: '01:19.40',
        track: 'Docas Industriais',
        mode: 'Carreira',
        date: 'Há 2 dias',
      },
      {
        rank: 4,
        pilotName: 'MidnightRider',
        car: 'Nebula RS Hyper',
        scoreOrTime: '01:21.12',
        track: 'Cânion do Deserto',
        mode: 'Desafio',
        date: 'Há 3 dias',
      },
      {
        rank: 5,
        pilotName: 'Toretto_SP',
        car: 'Viper GT Drag',
        scoreOrTime: '01:23.95',
        track: 'Metrópole Neon',
        mode: 'Multiplayer',
        date: 'Há 5 dias',
      },
    ];

    try {
      const stored = localStorage.getItem('outlaw_global_leaderboard');
      return stored ? JSON.parse(stored) : defaultLeaderboard;
    } catch {
      return defaultLeaderboard;
    }
  }

  public static addGlobalScore(entry: Omit<LeaderboardEntry, 'rank' | 'date'>) {
    const list = this.getGlobalLeaderboard();
    const newEntry: LeaderboardEntry = {
      ...entry,
      rank: list.length + 1,
      date: 'Agora',
    };
    list.push(newEntry);
    list.sort((a, b) => a.scoreOrTime.localeCompare(b.scoreOrTime));
    list.forEach((item, idx) => (item.rank = idx + 1));
    const trimmed = list.slice(0, 10);
    try {
      localStorage.setItem('outlaw_global_leaderboard', JSON.stringify(trimmed));
    } catch {}
    return trimmed;
  }
}
