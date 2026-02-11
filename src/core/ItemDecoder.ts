/**
 * Chimera Gear: Text Edition — Genome → Combat Stats Decoder
 */

import type { Item, Genome } from './GeneticEngine';

export type ElementType = 'Fire' | 'Ice' | 'Lightning';
export type SpecialAbility = 'none' | 'homing' | 'piercing' | 'chain_explosion';
export type ActionType = 'attack' | 'skill' | 'defend';

export interface CombatStats {
    attack: number;
    attackSpeed: number;   // seconds per action
    element: ElementType;
    special: SpecialAbility;
    maxHp: number;
    defense: number;

    // AI personality weights (sum to ~1.0)
    aggressionWeight: number;   // normal attack bias
    defenseWeight: number;      // defend/repair bias
    tacticalWeight: number;     // special skill bias

    // Elemental resistances (0.0–1.0)
    fireResist: number;
    iceResist: number;
    lightningResist: number;
}

export class ItemDecoder {
    static decode(genome: Genome, stageBase: number = 100): CombatStats {
        // [0] Attack Power — exponential curve
        const attack = Math.pow(genome[0], 1.4) * stageBase;

        // [1] Attack Speed — 0.3s (fast) ~ 1.5s (slow)
        const attackSpeed = 0.3 + (1.0 - genome[1]) * 1.2;

        // [2] Element — threshold
        let element: ElementType = 'Lightning';
        if (genome[2] < 0.33) element = 'Fire';
        else if (genome[2] < 0.66) element = 'Ice';

        // [3] Special Ability
        let special: SpecialAbility = 'none';
        if (genome[3] >= 0.9) special = 'chain_explosion';
        else if (genome[3] >= 0.75) special = 'homing';
        else if (genome[3] >= 0.6) special = 'piercing';

        // [4] Max HP
        const maxHp = 60 + genome[4] * 440;

        // [5,6,7] AI Personality — normalize to weights
        const rawAggr = genome[5];
        const rawDef = genome[6];
        const rawTact = genome[7];
        const total = rawAggr + rawDef + rawTact + 0.01;
        const aggressionWeight = rawAggr / total;
        const defenseWeight = rawDef / total;
        const tacticalWeight = rawTact / total;

        // [8,9] Resistances — Lightning derived as tradeoff
        const fireResist = genome[8];
        const iceResist = genome[9];
        const lightningResist = Math.max(0, 1.0 - (fireResist + iceResist) * 0.6);

        // Defense from resistances
        const defense = ((fireResist + iceResist + lightningResist) / 3) * 30;

        return {
            attack,
            attackSpeed,
            element,
            special,
            maxHp,
            defense,
            aggressionWeight,
            defenseWeight,
            tacticalWeight,
            fireResist,
            iceResist,
            lightningResist,
        };
    }

    static getRating(item: Item): string {
        const stats = this.decode(item.genome);
        const dps = stats.attack / stats.attackSpeed;
        if (dps > 500) return 'S';
        if (dps > 300) return 'A';
        if (dps > 150) return 'B';
        if (dps > 50) return 'C';
        return 'D';
    }

    static getElementLabel(elem: ElementType): string {
        switch (elem) {
            case 'Fire': return '🔥 火炎';
            case 'Ice': return '❄️ 氷結';
            case 'Lightning': return '⚡ 雷撃';
        }
    }

    static getSpecialLabel(special: SpecialAbility): string {
        switch (special) {
            case 'chain_explosion': return '💥 連鎖爆発';
            case 'homing': return '🎯 追尾';
            case 'piercing': return '🗡️ 貫通';
            case 'none': return '—';
        }
    }

    /** Encode genome as a shareable Base64 string */
    static encodeShareCode(item: Item): string {
        const data = {
            g: item.genome.map(v => Math.round(v * 1000) / 1000),
            n: item.generation,
            f: Math.round(item.fitness * 100) / 100,
        };
        return btoa(JSON.stringify(data));
    }

    /** Decode a Base64 share code back into an Item */
    static decodeShareCode(code: string): Item | null {
        try {
            const data = JSON.parse(atob(code));
            if (!data.g || !Array.isArray(data.g) || data.g.length !== 10) return null;
            return {
                id: `import_${Date.now()}`,
                genome: data.g,
                generation: data.n || 1,
                fitness: data.f || 0,
            };
        } catch {
            return null;
        }
    }
}
