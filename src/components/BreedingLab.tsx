/**
 * BreedingLab — Parent selection, genome visualization, gene locking, breeding + simulation
 */

import { useState, useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import type { ItemCategory, MaterialType } from '../store/useGameStore';
import { GeneticEngine, GENE_NAMES } from '../core/GeneticEngine';
import { ItemDecoder } from '../core/ItemDecoder';
import { FastSimulator } from '../core/FastSimulator';
import { PedigreeSystem, GENETIC_DISEASE_LABELS, MAX_BREED_COUNT } from '../core/PedigreeSystem';
import type { Item } from '../core/GeneticEngine';
import type { SimulationResult } from '../core/FastSimulator';
import { getTraitSummary } from '../core/TraitSystem';
import { calculateBreedingCost, requiredMastery } from '../core/mathUtils';

function GeneCard({ item, selected, onClick, isEquipped, onCrystallize }: {
    item: Item; selected: boolean; onClick: () => void; isEquipped?: boolean;
    onCrystallize?: (item: Item) => void;
}) {
    const stats = ItemDecoder.decode(item.genome);
    const rating = ItemDecoder.getRating(item);
    const mastery = item.mastery ?? 0;
    const breedCount = item.breedCount ?? 0;
    const atLimit = breedCount >= MAX_BREED_COUNT;
    const disease = item.geneticDisease;

    return (
        <div
            className={`gene-card ${selected ? 'selected' : ''} ${isEquipped ? 'equipped' : ''} ${atLimit ? 'breed-maxed' : ''}`}
            onClick={atLimit ? undefined : onClick}
            style={atLimit ? { borderColor: 'var(--accent-magenta)' } : undefined}
        >
            <div className="gene-card-header">
                <span className="gene-card-name">
                    {isEquipped && <span style={{ color: 'var(--accent-cyan)', fontSize: 10, marginRight: 6 }}>[装備中]</span>}
                    {item.bloodlineName ?? `${ItemDecoder.getElementLabel(stats.element)} 個体`}
                </span>
                <span className={`gene-card-rating ${rating}`}>{rating}</span>
            </div>
            {/* Breed count pips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 9 }}>
                <span style={{ color: 'var(--text-dim)' }}>配合:</span>
                {Array.from({ length: MAX_BREED_COUNT }).map((_, i) => (
                    <span key={i} style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: i < breedCount ? 'var(--accent-magenta)' : 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.15)',
                    }} />
                ))}
                {atLimit && <span style={{ color: 'var(--accent-magenta)', fontWeight: 700 }}>限界</span>}
                {disease && (
                    <span style={{ color: 'var(--accent-red)', marginLeft: 'auto' }}>
                        {GENETIC_DISEASE_LABELS[disease].icon} {GENETIC_DISEASE_LABELS[disease].name}
                    </span>
                )}
            </div>
            <div className="gene-bars">
                {item.genome.map((val, i) => {
                    // Squared display: C/D ~9-25%, S/SS ~64-90%
                    const displayWidth = i >= 8
                        ? Math.max(val * val * 100, val > 0.01 ? 5 : 0) // Resistance: min 5% if non-zero
                        : val * val * 100;
                    return (
                        <div key={i} className="gene-bar-row">
                            <span className="gene-bar-label">{GENE_NAMES[i]}</span>
                            <div className="gene-bar-track" style={{ position: 'relative' }}>
                                {/* Rank markers */}
                                <div style={{ position: 'absolute', left: '36%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.08)' }} title="A" />
                                <div style={{ position: 'absolute', left: '64%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} title="S" />
                                <div
                                    className={`gene-bar-fill ${i >= 8 ? (i === 8 ? 'fire' : 'ice') : i >= 5 ? 'personality' : ''}`}
                                    style={{ width: `${displayWidth}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="gene-card-meta">
                <span>Gen.{item.generation}</span>
                <span>適合度: {item.fitness.toFixed(1)}</span>
                <span>DPS: {(stats.attack / stats.attackSpeed).toFixed(0)}</span>
                {stats.special !== 'none' && <span>{ItemDecoder.getSpecialLabel(stats.special)}</span>}
            </div>
            {/* Mastery gauge */}
            {mastery > 0 && (
                <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--accent-purple)', marginBottom: 2 }}>
                        <span>🔮 熟練度</span>
                        <span>{mastery}/100</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(170, 85, 255, 0.15)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${mastery}%`, background: 'var(--accent-purple)', borderRadius: 2, transition: 'width 0.5s ease' }} />
                    </div>
                </div>
            )}
            {/* Trait badges */}
            {item.traits && item.traits.length > 0 && (
                <div className="trait-badge-list">
                    {getTraitSummary(item.traits).map((t, i) => (
                        <span key={i} className={`trait-badge rank-${t.rank.toLowerCase()}`} title={t.desc}>
                            {t.icon} {t.name}
                        </span>
                    ))}
                </div>
            )}
            {/* Crystallize button for maxed items — show estimated EP yield */}
            {atLimit && onCrystallize && (() => {
                const genomeQuality = item.genome.reduce((a, b) => a + b, 0) / 10;
                const estEP = Math.floor(50 + item.generation * 10 + genomeQuality * 40 + mastery * 0.5 + breedCount * 15);
                return (
                    <button
                        onClick={(e) => { e.stopPropagation(); onCrystallize(item); }}
                        style={{
                            marginTop: 6, padding: '4px 10px', fontSize: 10, width: '100%',
                            background: 'linear-gradient(135deg, rgba(170, 85, 255, 0.2), rgba(255, 107, 53, 0.2))',
                            border: '1px solid var(--accent-magenta)', borderRadius: 4,
                            color: 'var(--accent-magenta)', cursor: 'pointer', fontWeight: 700,
                        }}
                    >
                        💎 結晶化 (+{estEP}EP)
                    </button>
                );
            })()}
        </div>
    );
}

export function BreedingLab() {
    const store = useGameStore();
    const { inventory, equipWeapon, stage, exitBreedingPhase, isBreedingPhase, advanceStage, equippedWeapon, geneEnergy, showToast, stageSummary, setStageSummary, crystallizeItem, materials, bulkCrystallize } = store;
    const [parentA, setParentA] = useState<Item | null>(null);
    const [parentB, setParentB] = useState<Item | null>(null);
    const [simResult, setSimResult] = useState<SimulationResult | null>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    const [lockedGenes, setLockedGenes] = useState<number[]>([]);
    const [activeCategory, setActiveCategory] = useState<ItemCategory | 'all'>('all');
    const [sortBy, setSortBy] = useState<'fitness' | 'generation' | 'breedRemain'>('fitness');
    const [showCoiWarning, setShowCoiWarning] = useState(false);

    // Progressive cost via shared math utility
    const parentGeneration = parentA && parentB
        ? Math.max(parentA.generation, parentB.generation)
        : 1;
    const LOCK_COST_PER_GENE = 10;
    const bestRank = useMemo(() => {
        if (!parentA || !parentB) return 'C';
        const ratings = [parentA, parentB].map(p => ItemDecoder.getRating(p));
        const rankOrder = ['D', 'C', 'B', 'A', 'S', 'SS'];
        return ratings.sort((a, b) => rankOrder.indexOf(b) - rankOrder.indexOf(a))[0];
    }, [parentA, parentB]);
    const { breedCost, totalCost } = calculateBreedingCost(
        parentGeneration, bestRank, lockedGenes.length,
    );

    // Gen 5+ requires elemental material
    const needsMaterial = parentGeneration >= 5;
    const requiredMaterialType: MaterialType = useMemo(() => {
        if (!parentA) return 'fire_shard';
        const el = ItemDecoder.decode(parentA.genome).element.toLowerCase();
        return el === 'ice' ? 'ice_shard' : el === 'lightning' ? 'lightning_shard' : 'fire_shard';
    }, [parentA]);
    const hasMaterial = !needsMaterial || materials[requiredMaterialType] >= 1;
    const materialLabel: Record<MaterialType, string> = { fire_shard: '🔥火の欠片', ice_shard: '❄️氷の欠片', lightning_shard: '⚡雷の欠片' };

    const sortedInventory = useMemo(() => {
        let items = [...inventory];
        if (activeCategory !== 'all') {
            items = items.filter(i => (i.category ?? 'battle') === activeCategory);
        }
        switch (sortBy) {
            case 'fitness': items.sort((a, b) => b.fitness - a.fitness); break;
            case 'generation': items.sort((a, b) => b.generation - a.generation); break;
            case 'breedRemain': items.sort((a, b) => (MAX_BREED_COUNT - (a.breedCount ?? 0)) - (MAX_BREED_COUNT - (b.breedCount ?? 0))); break;
        }
        return items;
    }, [inventory, activeCategory, sortBy]);

    const handleSelect = (item: Item) => {
        // Block maxed items from being selected as parents
        if ((item.breedCount ?? 0) >= MAX_BREED_COUNT) {
            showToast(`⚠️ この個体は配合上限(${MAX_BREED_COUNT}回)に達しています。結晶化してください`);
            return;
        }
        // Mastery gate: must earn battle experience before breeding
        const reqMastery = requiredMastery(item.generation);
        if ((item.mastery ?? 0) < reqMastery) {
            showToast(`⚠️ 熟練度不足！配合には🔮${reqMastery}以上必要（現在: ${item.mastery ?? 0}）— まず戦闘で鍛えてください`);
            return;
        }

        if (parentA?.id === item.id) { setParentA(null); setLockedGenes([]); return; }
        if (parentB?.id === item.id) { setParentB(null); return; }
        if (!parentA) { setParentA(item); setLockedGenes([]); }
        else if (!parentB) setParentB(item);
        else { setParentA(parentB); setParentB(item); setLockedGenes([]); }
        setSimResult(null);
    };

    const toggleGeneLock = (idx: number) => {
        if (!parentA) return;
        const mastery = parentA.mastery ?? 0;
        if (mastery < 10 && !lockedGenes.includes(idx)) {
            showToast('⚠️ 熟練度10以上で遺伝子ロック解禁');
            return;
        }
        setLockedGenes(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    };

    // Inbreeding preview — computed live when both parents are selected
    const inbreedPreview = useMemo(() => {
        if (!parentA || !parentB) return null;
        return PedigreeSystem.detectInbreeding(parentA, parentB);
    }, [parentA, parentB]);

    const handleBreed = () => {
        if (!parentA || !parentB) return;

        const child = GeneticEngine.breed(parentA, parentB, 0.06, lockedGenes);

        // Atomic transaction: energy + material + breedCount + addChild in one set()
        const success = store.breedTransaction(
            parentA.id,
            parentB.id,
            child,
            totalCost,
            needsMaterial ? requiredMaterialType : undefined,
        );

        if (!success) {
            showToast(
                geneEnergy < totalCost
                    ? `⚠️ Gene Energy が不足 (${totalCost}EP 必要)`
                    : `⚠️ ${materialLabel[requiredMaterialType]} が不足 (Gen.${parentGeneration}以上は素材必要)`,
            );
            return;
        }

        // Build toast message
        const rating = ItemDecoder.getRating(child);
        const lockMsg = lockedGenes.length > 0 ? ` [🔒${lockedGenes.length}遺伝子ロック]` : '';
        const inbreedMsg = inbreedPreview?.isInbred ? ` [🧬 近親配合 ${(inbreedPreview.coefficient * 100).toFixed(0)}%]` : '';
        const diseaseMsg = child.geneticDisease ? ` ⚠️ ${GENETIC_DISEASE_LABELS[child.geneticDisease].name}発症！` : '';
        const nameMsg = child.bloodlineName ? ` — ${child.bloodlineName}` : '';

        showToast(`✨ ${rating}ランク誕生${nameMsg} (Gen.${child.generation})${lockMsg}${inbreedMsg}${diseaseMsg}`);

        setParentA(null);
        setParentB(null);
        setSimResult(null);
        setLockedGenes([]);

        // Auto-save after breeding
        store.saveGame().catch(() => { });
    };

    const handleCrystallize = (item: Item) => {
        const crystal = crystallizeItem(item.id);
        if (crystal) {
            showToast(`💎 ${crystal.bloodlineName} を結晶化！ +${crystal.crystalBonus.energyYield}EP (殿堂入り)`);
            // Clear selection if crystallized item was a parent
            if (parentA?.id === item.id) setParentA(null);
            if (parentB?.id === item.id) setParentB(null);
        }
    };

    const handleSimulate = () => {
        if (!parentA || !parentB) return;
        setIsSimulating(true);

        setTimeout(() => {
            const childGenome = GeneticEngine.crossover(parentA.genome, parentB.genome);
            const enemyGenome = GeneticEngine.createRandomGenome();
            const result = FastSimulator.simulate(childGenome, enemyGenome, stage, 100);
            setSimResult(result);
            setIsSimulating(false);
        }, 50);
    };

    const handleEquipAndResume = (item: Item) => {
        equipWeapon(item);
        if (isBreedingPhase) {
            advanceStage();
            exitBreedingPhase();
            setStageSummary(null);
        }
    };

    const prediction = parentA && parentB
        ? GeneticEngine.predictOffspring(parentA.genome, parentB.genome, 30, parentGeneration, lockedGenes)
        : null;

    const canBreed = parentA && parentB && geneEnergy >= totalCost && hasMaterial;
    const parentAMastery = parentA?.mastery ?? 0;

    const exhaustedCount = inventory.filter(i => (i.breedCount ?? 0) >= MAX_BREED_COUNT && i.id !== equippedWeapon?.id).length;

    const handleBulkCrystallize = () => {
        const crystals = bulkCrystallize();
        if (crystals.length > 0) {
            const totalEP = crystals.reduce((sum, c) => sum + c.crystalBonus.energyYield, 0);
            showToast(`💎 ${crystals.length}体を一括結晶化！ +${totalEP}EP`);
        } else {
            showToast('結晶化対象がありません');
        }
    };

    return (
        <div className="lab-view">
            {/* Left: Inventory / Parent Selection */}
            <div className="lab-panel">
                <div className="lab-panel-header">
                    <h3>🧬 Gene Pool ({inventory.length}体)</h3>
                </div>
                <div className="lab-content">
                    {/* Stage Clear Summary */}
                    {stageSummary && (
                        <div className="stage-summary">
                            <div className="stage-summary-title">🏆 ステージ {stageSummary.stage} クリア！</div>
                            <div className="stage-summary-stats">
                                <div className="stage-summary-stat">
                                    <span className="stage-summary-label">キル数</span>
                                    <span className="stage-summary-value">{stageSummary.totalKills}</span>
                                </div>
                                <div className="stage-summary-stat">
                                    <span className="stage-summary-label">収集遺伝子</span>
                                    <span className="stage-summary-value">{stageSummary.genesCollected}</span>
                                </div>
                                <div className="stage-summary-stat">
                                    <span className="stage-summary-label">最高適合度</span>
                                    <span className="stage-summary-value good">{stageSummary.bestFitness.toFixed(1)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Category Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                        {([['all', '📦全て'], ['battle', '⚔️戦闘'], ['breeding', '🧬種親'], ['material', '💎素材']] as const).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setActiveCategory(key)}
                                style={{
                                    padding: '4px 10px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                                    background: activeCategory === key ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
                                    color: activeCategory === key ? 'var(--bg-primary)' : 'var(--text-dim)',
                                    border: '1px solid ' + (activeCategory === key ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)'),
                                    fontWeight: activeCategory === key ? 700 : 400,
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Sort + Bulk Actions */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                            style={{
                                fontSize: 10, padding: '3px 8px', background: 'var(--bg-tertiary)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
                                color: 'var(--text-primary)',
                            }}
                        >
                            <option value="fitness">適合度順</option>
                            <option value="generation">世代順</option>
                            <option value="breedRemain">配合残順</option>
                        </select>
                        {exhaustedCount > 0 && (
                            <button
                                onClick={handleBulkCrystallize}
                                style={{
                                    fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                                    background: 'linear-gradient(135deg, rgba(170,85,255,0.2), rgba(255,107,53,0.2))',
                                    border: '1px solid var(--accent-magenta)', color: 'var(--accent-magenta)',
                                    fontWeight: 700,
                                }}
                            >
                                💎 一括結晶化 ({exhaustedCount}体)
                            </button>
                        )}
                    </div>

                    {/* Materials Display */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 10, color: 'var(--text-dim)' }}>
                        <span>🔥{materials.fire_shard}</span>
                        <span>❄️{materials.ice_shard}</span>
                        <span>⚡{materials.lightning_shard}</span>
                    </div>

                    {sortedInventory.length === 0 ? (
                        <div className="db-empty">
                            <div style={{ fontSize: 36, opacity: 0.3 }}>🧬</div>
                            <div>遺伝子を収集してここに表示</div>
                        </div>
                    ) : (
                        sortedInventory.map(item => {
                            const isEquipped = equippedWeapon?.id === item.id;
                            return (
                                <GeneCard
                                    key={item.id}
                                    item={item}
                                    selected={parentA?.id === item.id || parentB?.id === item.id}
                                    onClick={() => handleSelect(item)}
                                    isEquipped={isEquipped}
                                    onCrystallize={handleCrystallize}
                                />
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right: Breeding Controls + Preview */}
            <div className="lab-panel">
                <div className="lab-panel-header">
                    <h3>⚗️ 配合ラボ</h3>
                </div>
                <div className="lab-content">
                    {/* Parent Selection Status */}
                    <div style={{ marginBottom: 16 }}>
                        <div className="stats-section-title">親個体選択</div>
                        <div className="stat-row">
                            <span className="stat-label">親A</span>
                            <span className="stat-value" style={{ color: parentA ? 'var(--accent-magenta)' : 'var(--text-dim)' }}>
                                {parentA ? `${ItemDecoder.getElementLabel(ItemDecoder.decode(parentA.genome).element)} Gen.${parentA.generation}` : '未選択'}
                                {parentAMastery > 0 && <span style={{ color: 'var(--accent-purple)', fontSize: 10, marginLeft: 6 }}>🔮{parentAMastery}</span>}
                            </span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">親B</span>
                            <span className="stat-value" style={{ color: parentB ? 'var(--accent-magenta)' : 'var(--text-dim)' }}>
                                {parentB ? `${ItemDecoder.getElementLabel(ItemDecoder.decode(parentB.genome).element)} Gen.${parentB.generation}` : '未選択'}
                            </span>
                        </div>
                        <div className="stat-row" style={{ marginTop: 4 }}>
                            <span className="stat-label">コスト</span>
                            <span className="stat-value" style={{ color: geneEnergy >= totalCost ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                ⚡{totalCost} EP
                                {lockedGenes.length > 0 && <span style={{ fontSize: 9, opacity: 0.7 }}> (配合{breedCost} + ロック{lockedGenes.length}×{LOCK_COST_PER_GENE})</span>}
                            </span>
                        </div>
                        {/* EP deficit display */}
                        {geneEnergy < totalCost && (
                            <div style={{ fontSize: 10, color: 'var(--accent-red)', marginTop: 2, padding: '3px 8px', background: 'rgba(255,51,85,0.08)', borderRadius: 4 }}>
                                🚨 {totalCost - geneEnergy}EP 不足（所持: ⚡{geneEnergy} / 必要: ⚡{totalCost}）
                            </div>
                        )}
                    </div>

                    {/* Gene Lock (Epigenetics) */}
                    {parentA && parentB && (
                        <div style={{ marginBottom: 16, padding: 10, background: 'rgba(170, 85, 255, 0.05)', border: '1px solid rgba(170, 85, 255, 0.2)', borderRadius: 'var(--radius)' }}>
                            <div style={{ fontSize: 10, color: 'var(--accent-purple)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                                🔒 遺伝子ロック {parentAMastery < 10 && <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>(熟練度10で解禁)</span>}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                                {GENE_NAMES.map((name, idx) => {
                                    const isLocked = lockedGenes.includes(idx);
                                    const canLock = parentAMastery >= 10;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => toggleGeneLock(idx)}
                                            disabled={!canLock && !isLocked}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: 10,
                                                border: `1px solid ${isLocked ? 'var(--accent-purple)' : 'var(--border)'}`,
                                                borderRadius: 4,
                                                background: isLocked ? 'rgba(170, 85, 255, 0.15)' : 'transparent',
                                                color: isLocked ? 'var(--accent-purple)' : canLock ? 'var(--text-secondary)' : 'var(--text-dim)',
                                                cursor: canLock || isLocked ? 'pointer' : 'not-allowed',
                                                textAlign: 'left',
                                            }}
                                        >
                                            {isLocked ? '🔒' : '　'} {name}
                                        </button>
                                    );
                                })}
                            </div>
                            {lockedGenes.length > 0 && (
                                <div style={{ fontSize: 9, color: 'var(--accent-purple)', marginTop: 6, opacity: 0.8 }}>
                                    ロック中の遺伝子は親Aから100%継承、突然変異無効
                                </div>
                            )}
                        </div>
                    )}

                    {/* Offspring Prediction */}
                    {prediction && (
                        <div className="breed-preview">
                            <div className="breed-preview-title">🔮 予想ステータス（子世代）</div>
                            <div className="gene-bars">
                                {prediction.average.map((avg, i) => (
                                    <div key={i} className="gene-bar-row">
                                        <span className="gene-bar-label">
                                            {lockedGenes.includes(i) && '🔒'}{GENE_NAMES[i]}
                                        </span>
                                        <div className="gene-bar-track" style={{ position: 'relative' }}>
                                            {/* Range bar */}
                                            <div style={{
                                                position: 'absolute',
                                                left: `${prediction.min[i] * 100}%`,
                                                width: `${(prediction.max[i] - prediction.min[i]) * 100}%`,
                                                height: '100%',
                                                background: lockedGenes.includes(i) ? 'rgba(170, 85, 255, 0.3)' : 'rgba(170, 85, 255, 0.2)',
                                                borderRadius: 2,
                                            }} />
                                            <div
                                                className={`gene-bar-fill ${i >= 8 ? (i === 8 ? 'fire' : 'ice') : i >= 5 ? 'personality' : ''}`}
                                                style={{ width: `${avg * 100}%`, opacity: 0.8 }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--accent-yellow)', marginTop: 8, opacity: 0.8 }}>
                                ⚠ 突然変異により実際のステータスは変動します
                                {parentGeneration >= 5 && <span style={{ color: 'var(--accent-red)' }}> (遺伝子劣化: Gen.{parentGeneration + 1})</span>}
                            </div>
                        </div>
                    )}

                    {/* Inbreed Alert */}
                    {inbreedPreview?.isInbred && (
                        <div style={{
                            marginBottom: 16, padding: 10,
                            background: 'rgba(255, 107, 53, 0.06)',
                            border: '1px solid rgba(255, 107, 53, 0.3)',
                            borderRadius: 'var(--radius)',
                        }}>
                            <div style={{ fontSize: 10, color: 'var(--accent-yellow)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                                🧬 近親配合検知 — 係数: {(inbreedPreview.coefficient * 100).toFixed(0)}%
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--accent-green)', marginBottom: 4 }}>
                                ✅ ボーナス: {inbreedPreview.fixedGenes.length}遺伝子自動固定
                                {inbreedPreview.fixedGenes.length > 0 && (
                                    <span style={{ color: 'var(--text-dim)' }}>
                                        {' '}({inbreedPreview.fixedGenes.map(i => GENE_NAMES[i]).join(', ')})
                                    </span>
                                )}
                            </div>
                            {inbreedPreview.coefficient > 0.25 && (
                                <div style={{ fontSize: 10, color: 'var(--accent-red)' }}>
                                    ⚠️ 遺伝病リスク: {Math.round(inbreedPreview.coefficient > 0.5 ? 50 : inbreedPreview.coefficient * 30)}%
                                    <span style={{ fontSize: 9, color: 'var(--text-dim)' }}> (脆弱遺伝子 / 攻撃減衰 / 属性不安定 / 代謝低下)</span>
                                </div>
                            )}
                            {inbreedPreview.sharedAncestors.length > 0 && (
                                <div style={{ fontSize: 10, color: 'var(--accent-red)', marginTop: 6 }}>
                                    🔴 共通祖先: {inbreedPreview.sharedAncestors.map(id => {
                                        const anc = inventory.find(i => i.id === id);
                                        const name = anc?.bloodlineName ?? id.slice(0, 8);
                                        return name;
                                    }).join(' / ')}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Simulation */}
                    {simResult && (
                        <div className="sim-box">
                            <div className="sim-box-title">📈 100戦シミュレーション結果</div>
                            <div className={`sim-winrate ${simResult.winRate > 0.7 ? 'high' : simResult.winRate > 0.4 ? 'mid' : 'low'}`}>
                                {(simResult.winRate * 100).toFixed(0)}%
                            </div>
                            <div className="sim-stat">
                                <span className="sim-stat-label">勝率</span>
                                <span className="sim-stat-value">{simResult.wins}勝 / {simResult.losses}敗</span>
                            </div>
                            <div className="sim-stat">
                                <span className="sim-stat-label">平均キルタイム</span>
                                <span className="sim-stat-value">{simResult.avgKillTime === Infinity ? '—' : simResult.avgKillTime.toFixed(1)}秒</span>
                            </div>
                            <div className="sim-stat">
                                <span className="sim-stat-label">最速キル</span>
                                <span className="sim-stat-value">{simResult.bestKillTime.toFixed(1)}秒</span>
                            </div>
                            <div className="sim-stat">
                                <span className="sim-stat-label">平均ダメージ効率</span>
                                <span className="sim-stat-value">{simResult.avgDamageRatio.toFixed(1)}x</span>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                        <button
                            className="btn btn-secondary"
                            onClick={handleSimulate}
                            disabled={!parentA || !parentB || isSimulating}
                        >
                            {isSimulating ? '⏳ シミュレーション中...' : '📊 100戦シミュレート'}
                        </button>
                        <button
                            className="btn btn-breed"
                            onClick={() => {
                                if (inbreedPreview?.isInbred && inbreedPreview.coefficient > 0.25) {
                                    setShowCoiWarning(true);
                                } else {
                                    handleBreed();
                                }
                            }}
                            disabled={!canBreed}
                        >
                            🧬 配合実行 (⚡{totalCost} EP{needsMaterial ? ` + ${materialLabel[requiredMaterialType]}` : ''})
                        </button>
                    </div>

                    {/* COI Warning Dialog */}
                    {showCoiWarning && inbreedPreview && (
                        <div style={{
                            position: 'fixed', inset: 0, zIndex: 1000,
                            background: 'rgba(0, 0, 0, 0.7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }} onClick={() => setShowCoiWarning(false)}>
                            <div className="coi-warning-dialog" onClick={e => e.stopPropagation()} style={{
                                background: 'var(--bg-panel)', border: '2px solid var(--accent-red)',
                                borderRadius: 'var(--radius)', padding: 24, maxWidth: 400, width: '90%',
                                boxShadow: '0 0 40px rgba(255, 51, 85, 0.3)',
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 12, textAlign: 'center' }}>
                                    ⚠️ 遺伝的崩壊の警告
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                                    近親配合係数(COI)が <strong style={{ color: 'var(--accent-yellow)' }}>{(inbreedPreview.coefficient * 100).toFixed(0)}%</strong> を超えています。
                                    子個体に遺伝病が発症するリスクがあります。
                                </div>

                                <div style={{ fontSize: 10, marginBottom: 8 }}>
                                    <div style={{ color: 'var(--accent-green)', marginBottom: 4, fontWeight: 700 }}>✅ メリット（血の濃さ）:</div>
                                    <div style={{ color: 'var(--text-secondary)', paddingLeft: 12 }}>
                                        • {inbreedPreview.fixedGenes.length}遺伝子が自動固定
                                        {inbreedPreview.fixedGenes.length > 0 && (
                                            <span style={{ color: 'var(--text-dim)' }}>
                                                {' '}({inbreedPreview.fixedGenes.map(i => GENE_NAMES[i]).join(', ')})
                                            </span>
                                        )}<br />
                                        • 両親の強みが高確率で継承
                                    </div>
                                </div>

                                <div style={{ fontSize: 10, marginBottom: 12 }}>
                                    <div style={{ color: 'var(--accent-red)', marginBottom: 4, fontWeight: 700 }}>❌ デメリット（遺伝病リスク）:</div>
                                    <div style={{ color: 'var(--text-secondary)', paddingLeft: 12 }}>
                                        • 発症確率: {Math.round(inbreedPreview.coefficient > 0.5 ? 50 : inbreedPreview.coefficient * 30)}%<br />
                                        • 脆弱遺伝子 (HP-30%) / 攻撃減衰 / 属性不安定 / 代謝低下
                                    </div>
                                </div>

                                {inbreedPreview.sharedAncestors.length > 0 && (
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 12 }}>
                                        共通祖先: {inbreedPreview.sharedAncestors.length}体検出
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ flex: 1 }}
                                        onClick={() => setShowCoiWarning(false)}
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        className="btn btn-danger"
                                        style={{ flex: 1 }}
                                        onClick={() => { setShowCoiWarning(false); handleBreed(); }}
                                    >
                                        ⚠️ 配合する
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Quick Equip (for breeding phase) */}
                    {isBreedingPhase && sortedInventory.length > 0 && (
                        <div style={{ marginTop: 24 }}>
                            <div className="stats-section-title">⚡ 装備して出撃</div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                                兵器を選んで次のステージへ
                            </div>
                            {sortedInventory.slice(0, 5).map(item => (
                                <div key={item.id} style={{ marginBottom: 4 }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%', fontSize: 10, padding: '8px 12px' }}
                                        onClick={() => handleEquipAndResume(item)}
                                    >
                                        装備: {ItemDecoder.getElementLabel(ItemDecoder.decode(item.genome).element)} {ItemDecoder.getRating(item)}ランク (Gen.{item.generation})
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
