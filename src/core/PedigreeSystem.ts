/**
 * Chimera Gear: Text Edition — Pedigree System
 * Bloodline tracking, inbreeding detection, name generation, crystallization
 */

import type { Item, Genome } from './GeneticEngine';
import { GENOME_LENGTH } from './GeneticEngine';
import { ItemDecoder } from './ItemDecoder';
import type { ElementType, SpecialAbility } from './ItemDecoder';
import { diminishingReturns } from './mathUtils';

// ========== TYPES ==========

export type GeneticDisease =
    | 'fragile_genome'       // Max HP -30%
    | 'attack_decay'         // 攻撃力が毎ターン1%減衰
    | 'element_instability'  // 属性がランダムに変化
    | 'slow_metabolism';     // 攻撃速度 -25%

export interface InbreedResult {
    isInbred: boolean;
    sharedAncestors: string[];
    coefficient: number;       // 0~1 inbreeding coefficient
    fixedGenes: number[];      // gene indices fixed by inbreeding
    geneticDisease: GeneticDisease | null;
}

export interface CrystalBonus {
    energyYield: number;       // Extra EP on decompose
    statLegacy: number[];      // Small gene bonus passed to descendants
}

export interface CrystallizedItem {
    id: string;
    originalId: string;
    bloodlineName: string;
    genome: Genome;
    generation: number;
    totalBreedCount: number;
    crystalBonus: CrystalBonus;
    ancestorIds: string[];
    crystallizedAt: number;    // timestamp
}

export const MAX_BREED_COUNT = 3;

export const GENETIC_DISEASE_LABELS: Record<GeneticDisease, { icon: string; name: string; desc: string }> = {
    fragile_genome: { icon: '💔', name: '脆弱遺伝子', desc: 'Max HP -30%' },
    attack_decay: { icon: '📉', name: '攻撃減衰', desc: '攻撃力が毎ターン1%減衰' },
    element_instability: { icon: '🌀', name: '属性不安定', desc: '属性がランダム変化' },
    slow_metabolism: { icon: '🐢', name: '代謝低下', desc: '攻撃速度 -25%' },
};

// ========== NAME GENERATION DATA ==========

/** Title prefixes based on genome characteristics */
const ELEMENT_TITLES: Record<ElementType, { strong: string[]; normal: string[] }> = {
    Fire: { strong: ['灼熱の', '紅蓮の', '焔帝の'], normal: ['火燐の', '赤熱の'] },
    Ice: { strong: ['凍王の', '氷牙の', '極寒の'], normal: ['霜剣の', '蒼氷の'] },
    Lightning: { strong: ['雷光の', '迅雷の', '轟雷の'], normal: ['電閃の', '紫電の'] },
};

const SPECIAL_TITLES: Partial<Record<SpecialAbility, string[]>> = {
    chain_explosion: ['爆砕の', '連鎖の', '崩壊の'],
    homing: ['追尾の', '必中の'],
    piercing: ['貫通の', '穿孔の'],
};

const GENERATION_TITLES = ['古血の', '名家の', '覇統の'];

const HIGH_STAT_TITLES: { gene: number; threshold: number; titles: string[] }[] = [
    { gene: 0, threshold: 0.85, titles: ['破壊の', '剛力の'] },
    { gene: 4, threshold: 0.85, titles: ['不滅の', '鋼体の'] },
    { gene: 6, threshold: 0.85, titles: ['守護の', '盾王の'] },
    { gene: 7, threshold: 0.85, titles: ['策士の', '千変の'] },
];

/** Proper name pool — Norse mythology weapon/hero names */
const PROPER_NAMES = [
    'シグルド', 'ブリュンヒルデ', 'ティルフィング', 'グングニル',
    'ミョルニル', 'レーヴァテイン', 'ダインスレイヴ', 'エクスカリバー',
    'グラム', 'フルンティング', 'カラドボルグ', 'デュランダル',
    'アスカロン', 'ゲイボルグ', 'ブリューナク', 'トネリコ',
    'ヘルモーズ', 'フレスベルグ', 'ニーベルング', 'ヴァルキリー',
    'ファフニール', 'ベオウルフ', 'ジークフリート', 'ランスロット',
    'アロンダイト', 'クラウソラス', 'フラガラッハ', 'アンサラー',
    'ハルバード', 'ロンギヌス', 'アスクレピオス', 'オーディン',
];

// ========== PEDIGREE SYSTEM ==========

export class PedigreeSystem {

    // ==================== 1. ANCESTOR TRACKING ====================

    /**
     * Build ancestorIds for a new child from both parents.
     * Keeps up to 2 generations of ancestors (max ~6 IDs) for memory efficiency.
     */
    static buildAncestorIds(parentA: Item, parentB: Item): string[] {
        const ancestors = new Set<string>();

        // Add parents themselves
        ancestors.add(parentA.id);
        ancestors.add(parentB.id);

        // Add parents' ancestors (grandparents + great-grandparents)
        for (const id of parentA.ancestorIds ?? []) ancestors.add(id);
        for (const id of parentB.ancestorIds ?? []) ancestors.add(id);

        // Cap at 14 most recent ancestors for memory efficiency
        const arr = Array.from(ancestors);
        return arr.slice(0, 14);
    }

    // ==================== 2. INBREEDING DETECTION ====================

    /**
     * Detect inbreeding between two prospective parents.
     * Returns coefficient, fixed genes, and potential genetic disease.
     */
    static detectInbreeding(parentA: Item, parentB: Item): InbreedResult {
        const ancestorsA = new Set(parentA.ancestorIds ?? []);
        const ancestorsB = new Set(parentB.ancestorIds ?? []);

        // Also consider parentIds as immediate ancestors
        if (parentA.parentIds) {
            parentA.parentIds.forEach(id => ancestorsA.add(id));
        }
        if (parentB.parentIds) {
            parentB.parentIds.forEach(id => ancestorsB.add(id));
        }

        // Find shared ancestors
        const shared: string[] = [];
        for (const id of ancestorsA) {
            if (ancestorsB.has(id)) shared.push(id);
        }

        // Also check if one parent is an ancestor of the other
        if (ancestorsB.has(parentA.id)) shared.push(parentA.id);
        if (ancestorsA.has(parentB.id)) shared.push(parentB.id);

        // Deduplicate
        const sharedAncestors = [...new Set(shared)];

        if (sharedAncestors.length === 0) {
            return {
                isInbred: false,
                sharedAncestors: [],
                coefficient: 0,
                fixedGenes: [],
                geneticDisease: null,
            };
        }

        // Calculate inbreeding coefficient (0~1)
        // More shared ancestors = higher coefficient
        const maxPossible = Math.max(ancestorsA.size, ancestorsB.size, 1);
        const coefficient = Math.min(1.0, sharedAncestors.length / maxPossible);

        // Fixed genes bonus: pick genes where both parents agree most closely
        const fixedGenes = this.selectInbreedFixedGenes(
            parentA.genome, parentB.genome, coefficient
        );

        // Genetic disease risk: only if coefficient > 0.25
        let geneticDisease: GeneticDisease | null = null;
        if (coefficient > 0.25) {
            // COI > 0.5: deadly disease risk 50%, but stat explosion
            const diseaseChance = coefficient > 0.5 ? 0.5 : coefficient * 0.3;
            if (Math.random() < diseaseChance) {
                const diseases: GeneticDisease[] = [
                    'fragile_genome', 'attack_decay', 'element_instability', 'slow_metabolism',
                ];
                geneticDisease = diseases[Math.floor(Math.random() * diseases.length)];
            }
        }

        return {
            isInbred: true,
            sharedAncestors,
            coefficient,
            fixedGenes,
            geneticDisease,
        };
    }

    /**
     * Select which genes get fixed by inbreeding.
     * Picks genes where both parents have similar values (< 0.15 diff).
     * Number of fixed genes scales with coefficient.
     */
    private static selectInbreedFixedGenes(
        genomeA: Genome, genomeB: Genome, coefficient: number
    ): number[] {
        // Calculate similarity per gene
        const similarities: { idx: number; diff: number }[] = [];
        for (let i = 0; i < GENOME_LENGTH; i++) {
            const diff = Math.abs(genomeA[i] - genomeB[i]);
            if (diff < 0.15) {
                similarities.push({ idx: i, diff });
            }
        }

        // Sort by most similar
        similarities.sort((a, b) => a.diff - b.diff);

        // Number of genes to fix: 1~3 based on coefficient
        const maxFixed = Math.min(3, Math.ceil(coefficient * 4));
        return similarities.slice(0, maxFixed).map(s => s.idx);
    }

    /**
     * Apply inbreeding effects to a child genome.
     * Fixed genes are averaged from parents (locked in).
     * Disease modifies specific genome values.
     */
    static applyInbreedEffects(
        childGenome: Genome,
        parentA: Item,
        parentB: Item,
        inbreed: InbreedResult,
    ): Genome {
        const result = [...childGenome];

        // Fix genes: use average of both parents for these positions
        for (const idx of inbreed.fixedGenes) {
            result[idx] = (parentA.genome[idx] + parentB.genome[idx]) / 2;
        }

        // Apply genetic disease effects to genome
        if (inbreed.geneticDisease) {
            switch (inbreed.geneticDisease) {
                case 'fragile_genome':
                    result[4] = Math.max(0, result[4] * 0.7); // HP -30%
                    break;
                case 'attack_decay':
                    result[0] = Math.max(0, result[0] * 0.85); // Attack -15% base
                    break;
                case 'element_instability':
                    result[2] = Math.random(); // Randomize element
                    break;
                case 'slow_metabolism':
                    result[1] = Math.max(0, result[1] * 0.75); // Speed -25%
                    break;
            }
        }

        // COI > 0.5: explosive stat boost (diminishes with generation)
        if (inbreed.coefficient > 0.5) {
            const maxGen = Math.max(
                parentA.generation, parentB.generation, 1
            );
            const coiBoost = diminishingReturns(0.15, maxGen);
            for (let i = 0; i < GENOME_LENGTH; i++) {
                result[i] = Math.min(1, result[i] * (1 + coiBoost));
            }
        }

        return result;
    }

    // ==================== 3. BLOODLINE NAME GENERATION ====================

    /**
     * Generate a cool bloodline name like "雷光のシグルド" based on genome stats.
     * Uses a deterministic hash from item ID for proper name selection.
     */
    static generateBloodlineName(item: Item): string {
        const stats = ItemDecoder.decode(item.genome);
        const title = this.selectTitle(item, stats);
        const properName = this.selectProperName(item.id);

        // Inbreeding lineage title: "〇〇の直系" if deeply inbred
        if (item.parentIds && item.ancestorIds && item.ancestorIds.length > 2) {
            // Check for shared ancestors via parent bloodline names
            const lineageDepth = item.ancestorIds.length;
            if (lineageDepth >= 4) {
                // Use ancestor-based proper name for lineage title
                const ancestorName = this.selectProperName(item.ancestorIds[0]);
                return `${ancestorName}の直系・${title}${properName}`;
            }
        }

        return `${title}${properName}`;
    }

    private static selectTitle(
        item: Item,
        stats: ReturnType<typeof ItemDecoder.decode>,
    ): string {
        // Priority 1: Special ability titles
        if (stats.special !== 'none' && SPECIAL_TITLES[stats.special]) {
            const titles = SPECIAL_TITLES[stats.special]!;
            return titles[this.hashIndex(item.id, 'special') % titles.length];
        }

        // Priority 2: High-stat titles
        for (const { gene, threshold, titles } of HIGH_STAT_TITLES) {
            if (item.genome[gene] >= threshold) {
                return titles[this.hashIndex(item.id, `stat${gene}`) % titles.length];
            }
        }

        // Priority 3: Generation titles (gen >= 5)
        if (item.generation >= 5) {
            return GENERATION_TITLES[this.hashIndex(item.id, 'gen') % GENERATION_TITLES.length];
        }

        // Priority 4: Element-based titles
        const elemTitles = ELEMENT_TITLES[stats.element];
        const isStrong = item.genome[0] > 0.7 || item.genome[1] > 0.7;
        const pool = isStrong ? elemTitles.strong : elemTitles.normal;
        return pool[this.hashIndex(item.id, 'elem') % pool.length];
    }

    private static selectProperName(id: string): string {
        return PROPER_NAMES[this.hashIndex(id, 'name') % PROPER_NAMES.length];
    }

    /** Simple deterministic hash from string → index */
    private static hashIndex(str: string, salt: string): number {
        const input = str + salt;
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
        }
        return Math.abs(hash);
    }

    // ==================== 4. BREED COUNT & CRYSTALLIZATION ====================

    /**
     * Check if an item has reached its breeding limit.
     */
    static canBreed(item: Item): boolean {
        return (item.breedCount ?? 0) < MAX_BREED_COUNT;
    }

    /**
     * Get remaining breed count for an item.
     */
    static remainingBreeds(item: Item): number {
        return MAX_BREED_COUNT - (item.breedCount ?? 0);
    }

    /**
     * Crystallize an item that has reached its breeding limit.
     * Returns the crystallized form with bonuses.
     */
    static crystallize(item: Item): CrystallizedItem {
        // Calculate crystal bonus based on generation and genome quality
        const genomeSum = item.genome.reduce((a, b) => a + b, 0);
        const qualityFactor = genomeSum / GENOME_LENGTH; // avg gene value 0~1
        const mastery = item.mastery ?? 0;
        const breedCount = item.breedCount ?? 0;

        // Energy yield: base 50 + generation + quality + mastery + usage bonuses
        const masteryBonus = mastery * 0.5;         // mastery 100 → +50 EP
        const usageBonus = breedCount * 15;          // 3 breeds → +45 EP
        const energyYield = Math.floor(
            50 + item.generation * 10 + qualityFactor * 40 + masteryBonus + usageBonus
        );

        // Stat legacy: bonus genes passed to descendants
        // High mastery (>=50) lowers the threshold from 0.6 to 0.4
        const legacyThreshold = mastery >= 50 ? 0.4 : 0.6;
        const legacyMultiplier = mastery >= 80 ? 0.15 : 0.1;
        const statLegacy = item.genome.map(g =>
            g > legacyThreshold ? g * legacyMultiplier : 0
        );

        const bloodlineName = item.bloodlineName ?? this.generateBloodlineName(item);

        return {
            id: `crystal_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            originalId: item.id,
            bloodlineName,
            genome: [...item.genome],
            generation: item.generation,
            totalBreedCount: item.breedCount ?? 0,
            crystalBonus: {
                energyYield,
                statLegacy,
            },
            ancestorIds: item.ancestorIds ?? [],
            crystallizedAt: Date.now(),
        };
    }

    /**
     * Apply crystal legacy bonus to a child genome.
     * If any ancestor was crystallized, apply their statLegacy.
     */
    static applyCrystalLegacy(
        childGenome: Genome,
        crystalItems: CrystallizedItem[],
        childAncestorIds: string[],
    ): Genome {
        const result = [...childGenome];

        // Find any crystallized ancestors
        const relevantCrystals = crystalItems.filter(c =>
            childAncestorIds.includes(c.originalId)
        );

        if (relevantCrystals.length === 0) return result;

        // Apply the best crystal's legacy (strongest single crystal)
        const bestCrystal = relevantCrystals.sort(
            (a, b) => b.crystalBonus.energyYield - a.crystalBonus.energyYield
        )[0];

        for (let i = 0; i < GENOME_LENGTH; i++) {
            result[i] = Math.min(1.0, result[i] + bestCrystal.crystalBonus.statLegacy[i]);
        }

        return result;
    }
}
