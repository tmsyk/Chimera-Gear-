/**
 * DatabasePanel — Inventory list, bulk decompose, energy system, pedigree view
 * Enhanced: 6 sort options, checkbox bulk-select (D/C/expired), lock visual emphasis,
 *           val² gene bars, EP preview, 1-click equip, selection clear
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

type SortKey = 'fitness' | 'generation' | 'rating' | 'dps' | 'element' | 'mastery';

export function DatabasePanel() {
    const { inventory, geneEnergy, decompose, equipWeapon, equippedWeapon, showToast, crystallizedItems, toggleItemLock } = useGameStore();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<SortKey>('fitness');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const inventoryMap = useMemo(() => {
        const map = new Map<string, Item>();
        for (const item of inventory) map.set(item.id, item);
        return map;
    }, [inventory]);

    const findAncestor = useCallback((id: string) => inventoryMap.get(id) ?? null, [inventoryMap]);

    const sortedInventory = useMemo(() => {
        const sorted = [...inventory];
        const rankOrder: Record<string, number> = { SS: 6, S: 5, A: 4, B: 3, C: 2, D: 1 };
        switch (sortBy) {
            case 'fitness': return sorted.sort((a, b) => b.fitness - a.fitness);
            case 'generation': return sorted.sort((a, b) => b.generation - a.generation);
            case 'rating': return sorted.sort((a, b) =>
                (rankOrder[ItemDecoder.getRating(b)] || 0) - (rankOrder[ItemDecoder.getRating(a)] || 0)
            );
            case 'dps': return sorted.sort((a, b) => {
                const dA = ItemDecoder.decode(a.genome); const dB = ItemDecoder.decode(b.genome);
                return (dB.attack / dB.attackSpeed) - (dA.attack / dA.attackSpeed);
            });
            case 'element': return sorted.sort((a, b) => {
                const eOrder: Record<string, number> = { Fire: 0, Ice: 1, Lightning: 2 };
                return (eOrder[ItemDecoder.decode(a.genome).element] ?? 0) - (eOrder[ItemDecoder.decode(b.genome).element] ?? 0);
            });
            case 'mastery': return sorted.sort((a, b) => (b.mastery ?? 0) - (a.mastery ?? 0));
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

    // Bulk select helpers
    const selectByFilter = (filter: (item: Item) => boolean) => {
        const equippedId = equippedWeapon?.id;
        const ids = inventory
            .filter(i => filter(i) && i.id !== equippedId && !i.locked)
            .map(i => i.id);
        setSelectedIds(new Set(ids));
    };

    const selectDOnly = () => selectByFilter(i => ItemDecoder.getRating(i) === 'D');
    const selectCOnly = () => selectByFilter(i => ItemDecoder.getRating(i) === 'C');
    const selectExpired = () => selectByFilter(i => (i.breedCount ?? 0) >= MAX_BREED_COUNT);

    // Compute EP yield for selected items
    const selectedEP = selectedIds.size * 10;

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
                        onChange={e => setSortBy(e.target.value as SortKey)}
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
                        <option value="dps">DPS順</option>
                        <option value="element">属性別</option>
                        <option value="mastery">熟練度順</option>
                    </select>
                </div>
            </div>

            {/* ========== Bulk Selection Checkboxes ========== */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                padding: '8px 12px', marginBottom: 8,
                background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255,255,255,0.05)',
            }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 4 }}>一括選択:</span>
                <button
                    className="btn btn-secondary"
                    style={{ padding: '3px 10px', fontSize: 10 }}
                    onClick={selectDOnly}
                >
                    D のみ
                </button>
                <button
                    className="btn btn-secondary"
                    style={{ padding: '3px 10px', fontSize: 10 }}
                    onClick={selectCOnly}
                >
                    C のみ
                </button>
                <button
                    className="btn btn-secondary"
                    style={{ padding: '3px 10px', fontSize: 10 }}
                    onClick={selectExpired}
                >
                    寿命切れ
                </button>
                {selectedIds.size > 0 && (
                    <>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 10px', fontSize: 10, marginLeft: 'auto' }}
                            onClick={() => setSelectedIds(new Set())}
                        >
                            ✕ 選択解除
                        </button>
                        <button
                            className="btn btn-danger"
                            style={{ padding: '3px 12px', fontSize: 10, fontWeight: 700 }}
                            onClick={handleDecompose}
                        >
                            🔥 解体 ({selectedIds.size}体 → +{selectedEP}EP)
                        </button>
                    </>
                )}
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
                        const isLocked = item.locked;
                        const isExpiredBreed = (item.breedCount ?? 0) >= MAX_BREED_COUNT;

                        return (
                            <div key={item.id}>
                                <div
                                    className={`db-item ${isSelected ? 'selected' : ''} ${isEquipped ? 'db-item-equipped' : ''}`}
                                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                    style={isLocked ? {
                                        borderLeft: '3px solid var(--accent-yellow, #ffd700)',
                                        background: 'rgba(255, 215, 0, 0.03)',
                                    } : undefined}
                                >
                                    <div
                                        className="db-item-check"
                                        onClick={e => { e.stopPropagation(); toggleSelection(item.id); }}
                                        style={isEquipped || isLocked ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
                                    >
                                        {isSelected ? '✓' : isEquipped ? '⚔' : isLocked ? '🔒' : ''}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div className="db-item-name">
                                            {isLocked && <span style={{ color: 'var(--accent-yellow, #ffd700)', fontSize: 11, marginRight: 4 }}>🔒</span>}
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
                                            <span style={{ color: isExpiredBreed ? 'var(--accent-red)' : 'var(--text-dim)', marginLeft: 6, fontSize: 9 }}>
                                                配合{item.breedCount ?? 0}/{MAX_BREED_COUNT}
                                                {isExpiredBreed && ' ⏰'}
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
                                    {/* 1-click equip shortcut */}
                                    {!isEquipped ? (
                                        <button
                                            onClick={e => { e.stopPropagation(); equipWeapon(item); showToast(`⚔️ ${item.bloodlineName ?? 'ゲノム'}を装備`); }}
                                            style={{
                                                padding: '2px 8px', fontSize: 9, flexShrink: 0,
                                                background: 'rgba(0,210,255,0.1)', border: '1px solid rgba(0,210,255,0.3)',
                                                borderRadius: 4, color: 'var(--accent-cyan)', cursor: 'pointer',
                                                whiteSpace: 'nowrap', textAlign: 'center',
                                            }}
                                        >
                                            装備
                                        </button>
                                    ) : <div />}
                                </div>

                                {/* Expanded detail + Pedigree */}
                                {isExpanded && (
                                    <div style={{
                                        padding: '8px 12px 12px 44px',
                                        background: 'var(--bg-panel)',
                                        borderBottom: '1px solid var(--border)',
                                        marginBottom: 4,
                                    }}>
                                        {/* Gene bars with val² display + rank markers + derived lightning resist */}
                                        <div className="gene-bars" style={{ marginBottom: 8 }}>
                                            {item.genome.map((val, i) => {
                                                const displayWidth = i >= 8
                                                    ? Math.max(val * val * 100, val > 0.01 ? 5 : 0)
                                                    : val * val * 100;
                                                return (
                                                    <div key={i} className="gene-bar-row">
                                                        <span className="gene-bar-label">{GENE_NAMES[i]}</span>
                                                        <div className="gene-bar-track" style={{ position: 'relative' }}>
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
                                            {/* Lightning resistance — derived value, not in genome */}
                                            {(() => {
                                                const lrVal = stats.lightningResist;
                                                const lrWidth = Math.max(lrVal * lrVal * 100, lrVal > 0.01 ? 5 : 0);
                                                return (
                                                    <div className="gene-bar-row">
                                                        <span className="gene-bar-label">⚡雷耐性</span>
                                                        <div className="gene-bar-track" style={{ position: 'relative' }}>
                                                            <div style={{ position: 'absolute', left: '36%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.08)' }} title="A" />
                                                            <div style={{ position: 'absolute', left: '64%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} title="S" />
                                                            <div
                                                                className="gene-bar-fill"
                                                                style={{ width: `${lrWidth}%`, background: 'var(--accent-yellow, #ffd700)' }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
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
                                                className={`btn ${isLocked ? 'btn-primary' : 'btn-secondary'}`}
                                                style={{ padding: '6px 12px', fontSize: 10 }}
                                                onClick={() => toggleItemLock(item.id)}
                                            >
                                                {isLocked ? '🔒 解除' : '🔓 ロック'}
                                            </button>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '6px 12px', fontSize: 10 }}
                                                onClick={() => { decompose([item.id]); setExpandedId(null); }}
                                                disabled={isEquipped || isLocked}
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
