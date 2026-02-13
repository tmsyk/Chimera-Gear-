import { GeneticEngine, type Genome, type Item } from './GeneticEngine';
import { clampGene, boostResistance, createStageGenome } from './mathUtils';

export interface CounterReport {
    stage: number;
    timestamp: number;
    dominantPlayerElement: string | null;
    adaptations: string[];
    resistanceBoost: { gene: string; boost: number }[];
    message: string;
}

export type EnemySpecies = 'standard' | 'tank' | 'attacker' | 'boss';

export class EnemyEvolution {
    private generationCount = 1;
    private bestAncestors: Item[] = [];
    private playerElementDamage: Map<string, number> = new Map();

    /** Record player attack for meta-analysis */
    logPlayerAttack(element: string, damage: number) {
        const current = this.playerElementDamage.get(element) || 0;
        this.playerElementDamage.set(element, current + damage);
    }

    /** Record an enemy death with its fitness */
    logEnemyDeath(item: Item, survivalTime: number, damageDealt: number) {
        item.fitness = survivalTime * 2 + damageDealt * 5;
        this.bestAncestors.push(item);

        // Keep top 20
        this.bestAncestors.sort((a, b) => b.fitness - a.fitness);
        if (this.bestAncestors.length > 20) {
            this.bestAncestors = this.bestAncestors.slice(0, 20);
        }
    }

    /** Get the most threatening player element */
    getDominantPlayerElement(): string | null {
        let max = 0;
        let best: string | null = null;
        for (const [elem, dmg] of this.playerElementDamage.entries()) {
            if (dmg > max) { max = dmg; best = elem; }
        }
        return best;
    }

    /**
     * Spawn a new enemy genome — TWO-TIER SYSTEM:
     * Tier 1: Stage-based base stats (createStageGenome sets quality floor)
     * Tier 2: Adaptive counter-traits from player history (resistance boosts)
     */
    spawnEnemy(stageLevel: number): { genome: Genome; generation: number; species: EnemySpecies } {
        let baseGenome: Genome;
        let gen = 1;

        if (this.bestAncestors.length >= 2) {
            // Tier 1: Evolved from best ancestors + stage quality floor
            this.generationCount = Math.max(...this.bestAncestors.map(p => p.generation)) + 1;
            gen = this.generationCount;

            const p1 = GeneticEngine.selectParent(this.bestAncestors);
            const p2 = GeneticEngine.selectParent(this.bestAncestors);

            let child = GeneticEngine.crossover(p1.genome, p2.genome);
            child = GeneticEngine.mutate(child, 0.12 + stageLevel * 0.01);

            // Apply stage floor: pull weak genes up to stage minimum
            const stageFloor = createStageGenome(stageLevel);
            child = child.map((g, i) => Math.max(g, stageFloor[i] * 0.7));

            // Tier 2: Adaptive counter-resistance from player history
            child = this.applyAdaptiveResistance(child);
            baseGenome = child;
        } else {
            // No history: pure stage-based genome
            baseGenome = createStageGenome(stageLevel);
        }

        // Speciation roll
        const roll = Math.random();
        let species: EnemySpecies = 'standard';

        if (roll < 0.3) {
            // TANK: high HP, low attack, high defense
            species = 'tank';
            baseGenome[4] = clampGene(baseGenome[4] * 1.8);
            baseGenome[0] = baseGenome[0] * 0.5;
            baseGenome[6] = clampGene(baseGenome[6] + 0.3);
            baseGenome[8] = clampGene(baseGenome[8] + 0.1);
            baseGenome[9] = clampGene(baseGenome[9] + 0.1);
        } else if (roll < 0.5) {
            // ATTACKER: low HP, high attack, fast
            species = 'attacker';
            baseGenome[4] = baseGenome[4] * 0.5;
            baseGenome[0] = clampGene(baseGenome[0] * 2.0);
            baseGenome[1] = clampGene(baseGenome[1] + 0.2);
            baseGenome[5] = clampGene(baseGenome[5] + 0.3);
        }

        return { genome: baseGenome, generation: gen, species };
    }

    /** Named boss data per stage tier */
    private static readonly BOSS_DATA: Record<number, { name: string; title: string }> = {
        10: { name: '番犬型試作体ケルベロス', title: '目覚め' },
        20: { name: '深海型適応体リヴァイアサン', title: '休息' },
        30: { name: '暴食型突然変異体フェンリル', title: '熱' },
        40: { name: '空戦型制圧体バハムート', title: 'ソルジャー' },
        50: { name: '循環型巨大体ヨルムンガンド', title: 'チーム' },
        60: { name: '焦土型殲滅体スルト', title: '静寂' },
        70: { name: '原初型支配体ティアマト', title: 'ノイズ' },
        80: { name: '裁定型禁忌体アヌビス', title: '怪物' },
        90: { name: '超越型観測体メタトロン', title: 'キメラ' },
        100: { name: '開発責任者 ミナト', title: '最終戦' },
    };

    /** Spawn a boss enemy — appears every 10 stages.
     *  Named boss with 2.5× all stats (3× for Stage 100) + extreme counter-resistance. */
    spawnBoss(stageLevel: number): {
        genome: Genome; generation: number; species: EnemySpecies;
        bossName?: string; bossTitle?: string;
    } {
        let baseGenome: Genome;
        let gen = 1;

        if (this.bestAncestors.length >= 2) {
            this.generationCount = Math.max(...this.bestAncestors.map(p => p.generation)) + 1;
            gen = this.generationCount;
            const p1 = GeneticEngine.selectParent(this.bestAncestors);
            const p2 = GeneticEngine.selectParent(this.bestAncestors);
            let child = GeneticEngine.crossover(p1.genome, p2.genome);
            child = GeneticEngine.mutate(child, 0.05);

            // Stage quality floor
            const stageFloor = createStageGenome(stageLevel);
            child = child.map((g, i) => Math.max(g, stageFloor[i] * 0.8));
            baseGenome = child;
        } else {
            baseGenome = createStageGenome(stageLevel);
        }

        // Stage 100 (final boss): 3× multiplier; others: 2.5×
        const mult = stageLevel >= 100 ? 3.0 : 2.5;
        baseGenome[0] = clampGene(baseGenome[0] * mult);  // ATK
        baseGenome[1] = clampGene(Math.min(baseGenome[1] + 0.15, 0.99)); // Slightly faster
        baseGenome[4] = clampGene(baseGenome[4] * mult);  // HP
        baseGenome[6] = clampGene(baseGenome[6] + 0.4);   // DEF weight
        baseGenome[8] = clampGene(baseGenome[8] + 0.15);  // Fire resist
        baseGenome[9] = clampGene(baseGenome[9] + 0.15);  // Ice resist

        // Tier 2: Extreme resistance against player's dominant element (+0.4)
        const dominant = this.getDominantPlayerElement();
        if (dominant) {
            baseGenome = boostResistance(baseGenome, dominant as 'Fire' | 'Ice' | 'Lightning', 0.4);
        }

        // Named boss lookup
        const bossInfo = EnemyEvolution.BOSS_DATA[stageLevel];

        return {
            genome: baseGenome,
            generation: gen,
            species: 'boss',
            bossName: bossInfo?.name,
            bossTitle: bossInfo?.title,
        };
    }

    /** Apply resistance boost against player's dominant element */
    private applyAdaptiveResistance(genome: Genome): Genome {
        const dominant = this.getDominantPlayerElement();
        if (!dominant) return genome;
        return boostResistance(genome, dominant as 'Fire' | 'Ice' | 'Lightning', 0.15);
    }

    /** Generate a counter-report at end of stage */
    generateCounterReport(stageLevel: number): CounterReport {
        const dominant = this.getDominantPlayerElement();
        const adaptations: string[] = [];
        const boosts: { gene: string; boost: number }[] = [];

        if (dominant === 'Fire') {
            adaptations.push('火炎耐性を強化');
            boosts.push({ gene: '火炎耐性', boost: 15 });
        } else if (dominant === 'Ice') {
            adaptations.push('氷結耐性を強化');
            boosts.push({ gene: '氷結耐性', boost: 15 });
        } else if (dominant === 'Lightning') {
            adaptations.push('絶縁皮膚を獲得（雷耐性強化）');
            boosts.push({ gene: '雷撃耐性', boost: 20 });
        }

        // Additional stage-based adaptations
        if (stageLevel >= 3) {
            adaptations.push('防御本能が向上');
            boosts.push({ gene: '防衛本能', boost: 10 });
        }
        if (stageLevel >= 5) {
            adaptations.push('攻撃パターンが多様化');
            boosts.push({ gene: '戦術多様性', boost: 10 });
        }

        const elementLabel = dominant
            ? { Fire: '火炎', Ice: '氷結', Lightning: '雷撃' }[dominant] || dominant
            : '不明';

        const message = dominant
            ? `分析結果：直近の戦闘でプレイヤーの${elementLabel}属性攻撃が猛威を振るったため、次階層の個体群は${adaptations.join('、')}して生成されます。`
            : `分析結果：プレイヤーの攻撃パターンに偏りは検出されませんでした。次階層の個体群はランダムに進化します。`;

        return {
            stage: stageLevel,
            timestamp: Date.now(),
            dominantPlayerElement: dominant,
            adaptations,
            resistanceBoost: boosts,
            message,
        };
    }

    /** Reset element tracking for new stage */
    resetStageTracking() {
        this.playerElementDamage.clear();
    }
}
