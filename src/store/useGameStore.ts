/**
 * Chimera Gear: Text Edition — Global State (Zustand)
 */

import { create } from 'zustand';
import type { Item } from '../core/GeneticEngine';
import type { BattleLogEntry, BattleResult } from '../core/TextBattleEngine';
import type { CounterReport } from '../core/EnemyEvolution';
import type { SimulationResult } from '../core/FastSimulator';
import { FitnessCalculator } from '../core/FitnessCalculator';
import { PedigreeSystem } from '../core/PedigreeSystem';
import type { CrystallizedItem } from '../core/PedigreeSystem';
import { SaveManager } from '../core/SaveManager';

export type TabView = 'battle' | 'lab' | 'database';
export type ItemCategory = 'battle' | 'breeding' | 'material';
export type MaterialType = 'fire_shard' | 'ice_shard' | 'lightning_shard';

export interface StageSummary {
    stage: number;
    totalKills: number;
    genesCollected: number;
    bestFitness: number;
}

export interface GameStoreState {
    // Navigation
    activeTab: TabView;
    setActiveTab: (tab: TabView) => void;

    // Stage / Wave
    stage: number;
    wave: number;
    maxWaves: number;
    maxClearedStage: number;

    // Battle
    isBattling: boolean;
    battleLogs: BattleLogEntry[];
    currentResult: BattleResult | null;
    battleSpeed: number; // 1x, 10x, 100x

    // Weapons (Inventory)
    inventory: Item[];
    equippedWeapon: Item | null;
    geneEnergy: number;

    // Enemy Evolution
    counterReports: CounterReport[];

    // Simulation
    lastSimulation: SimulationResult | null;

    // Breeding phase
    isBreedingPhase: boolean;

    // Toast notification
    toast: string | null;

    // Stage clear summary
    stageSummary: StageSummary | null;

    // Analytics: DPS tracking
    dpsHistory: number[];
    peakDps: number;

    // Pedigree: crystallized items (Hall of Fame)
    crystallizedItems: CrystallizedItem[];

    // Materials (elemental shards)
    materials: Record<MaterialType, number>;

    // Actions
    startBattle: () => void;
    addBattleLog: (log: BattleLogEntry) => void;
    addBattleLogs: (logs: BattleLogEntry[]) => void;
    setBattleResult: (result: BattleResult) => void;
    endBattle: () => void;
    setBattleSpeed: (speed: number) => void;

    addItem: (item: Item) => void;
    removeItem: (id: string) => void;
    equipWeapon: (item: Item) => void;
    decompose: (ids: string[]) => void;
    moveToCategory: (itemId: string, category: ItemCategory) => void;
    toggleItemLock: (itemId: string) => void;
    bulkCrystallize: () => CrystallizedItem[];
    addMaterial: (type: MaterialType, count: number) => void;
    spendMaterial: (type: MaterialType, count: number) => boolean;
    spendEnergy: (amount: number) => boolean;

    addCounterReport: (report: CounterReport) => void;
    setSimulation: (result: SimulationResult | null) => void;
    showToast: (message: string) => void;
    setStageSummary: (summary: StageSummary | null) => void;

    advanceWave: () => void;
    advanceStage: () => void;
    setStage: (stage: number) => void;
    enterBreedingPhase: () => void;
    exitBreedingPhase: () => void;
    recordDps: (dps: number) => void;
    updateMastery: (itemId: string, fitness: number) => void;
    incrementBreedCount: (itemId: string) => void;
    crystallizeItem: (itemId: string) => CrystallizedItem | null;

    // Atomic breeding: energy + material + breedCount + addChild in single set()
    breedTransaction: (
        parentAId: string, parentBId: string, child: Item,
        cost: number, materialType?: MaterialType,
    ) => boolean;

    // Save / Load
    saveGame: () => Promise<void>;
    loadGame: () => Promise<boolean>;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
    // Navigation
    activeTab: 'battle',
    setActiveTab: (tab) => set({ activeTab: tab }),

    // Stage
    stage: 1,
    wave: 1,
    maxWaves: 3,
    maxClearedStage: 0,

    // Battle
    isBattling: false,
    battleLogs: [],
    currentResult: null,
    battleSpeed: 1,

    // Inventory
    inventory: [],
    equippedWeapon: null,
    geneEnergy: 0,

    // Evolution
    counterReports: [],

    // Simulation
    lastSimulation: null,

    // Breeding
    isBreedingPhase: false,

    // Toast
    toast: null,

    // Stage Summary
    stageSummary: null,

    // Analytics
    dpsHistory: [],
    peakDps: 0,

    // Pedigree
    crystallizedItems: [],

    // Materials
    materials: { fire_shard: 0, ice_shard: 0, lightning_shard: 0 },

    // Actions
    startBattle: () => set({ isBattling: true, battleLogs: [], currentResult: null, stageSummary: null }),
    addBattleLog: (log) => set((s) => ({ battleLogs: [...s.battleLogs, log].slice(-200) })),
    addBattleLogs: (logs) => set((s) => ({ battleLogs: [...s.battleLogs, ...logs].slice(-200) })),
    setBattleResult: (result) => set({ currentResult: result }),
    endBattle: () => set({ isBattling: false }),
    setBattleSpeed: (speed) => set({ battleSpeed: speed }),

    addItem: (item) => set((s) => {
        // Deduplicate by ID
        if (s.inventory.some(i => i.id === item.id)) return s;
        return { inventory: [...s.inventory, item] };
    }),
    removeItem: (id) => set((s) => ({ inventory: s.inventory.filter(i => i.id !== id) })),
    equipWeapon: (item) => set((s) => {
        // Ensure equipped weapon is in inventory (add if missing, no duplicates)
        const inInventory = s.inventory.some(i => i.id === item.id);
        return {
            equippedWeapon: item,
            inventory: inInventory ? s.inventory : [...s.inventory, item],
        };
    }),
    decompose: (ids) => {
        const state = get();
        // Block decomposing equipped weapon
        const equippedId = state.equippedWeapon?.id;
        const safeIds = ids.filter(id => id !== equippedId);
        const toRemove = state.inventory.filter(i => safeIds.includes(i.id));
        const energyGain = toRemove.length * 10;
        set({
            inventory: state.inventory.filter(i => !safeIds.includes(i.id)),
            geneEnergy: state.geneEnergy + energyGain,
        });
    },
    spendEnergy: (amount) => {
        const state = get();
        if (state.geneEnergy < amount) return false;
        set({ geneEnergy: state.geneEnergy - amount });
        return true;
    },
    moveToCategory: (itemId, category) => set((s) => ({
        inventory: s.inventory.map(item =>
            item.id === itemId ? { ...item, category } : item
        ),
    })),
    toggleItemLock: (itemId) => set((s) => ({
        inventory: s.inventory.map(item =>
            item.id === itemId ? { ...item, locked: !item.locked } : item
        ),
        equippedWeapon: s.equippedWeapon?.id === itemId
            ? { ...s.equippedWeapon, locked: !s.equippedWeapon.locked }
            : s.equippedWeapon,
    })),
    bulkCrystallize: () => {
        const state = get();
        const MAX_BREED = 3;
        const exhausted = state.inventory.filter(i =>
            (i.breedCount ?? 0) >= MAX_BREED &&
            i.id !== state.equippedWeapon?.id &&
            !i.locked
        );
        const crystals: CrystallizedItem[] = [];
        let totalEnergy = 0;
        for (const item of exhausted) {
            const crystal = PedigreeSystem.crystallize(item);
            crystals.push(crystal);
            totalEnergy += crystal.crystalBonus.energyYield;
        }
        set({
            inventory: state.inventory.filter(i =>
                !exhausted.some(e => e.id === i.id)
            ),
            crystallizedItems: [...state.crystallizedItems, ...crystals],
            geneEnergy: state.geneEnergy + totalEnergy,
        });
        return crystals;
    },
    addMaterial: (type, count) => set((s) => ({
        materials: { ...s.materials, [type]: s.materials[type] + count },
    })),
    spendMaterial: (type, count) => {
        const state = get();
        if (state.materials[type] < count) return false;
        set({ materials: { ...state.materials, [type]: state.materials[type] - count } });
        return true;
    },

    addCounterReport: (report) => set((s) => ({
        counterReports: [...s.counterReports, report],
    })),
    setSimulation: (result) => set({ lastSimulation: result }),
    showToast: (message) => {
        set({ toast: message });
        setTimeout(() => set({ toast: null }), 3000);
    },
    setStageSummary: (summary) => set({ stageSummary: summary }),

    advanceWave: () => set((s) => ({ wave: s.wave + 1 })),
    advanceStage: () => set((s) => ({
        stage: s.stage + 1,
        wave: 1,
        maxClearedStage: Math.max(s.maxClearedStage, s.stage),
    })),
    setStage: (stage) => set((s) => ({
        stage: Math.max(1, Math.min(stage, s.maxClearedStage + 1)),
        wave: 1,
    })),
    enterBreedingPhase: () => {
        set({ isBreedingPhase: true });
        // Auto-save on retreat / stage clear
        const s = get();
        SaveManager.saveGame(s).catch(() => { });
    },
    exitBreedingPhase: () => set({ isBreedingPhase: false, activeTab: 'battle' }),
    recordDps: (dps) => set((s) => {
        const history = [...s.dpsHistory, dps].slice(-10); // Keep last 10
        return {
            dpsHistory: history,
            peakDps: Math.max(s.peakDps, dps),
        };
    }),
    updateMastery: (itemId, fitness) => set((s) => ({
        inventory: s.inventory.map(item =>
            item.id === itemId
                ? { ...item, mastery: FitnessCalculator.addMastery(item.mastery ?? 0, fitness) }
                : item
        ),
        equippedWeapon: s.equippedWeapon?.id === itemId
            ? { ...s.equippedWeapon, mastery: FitnessCalculator.addMastery(s.equippedWeapon.mastery ?? 0, fitness) }
            : s.equippedWeapon,
    })),
    incrementBreedCount: (itemId) => set((s) => ({
        inventory: s.inventory.map(item =>
            item.id === itemId
                ? { ...item, breedCount: (item.breedCount ?? 0) + 1 }
                : item
        ),
        equippedWeapon: s.equippedWeapon?.id === itemId
            ? { ...s.equippedWeapon, breedCount: (s.equippedWeapon.breedCount ?? 0) + 1 }
            : s.equippedWeapon,
    })),
    crystallizeItem: (itemId) => {
        const state = get();
        const item = state.inventory.find(i => i.id === itemId);
        if (!item) return null;

        const crystal = PedigreeSystem.crystallize(item);
        set({
            inventory: state.inventory.filter(i => i.id !== itemId),
            crystallizedItems: [...state.crystallizedItems, crystal],
            geneEnergy: state.geneEnergy + crystal.crystalBonus.energyYield,
            equippedWeapon: state.equippedWeapon?.id === itemId ? null : state.equippedWeapon,
        });

        return crystal;
    },

    // ==================== ATOMIC BREEDING ====================
    breedTransaction: (parentAId, parentBId, child, cost, materialType?) => {
        const s = get();
        // Pre-check: enough energy
        if (s.geneEnergy < cost) return false;
        // Pre-check: enough material if required
        if (materialType && (s.materials[materialType] ?? 0) < 1) return false;

        set((state) => {
            const newMaterials = { ...state.materials };
            if (materialType) {
                newMaterials[materialType] = (newMaterials[materialType] ?? 0) - 1;
            }

            const newInventory = state.inventory.map(item => {
                if (item.id === parentAId || item.id === parentBId) {
                    return { ...item, breedCount: (item.breedCount ?? 0) + 1 };
                }
                return item;
            });
            newInventory.push(child);

            return {
                geneEnergy: state.geneEnergy - cost,
                materials: newMaterials,
                inventory: newInventory,
            };
        });
        return true;
    },

    // ==================== SAVE / LOAD ====================
    saveGame: async () => {
        const s = get();
        await SaveManager.saveGame(s);
    },
    loadGame: async () => {
        const data = await SaveManager.loadGame();
        if (!data) return false;
        set({
            inventory: data.inventory,
            equippedWeapon: data.equippedWeapon,
            stage: data.stage,
            wave: data.wave,
            geneEnergy: data.geneEnergy,
            materials: data.materials,
            crystallizedItems: data.crystallizedItems,
            dpsHistory: data.dpsHistory,
            peakDps: data.peakDps,
            maxClearedStage: data.maxClearedStage ?? (data.stage > 1 ? data.stage - 1 : 0),
            isBreedingPhase: false,
            isBattling: false,
            battleLogs: [],
            currentResult: null,
        });
        return true;
    },
}));
