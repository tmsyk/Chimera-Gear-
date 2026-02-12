/**
 * Chimera Gear: Text Edition — Text Battle Engine
 * tick-based auto battle with log generation
 */

import { ItemDecoder, type CombatStats, type ActionType, type ElementType } from './ItemDecoder';
import type { Genome } from './GeneticEngine';
import type { TraitInstance } from './TraitSystem';
import { applyTraits, getTraitCombatEffects, getTraitDef } from './TraitSystem';
import { masterySynchroBoost, masteryCritBonus, isMasteryMax } from './mathUtils';

export interface BattleLogEntry {
    time: number;          // seconds elapsed
    actor: 'weapon' | 'enemy';
    action: ActionType;
    message: string;
    damage?: number;
    isCrit?: boolean;
    isMutation?: boolean;  // special mutation event
    isEvade?: boolean;     // dodge/evasion event
    element?: ElementType;
}

export interface BattleResult {
    won: boolean;
    logs: BattleLogEntry[];
    killTime: number;         // seconds to kill (Infinity if lost)
    damageDealt: number;
    damageTaken: number;
    damageRatio: number;      // dealt / taken
    adaptationScore: number;  // how well you bypassed resistances
    weaponHpRemaining: number;
    enemyHpRemaining: number;
    endReason: 'enemy_killed' | 'weapon_destroyed' | 'weapon_selfkill' | 'timeout';
}

interface Combatant {
    name: string;
    stats: CombatStats;
    currentHp: number;
    cooldown: number;  // seconds until next action
    actor: 'weapon' | 'enemy';
}

const MUTATION_SKILLS: { name: string; damageMultiplier: number; aoe: boolean; element?: ElementType }[] = [
    { name: '連鎖爆発', damageMultiplier: 0.4, aoe: true },
    { name: 'プラズマバースト', damageMultiplier: 2.0, aoe: false, element: 'Lightning' },
    { name: '絶対零度', damageMultiplier: 1.5, aoe: false, element: 'Ice' },
    { name: '業火', damageMultiplier: 1.5, aoe: false, element: 'Fire' },
    { name: '遺伝子共鳴', damageMultiplier: 1.8, aoe: false },
];

export class TextBattleEngine {
    /**
     * Run a single battle between weapon and enemy genomes.
     * Returns full log + result analytics.
     */
    static runBattle(
        weaponGenome: Genome,
        enemyGenome: Genome,
        stageLevel: number = 1,
        maxTime: number = 30,
        weaponTraits: TraitInstance[] = [],
        initialWeaponHp: number | null = null,
        weaponMastery: number = 0,
    ): BattleResult {
        let wStats = ItemDecoder.decode(weaponGenome, 80 + stageLevel * 20);
        const eStats = ItemDecoder.decode(enemyGenome, 60 + stageLevel * 15);

        // Apply mastery synchro boost to weapon stats
        const synchroMult = masterySynchroBoost(weaponMastery);
        wStats = {
            ...wStats,
            attack: wStats.attack * synchroMult,
            defense: wStats.defense * synchroMult,
        };
        const masteryCrit = masteryCritBonus(weaponMastery);
        const isGolden = isMasteryMax(weaponMastery);

        // Apply traits to weapon stats
        const traitResult = applyTraits(wStats, weaponTraits);
        wStats = traitResult.stats;
        const traitEffects = getTraitCombatEffects(weaponTraits);
        const activeSynergies = traitResult.activeSynergies;

        const weaponName = isGolden ? '✦キメラ兵器✦' : 'キメラ兵器';
        const weapon: Combatant = {
            name: weaponName,
            stats: wStats,
            currentHp: initialWeaponHp !== null ? Math.min(initialWeaponHp, wStats.maxHp) : wStats.maxHp,
            cooldown: 0,
            actor: 'weapon',
        };

        const enemy: Combatant = {
            name: '敵個体',
            stats: eStats,
            currentHp: eStats.maxHp,
            cooldown: 0.3, // enemy acts slightly later
            actor: 'enemy',
        };

        const logs: BattleLogEntry[] = [];
        let time = 0;
        const tickInterval = 0.1; // 100ms ticks
        let totalDamageDealt = 0;
        let totalDamageTaken = 0;
        let resistedDamage = 0;
        let totalAttempedDamage = 0;

        // Opening log
        const traitNames = weaponTraits
            .map(t => getTraitDef(t.defId))
            .filter(Boolean)
            .map(d => `${d!.icon}${d!.name}`);
        const traitInfo = traitNames.length > 0 ? ` 【${traitNames.join('/')}】` : '';
        const synergyInfo = activeSynergies.length > 0 ? ` ✦シナジー:${activeSynergies.join(',')}` : '';

        logs.push({
            time: 0,
            actor: 'weapon',
            action: 'attack',
            message: `⚔️ 戦闘開始 — ${ItemDecoder.getElementLabel(wStats.element)}属性 vs ${ItemDecoder.getElementLabel(eStats.element)}属性${traitInfo}${synergyInfo}`,
        });

        // Mastery 100 bonus announcement
        if (isGolden) {
            logs.push({
                time: 0,
                actor: 'weapon',
                action: 'attack',
                message: `>> システム: 同期率100%。リミッター解除。全能力に習熟ボーナスを適用。`,
            });
        }

        // Berserk tracking
        let berserkActive = false;
        let battleOver = false;

        // Unified death check — returns true if battle should end
        // Uses < 0.01 threshold instead of <= 0 to handle floating-point rounding errors
        const HP_DEATH_THRESHOLD = 0.01;
        const checkDeath = (): boolean => {
            weapon.currentHp = Math.max(0, weapon.currentHp);
            enemy.currentHp = Math.max(0, enemy.currentHp);

            if (enemy.currentHp < HP_DEATH_THRESHOLD) {
                enemy.currentHp = 0;
                logs.push({
                    time, actor: 'weapon', action: 'attack',
                    message: `🏆 >> ターゲットの完全破壊を確認。`,
                });
                console.warn(`[Engine] checkDeath: enemy killed at t=${time.toFixed(1)}s (eHP=${enemy.currentHp})`);
                return true;
            }
            if (weapon.currentHp < HP_DEATH_THRESHOLD) {
                weapon.currentHp = 0;
                logs.push({
                    time, actor: 'weapon', action: 'defend',
                    message: `💀 >> 深刻な損傷。強制撤退します。`,
                });
                console.warn(`[Engine] checkDeath: weapon destroyed at t=${time.toFixed(1)}s (wHP=${weapon.currentHp})`);
                return true;
            }
            return false;
        };

        while (time < maxTime && !battleOver) {
            time = Math.round((time + tickInterval) * 100) / 100;

            // === Trait: HP decay per second ===
            if (traitEffects.hpDecayPerSec > 0) {
                weapon.currentHp -= weapon.stats.maxHp * traitEffects.hpDecayPerSec * tickInterval;
                weapon.currentHp = Math.max(0, weapon.currentHp);
                if (weapon.currentHp < HP_DEATH_THRESHOLD) {
                    weapon.currentHp = 0;
                    logs.push({
                        time, actor: 'weapon', action: 'defend',
                        message: `💀 >> キメラ兵器は自壊した…`,
                    });
                    console.warn(`[Engine] HP decay self-destruct at t=${time.toFixed(1)}s`);
                    battleOver = true;
                    break;
                }
            }

            // === Trait: Berserk activation ===
            if (traitEffects.berserkThreshold > 0 && !berserkActive) {
                if (weapon.currentHp / weapon.stats.maxHp <= traitEffects.berserkThreshold) {
                    berserkActive = true;
                    weapon.stats.attack *= 2;
                    weapon.stats.defense = 0;
                    logs.push({
                        time, actor: 'weapon', action: 'attack',
                        message: `👹 [${time.toFixed(1)}s] 狂戦士化発動！ 攻撃力2倍・防御0`,
                    });
                }
            }

            // ── Weapon action phase ──
            weapon.cooldown -= tickInterval;
            if (weapon.cooldown <= 0) {
                const action = this.selectAction(weapon, enemy, weaponGenome);
                const logEntry = this.executeAction(weapon, enemy, action, time, weaponGenome, masteryCrit);
                if (logEntry) {
                    logs.push(logEntry);
                    if (logEntry.damage && logEntry.actor === 'weapon') {
                        totalDamageDealt += logEntry.damage;

                        // === Trait: Lifesteal ===
                        if (traitEffects.lifesteal > 0) {
                            const heal = logEntry.damage * traitEffects.lifesteal;
                            weapon.currentHp = Math.min(weapon.stats.maxHp, weapon.currentHp + heal);
                        }

                        // === Trait: DoT on hit ===
                        if (traitEffects.dotOnHit > 0) {
                            const dotDmg = Math.round(enemy.stats.maxHp * traitEffects.dotOnHit * 10) / 10;
                            enemy.currentHp -= dotDmg;
                        }
                    }
                }
                weapon.cooldown = weapon.stats.attackSpeed;

                // Check death after weapon action + traits
                if (checkDeath()) { battleOver = true; break; }
            }

            // ── Enemy action phase (only if battle not over) ──
            if (battleOver) break;

            enemy.cooldown -= tickInterval;
            if (enemy.cooldown <= 0) {
                const action = this.selectAction(enemy, weapon, enemyGenome);
                const logEntry = this.executeAction(enemy, weapon, action, time, enemyGenome);
                if (logEntry) {
                    logs.push(logEntry);
                    if (logEntry.damage && logEntry.actor === 'enemy') {
                        totalDamageTaken += logEntry.damage;

                        // === Trait: Self-destruct on hit ===
                        if (traitEffects.selfDestructChance > 0 && Math.random() < traitEffects.selfDestructChance) {
                            const selfDmg = Math.round(weapon.stats.maxHp * 0.25);
                            weapon.currentHp -= selfDmg;
                            logs.push({
                                time, actor: 'weapon', action: 'attack',
                                message: `☢️ [${time.toFixed(1)}s] 不安定な核が暴走！ 自爆ダメージ ${selfDmg}`,
                                damage: selfDmg,
                            });
                        }

                        // === Trait: Thorn damage ===
                        if (traitEffects.thornDmg > 0) {
                            const thornDmg = Math.round(logEntry.damage * traitEffects.thornDmg * 10) / 10;
                            enemy.currentHp -= thornDmg;
                        }
                    }
                }
                enemy.cooldown = enemy.stats.attackSpeed;

                // Check death after enemy action + traits
                if (checkDeath()) { battleOver = true; break; }
            }

            // Track resisted damage for adaptation score
            totalAttempedDamage += totalDamageDealt;
        }

        // Determine end reason
        let endReason: BattleResult['endReason'];
        if (enemy.currentHp < HP_DEATH_THRESHOLD) {
            endReason = 'enemy_killed';
        } else if (weapon.currentHp < HP_DEATH_THRESHOLD) {
            const lastLog = logs[logs.length - 1];
            endReason = lastLog?.message.includes('自壊') ? 'weapon_selfkill' : 'weapon_destroyed';
        } else {
            endReason = 'timeout';
        }

        const won = enemy.currentHp < HP_DEATH_THRESHOLD && weapon.currentHp >= HP_DEATH_THRESHOLD;
        const killTime = won ? time : Infinity;
        const damageRatio = totalDamageTaken > 0 ? totalDamageDealt / totalDamageTaken : totalDamageDealt > 0 ? 999 : 1;

        // Adaptation score: how much damage got through vs resisted
        const adaptationScore = totalAttempedDamage > 0
            ? 1.0 - (resistedDamage / Math.max(1, totalAttempedDamage))
            : 0.5;

        // End log — only for timeout (HP0 cases already logged by checkDeath)
        if (endReason === 'timeout') {
            logs.push({
                time,
                actor: 'weapon',
                action: 'attack',
                message: `⏱️ >> タイムアウト — 決着つかず`,
            });
            console.warn(`[Engine] timeout at t=${time.toFixed(1)}s (wHP=${weapon.currentHp.toFixed(1)}, eHP=${enemy.currentHp.toFixed(1)})`);
        }

        return {
            won,
            logs,
            killTime,
            damageDealt: totalDamageDealt,
            damageTaken: totalDamageTaken,
            damageRatio,
            adaptationScore,
            weaponHpRemaining: Math.max(0, weapon.currentHp),
            enemyHpRemaining: Math.max(0, enemy.currentHp),
            endReason,
        };
    }

    /** Select action based on genome AI personality */
    private static selectAction(
        actor: Combatant,
        _target: Combatant,
        genome: Genome
    ): ActionType {
        const hpRatio = actor.currentHp / actor.stats.maxHp;

        // Base weights from genome
        let atkWeight = actor.stats.aggressionWeight;
        let defWeight = actor.stats.defenseWeight;
        let skillWeight = actor.stats.tacticalWeight;

        // Low HP boosts defense instinct
        if (hpRatio < 0.3) {
            defWeight *= (1 + genome[6] * 3); // Defense instinct gene amplifies
        }

        // Normalize
        const total = atkWeight + defWeight + skillWeight;
        atkWeight /= total;
        defWeight /= total;
        skillWeight /= total;

        const roll = Math.random();
        if (roll < atkWeight) return 'attack';
        if (roll < atkWeight + skillWeight) return 'skill';
        return 'defend';
    }

    /** Execute an action and return a log entry */
    private static executeAction(
        actor: Combatant,
        target: Combatant,
        action: ActionType,
        time: number,
        genome: Genome,
        critBonus: number = 0,
    ): BattleLogEntry | null {
        const timeStr = time.toFixed(1);

        switch (action) {
            case 'attack': {
                const baseDmg = actor.stats.attack;
                const resist = this.getResistance(target, actor.stats.element);
                const dmgAfterResist = baseDmg * (1 - resist * 0.8);
                const isCrit = Math.random() < 0.1 + genome[5] * 0.1 + critBonus;
                const finalDmg = Math.round((isCrit ? dmgAfterResist * 2 : dmgAfterResist) * 10) / 10;

                target.currentHp -= finalDmg;

                const elemTag = this.getElementTag(actor.stats.element);
                let msg = `${elemTag} [${timeStr}s] ${actor.name}の攻撃。${target.name}に${finalDmg}ダメージ`;
                if (isCrit) msg += '（クリティカル！）';
                if (resist > 0.3) msg += `。${target.name}の${ItemDecoder.getElementLabel(actor.stats.element).slice(2)}耐性でダメージ軽減`;

                return {
                    time, actor: actor.actor, action, message: msg,
                    damage: finalDmg, isCrit, element: actor.stats.element,
                };
            }

            case 'skill': {
                // Mutation skill — chance based on tactical variety gene
                const hasMutation = Math.random() < genome[7] * 0.4;

                if (hasMutation && actor.stats.special !== 'none') {
                    const skill = MUTATION_SKILLS[Math.floor(Math.random() * MUTATION_SKILLS.length)];
                    const skillElement = skill.element || actor.stats.element;
                    const resist = this.getResistance(target, skillElement);
                    const rawDmg = actor.stats.attack * skill.damageMultiplier;
                    const finalDmg = Math.round(rawDmg * (1 - resist * 0.8) * 10) / 10;

                    target.currentHp -= finalDmg;

                    const skillElemTag = this.getElementTag(skillElement);
                    return {
                        time, actor: actor.actor, action, isMutation: true,
                        message: `${skillElemTag} [${timeStr}s] 突然変異遺伝子：【${skill.name}】が発動！${target.name}に${finalDmg}ダメージ`,
                        damage: finalDmg, element: skillElement,
                    };
                }

                // Normal skill — slightly stronger attack with element
                const skillDmg = actor.stats.attack * 1.3;
                const resist = this.getResistance(target, actor.stats.element);
                const finalDmg = Math.round(skillDmg * (1 - resist * 0.8) * 10) / 10;
                target.currentHp -= finalDmg;

                const elemTag2 = this.getElementTag(actor.stats.element);
                return {
                    time, actor: actor.actor, action,
                    message: `${elemTag2} [${timeStr}s] ${actor.name}が${ItemDecoder.getElementLabel(actor.stats.element).slice(2)}スキルを発動。${finalDmg}ダメージ`,
                    damage: finalDmg, element: actor.stats.element,
                };
            }

            case 'defend': {
                const healAmount = Math.round(actor.stats.maxHp * 0.05 * 10) / 10;
                actor.currentHp = Math.min(actor.stats.maxHp, actor.currentHp + healAmount);

                return {
                    time, actor: actor.actor, action,
                    message: `[${timeStr}s] ${actor.name}が防御体勢。HP ${healAmount} 回復`,
                };
            }
        }
    }

    /** Get element tag for log messages */
    private static getElementTag(element: ElementType): string {
        switch (element) {
            case 'Fire': return '[🔥火炎]';
            case 'Ice': return '[❄️氷結]';
            case 'Lightning': return '[⚡雷撃]';
        }
    }

    /** Get elemental resistance of target vs incoming element */
    private static getResistance(target: Combatant, element: ElementType): number {
        switch (element) {
            case 'Fire': return target.stats.fireResist;
            case 'Ice': return target.stats.iceResist;
            case 'Lightning': return target.stats.lightningResist;
        }
    }
}
