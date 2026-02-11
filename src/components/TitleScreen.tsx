/**
 * TitleScreen — Chimera Gear opening screen
 * Shows NEW GAME / CONTINUE buttons
 */

import { useEffect, useState } from 'react';
import { SaveManager } from '../core/SaveManager';

interface TitleScreenProps {
    onNewGame: () => void;
    onContinue: () => void;
}

export function TitleScreen({ onNewGame, onContinue }: TitleScreenProps) {
    const [hasSave, setHasSave] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        SaveManager.hasSaveData().then((exists) => {
            setHasSave(exists);
            setChecking(false);
        });
    }, []);

    if (checking) return null;

    return (
        <div className="title-screen">
            <div className="title-content">
                {/* Glitch Logo */}
                <div className="title-logo" data-text="CHIMERA GEAR">
                    CHIMERA GEAR
                </div>
                <div className="title-subtitle">— Text Edition —</div>
                <div className="title-tagline">遺伝子を鍛え、最強のキメラ兵器を生み出せ。</div>

                {/* Buttons */}
                <div className="title-buttons">
                    {hasSave && (
                        <button className="title-btn title-btn-continue" onClick={onContinue}>
                            ▶ CONTINUE
                        </button>
                    )}
                    <button className="title-btn title-btn-new" onClick={onNewGame}>
                        ✦ NEW GAME
                    </button>
                </div>

                <div className="title-version">v1.0 — Genetic Arms Race</div>
            </div>

            {/* Background particles */}
            <div className="title-particles">
                {Array.from({ length: 20 }).map((_, i) => (
                    <div
                        key={i}
                        className="title-particle"
                        style={{
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 6}s`,
                            animationDuration: `${4 + Math.random() * 4}s`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
