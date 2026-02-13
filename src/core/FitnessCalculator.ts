/**
 * Chimera Gear: Text Edition — Multi-Axis Fitness Calculator
 */

import type { BattleResult } from './TextBattleEngine';

export interface FitnessBreakdown {
    killTimeScore: number;    // 0~100 — faster = better
    damageEfficiency: number; // 0~100 — higher ratio = better
    adaptationScore: number;  // 0~100 — bypassing resistance
    survivalScore: number;    // 0~100 — HP remaining
    totalFitness: number;     // Weighted sum
}

export class FitnessCalculator {
    /**
     * Calculate multi-axis fitness from a battle result
     */
    static calculate(result: BattleResult): FitnessBreakdown {
        // Kill Time Score: 30s is baseline, faster = higher.  Loss = 0
        const killTimeScore = result.won
            ? Math.min(100, (30 / Math.max(0.5, result.killTime)) * 50)
            : 0;

        // Damage Efficiency: ratio of dealt/taken
        const damageEfficiency = Math.min(100, result.damageRatio * 20);

        // Adaptation Score: how well we bypassed enemy resistances (0~1 → 0~100)
        const adaptationScore = result.adaptationScore * 100;

        // Survival Score: HP remaining as %
        const survivalScore = result.won
            ? (result.weaponHpRemaining / Math.max(1, result.weaponHpRemaining + result.damageTaken)) * 100
            : 0;

        // Weighted total
        const totalFitness =
            killTimeScore * 0.35 +
            damageEfficiency * 0.30 +
            adaptationScore * 0.15 +
            survivalScore * 0.20;

        return {
            killTimeScore: Math.round(killTimeScore * 10) / 10,
            damageEfficiency: Math.round(damageEfficiency * 10) / 10,
            adaptationScore: Math.round(adaptationScore * 10) / 10,
            survivalScore: Math.round(survivalScore * 10) / 10,
            totalFitness: Math.round(totalFitness * 10) / 10,
        };
    }

    /** Calculate average fitness from multiple battle results */
    static calculateAverage(results: BattleResult[]): FitnessBreakdown {
        if (results.length === 0) {
            return { killTimeScore: 0, damageEfficiency: 0, adaptationScore: 0, survivalScore: 0, totalFitness: 0 };
        }

        const breakdowns = results.map(r => this.calculate(r));

        const avg = (field: keyof FitnessBreakdown) =>
            Math.round((breakdowns.reduce((sum, b) => sum + b[field], 0) / breakdowns.length) * 10) / 10;

        return {
            killTimeScore: avg('killTimeScore'),
            damageEfficiency: avg('damageEfficiency'),
            adaptationScore: avg('adaptationScore'),
            survivalScore: avg('survivalScore'),
            totalFitness: avg('totalFitness'),
        };
    }

    /** Add mastery points to a weapon based on battle performance (×1.5 育成緩和) */
    static addMastery(currentMastery: number, fitness: number): number {
        if (fitness >= 80) return Math.min(100, currentMastery + 3);
        if (fitness >= 50) return Math.min(100, currentMastery + 2);
        return currentMastery;
    }
}
