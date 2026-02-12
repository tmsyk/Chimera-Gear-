/**
 * Chimera Gear: Text Edition — Genetic Engine
 * 10-gene genome for autonomous weapon evolution
 */

import { PedigreeSystem } from './PedigreeSystem';
import type { GeneticDisease } from './PedigreeSystem';
import { resolveTraitInheritance } from './TraitSystem';
import type { TraitInstance } from './TraitSystem';
import { applySoftCap } from './mathUtils';

export type Genome = number[];

export interface Item {
  id: string;
  genome: Genome;
  fitness: number;
  generation: number;
  parentIds?: [string, string];
  ancestorIds?: string[];            // tracked ancestor chain
  bloodlineName?: string;            // auto-generated bloodline name
  breedCount?: number;               // times used as parent (max 3)
  geneticDisease?: GeneticDisease | null;  // inbreeding penalty
  battleMemory?: BattleAchievement[];
  mastery?: number;                  // 0~100 proficiency from battle
  lockedGenes?: number[];            // gene indices locked by mastery
  traits?: TraitInstance[];          // trait system: inherited/mutated traits
  category?: 'battle' | 'breeding' | 'material'; // inventory category
  locked?: boolean;              // lock protection from bulk operations
}

export interface BattleAchievement {
  text: string;
  timestamp: number;
}

/**
 * Gene Index Map:
 * [0] Attack Power     — Raw damage multiplier
 * [1] Attack Speed     — Fire rate (higher = faster)
 * [2] Element Type     — Fire / Ice / Lightning threshold
 * [3] Special Ability  — Homing / Piercing / Chain threshold
 * [4] Max HP           — Survivability
 * [5] Aggression       — Bias toward "Attack" action
 * [6] Defense Instinct — Bias toward "Repair/Defend" when low HP
 * [7] Tactical Variety — Bias toward "Special Skill" over normal attack
 * [8] Fire Resistance  
 * [9] Ice Resistance   
 * (Lightning Resistance derived from 1 - avg(8,9) to force tradeoffs)
 */
export const GENE_NAMES = [
  '⚔️攻撃力',       // Attack Power
  '💨攻撃速度',     // Attack Speed
  '🌀属性',         // Element
  '⭐特殊能力',     // Special
  '❤️耐久力',       // Max HP
  '👹攻撃性',       // Aggression (AI)
  '🛡️防衛本能',     // Defense Instinct (AI)
  '🎲戦術多様性',   // Tactical Variety (AI)
  '🔥火炎耐性',     // Fire Resist
  '❄️氷結耐性',     // Ice Resist
];

export const GENOME_LENGTH = 10;

export class GeneticEngine {
  /** Create a random genome */
  static createRandomGenome(): Genome {
    return Array.from({ length: GENOME_LENGTH }, () => Math.random());
  }

  /** Uniform Crossover — each gene has 50% chance from either parent */
  static crossover(parentA: Genome, parentB: Genome): Genome {
    return parentA.map((gene, i) =>
      Math.random() < 0.5 ? gene : parentB[i]
    );
  }

  /** Mutation — chance per gene to shift or randomize, with entropy */
  static mutate(
    genome: Genome,
    rate: number = 0.04,
    generation: number = 1,
    lockedGenes: number[] = []
  ): Genome {
    return genome.map((gene, idx) => {
      // Skip locked genes
      if (lockedGenes.includes(idx)) return gene;

      if (Math.random() < rate) {
        // Genetic entropy: higher generations bias toward negative mutations
        const negativeBias = Math.min(0.7, 0.5 + generation * 0.02);

        if (Math.random() < 0.5) {
          // Full random
          return Math.random();
        }
        // Perturbation — biased downward at high generations
        const direction = Math.random() < negativeBias ? -1 : 1;
        const magnitude = Math.random() * 0.3;
        return Math.max(0, Math.min(1, gene + direction * magnitude));
      }
      return gene;
    });
  }

  /** Roulette Wheel Selection — probability proportional to fitness */
  static selectParent(population: Item[]): Item {
    if (population.length === 0) throw new Error('Population is empty');

    const totalFitness = population.reduce(
      (sum, item) => sum + Math.max(0.01, item.fitness),
      0
    );

    let r = Math.random() * totalFitness;
    for (const item of population) {
      r -= Math.max(0.01, item.fitness);
      if (r <= 0) return item;
    }
    return population[population.length - 1];
  }

  /** Breed two parents to produce a child, with optional gene locking */
  static breed(
    parentA: Item,
    parentB: Item,
    mutationRate = 0.06,
    lockedGenes: number[] = []
  ): Item {
    const generation = Math.max(parentA.generation, parentB.generation) + 1;

    // Genetic entropy: escalating mutation rate
    const entropyRate = mutationRate + generation * 0.005;

    let childGenome = this.crossover(parentA.genome, parentB.genome);

    // Apply gene locks: locked genes always inherit from parent A, skip mutation
    for (const idx of lockedGenes) {
      if (idx >= 0 && idx < GENOME_LENGTH) {
        childGenome[idx] = parentA.genome[idx];
      }
    }

    // Inbreeding detection & effects
    const inbreed = PedigreeSystem.detectInbreeding(parentA, parentB);
    if (inbreed.isInbred) {
      // Merge inbreed fixed genes with manual locks (no double-locking)
      const allLocked = [...new Set([...lockedGenes, ...inbreed.fixedGenes])];
      childGenome = PedigreeSystem.applyInbreedEffects(
        childGenome, parentA, parentB, inbreed
      );
      lockedGenes = allLocked;
    }

    childGenome = this.mutate(childGenome, entropyRate, generation, lockedGenes);

    // Soft cap: compress excess beyond 7.0
    childGenome = applySoftCap(childGenome);

    // Build ancestor chain
    const ancestorIds = PedigreeSystem.buildAncestorIds(parentA, parentB);

    // Resolve trait inheritance from parents
    const childTraits = resolveTraitInheritance(
      parentA.traits ?? [],
      parentB.traits ?? [],
      inbreed.coefficient,
    );

    const child: Item = {
      id: `chimera_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      genome: childGenome,
      fitness: 0,
      generation,
      parentIds: [parentA.id, parentB.id],
      ancestorIds,
      breedCount: 0,
      geneticDisease: inbreed.geneticDisease ?? null,
      traits: childTraits,
    };

    // === Mastery Breeding Bonus ===
    // If average parent mastery >= 80: reduce disease chance by 20%, boost positive traits +5%
    const avgMastery = ((parentA.mastery ?? 0) + (parentB.mastery ?? 0)) / 2;
    const isMasteryBreed = avgMastery >= 80;

    // Genetic fatigue: higher parent breedCount → exponentially higher disease chance
    if (!child.geneticDisease) {
      const maxParentBreeds = Math.max(parentA.breedCount ?? 0, parentB.breedCount ?? 0);
      let fatigueChance = Math.pow(maxParentBreeds * 0.12, 1.5);
      // Mastery: reduce disease chance by 20%
      if (isMasteryBreed) fatigueChance *= 0.8;
      if (maxParentBreeds > 0 && Math.random() < fatigueChance) {
        const diseases: GeneticDisease[] = ['fragile_genome', 'attack_decay', 'element_instability', 'slow_metabolism'];
        child.geneticDisease = diseases[Math.floor(Math.random() * diseases.length)];
      }
    } else if (isMasteryBreed && Math.random() < 0.20) {
      // 20% chance to cure inherited disease with high mastery parents
      child.geneticDisease = null;
    }

    // Mastery: boost positive traits to higher rank (+5% upgrade chance per trait)
    if (isMasteryBreed && child.traits) {
      const rankUpgrade: Record<string, string> = {
        'Common': 'Rare', 'Rare': 'Epic', 'Epic': 'Legendary',
      };
      child.traits = child.traits.map(t => {
        const nextRank = rankUpgrade[t.rank];
        if (nextRank && Math.random() < 0.05) {
          return { ...t, rank: nextRank as typeof t.rank };
        }
        return t;
      });
    }

    // Generate bloodline name (only for bred items, gen >= 2)
    child.bloodlineName = PedigreeSystem.generateBloodlineName(child);

    return child;
  }

  /** Predict offspring stat ranges by sampling (entropy-aware) */
  static predictOffspring(
    parentA: Genome,
    parentB: Genome,
    samples = 30,
    generation = 1,
    lockedGenes: number[] = []
  ): { average: Genome; min: Genome; max: Genome } {
    const results: Genome[] = [];
    const entropyRate = 0.06 + generation * 0.005;

    for (let i = 0; i < samples; i++) {
      let child = this.crossover(parentA, parentB);
      // Apply gene locks
      for (const idx of lockedGenes) {
        if (idx >= 0 && idx < GENOME_LENGTH) {
          child[idx] = parentA[idx];
        }
      }
      child = this.mutate(child, entropyRate, generation, lockedGenes);

      // Soft cap
      child = applySoftCap(child);

      results.push(child);
    }

    const avg = Array(GENOME_LENGTH).fill(0);
    const min = Array(GENOME_LENGTH).fill(1);
    const max = Array(GENOME_LENGTH).fill(0);

    for (const r of results) {
      for (let i = 0; i < GENOME_LENGTH; i++) {
        avg[i] += r[i] / samples;
        if (r[i] < min[i]) min[i] = r[i];
        if (r[i] > max[i]) max[i] = r[i];
      }
    }

    return { average: avg, min, max };
  }
}
