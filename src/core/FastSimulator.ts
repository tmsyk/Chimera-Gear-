/**
 * Chimera Gear: Text Edition — High-Speed Simulator
 * Runs N battles in sub-second time, returns aggregate stats
 */

import type { Genome } from './GeneticEngine';
import { TextBattleEngine, type BattleResult } from './TextBattleEngine';

export interface SimulationResult {
    totalBattles: number;
    wins: number;
    losses: number;
    winRate: number;           // 0.0 ~ 1.0
    avgKillTime: number;       // seconds (wins only)
    avgDamageRatio: number;    // dealt/taken
    avgAdaptation: number;     // 0.0 ~ 1.0
    avgHpRemaining: number;    // weapon HP remaining (wins only)
    bestKillTime: number;
    worstKillTime: number;
    detailedResults?: BattleResult[];
}

export class FastSimulator {
    /**
     * Run N battles between a weapon and enemy genome.
     * No logs are stored to maximize speed.
     */
    static simulate(
        weaponGenome: Genome,
        enemyGenome: Genome,
        stageLevel: number = 1,
        battleCount: number = 100
    ): SimulationResult {
        let wins = 0;
        let totalKillTimeWins = 0;
        let totalDamageRatio = 0;
        let totalAdaptation = 0;
        let totalHpRemainingWins = 0;
        let bestKillTime = Infinity;
        let worstKillTime = 0;

        for (let i = 0; i < battleCount; i++) {
            const result = TextBattleEngine.runBattle(
                weaponGenome, enemyGenome, stageLevel, 30
            );

            if (result.won) {
                wins++;
                totalKillTimeWins += result.killTime;
                totalHpRemainingWins += result.weaponHpRemaining;
                if (result.killTime < bestKillTime) bestKillTime = result.killTime;
                if (result.killTime > worstKillTime) worstKillTime = result.killTime;
            }

            totalDamageRatio += result.damageRatio;
            totalAdaptation += result.adaptationScore;
        }

        return {
            totalBattles: battleCount,
            wins,
            losses: battleCount - wins,
            winRate: wins / battleCount,
            avgKillTime: wins > 0 ? totalKillTimeWins / wins : Infinity,
            avgDamageRatio: totalDamageRatio / battleCount,
            avgAdaptation: totalAdaptation / battleCount,
            avgHpRemaining: wins > 0 ? totalHpRemainingWins / wins : 0,
            bestKillTime: bestKillTime === Infinity ? 0 : bestKillTime,
            worstKillTime,
        };
    }

    /**
     * Compare two weapon candidates against the same enemy pool.
     * Returns which weapon performs better.
     */
    static compare(
        weaponA: Genome,
        weaponB: Genome,
        enemyGenome: Genome,
        stageLevel: number = 1,
        battleCount: number = 50
    ): { resultA: SimulationResult; resultB: SimulationResult; winner: 'A' | 'B' | 'tie' } {
        const resultA = this.simulate(weaponA, enemyGenome, stageLevel, battleCount);
        const resultB = this.simulate(weaponB, enemyGenome, stageLevel, battleCount);

        let winner: 'A' | 'B' | 'tie' = 'tie';
        const scoreA = resultA.winRate * 1000 + (resultA.avgKillTime > 0 ? 100 / resultA.avgKillTime : 0);
        const scoreB = resultB.winRate * 1000 + (resultB.avgKillTime > 0 ? 100 / resultB.avgKillTime : 0);

        if (scoreA > scoreB + 5) winner = 'A';
        else if (scoreB > scoreA + 5) winner = 'B';

        return { resultA, resultB, winner };
    }
}
