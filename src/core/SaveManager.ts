/**
 * Chimera Gear: Text Edition — Save Manager (IndexedDB via Dexie.js)
 */

import Dexie from 'dexie';
import type { Item, Genome } from './GeneticEngine';
import type { CrystallizedItem } from './PedigreeSystem';
import type { MaterialType } from '../store/useGameStore';

// ========== ARCHIVED ANCESTOR ==========
// Lightweight record for pedigree display after item is decomposed/crystallized
export interface ArchivedAncestor {
    id: string;
    genome: Genome;
    generation: number;
    parentIds?: [string, string];
    bloodlineName?: string;
    status: 'decomposed' | 'crystallized';
    archivedAt: number;
    finalMastery?: number;   // mastery at time of archive
    highestStage?: number;   // highest stage reached with this item
}

// ========== DATABASE SCHEMA ==========

interface SaveData {
    id: string; // always 'main'
    inventory: Item[];
    equippedWeaponId: string | null;
    stage: number;
    wave: number;
    geneEnergy: number;
    materials: Record<MaterialType, number>;
    crystallizedItems: CrystallizedItem[];
    ancestors: ArchivedAncestor[];
    dpsHistory: number[];
    peakDps: number;
    maxClearedStage: number;
    unlockedArchives?: Record<number, string>;
    gameCleared?: boolean;
    savedAt: number;
}

class ChimeraDB extends Dexie {
    saves!: Dexie.Table<SaveData, string>;

    constructor() {
        super('chimera-gear-db');
        this.version(1).stores({
            saves: 'id',
        });
    }
}

const db = new ChimeraDB();

// ========== PUBLIC API ==========

export class SaveManager {
    /**
     * Save the current game state to IndexedDB.
     * We store a single save slot with id='main'.
     */
    static async saveGame(state: {
        inventory: Item[];
        equippedWeapon: Item | null;
        stage: number;
        wave: number;
        geneEnergy: number;
        materials: Record<MaterialType, number>;
        crystallizedItems: CrystallizedItem[];
        ancestors: ArchivedAncestor[];
        dpsHistory: number[];
        peakDps: number;
        maxClearedStage: number;
        unlockedArchives: Record<number, string>;
        gameCleared: boolean;
    }): Promise<void> {
        try {
            const data: SaveData = {
                id: 'main',
                inventory: state.inventory,
                equippedWeaponId: state.equippedWeapon?.id ?? null,
                stage: state.stage,
                wave: state.wave,
                geneEnergy: state.geneEnergy,
                materials: state.materials,
                crystallizedItems: state.crystallizedItems,
                ancestors: state.ancestors ?? [],
                dpsHistory: state.dpsHistory,
                peakDps: state.peakDps,
                maxClearedStage: state.maxClearedStage,
                unlockedArchives: state.unlockedArchives,
                gameCleared: state.gameCleared,
                savedAt: Date.now(),
            };
            await db.saves.put(data);
        } catch (err) {
            console.error('[SaveManager] Save failed:', err);
        }
    }

    /**
     * Load game state from IndexedDB.
     * Returns null if no save exists or data is unrecoverable.
     * Corrupted fields are automatically repaired with defaults.
     */
    static async loadGame(): Promise<{
        inventory: Item[];
        equippedWeapon: Item | null;
        stage: number;
        wave: number;
        geneEnergy: number;
        materials: Record<MaterialType, number>;
        crystallizedItems: CrystallizedItem[];
        ancestors: ArchivedAncestor[];
        dpsHistory: number[];
        peakDps: number;
        maxClearedStage: number;
        unlockedArchives: Record<number, string>;
        gameCleared: boolean;
    } | null> {
        try {
            const data = await db.saves.get('main');
            if (!data) return null;

            // Validate & repair inventory items
            const inventory = (Array.isArray(data.inventory) ? data.inventory : [])
                .filter((item): item is Item => item != null && typeof item === 'object')
                .map(item => ({
                    ...item,
                    // Repair genome: must be array of 10 numbers
                    genome: Array.isArray(item.genome) && item.genome.length === 10
                        && item.genome.every(g => typeof g === 'number')
                        ? item.genome
                        : Array.from({ length: 10 }, () => Math.random()),
                    fitness: typeof item.fitness === 'number' ? item.fitness : 0,
                    generation: typeof item.generation === 'number' && item.generation > 0
                        ? item.generation : 1,
                    breedCount: typeof item.breedCount === 'number' ? item.breedCount : 0,
                    locked: typeof item.locked === 'boolean' ? item.locked : false,
                }));

            // Validate scalar fields with safe defaults
            const stage = typeof data.stage === 'number' && data.stage > 0 ? data.stage : 1;
            const wave = typeof data.wave === 'number' && data.wave > 0 ? data.wave : 1;
            const geneEnergy = typeof data.geneEnergy === 'number' ? Math.max(0, data.geneEnergy) : 0;
            const peakDps = typeof data.peakDps === 'number' ? Math.max(0, data.peakDps) : 0;

            // Reconstruct equippedWeapon from inventory
            const equippedWeapon = data.equippedWeaponId
                ? inventory.find(i => i.id === data.equippedWeaponId) ?? null
                : null;

            return {
                inventory,
                equippedWeapon,
                stage,
                wave,
                geneEnergy,
                materials: data.materials ?? { fire_shard: 0, ice_shard: 0, lightning_shard: 0 },
                crystallizedItems: Array.isArray(data.crystallizedItems) ? data.crystallizedItems : [],
                ancestors: Array.isArray(data.ancestors) ? data.ancestors : [],
                dpsHistory: Array.isArray(data.dpsHistory) ? data.dpsHistory : [],
                peakDps,
                maxClearedStage: typeof data.maxClearedStage === 'number'
                    ? data.maxClearedStage
                    : (stage > 1 ? stage - 1 : 0),
                unlockedArchives: data.unlockedArchives ?? {},
                gameCleared: data.gameCleared ?? false,
            };
        } catch (err) {
            console.error('[SaveManager] Load failed, returning null for fresh start:', err);
            return null;
        }
    }

    /**
     * Check if a save exists.
     */
    static async hasSaveData(): Promise<boolean> {
        const count = await db.saves.count();
        return count > 0;
    }

    /**
     * Delete saved data (for NEW GAME).
     */
    static async deleteSave(): Promise<void> {
        await db.saves.delete('main');
    }
}
