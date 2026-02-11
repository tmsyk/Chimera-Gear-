/**
 * BattleLogPanel — Streaming battle log display with semantic highlighting
 * Performance optimized: renders only last 50 entries, throttled scroll
 */

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';

export function BattleLogPanel() {
    const { battleLogs, battleSpeed, setBattleSpeed, isBattling } = useGameStore();
    const scrollRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number>(0);

    // Throttled scroll via requestAnimationFrame
    const scheduleScroll = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
            rafRef.current = 0;
        });
    }, []);

    useEffect(() => {
        scheduleScroll();
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [battleLogs, scheduleScroll]);

    const getLogClass = (log: typeof battleLogs[0]) => {
        const classes = ['log-entry'];
        if (log.isMutation) classes.push('mutation');
        else if (log.actor === 'weapon') classes.push('weapon');
        else if (log.actor === 'enemy') classes.push('enemy');

        if (log.isCrit) classes.push('crit', 'flash');
        if (log.isEvade) classes.push('flash');
        if (log.message.includes('戦闘開始') || log.message.includes('勝利') || log.message.includes('破壊') || log.message.includes('タイムアウト')) {
            classes.push('system');
        }

        // Element class for colored tags
        if (log.element) {
            classes.push(`elem-${log.element.toLowerCase()}`);
        }

        return classes.join(' ');
    };

    // Only render last 50 entries for DOM performance on mobile
    const visibleLogs = battleLogs.slice(-50);
    const offset = Math.max(0, battleLogs.length - 50);

    return (
        <div className="log-panel">
            <div className="log-header">
                <h3>⚡ Battle Log</h3>
                <div className="speed-controls">
                    {[1, 10, 100].map(s => (
                        <button
                            key={s}
                            className={`speed-btn ${battleSpeed === s ? 'active' : ''}`}
                            onClick={() => setBattleSpeed(s)}
                        >
                            {s}x
                        </button>
                    ))}
                    {isBattling && <span className="pulse" style={{ color: 'var(--accent-green)', fontSize: 11 }}>● LIVE</span>}
                </div>
            </div>
            <div className="log-scroll" ref={scrollRef}>
                {battleLogs.length === 0 ? (
                    <div className="log-empty">
                        <div className="log-empty-icon">⚔️</div>
                        <div>バトルを開始してログを監視しよう</div>
                    </div>
                ) : (
                    <>
                        {offset > 0 && (
                            <div className="log-entry" style={{ opacity: 0.4, fontSize: 10, textAlign: 'center' }}>
                                ··· {offset} 件のログを省略 ···
                            </div>
                        )}
                        {visibleLogs.map((log, i) => (
                            <div key={offset + i} className={getLogClass(log)}>
                                {log.message}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
