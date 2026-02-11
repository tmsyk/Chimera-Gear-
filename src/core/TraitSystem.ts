/**
 * Chimera Gear: Text Edition — Trait System
 * Two-sided traits, pure positives, genetic diseases,
 * stacking with diminishing returns, capacity system,
 * inheritance logic, crystallization choices
 */

import type { CombatStats } from './ItemDecoder';

// ========== TYPES ==========

export type TraitRank = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export type TraitCategory = 'element_linked' | 'stat_skewed' | 'mutation' | 'pure_positive' | 'genetic_disease';

export interface TraitDefinition {
    id: string;
    name: string;
    rank: TraitRank;
    category: TraitCategory;
    capacity: number;              // capacity cost (器コスト)
    icon: string;
    desc: string;
    // stat modifiers (percentage-based, applied multiplicatively)
    bonuses: Partial<Record<keyof CombatStats | 'critRate' | 'evasion' | 'lifesteal' | 'thornDmg' | 'dotOnHit' | 'critDamage', number>>;
    penalties: Partial<Record<keyof CombatStats | 'critRate' | 'evasion' | 'hpDecayPerSec' | 'maxHpDecayPerWave' | 'critDamage', number>>;
    // special flags
    element?: 'Fire' | 'Ice' | 'Lightning';  // element-linked only
    berserkThreshold?: number;  // HP ratio to trigger
    mutationChance?: number;    // appearance rate modifier
}

export interface TraitInstance {
    defId: string;         // references TraitDefinition.id
    rank: TraitRank;
    source: 'inherited' | 'mutation' | 'crystal_extract';
}

// ========== CONSTANTS ==========

export const TRAIT_CONFIG = {
    maxSlots: 5,
    capacityLimit: 12,
    rankCapacity: { Common: 1, Rare: 2, Epic: 3, Legendary: 4 } as const,
    purePositiveMutationChance: 0.12,  // 12% when mutation occurs
    diseaseBaseChance: 0.40,           // COI × 40%
} as const;

// ========== TRAIT LIBRARY ==========

export const TRAIT_LIBRARY: TraitDefinition[] = [
    // ━━━ 属性連動型 (Element-Linked) ━━━
    {
        id: 'ELT_001', name: '灼熱核', rank: 'Rare', category: 'element_linked', capacity: 2,
        icon: '🔥', desc: '攻撃力+40%。最大HP-20%', element: 'Fire',
        bonuses: { attack: 0.40 }, penalties: { maxHp: -0.20 }
    },
    {
        id: 'ELT_002', name: '永久凍土', rank: 'Rare', category: 'element_linked', capacity: 2,
        icon: '🧊', desc: '防御力+50%。攻撃速度-30%', element: 'Ice',
        bonuses: { defense: 0.50 }, penalties: { attackSpeed: -0.30 }
    },
    {
        id: 'ELT_003', name: '過電流', rank: 'Rare', category: 'element_linked', capacity: 2,
        icon: '⚡', desc: '攻撃速度+60%。攻撃力-25%', element: 'Lightning',
        bonuses: { attackSpeed: 0.60 }, penalties: { attack: -0.25 }
    },
    {
        id: 'ELT_004', name: '業火の鎧', rank: 'Epic', category: 'element_linked', capacity: 3,
        icon: '🛡️', desc: '火耐性+60%。氷耐性-40%', element: 'Fire',
        bonuses: { fireResist: 0.60 }, penalties: { iceResist: -0.40 }
    },

    // ━━━ 性能偏重型 (Stat-Skewed) ━━━
    {
        id: 'SST_001', name: 'ガラスの大砲', rank: 'Epic', category: 'stat_skewed', capacity: 3,
        icon: '💣', desc: '攻撃力+80%。HP-40%、防御-30%',
        bonuses: { attack: 0.80 }, penalties: { maxHp: -0.40, defense: -0.30 }
    },
    {
        id: 'SST_002', name: '鉄壁の亀', rank: 'Epic', category: 'stat_skewed', capacity: 3,
        icon: '🐢', desc: '防御+100%、HP+25%。攻速-50%、攻撃-20%',
        bonuses: { defense: 1.00, maxHp: 0.25 }, penalties: { attackSpeed: -0.50, attack: -0.20 }
    },
    {
        id: 'SST_003', name: '吸血鬼', rank: 'Rare', category: 'stat_skewed', capacity: 2,
        icon: '🧛', desc: 'ダメ20%吸血。HP-30%',
        bonuses: { lifesteal: 0.20 }, penalties: { maxHp: -0.30 }
    },
    {
        id: 'SST_004', name: '捨て身', rank: 'Rare', category: 'stat_skewed', capacity: 2,
        icon: '⚔️', desc: '攻撃+60%、会心率+15%。防御-50%',
        bonuses: { attack: 0.60, critRate: 0.15 }, penalties: { defense: -0.50 }
    },

    // ━━━ 変異型 (Mutation) ━━━
    {
        id: 'MUT_001', name: '不安定な核', rank: 'Rare', category: 'mutation', capacity: 2,
        icon: '☢️', desc: '攻撃+35%。被弾時5%で自爆(HP-25%)',
        bonuses: { attack: 0.35 }, penalties: {}, mutationChance: 0.05
    },
    {
        id: 'MUT_002', name: '狂戦士化', rank: 'Epic', category: 'mutation', capacity: 3,
        icon: '👹', desc: 'HP50%以下で攻撃力2倍。防御0',
        bonuses: { attack: 1.00 }, penalties: { defense: -1.00 }, berserkThreshold: 0.50
    },
    {
        id: 'MUT_003', name: '適者生存', rank: 'Legendary', category: 'mutation', capacity: 4,
        icon: '🧬', desc: '10秒毎に全ステ+5%累積。初期ステ-15%',
        bonuses: {}, penalties: { attack: -0.15, defense: -0.15, maxHp: -0.15 }
    },
    {
        id: 'MUT_004', name: '呪詛の刃', rank: 'Rare', category: 'mutation', capacity: 2,
        icon: '☠️', desc: '攻撃にDoT付与(毎秒2%)。自分も毎秒1%',
        bonuses: { dotOnHit: 0.02 }, penalties: { hpDecayPerSec: 0.01 }
    },

    // ━━━ 純粋加護 (Pure Positive) ━━━
    {
        id: 'PP_001', name: '黄金の回路', rank: 'Rare', category: 'pure_positive', capacity: 2,
        icon: '✨', desc: '全ステ+5%',
        bonuses: { attack: 0.05, defense: 0.05, maxHp: 0.05 }, penalties: {}
    },
    {
        id: 'PP_002', name: '精密神経', rank: 'Common', category: 'pure_positive', capacity: 1,
        icon: '🎯', desc: '攻撃速度+8%',
        bonuses: { attackSpeed: 0.08 }, penalties: {}
    },
    {
        id: 'PP_003', name: '強靭な皮膚', rank: 'Common', category: 'pure_positive', capacity: 1,
        icon: '🛡️', desc: '防御力+8%',
        bonuses: { defense: 0.08 }, penalties: {}
    },
    {
        id: 'PP_004', name: '覇気', rank: 'Legendary', category: 'pure_positive', capacity: 4,
        icon: '👑', desc: '全ステ+10%',
        bonuses: { attack: 0.10, defense: 0.10, maxHp: 0.10, attackSpeed: 0.10 }, penalties: {}
    },

    // ━━━ 遺伝病 (Genetic Disease) ━━━
    {
        id: 'GD_001', name: '脆い骨格', rank: 'Common', category: 'genetic_disease', capacity: 0,
        icon: '💔', desc: '最大HP-25%',
        bonuses: {}, penalties: { maxHp: -0.25 }
    },
    {
        id: 'GD_002', name: '感覚鈍麻', rank: 'Common', category: 'genetic_disease', capacity: 0,
        icon: '🫥', desc: '攻撃速度-20%',
        bonuses: {}, penalties: { attackSpeed: -0.20 }
    },
    {
        id: 'GD_003', name: 'エネルギー漏出', rank: 'Common', category: 'genetic_disease', capacity: 0,
        icon: '⚠️', desc: '毎秒HP-1%',
        bonuses: {}, penalties: { hpDecayPerSec: 0.01 }
    },
    {
        id: 'GD_004', name: '傷口が開く', rank: 'Common', category: 'genetic_disease', capacity: 0,
        icon: '🩸', desc: 'Wave毎にmaxHP-5%',
        bonuses: {}, penalties: { maxHpDecayPerWave: 0.05 }
    },
];

// ========== SYNERGY PAIRS ==========

export interface SynergyPair {
    traitA: string;  // trait ID
    traitB: string;
    resultName: string;
    icon: string;
    desc: string;
    bonuses: Partial<Record<string, number>>;
}

export const SYNERGY_PAIRS: SynergyPair[] = [
    {
        traitA: 'ELT_002', traitB: 'ELT_003',
        resultName: '絶対零度', icon: '🧊⚡',
        desc: '攻撃毎に5%で敵を凍結', bonuses: { freezeChance: 0.05 }
    },
    {
        traitA: 'ELT_001', traitB: 'SST_001',
        resultName: '超新星', icon: '💥🔥',
        desc: 'HP20%以下で攻撃力+100%', bonuses: { attack: 1.00 }
    },
    {
        traitA: 'SST_003', traitB: 'MUT_002',
        resultName: '血の渇望', icon: '🩸⚔️',
        desc: 'HP50%以下で吸血量2倍', bonuses: { lifesteal: 0.20 }
    },
    {
        traitA: 'SST_004', traitB: 'MUT_001',
        resultName: '修羅', icon: '👹⚔️',
        desc: '攻撃+100%。防御0、回復0', bonuses: { attack: 1.00 }
    },
    {
        traitA: 'MUT_004', traitB: 'SST_003',
        resultName: '死食い', icon: '☠️🍽️',
        desc: 'DoTダメも吸血対象に', bonuses: { dotOnHit: 0.01 }
    },
];

// ========== CORE FUNCTIONS ==========

/** Get trait definition by ID */
export function getTraitDef(id: string): TraitDefinition | undefined {
    return TRAIT_LIBRARY.find(t => t.id === id);
}

/**
 * Diminishing returns stacking formula
 * effect = 1 - (1 - individualEffect)^count
 * Never reaches 100%
 */
export function calcStackedEffect(individualEffect: number, stackCount: number): number {
    if (stackCount <= 0) return 0;
    return 1 - Math.pow(1 - Math.abs(individualEffect), stackCount);
}

/**
 * Apply all traits to base combat stats.
 * Handles:
 * - Capacity (器) overflow check — excess traits randomly removed
 * - Same-stat stacking with diminishing returns
 * - Penalty application
 */
export function applyTraits(
    baseStats: CombatStats,
    traits: TraitInstance[],
    berserkActive: boolean = false,
): { stats: CombatStats; activeTraits: TraitInstance[]; lostTraits: string[]; activeSynergies: string[] } {
    const stats = { ...baseStats };
    const lostTraits: string[] = [];
    let activeTraits = [...traits].slice(0, TRAIT_CONFIG.maxSlots);

    // 1) Capacity check
    let totalCap = 0;
    for (const t of activeTraits) {
        totalCap += TRAIT_CONFIG.rankCapacity[t.rank];
    }
    while (totalCap > TRAIT_CONFIG.capacityLimit && activeTraits.length > 0) {
        // Remove lowest-rank trait first
        const sortedByRank = [...activeTraits].sort((a, b) =>
            TRAIT_CONFIG.rankCapacity[a.rank] - TRAIT_CONFIG.rankCapacity[b.rank]
        );
        const removed = sortedByRank[0];
        activeTraits = activeTraits.filter(t => t !== removed);
        lostTraits.push(removed.defId);
        totalCap -= TRAIT_CONFIG.rankCapacity[removed.rank];
    }

    // 2) Collect all stat modifiers
    const bonusAccum: Record<string, number[]> = {};
    const penaltyAccum: Record<string, number[]> = {};

    for (const t of activeTraits) {
        const def = getTraitDef(t.defId);
        if (!def) continue;

        // Skip berserk traits unless threshold met
        if (def.berserkThreshold && !berserkActive) continue;

        for (const [key, val] of Object.entries(def.bonuses)) {
            if (!bonusAccum[key]) bonusAccum[key] = [];
            bonusAccum[key].push(val as number);
        }
        for (const [key, val] of Object.entries(def.penalties)) {
            if (!penaltyAccum[key]) penaltyAccum[key] = [];
            penaltyAccum[key].push(val as number);
        }
    }

    // 3) Check synergies
    const activeSynergies: string[] = [];
    const traitIds = new Set(activeTraits.map(t => t.defId));
    for (const syn of SYNERGY_PAIRS) {
        if (traitIds.has(syn.traitA) && traitIds.has(syn.traitB)) {
            activeSynergies.push(syn.resultName);
            for (const [key, val] of Object.entries(syn.bonuses)) {
                if (!bonusAccum[key]) bonusAccum[key] = [];
                bonusAccum[key].push(val as number);
            }
        }
    }

    // 4) Apply with diminishing returns
    const applyMod = (key: string, values: number[], isBonus: boolean) => {
        // For same-stat stacking: use diminishing formula
        const totalEffect = values.length === 1
            ? values[0]
            : (isBonus ? 1 : -1) * calcStackedEffect(Math.abs(values[0]), values.length);

        const finalVal = isBonus ? totalEffect : -Math.abs(totalEffect);

        switch (key) {
            case 'attack': stats.attack *= (1 + finalVal); break;
            case 'defense': stats.defense *= (1 + finalVal); break;
            case 'maxHp': stats.maxHp *= (1 + finalVal); break;
            case 'attackSpeed':
                // attackSpeed is "seconds per action", lower = faster
                // bonus = faster = multiply by (1 - val)
                stats.attackSpeed *= isBonus ? (1 / (1 + finalVal)) : (1 / (1 + finalVal));
                break;
            case 'fireResist': stats.fireResist = Math.min(0.95, Math.max(0, stats.fireResist + finalVal)); break;
            case 'iceResist': stats.iceResist = Math.min(0.95, Math.max(0, stats.iceResist + finalVal)); break;
            case 'lightningResist': stats.lightningResist = Math.min(0.95, Math.max(0, stats.lightningResist + finalVal)); break;
            // Extended stats stored directly won't affect CombatStats but will be read by battle engine
        }
    };

    for (const [key, values] of Object.entries(bonusAccum)) {
        applyMod(key, values, true);
    }
    for (const [key, values] of Object.entries(penaltyAccum)) {
        applyMod(key, values, false);
    }

    // Ensure minimums
    stats.attack = Math.max(1, stats.attack);
    stats.defense = Math.max(0, stats.defense);
    stats.maxHp = Math.max(10, stats.maxHp);
    stats.attackSpeed = Math.max(0.1, Math.min(3.0, stats.attackSpeed));

    return { stats, activeTraits, lostTraits, activeSynergies };
}

/**
 * Roll for a Pure Positive trait during mutation.
 * Only triggers on successful mutation (called from breed).
 * Returns null if no trait gained.
 */
export function rollTraitOnMutation(): TraitInstance | null {
    if (Math.random() > TRAIT_CONFIG.purePositiveMutationChance) return null;

    const pool = TRAIT_LIBRARY.filter(t => t.category === 'pure_positive');
    // Weighted by rarity (rarer = less likely)
    const weights = pool.map(t => {
        switch (t.rank) {
            case 'Common': return 50;
            case 'Rare': return 25;
            case 'Epic': return 10;
            case 'Legendary': return 3;
        }
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
            return { defId: pool[i].id, rank: pool[i].rank, source: 'mutation' };
        }
    }
    return null;
}

/**
 * Roll genetic diseases based on inbreeding coefficient (COI).
 * Disease chance = COI × 40%
 * Higher COI may produce multiple diseases.
 */
export function rollDiseaseOnInbreed(coi: number): TraitInstance[] {
    const diseases: TraitInstance[] = [];
    const chance = coi * TRAIT_CONFIG.diseaseBaseChance;

    if (Math.random() < chance) {
        const pool = TRAIT_LIBRARY.filter(t => t.category === 'genetic_disease');
        const disease = pool[Math.floor(Math.random() * pool.length)];
        diseases.push({ defId: disease.id, rank: disease.rank, source: 'inherited' });

        // High COI: chance for second disease
        if (coi > 0.35 && Math.random() < coi * 0.30) {
            const second = pool[Math.floor(Math.random() * pool.length)];
            if (second.id !== disease.id) {
                diseases.push({ defId: second.id, rank: second.rank, source: 'inherited' });
            }
        }
    }

    return diseases;
}

/**
 * Resolve trait inheritance from two parents.
 * - Tradeoff/element traits: 30% base inherit × (1 + COI) per trait
 * - Pure Positive: 20% base × (1 + COI×2) — inbreed doubles the rate
 * - Genetic diseases: parent diseases + COI-based new diseases
 * - Max 5 traits total
 */
export function resolveTraitInheritance(
    parentATraits: TraitInstance[],
    parentBTraits: TraitInstance[],
    coi: number,
): TraitInstance[] {
    const childTraits: TraitInstance[] = [];
    const usedIds = new Set<string>();

    // Merge parent traits
    const allParentTraits = [...parentATraits, ...parentBTraits];

    for (const t of allParentTraits) {
        if (usedIds.has(t.defId)) continue;  // no duplicates
        if (childTraits.length >= TRAIT_CONFIG.maxSlots) break;

        const def = getTraitDef(t.defId);
        if (!def) continue;

        let inheritChance: number;
        if (def.category === 'pure_positive') {
            inheritChance = 0.20 * (1 + coi * 2);  // inbreed boosts positive inheritance
        } else if (def.category === 'genetic_disease') {
            inheritChance = 0.50 + coi * 0.30;     // diseases are sticky
        } else {
            inheritChance = 0.30 * (1 + coi);      // standard traits
        }

        if (Math.random() < inheritChance) {
            childTraits.push({ defId: t.defId, rank: t.rank, source: 'inherited' });
            usedIds.add(t.defId);
        }
    }

    // Roll new diseases from inbreeding
    if (coi > 0) {
        const newDiseases = rollDiseaseOnInbreed(coi);
        for (const d of newDiseases) {
            if (childTraits.length >= TRAIT_CONFIG.maxSlots) break;
            if (!usedIds.has(d.defId)) {
                childTraits.push(d);
                usedIds.add(d.defId);
            }
        }
    }

    // Roll for mutation-triggered pure positive
    if (childTraits.length < TRAIT_CONFIG.maxSlots) {
        const mutTrait = rollTraitOnMutation();
        if (mutTrait && !usedIds.has(mutTrait.defId)) {
            childTraits.push(mutTrait);
        }
    }

    return childTraits;
}

/**
 * Get trait summary for display purposes
 */
export function getTraitSummary(traits: TraitInstance[]): { name: string; icon: string; rank: TraitRank; desc: string }[] {
    return traits.map(t => {
        const def = getTraitDef(t.defId);
        if (!def) return { name: '???', icon: '❓', rank: 'Common' as TraitRank, desc: '' };
        return { name: def.name, icon: def.icon, rank: def.rank, desc: def.desc };
    });
}

/**
 * Get extra combat effects from traits (for battle engine to process)
 */
export function getTraitCombatEffects(traits: TraitInstance[]): {
    lifesteal: number;
    thornDmg: number;
    dotOnHit: number;
    hpDecayPerSec: number;
    maxHpDecayPerWave: number;
    berserkThreshold: number;
    selfDestructChance: number;
} {
    let lifesteal = 0, thornDmg = 0, dotOnHit = 0;
    let hpDecayPerSec = 0, maxHpDecayPerWave = 0;
    let berserkThreshold = 0, selfDestructChance = 0;

    for (const t of traits) {
        const def = getTraitDef(t.defId);
        if (!def) continue;

        if (def.bonuses.lifesteal) lifesteal += def.bonuses.lifesteal;
        if (def.bonuses.thornDmg) thornDmg += def.bonuses.thornDmg;
        if (def.bonuses.dotOnHit) dotOnHit += def.bonuses.dotOnHit;
        if (def.penalties.hpDecayPerSec) hpDecayPerSec += def.penalties.hpDecayPerSec;
        if (def.penalties.maxHpDecayPerWave) maxHpDecayPerWave += def.penalties.maxHpDecayPerWave;
        if (def.berserkThreshold) berserkThreshold = def.berserkThreshold;
        if (def.mutationChance) selfDestructChance += def.mutationChance;
    }

    return { lifesteal, thornDmg, dotOnHit, hpDecayPerSec, maxHpDecayPerWave, berserkThreshold, selfDestructChance };
}

/**
 * Crystallization choices
 */
export type CrystallizationChoice = 'extract_trait' | 'stat_fuel';

export interface CrystallizationResult {
    choice: CrystallizationChoice;
    extractedTrait?: TraitInstance;
    statBoosts?: Partial<Record<string, number>>;
    epYield: number;
}
