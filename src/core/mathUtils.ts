/**
 * Chimera Gear: Text Edition — Shared Math Utilities
 * Centralized numeric models used across Genetic, Battle, and Breeding systems.
 */

import type { Genome } from './GeneticEngine';

// ========== GENE UTILITIES ==========

/** Clamp a gene value to [0, 1] */
export function clampGene(value: number): number {
    return Math.max(0, Math.min(1, value));
}

// ========== SOFT CAP ==========

/**
 * Apply soft cap to genome: if total gene sum exceeds `cap`,
 * compress excess by `compressionRate` (default 10%).
 * Returns a new genome array (does not mutate).
 */
export function applySoftCap(
    genome: Genome,
    cap: number = 7.0,
    compressionRate: number = 0.1,
): Genome {
    const totalSum = genome.reduce((a, b) => a + b, 0);
    if (totalSum <= cap) return genome;
    const excess = totalSum - cap;
    const scale = 1 - (excess / totalSum) * compressionRate;
    return genome.map(g => clampGene(g * scale));
}

// ========== RESISTANCE BOOST ==========

export type ElementLabel = 'Fire' | 'Ice' | 'Lightning';

/**
 * Boost elemental resistance on a genome.
 * Fire  → gene[8], Ice → gene[9],
 * Lightning → derived (lower fire+ice raises it), so boost both by half.
 * Returns a new genome array.
 */
export function boostResistance(
    genome: Genome,
    element: ElementLabel,
    amount: number,
): Genome {
    const g = [...genome];
    if (element === 'Fire') {
        g[8] = clampGene(g[8] + amount);
    } else if (element === 'Ice') {
        g[9] = clampGene(g[9] + amount);
    } else if (element === 'Lightning') {
        // Lightning resist is derived from 1 - avg(fire, ice)*0.6
        // To raise it, we reduce fire+ice or split the boost
        g[8] = clampGene(g[8] + amount * 0.5);
        g[9] = clampGene(g[9] + amount * 0.5);
    }
    return g;
}

// ========== BREEDING COST ==========

const RANK_COST_MAP: Record<string, number> = {
    D: 1, C: 1, B: 1.5, A: 2, S: 3, SS: 5,
};

/**
 * Calculate breeding EP cost.
 * Formula: round(baseCost × generation^2.5 × rankMultiplier) + lockedGenes × lockCostPerGene
 */
export function calculateBreedingCost(
    generation: number,
    bestRank: string,
    lockedGeneCount: number,
    baseCost: number = 25,
    lockCostPerGene: number = 10,
): { breedCost: number; totalCost: number } {
    const genCost = Math.pow(generation, 2.5);
    const rankMult = RANK_COST_MAP[bestRank] ?? 1;
    const breedCost = Math.round(baseCost * genCost * rankMult);
    const totalCost = breedCost + lockedGeneCount * lockCostPerGene;
    return { breedCost, totalCost };
}

/**
 * Minimum mastery required to use an item as a breeding parent.
 * Scales with generation: 15 + gen * 5 (Gen1=20, Gen5=40, Gen10=65)
 */
export function requiredMastery(generation: number): number {
    return 15 + generation * 5;
}

// ========== DIMINISHING RETURNS ==========

/**
 * Apply diminishing returns to a value as generation increases.
 * Returns a reduced multiplier: baseValue shrinks gently at high generations.
 * gen 1-5: ~baseValue, gen 10: ~87%, gen 20+: ~67%
 */
export function diminishingReturns(baseValue: number, generation: number): number {
    // Logarithmic decay: base / (1 + ln(gen) * 0.25)
    const decay = 1 + Math.log(Math.max(1, generation)) * 0.25;
    return baseValue / decay;
}

// ========== MASTERY COMBAT BUFFS ==========

/**
 * Synchro Boost: damage & defense multiplier from mastery.
 * mastery 0 → ×1.0, mastery 100 → ×1.1 (MAX +10%)
 */
export function masterySynchroBoost(mastery: number): number {
    return 1 + Math.min(mastery, 100) / 1000;
}

/**
 * Critical rate bonus from mastery.
 * +1% per 10 mastery → MAX +10% at mastery 100.
 */
export function masteryCritBonus(mastery: number): number {
    return Math.floor(Math.min(mastery, 100) / 10) * 0.01;
}

/**
 * Whether this mastery level qualifies as "mastered" (golden name).
 */
export function isMasteryMax(mastery: number): boolean {
    return mastery >= 100;
}

// ========== STAGE-BASED GENOME QUALITY ==========

/**
 * Create a genome with quality scaled to stage level.
 * Uses logarithmic growth to align with player breeding pace (Gen count).
 *
 * Stage 1-5:   avg ~0.15-0.30 (D rank center)
 * Stage 10:    avg ~0.30-0.40 (C rank)
 * Stage 25:    avg ~0.40-0.55 (B rank)
 * Stage 50:    avg ~0.55-0.70 (A rank)
 * Stage 75:    avg ~0.65-0.80 (S rank)
 * Stage 100:   avg ~0.75-0.88 (SS rank ceiling)
 *
 * Formula: logarithmic curve with diminishing returns at high stages
 */
export function createStageGenome(stage: number, geneCount: number = 10): number[] {
    // Logarithmic progression: fast early, slow late
    const progress = Math.log(1 + stage) / Math.log(1 + 100); // 0..1 over stages 1..100
    const range = Math.min(0.25 + progress * 0.65, 0.90);
    const floor = Math.min(progress * 0.45, 0.45);
    return Array.from({ length: geneCount }, () => {
        const raw = Math.random() * range + floor;
        return Math.max(0.01, Math.min(0.99, raw));
    });
}
