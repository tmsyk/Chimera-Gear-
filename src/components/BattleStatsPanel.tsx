/**
 * BattleStatsPanel — HP bars, DPS, stage info, battle controls, analytics
 */

import { useCallback, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { ItemDecoder } from '../core/ItemDecoder';
import { TextBattleEngine } from '../core/TextBattleEngine';
import { EnemyEvolution, type EnemySpecies } from '../core/EnemyEvolution';
import { FitnessCalculator } from '../core/FitnessCalculator';
import { FastSimulator } from '../core/FastSimulator';
import type { BattleLogEntry } from '../core/TextBattleEngine';
import { getTraitSummary } from '../core/TraitSystem';

// Singleton enemy evolution tracker
const enemyEvolution = new EnemyEvolution();

const SPECIES_LABELS: Record<EnemySpecies, string> = {
    standard: '👾通常',
    tank: '🛡️タンク',
    attacker: '⚔️アタッカー',
    boss: '👑ボス',
};

export function BattleStatsPanel() {
    const store = useGameStore();
    const { stage, wave, maxWaves, equippedWeapon, currentResult, isBreedingPhase, maxClearedStage, stageSummary } = store;
    const [weaponHp, setWeaponHp] = useState(100);
    const [weaponMaxHp, setWeaponMaxHp] = useState(100);
    const [enemyHp, setEnemyHp] = useState(100);
    const [enemyMaxHp, setEnemyMaxHp] = useState(100);

    const [totalKills, setTotalKills] = useState(0);
    const [nextStageSurvival, setNextStageSurvival] = useState<number | null>(null);
    const [currentEnemyResistCut, setCurrentEnemyResistCut] = useState<number | null>(null);
    const [currentSpecies, setCurrentSpecies] = useState<EnemySpecies>('standard');
    const battleTimerRef = useRef<number | null>(null);
    const abortRef = useRef(false);
    const weaponCarryHpRef = useRef<number | null>(null);

    // Compact stat formatting for large numbers
    const formatStat = (n: number): string => {
        if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return Math.floor(n).toString();
    };

    const runBattle = useCallback(async () => {
        if (!equippedWeapon) return;

        // Read current state fresh to avoid stale closures
        const currentStage = useGameStore.getState().stage;
        let currentWave = useGameStore.getState().wave;
        const currentMaxWaves = useGameStore.getState().maxWaves;

        store.startBattle();
        abortRef.current = false;
        weaponCarryHpRef.current = null;

        let totalGenesCollected = 0;
        let totalBestFitness = 0;
        let stageTotalKills = 0;
        let weaponDestroyed = false;

        try {

            // Auto-continue through all waves in one go
            while (currentWave <= currentMaxWaves) {
                const enemiesInWave = 3 + Math.floor(currentStage * 0.7) + (currentWave - 1);
                let wKills = 0;

                for (let i = 0; i < enemiesInWave; i++) {
                    if (useGameStore.getState().isBreedingPhase) break;
                    if (abortRef.current) break;
                    // HP0 guard: prevent zombie state
                    if (weaponCarryHpRef.current !== null && weaponCarryHpRef.current <= 0) {
                        weaponDestroyed = true;
                        break;
                    }

                    const isBossStage = currentStage % 10 === 0 && currentStage > 0;
                    const { genome: enemyGenome, species } = isBossStage && i === enemiesInWave - 1
                        ? enemyEvolution.spawnBoss(currentStage)
                        : enemyEvolution.spawnEnemy(currentStage);
                    setCurrentSpecies(species);
                    const stageBase = 80 + currentStage * 15;
                    const enemyBase = 60 + currentStage * 10;
                    const wStats = ItemDecoder.decode(equippedWeapon.genome, stageBase);
                    const eStats = ItemDecoder.decode(enemyGenome, enemyBase);

                    // No-heal: use carried HP or full HP on first fight
                    const wHp = weaponCarryHpRef.current ?? wStats.maxHp;
                    setWeaponHp(wHp);
                    setWeaponMaxHp(wStats.maxHp);
                    setEnemyMaxHp(eStats.maxHp);
                    setEnemyHp(eStats.maxHp);

                    // Calculate resistance cut for analytics
                    const elemKey = `${wStats.element.toLowerCase()}Resist` as keyof typeof eStats;
                    const resist = eStats[elemKey];
                    if (typeof resist === 'number') {
                        setCurrentEnemyResistCut(Math.round(resist * 80));
                    }

                    // Header log with species label
                    store.addBattleLog({
                        time: 0, actor: 'weapon', action: 'attack',
                        message: `━━━ 🎯 Wave ${currentWave} - 個体 ${i + 1}/${enemiesInWave} ${SPECIES_LABELS[species]} ━━━`,
                    });

                    const result = TextBattleEngine.runBattle(
                        equippedWeapon.genome,
                        enemyGenome,
                        currentStage,
                        30,
                        equippedWeapon.traits ?? [],
                        weaponCarryHpRef.current,
                        equippedWeapon.mastery ?? 0,
                    );

                    // Record DPS for analytics
                    if (result.killTime > 0 && result.killTime < Infinity) {
                        const dps = result.damageDealt / result.killTime;
                        store.recordDps(Math.round(dps * 10) / 10);
                    }

                    // Stream logs based on speed
                    const speed = useGameStore.getState().battleSpeed;
                    if (speed >= 100) {
                        // At 100x: only show summary (first + last log) to avoid DOM overload
                        if (result.logs.length > 0) store.addBattleLog(result.logs[0]);
                        if (result.logs.length > 1) store.addBattleLog(result.logs[result.logs.length - 1]);
                    } else if (speed >= 10) {
                        // At 10x: stream with minimal delay, skip defend-only logs
                        for (const log of result.logs) {
                            store.addBattleLog(log);
                            if (log.damage) {
                                if (log.actor === 'weapon') {
                                    setEnemyHp(prev => Math.max(0, prev - log.damage!));
                                } else {
                                    setWeaponHp(prev => Math.max(0, prev - log.damage!));
                                }
                            }
                        }
                        // Single yield to let React render after each enemy
                        await new Promise(r => setTimeout(r, 10));
                    } else {
                        const delay = 150;
                        for (const log of result.logs) {
                            await new Promise(r => { battleTimerRef.current = window.setTimeout(r, delay) as unknown as number; });
                            store.addBattleLog(log);

                            if (log.damage) {
                                if (log.actor === 'weapon') {
                                    setEnemyHp(prev => Math.max(0, prev - log.damage!));
                                } else {
                                    setWeaponHp(prev => Math.max(0, prev - log.damage!));
                                }
                            }
                        }
                    }

                    // ── Final HP correction: ensure exact match after log animation ──
                    setWeaponHp(result.weaponHpRemaining);
                    setEnemyHp(result.enemyHpRemaining);

                    // Record results
                    if (result.won) {
                        wKills++;
                        stageTotalKills++;
                        setTotalKills(prev => prev + 1);

                        const enemyItem = {
                            id: `enemy_${currentStage}_${currentWave}_${i}`,
                            genome: enemyGenome,
                            fitness: 0,
                            generation: 1,
                        };
                        enemyEvolution.logEnemyDeath(enemyItem, result.killTime, result.damageTaken);

                        result.logs.forEach((l: BattleLogEntry) => {
                            if (l.actor === 'weapon' && l.element && l.damage) {
                                enemyEvolution.logPlayerAttack(l.element, l.damage);
                            }
                        });

                        const fit = FitnessCalculator.calculate(result).totalFitness;

                        // Update mastery for equipped weapon
                        store.updateMastery(equippedWeapon.id, fit);

                        // ── Loot drop with rank-based visual logs ──
                        const lootChance = species === 'boss' ? 0.80 : 0.40;
                        if (Math.random() < lootChance) {
                            const lootItem = {
                                id: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}_${i}`,
                                genome: enemyGenome,
                                fitness: fit,
                                generation: 1,
                            };
                            store.addItem(lootItem);
                            totalGenesCollected++;
                            if (fit > totalBestFitness) totalBestFitness = fit;

                            // Rank-based drop log with visual effects
                            const rating = ItemDecoder.getRating(lootItem);
                            const estimatedEP = 10; // base decompose value
                            let dropMsg: string;
                            if (rating === 'SS') {
                                dropMsg = `\n🔶 [!!! 極稀少信号 !!!] 伝説的個体のパーツを検知！\n>> 報告: 敵個体より 【遺伝子チップ: ランクSS】 を回収。推定EP: ${estimatedEP}`;
                            } else if (rating === 'S') {
                                dropMsg = `★ 報告: 敵個体より 【遺伝子チップ: ランク${rating}】 の回収に成功。推定EP: ${estimatedEP}`;
                            } else if (rating === 'A') {
                                dropMsg = `◆ 報告: 敵個体より 【遺伝子チップ: ランク${rating}】 の回収に成功。推定EP: ${estimatedEP}`;
                            } else {
                                dropMsg = `>> 報告: 敵個体より 【遺伝子チップ: ランク${rating}】 を回収。推定EP: ${estimatedEP}`;
                            }
                            store.addBattleLog({
                                time: 0, actor: 'weapon', action: 'attack',
                                message: dropMsg,
                            });
                        } else {
                            // No gene drop
                            store.addBattleLog({
                                time: 0, actor: 'weapon', action: 'defend',
                                message: `>> 警告: ドロップ反応なし。資材のみ回収します。`,
                            });
                        }

                        // Material shard drop: 80% for boss, 15% normally
                        const isBossKill = species === 'boss';
                        const dropChance = isBossKill ? 0.80 : 0.15;
                        if (Math.random() < dropChance) {
                            const enemyElement = ItemDecoder.decode(enemyGenome, 60).element.toLowerCase();
                            const shardMap: Record<string, 'fire_shard' | 'ice_shard' | 'lightning_shard'> = {
                                fire: 'fire_shard', ice: 'ice_shard', lightning: 'lightning_shard',
                            };
                            const shardType = shardMap[enemyElement] ?? 'fire_shard';
                            const shardCount = isBossKill ? 3 : 1;
                            store.addMaterial(shardType, shardCount);
                            store.addBattleLog({
                                time: 0, actor: 'weapon', action: 'attack',
                                message: isBossKill
                                    ? `🌟 ボス素材ドロップ: ${enemyElement === 'fire' ? '🔥火の欠片' : enemyElement === 'ice' ? '❄️氷の欠片' : '⚡雷の欠片'} ×${shardCount}`
                                    : `💎 素材ドロップ: ${enemyElement === 'fire' ? '🔥火の欠片' : enemyElement === 'ice' ? '❄️氷の欠片' : '⚡雷の欠片'}`,
                            });
                        }

                        if (speed < 100) {
                            await new Promise(r => setTimeout(r, speed >= 10 ? 200 : 800));
                        }
                    } else {
                        // HP=0 → weapon destroyed, abort stage
                        // The engine's checkDeath already logged the destruction message
                        store.addBattleLog({
                            time: 0, actor: 'weapon', action: 'defend',
                            message: `⚠️ ステージ撤退。`,
                        });

                        // Brief delay so player can read the final logs
                        const speed = useGameStore.getState().battleSpeed;
                        if (speed < 100) {
                            await new Promise(r => setTimeout(r, speed >= 10 ? 500 : 1500));
                        }

                        store.setBattleResult(result);
                        weaponCarryHpRef.current = 0;
                        weaponDestroyed = true;

                        // Enter breeding phase for recovery
                        store.setStageSummary({
                            stage: currentStage,
                            totalKills: stageTotalKills,
                            genesCollected: totalGenesCollected,
                            bestFitness: totalBestFitness,
                            cleared: false,
                        });
                        store.enterBreedingPhase();
                        store.endBattle();
                        return; // Exit entire runBattle
                    }

                    store.setBattleResult(result);

                    // No-heal: carry remaining HP to next fight
                    weaponCarryHpRef.current = result.weaponHpRemaining;
                }

                // If weapon was destroyed, don't report wave clear
                if (weaponDestroyed) break;

                // Wave complete
                if (currentWave < currentMaxWaves) {
                    store.addBattleLog({
                        time: 0, actor: 'weapon', action: 'attack',
                        message: `✅ Wave ${currentWave} クリア！ (${wKills}キル) — 次のWaveへ`,
                    });
                    store.advanceWave();
                    currentWave++;

                    // Brief pause between waves
                    const speed = useGameStore.getState().battleSpeed;
                    if (speed < 100) {
                        await new Promise(r => setTimeout(r, speed >= 10 ? 500 : 1500));
                    }
                } else {
                    // Final wave — stage complete
                    break;
                }

                if (abortRef.current) break;
            }

            if (weaponDestroyed) {
                // Weapon destroyed mid-stage — do NOT advance stage
                store.addBattleLog({
                    time: 0, actor: 'weapon', action: 'defend',
                    message: `💀 ステージ ${currentStage} 失敗… 戦果: ${stageTotalKills}キル`,
                });
                store.setStageSummary({
                    stage: currentStage,
                    totalKills: stageTotalKills,
                    genesCollected: totalGenesCollected,
                    bestFitness: totalBestFitness,
                    cleared: false,
                });
                store.enterBreedingPhase();
            } else if (abortRef.current) {
                // Aborted — just clean up
                store.addBattleLog({
                    time: 0, actor: 'weapon', action: 'defend',
                    message: `🏠 帰還しました。戦果: ${stageTotalKills}キル`,
                });
            } else {
                // Stage complete → counter report → survival prediction → breeding
                const report = enemyEvolution.generateCounterReport(currentStage);
                store.addCounterReport(report);
                store.addBattleLog({
                    time: 0, actor: 'weapon', action: 'attack',
                    message: `🏆 ステージ ${currentStage} クリア！`,
                });
                store.addBattleLog({
                    time: 0, actor: 'weapon', action: 'attack',
                    message: `📊 ${report.message}`,
                });

                store.setStageSummary({
                    stage: currentStage,
                    totalKills: stageTotalKills,
                    genesCollected: totalGenesCollected,
                    bestFitness: totalBestFitness,
                    cleared: true,
                });

                // Predict next stage survival
                if (equippedWeapon) {
                    const futureEnemy = enemyEvolution.spawnEnemy(currentStage + 1);
                    const sim = FastSimulator.simulate(
                        equippedWeapon.genome,
                        futureEnemy.genome,
                        currentStage + 1,
                        50
                    );
                    setNextStageSurvival(Math.round(sim.winRate * 100));
                }

                enemyEvolution.resetStageTracking();
                store.enterBreedingPhase();
            }
        } catch (err) {
            console.error('[BattleStatsPanel] runBattle error:', err);
            store.addBattleLog({
                time: 0, actor: 'weapon', action: 'defend',
                message: `❌ エラーが発生しました。帰還します。`,
            });
        } finally {
            store.endBattle();
        }
    }, [equippedWeapon, store]);

    const hpPercent = weaponMaxHp > 0 ? Math.max(0, (weaponHp / weaponMaxHp) * 100) : 0;
    const enemyHpPercent = enemyMaxHp > 0 ? Math.max(0, (enemyHp / enemyMaxHp) * 100) : 0;
    const hpClass = hpPercent > 60 ? 'high' : hpPercent > 30 ? 'mid' : 'low';
    const ehpClass = enemyHpPercent > 60 ? 'high' : enemyHpPercent > 30 ? 'mid' : 'low';

    const weaponStats = equippedWeapon ? ItemDecoder.decode(equippedWeapon.genome, 80 + stage * 20) : null;

    // Analytics computed values
    const avgDps = store.dpsHistory.length > 0
        ? Math.round((store.dpsHistory.reduce((a, b) => a + b, 0) / store.dpsHistory.length) * 10) / 10
        : 0;

    return (
        <div className="stats-panel">
            <div className="stats-panel-body">
                {/* Stage Info */}
                <div className="stats-section">
                    <div className="stats-section-title">📡 Mission Status</div>
                    <div className="stat-row">
                        <span className="stat-label">ステージ</span>
                        <span className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                                onClick={() => store.setStage(stage - 1)}
                                disabled={stage <= 1 || store.isBattling}
                                style={{
                                    background: 'none', border: '1px solid var(--border)', borderRadius: 3,
                                    color: stage <= 1 || store.isBattling ? 'var(--text-dim)' : 'var(--accent-cyan)',
                                    cursor: stage <= 1 || store.isBattling ? 'default' : 'pointer',
                                    padding: '1px 6px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                    minHeight: 24,
                                }}
                            >◀</button>
                            <span style={{ minWidth: 20, textAlign: 'center' }}>{stage}</span>
                            <button
                                onClick={() => store.setStage(stage + 1)}
                                disabled={stage > maxClearedStage || store.isBattling}
                                style={{
                                    background: 'none', border: '1px solid var(--border)', borderRadius: 3,
                                    color: stage > maxClearedStage || store.isBattling ? 'var(--text-dim)' : 'var(--accent-cyan)',
                                    cursor: stage > maxClearedStage || store.isBattling ? 'default' : 'pointer',
                                    padding: '1px 6px', fontSize: 11, fontFamily: 'var(--font-mono)',
                                    minHeight: 24,
                                }}
                            >▶</button>
                            {maxClearedStage > 0 && (
                                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4 }}>
                                    (最高:{maxClearedStage})
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="stat-row">
                        <span className="stat-label">ウェーブ</span>
                        <span className="stat-value">{wave} / {maxWaves}</span>
                    </div>
                    <div className="stat-row">
                        <span className="stat-label">合計キル</span>
                        <span className="stat-value good">{totalKills}</span>
                    </div>
                </div>

                {/* Weapon HP */}
                <div className="stats-section">
                    <div className="stats-section-title">🛡️ Weapon Status</div>
                    <div className="hp-bar-container">
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {(equippedWeapon?.mastery ?? 0) >= 100 ? (
                                <span style={{
                                    color: '#ffd700',
                                    fontWeight: 700,
                                    textShadow: '0 0 6px rgba(255,215,0,0.6)',
                                    letterSpacing: '0.05em',
                                }}>
                                    ✦ 自機HP ✦ <span style={{ fontSize: 9, opacity: 0.8 }}>熟練の証</span>
                                </span>
                            ) : (
                                <span>自機HP</span>
                            )}
                        </div>
                        <div className="hp-bar">
                            <div className={`hp-bar-fill ${hpClass}`} style={{ width: `${hpPercent}%` }} />
                            <span className="hp-bar-text">{formatStat(weaponHp)} / {formatStat(weaponMaxHp)}</span>
                        </div>
                    </div>
                    <div className="hp-bar-container" style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
                            敵HP {currentSpecies !== 'standard' && <span style={{ color: currentSpecies === 'tank' ? '#4fc3f7' : '#ff6b35', fontWeight: 700, fontSize: 11 }}>({SPECIES_LABELS[currentSpecies]})</span>}
                        </div>
                        <div className="hp-bar">
                            <div className={`hp-bar-fill ${ehpClass}`} style={{ width: `${enemyHpPercent}%` }} />
                            <span className="hp-bar-text">{formatStat(enemyHp)} / {formatStat(enemyMaxHp)}</span>
                        </div>
                    </div>
                </div>

                {/* Equipped Weapon Stats */}
                {weaponStats && (
                    <div className="stats-section">
                        <div className="stats-section-title">⚙️ Equipped Genome</div>
                        <div className="stat-row">
                            <span className="stat-label">攻撃力</span>
                            <span className="stat-value">{formatStat(weaponStats.attack)}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">攻撃速度</span>
                            <span className="stat-value">{weaponStats.attackSpeed.toFixed(2)}s</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">属性</span>
                            <span className="stat-value">{ItemDecoder.getElementLabel(weaponStats.element)}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">特殊</span>
                            <span className="stat-value">{ItemDecoder.getSpecialLabel(weaponStats.special)}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">DPS</span>
                            <span className="stat-value good">{formatStat(weaponStats.attack / weaponStats.attackSpeed)}</span>
                        </div>

                        {/* Elemental Resistances */}
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>属性耐性</div>
                            {[
                                { label: '🔥 火炎', value: weaponStats.fireResist, color: '#ff6b35' },
                                { label: '❄️ 氷結', value: weaponStats.iceResist, color: '#4fc3f7' },
                                { label: '⚡ 雷撃', value: weaponStats.lightningResist, color: '#ffeb3b' },
                            ].map(r => (
                                <div key={r.label} className="resist-bar-row">
                                    <span className="resist-bar-label">{r.label}</span>
                                    <div className="resist-bar-track">
                                        <div className="resist-bar-fill" style={{ width: `${Math.max(r.value * 100, r.value > 0.01 ? 5 : 0)}%`, background: r.color }} />
                                    </div>
                                    <span className="resist-bar-value" style={{ color: r.color }}>{(r.value * 100).toFixed(0)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ========== ACTIVE TRAITS ========== */}
                {equippedWeapon?.traits && equippedWeapon.traits.length > 0 && (
                    <div className="trait-active-list">
                        <div className="label">🧬 特性 ({equippedWeapon.traits.length})</div>
                        {getTraitSummary(equippedWeapon.traits).map((t, i) => (
                            <span key={i} className={`trait-badge rank-${t.rank.toLowerCase()}`} title={t.desc}>
                                {t.icon} {t.name}
                            </span>
                        ))}
                    </div>
                )}

                {/* ========== BATTLE ANALYTICS ========== */}
                {(store.dpsHistory.length > 0 || currentEnemyResistCut !== null) && (
                    <div className="analytics-section">
                        <div className="analytics-title">📈 Battle Analytics</div>

                        {/* DPS Comparison */}
                        {store.dpsHistory.length > 0 && (
                            <>
                                <div className="analytics-row">
                                    <span className="analytics-label">直近{store.dpsHistory.length}戦 平均DPS</span>
                                    <span className="analytics-value" style={{ color: 'var(--accent-cyan)' }}>{avgDps}</span>
                                </div>
                                <div className="analytics-row">
                                    <span className="analytics-label">過去最高DPS</span>
                                    <span className="analytics-value" style={{ color: 'var(--accent-magenta)' }}>{store.peakDps}</span>
                                </div>
                                <div className="analytics-row">
                                    <span className="analytics-label">DPS効率</span>
                                    <div className="analytics-bar">
                                        <div
                                            className="analytics-bar-fill"
                                            style={{
                                                width: `${store.peakDps > 0 ? Math.min(100, (avgDps / store.peakDps) * 100) : 0}%`,
                                                background: avgDps / store.peakDps > 0.7 ? 'var(--accent-green)' : 'var(--accent-yellow)',
                                            }}
                                        />
                                    </div>
                                    <span className="analytics-value" style={{ fontSize: 11, minWidth: 40, textAlign: 'right' }}>
                                        {store.peakDps > 0 ? Math.round((avgDps / store.peakDps) * 100) : 0}%
                                    </span>
                                </div>
                            </>
                        )}

                        {/* Resistance cut */}
                        {currentEnemyResistCut !== null && (
                            <div className="analytics-row" style={{ marginTop: 4 }}>
                                <span className="analytics-label">敵耐性カット</span>
                                <span className="analytics-value" style={{
                                    color: currentEnemyResistCut > 40 ? 'var(--accent-red)' : currentEnemyResistCut > 20 ? 'var(--accent-yellow)' : 'var(--accent-green)',
                                }}>
                                    -{currentEnemyResistCut}%
                                </span>
                            </div>
                        )}

                        {/* Next-stage survival prediction */}
                        {nextStageSurvival !== null && (
                            <div style={{ marginTop: 8 }}>
                                <div className="analytics-row">
                                    <span className="analytics-label">次ステージ予測勝率</span>
                                    <span className="analytics-value" style={{
                                        color: nextStageSurvival >= 60 ? 'var(--accent-green)' : nextStageSurvival >= 30 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                                    }}>
                                        {nextStageSurvival}%
                                    </span>
                                </div>
                                <div className={`survival-badge ${nextStageSurvival >= 60 ? 'safe' : nextStageSurvival >= 30 ? 'caution' : 'danger'}`} style={{ width: '100%', textAlign: 'center' }}>
                                    {nextStageSurvival >= 60 ? '✅ 安全 — このまま進軍可能' :
                                        nextStageSurvival >= 30 ? '⚠️ 注意 — 配合で強化推奨' :
                                            '🚨 危険 — 配合必須！'}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Fitness (last battle) */}
                {currentResult && (
                    <div className="stats-section">
                        <div className="stats-section-title">📊 Last Battle Fitness</div>
                        {(() => {
                            const fit = FitnessCalculator.calculate(currentResult);
                            return (
                                <>
                                    <div className="stat-row">
                                        <span className="stat-label">キルタイム</span>
                                        <span className={`stat-value ${fit.killTimeScore > 50 ? 'good' : 'warning'}`}>{fit.killTimeScore}</span>
                                    </div>
                                    <div className="stat-row">
                                        <span className="stat-label">被ダメ効率</span>
                                        <span className={`stat-value ${fit.damageEfficiency > 50 ? 'good' : 'warning'}`}>{fit.damageEfficiency}</span>
                                    </div>
                                    <div className="stat-row">
                                        <span className="stat-label">適応力</span>
                                        <span className="stat-value">{fit.adaptationScore}</span>
                                    </div>
                                    <div className="stat-row">
                                        <span className="stat-label">総合適合度</span>
                                        <span className={`stat-value ${fit.totalFitness > 50 ? 'good' : fit.totalFitness > 25 ? 'warning' : 'danger'}`}>
                                            {fit.totalFitness}
                                        </span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Counter Report */}
                {store.counterReports.length > 0 && (
                    <div className="counter-report">
                        <div className="counter-report-title">🧬 Enemy Evolution Report</div>
                        <div className="counter-report-text">
                            {store.counterReports[store.counterReports.length - 1].message}
                        </div>
                        {store.counterReports[store.counterReports.length - 1].resistanceBoost.map((b, i) => (
                            <div key={i} className="counter-report-adaptation">
                                ▲ {b.gene} +{b.boost}%
                            </div>
                        ))}
                    </div>
                )}

            </div> {/* end stats-panel-body */}

            {/* Battle Controls — always visible at bottom */}
            <div className="battle-controls">
                {isBreedingPhase ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {stageSummary?.cleared ? (
                            <>
                                <div className="breeding-banner">✨ ステージ {stage} クリア！</div>
                                {equippedWeapon && (
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%' }}
                                        onClick={() => {
                                            store.advanceStage();
                                            store.exitBreedingPhase();
                                            store.setStageSummary(null);
                                        }}
                                    >
                                        ⚔️ 次のステージへ（現在の装備で出撃）
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="breeding-banner" style={{ background: 'rgba(255,50,50,0.15)', borderColor: 'var(--accent-red)' }}>
                                    💀 ステージ {stage} 失敗… 配合で強化して再挑戦！
                                </div>
                                {equippedWeapon && (
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%' }}
                                        onClick={() => {
                                            weaponCarryHpRef.current = null;
                                            store.exitBreedingPhase();
                                            store.setStageSummary(null);
                                        }}
                                    >
                                        ⚔️ Wave 1 開始（同じステージに再挑戦）
                                    </button>
                                )}
                                {maxClearedStage >= 1 && equippedWeapon && (
                                    <button
                                        className="btn btn-secondary"
                                        style={{ width: '100%', background: 'rgba(0, 229, 255, 0.08)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                                        onClick={async () => {
                                            weaponCarryHpRef.current = null;
                                            store.exitBreedingPhase();
                                            store.setStageSummary(null);
                                            store.setStage(1);
                                            // Small delay then start continuous loop
                                            await new Promise(r => setTimeout(r, 100));
                                            abortRef.current = false;
                                            let currentLoopStage = 1;
                                            while (!abortRef.current && currentLoopStage <= maxClearedStage) {
                                                await runBattle();
                                                const s = useGameStore.getState();
                                                if (s.isBreedingPhase) break;
                                                currentLoopStage++;
                                                if (currentLoopStage <= maxClearedStage) {
                                                    store.advanceStage();
                                                    store.exitBreedingPhase();
                                                }
                                            }
                                        }}
                                    >
                                        🔄 連続周回（Stage 1～{maxClearedStage}）
                                    </button>
                                )}
                            </>
                        )}
                        <button
                            className="btn btn-secondary"
                            style={{ width: '100%' }}
                            onClick={() => {
                                store.exitBreedingPhase();
                                store.setStageSummary(null);
                                store.setActiveTab('lab');
                            }}
                        >
                            🧬 ラボで配合してから出撃
                        </button>
                    </div>
                ) : !equippedWeapon ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                        まず兵器を装備してください
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                            className="btn btn-primary"
                            onClick={runBattle}
                            disabled={store.isBattling}
                        >
                            {store.isBattling ? '⚔️ 戦闘中...' : `⚔️ Wave ${wave} 開始`}
                        </button>
                        {stage <= maxClearedStage && !store.isBattling && (
                            <button
                                className="btn btn-secondary"
                                style={{ background: 'rgba(0, 229, 255, 0.08)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                                onClick={async () => {
                                    // Continuous battle: loop stages until HP=0
                                    abortRef.current = false;
                                    let currentLoopStage = stage;
                                    while (!abortRef.current && currentLoopStage <= maxClearedStage) {
                                        await runBattle();
                                        // Check if weapon was destroyed (breeding phase entered)
                                        const s = useGameStore.getState();
                                        if (s.isBreedingPhase) break;
                                        // Advance to next stage for continuous loop
                                        currentLoopStage++;
                                        if (currentLoopStage <= maxClearedStage) {
                                            store.advanceStage();
                                            store.exitBreedingPhase();
                                        }
                                    }
                                }}
                            >
                                🔄 連続周回（Stage {stage}～{maxClearedStage}）
                            </button>
                        )}
                        {store.isBattling && (
                            <button
                                className="btn btn-secondary"
                                style={{ background: 'rgba(255, 51, 85, 0.15)', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}
                                onClick={() => {
                                    abortRef.current = true;
                                    if (battleTimerRef.current) {
                                        clearTimeout(battleTimerRef.current);
                                    }
                                }}
                            >
                                🏠 帰還する
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
