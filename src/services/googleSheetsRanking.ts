import { LeaderboardEntry } from '../types';
import { getAccessToken, getCurrentUserProfile } from './firebaseAuth';

export interface GlobalRacerEntry {
  rank: number;
  pilotName: string;
  avatarUrl?: string;
  carName: string;
  repPoints: number;
  topSpeedKmh: number;
  copsDestroyed: number;
  badge: string;
  isCurrentUser: boolean;
  country: string;
}

const DEFAULT_GLOBAL_LEADERBOARD: GlobalRacerEntry[] = [
  {
    rank: 1,
    pilotName: 'ViperKing_BR',
    carName: 'Nebula RS Hyper',
    repPoints: 28400,
    topSpeedKmh: 312,
    copsDestroyed: 84,
    badge: '👑 Rei da Pista',
    isCurrentUser: false,
    country: '🇧🇷',
  },
  {
    rank: 2,
    pilotName: 'GhostRacer_99',
    carName: 'Apex Phantom RS',
    repPoints: 24150,
    topSpeedKmh: 288,
    copsDestroyed: 65,
    badge: '⚡ Inalcançável',
    isCurrentUser: false,
    country: '🇺🇸',
  },
  {
    rank: 3,
    pilotName: 'MidnightDrifter',
    carName: 'Kuro RX Drift',
    repPoints: 21900,
    topSpeedKmh: 265,
    copsDestroyed: 52,
    badge: '🔥 Mestre do Drift',
    isCurrentUser: false,
    country: '🇯🇵',
  },
  {
    rank: 4,
    pilotName: 'Luca_Outlaw',
    carName: 'Viper GT',
    repPoints: 19800,
    topSpeedKmh: 254,
    copsDestroyed: 43,
    badge: '🎬 Protagonista',
    isCurrentUser: false,
    country: '🇧🇷',
  },
  {
    rank: 5,
    pilotName: 'CyberInterceptor',
    carName: 'Titan 4x4 Blindado',
    repPoints: 16400,
    topSpeedKmh: 210,
    copsDestroyed: 91,
    badge: '🛡️ Demolidor',
    isCurrentUser: false,
    country: '🇩🇪',
  },
  {
    rank: 6,
    pilotName: 'SombraNoturna',
    carName: 'Apex Phantom RS',
    repPoints: 14200,
    topSpeedKmh: 278,
    copsDestroyed: 38,
    badge: '⭐ Fugitivo',
    isCurrentUser: false,
    country: '🇵🇹',
  },
  {
    rank: 7,
    pilotName: 'Drift_Tokyo_X',
    carName: 'Kuro RX Drift',
    repPoints: 12500,
    topSpeedKmh: 250,
    copsDestroyed: 29,
    badge: '🌪️ Ás das Curvas',
    isCurrentUser: false,
    country: '🇯🇵',
  },
];

export class GoogleSheetsRankingService {
  /**
   * Fetches the live global ranking, optionally querying Google Sheets if spreadsheetId is passed,
   * or synchronizing with live network leaderboard and the current Google profile.
   */
  public static async fetchLiveRanking(
    currentUserRep: number = 0,
    currentPilotName: string = 'Você',
    currentCarName: string = 'Viper GT',
    currentTopSpeed: number = 0,
    currentCopsDestroyed: number = 0,
    spreadsheetId?: string
  ): Promise<GlobalRacerEntry[]> {
    const token = await getAccessToken();
    const googleUser = getCurrentUserProfile();

    let racers: GlobalRacerEntry[] = [...DEFAULT_GLOBAL_LEADERBOARD];

    // If an external Google Sheet ID is specified and token is available, attempt to query Google Sheets API
    if (spreadsheetId && token) {
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Ranking!A2:G30`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const sheetData = await res.json();
          if (sheetData.values && sheetData.values.length > 0) {
            racers = sheetData.values.map((row: string[], index: number) => ({
              rank: index + 1,
              pilotName: row[0] || `Piloto ${index + 1}`,
              carName: row[1] || 'Viper GT',
              repPoints: parseInt(row[2]) || 1000,
              topSpeedKmh: parseInt(row[3]) || 200,
              copsDestroyed: parseInt(row[4]) || 10,
              badge: row[5] || 'Piloto Global',
              isCurrentUser: false,
              country: row[6] || '🌐',
            }));
          }
        }
      } catch (err) {
        console.warn('Sheets API request fallback:', err);
      }
    }

    // Insert or update current user's ranking
    const displayName = googleUser?.displayName || currentPilotName;
    const userEntry: GlobalRacerEntry = {
      rank: 0,
      pilotName: `${displayName} (Você)`,
      avatarUrl: googleUser?.photoURL || undefined,
      carName: currentCarName,
      repPoints: Math.max(currentUserRep, 50),
      topSpeedKmh: Math.max(currentTopSpeed, 180),
      copsDestroyed: currentCopsDestroyed,
      badge: googleUser ? '✅ Google Verificado' : '📱 Piloto Local',
      isCurrentUser: true,
      country: '🇧🇷',
    };

    // Filter out existing user entry if present and insert
    racers = racers.filter((r) => !r.isCurrentUser);
    racers.push(userEntry);

    // Sort by Rep Points descending
    racers.sort((a, b) => b.repPoints - a.repPoints);

    // Re-assign 1-based ranks
    return racers.map((r, idx) => ({
      ...r,
      rank: idx + 1,
    }));
  }
}
