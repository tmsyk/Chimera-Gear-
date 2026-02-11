/**
 * DatabasePanel — Inventory list, bulk decompose, energy system, pedigree view
 */

import { useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';
import { ItemDecoder } from '../core/ItemDecoder';
import { GENE_NAMES } from '../core/GeneticEngine';
import { GENETIC_DISEASE_LABELS, MAX_BREED_COUNT } from '../core/PedigreeSystem';
import type { Item } from '../core/GeneticEngine';

function AncestorNode({ item, label }: { item: Item | null; label: string }) {
    if (!item) return (
        <div className="pedigree-node unknown">
            <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>不明</div>
        </div>
    );
    const stats = ItemDecoder.decode(item.genome);
    const dps = (stats.attack / stats.attackSpeed).toFixed(0);
    return (
        <div className="pedigree-node">
            <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{ItemDecoder.getElementLabel(stats.element).slice(0, 3)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Gen.{item.generation} | DPS {dps}</div>
        </div>
    );
}

export function DatabasePanel() {
    const { inventory, geneEnergy, decompose, equipWeapon, equippedWeapon, showToast, crystallizedItems, toggleItemLock } = useGameStore();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<'fitness' | 'generation' | 'rating'>('fitness');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const inventoryMap = useMemo(() => {
        const map = new Map<string, Item>();
        for (const item of inventory) map.set(item.id, item);
        return map;
    }, [inventory]);

    const findAncestor = useCallback((id: string) => inventoryMap.get(id) ?? null, [inventoryMap]);

    const sortedInventory = useMemo(() => {
        const sorted = [...inventory];
        switch (sortBy) {
            case 'fitness': return sorted.sort((a, b) => b.fitness - a.fitness);
            case 'generation': return sorted.sort((a, b) => b.generation - a.generation);
            case 'rating': {
                const ratingOrder: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };
                return sorted.sort((a, b) =>
                    (ratingOrder[ItemDecoder.getRating(b)] || 0) - (ratingOrder[ItemDecoder.getRating(a)] || 0)
                );
            }
        }
    }, [inventory, sortBy]);

    const toggleSelection = (id: string) => {
        const item = inventory.find(i => i.id === id);
        if (equippedWeapon?.id === id || item?.locked) return;
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const selectAllLowRating = () => {
        const equippedId = equippedWeapon?.id;
        const lowIds = inventory
            .filter(i => ['C', 'D'].includes(ItemDecoder.getRating(i)) && i.id !== equippedId && !i.locked)
            .map(i => i.id);
        setSelectedIds(new Set(lowIds));
    };

    const handleDecompose = () => {
        if (selectedIds.size === 0) return;
        const count = selectedIds.size;
        decompose(Array.from(selectedIds));
        setSelectedIds(new Set());
        showToast(`🔥 ${count}体を解体 → ⚡${count * 10} EP獲得`);
    };

    return (
        <div className="db-view">
            <div className="db-toolbar">
                <h3>💾 Genome Database ({inventory.length})</h3>
                <div className="db-toolbar-actions">
                    <div className="db-energy">⚡ {geneEnergy} EP</div>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as typeof sortBy)}
                        style={{
                            background: 'var(--bg-panel)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-primary)',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                        }}
                    >
                        <option value="fitness">適合度順</option>
                        <option value="generation">世代順</option>
                        <option value="rating">ランク順</option>
                    </select>
                    <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 10 }} onClick={selectAllLowRating}>
                        C/D選択
                    </button>
                    <button
                        className="btn btn-danger"
                        style={{ padding: '4px 12px', fontSize: 10 }}
                        onClick={handleDecompose}
                        disabled={selectedIds.size === 0}
                    >
                        🔥 解体 ({selectedIds.size})
                    </button>
                </div>
            </div>

            <div className="db-list">
                {sortedInventory.length === 0 ? (
                    <div className="db-empty">
                        <div style={{ fontSize: 48, opacity: 0.3 }}>💾</div>
                        <div>データベースは空です</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>バトルで遺伝子を収集しよう</div>
                    </div>
                ) : (
                    sortedInventory.map(item => {
                        const stats = ItemDecoder.decode(item.genome);
                        const rating = ItemDecoder.getRating(item);
                        const isSelected = selectedIds.has(item.id);
                        const isExpanded = expandedId === item.id;
                        const isEquipped = equippedWeapon?.id === item.id;
                        const mastery = item.mastery ?? 0;

                        return (
                            <div key={item.id}>
                                <div
                                    className={`db-item ${isSelected ? 'selected' : ''} ${isEquipped ? 'db-item-equipped' : ''}`}
                                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                >
                                    <div
                                        className="db-item-check"
                                        onClick={e => { e.stopPropagation(); toggleSelection(item.id); }}
                                        style={isEquipped || item.locked ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
                                    >
                                        {isSelected ? '✓' : isEquipped ? '⚔' : item.locked ? '🔒' : ''}
                                    </div>
                                    <div>
                                        <div className="db-item-name">
                                            {isEquipped && <span style={{ color: 'var(--accent-cyan)', fontSize: 9, marginRight: 4 }}>[装備中]</span>}
                                            {item.bloodlineName ?? `${ItemDecoder.getElementLabel(stats.element)} 個体`}
                                        </div>
                                        <div className="db-item-gen">
                                            Gen.{item.generation} | 適合度: {item.fitness.toFixed(1)}
                                            {mastery > 0 && <span style={{ color: 'var(--accent-purple)', marginLeft: 6 }}>🔮{mastery}</span>}
                                            {item.geneticDisease && (
                                                <span style={{ color: 'var(--accent-red)', marginLeft: 6 }}>
                                                    {GENETIC_DISEASE_LABELS[item.geneticDisease].icon}
                                                </span>
                                            )}
                                            <span style={{ color: 'var(--text-dim)', marginLeft: 6, fontSize: 9 }}>
                                                配合{item.breedCount ?? 0}/{MAX_BREED_COUNT}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="db-item-element">
                                        {stats.special !== 'none' ? ItemDecoder.getSpecialLabel(stats.special) : ''}
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-dim)' }}>
                                        DPS {(stats.attack / stats.attackSpeed).toFixed(0)}
                                    </div>
                                    <div className={`db-item-rating ${rating}`}>{rating}</div>
                                </div>

                                {/* Expanded detail + Pedigree */}
                                {isExpanded && (
                                    <div style={{
                                        padding: '8px 12px 12px 44px',
                                        background: 'var(--bg-panel)',
                                        borderBottom: '1px solid var(--border)',
                                        marginBottom: 4,
                                    }}>
                                        <div className="gene-bars" style={{ marginBottom: 8 }}>
                                            {item.genome.map((val, i) => (
                                                <div key={i} className="gene-bar-row">
                                                    <span className="gene-bar-label">{GENE_NAMES[i]}</span>
                                                    <div className="gene-bar-track">
                                                        <div
                                                            className={`gene-bar-fill ${i >= 8 ? (i === 8 ? 'fire' : 'ice') : i >= 5 ? 'personality' : ''}`}
                                                            style={{ width: `${val * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Pedigree Tree */}
                                        {item.parentIds && (
                                            <div className="pedigree-tree">
                                                <div style={{ fontSize: 10, color: 'var(--accent-cyan)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                                                    🌳 家系図
                                                </div>
                                                <div className="pedigree-level">
                                                    <AncestorNode item={item} label="本体" />
                                                </div>
                                                <div className="pedigree-connector">┣━━━━━━━━┫</div>
                                                <div className="pedigree-level">
                                                    <AncestorNode item={findAncestor(item.parentIds[0])} label="親A" />
                                                    <AncestorNode item={findAncestor(item.parentIds[1])} label="親B" />
                                                </div>
                                                {/* Grandparents */}
                                                {(() => {
                                                    const pA = findAncestor(item.parentIds[0]);
                                                    const pB = findAncestor(item.parentIds[1]);
                                                    const hasGrand = pA?.parentIds || pB?.parentIds;
                                                    if (!hasGrand) return null;
                                                    return (
                                                        <>
                                                            <div className="pedigree-connector" style={{ fontSize: 9 }}>┣━━┫　　┣━━┫</div>
                                                            <div className="pedigree-level grandparents">
                                                                {pA?.parentIds ? (
                                                                    <>
                                                                        <AncestorNode item={findAncestor(pA.parentIds[0])} label="祖A1" />
                                                                        <AncestorNode item={findAncestor(pA.parentIds[1])} label="祖A2" />
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <AncestorNode item={null} label="祖A1" />
                                                                        <AncestorNode item={null} label="祖A2" />
                                                                    </>
                                                                )}
                                                                {pB?.parentIds ? (
                                                                    <>
                                                                        <AncestorNode item={findAncestor(pB.parentIds[0])} label="祖B1" />
                                                                        <AncestorNode item={findAncestor(pB.parentIds[1])} label="祖B2" />
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <AncestorNode item={null} label="祖B1" />
                                                                        <AncestorNode item={null} label="祖B2" />
                                                                    </>
                                                                )}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                            <button
                                                className={`btn ${isEquipped ? 'btn-secondary' : 'btn-primary'}`}
                                                style={{ flex: 1, padding: '6px', fontSize: 10 }}
                                                onClick={() => equipWeapon(item)}
                                                disabled={isEquipped}
                                            >
                                                {isEquipped ? '装備済み' : '装備'}
                                            </button>
                                            <button
                                                className={`btn ${item.locked ? 'btn-primary' : 'btn-secondary'}`}
                                                style={{ padding: '6px 12px', fontSize: 10 }}
                                                onClick={() => toggleItemLock(item.id)}
                                            >
                                                {item.locked ? '🔒 解除' : '🔓 ロック'}
                                            </button>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '6px 12px', fontSize: 10 }}
                                                onClick={() => { decompose([item.id]); setExpandedId(null); }}
                                                disabled={isEquipped || item.locked}
                                            >
                                                解体
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* ========== Hall of Fame (Crystallized Items) ========== */}
            {crystallizedItems.length > 0 && (
                <div style={{
                    marginTop: 24,
                    padding: 16,
                    background: 'linear-gradient(135deg, rgba(170, 85, 255, 0.05), rgba(255, 107, 53, 0.05))',
                    border: '1px solid rgba(170, 85, 255, 0.2)',
                    borderRadius: 'var(--radius)',
                }}>
                    <div style={{ fontSize: 11, color: 'var(--accent-magenta)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
                        💎 殿堂 — Hall of Fame ({crystallizedItems.length})
                    </div>
                    {crystallizedItems.map(crystal => {
                        const cStats = ItemDecoder.decode(crystal.genome);
                        const cRating = (() => {
                            const dps = cStats.attack / cStats.attackSpeed;
                            if (dps > 500) return 'S';
                            if (dps > 300) return 'A';
                            if (dps > 150) return 'B';
                            return 'C';
                        })();
                        return (
                            <div key={crystal.id} style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '8px 12px', marginBottom: 6,
                                background: 'var(--bg-panel)', borderRadius: 'var(--radius-sm)',
                                border: '1px solid rgba(170, 85, 255, 0.15)',
                            }}>
                                <span style={{ fontSize: 20 }}>💎</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-magenta)' }}>
                                        {crystal.bloodlineName}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                        Gen.{crystal.generation} | {ItemDecoder.getElementLabel(cStats.element)}
                                        {' | '}配合{crystal.totalBreedCount}回 | +{crystal.crystalBonus.energyYield}EP
                                    </div>
                                </div>
                                <span className={`db-item-rating ${cRating}`} style={{ fontSize: 14 }}>{cRating}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
