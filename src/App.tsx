/**
 * Chimera Gear: Text Edition — Main App Shell
 */

import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from './store/useGameStore';
import { GeneticEngine } from './core/GeneticEngine';
import { ItemDecoder } from './core/ItemDecoder';
import { SaveManager } from './core/SaveManager';
import { BattleLogPanel } from './components/BattleLogPanel';
import { BattleStatsPanel } from './components/BattleStatsPanel';
import { BreedingLab } from './components/BreedingLab';
import { DatabasePanel } from './components/DatabasePanel';
import { TitleScreen } from './components/TitleScreen';

function App() {
  const { activeTab, setActiveTab, stage, inventory, geneEnergy, equippedWeapon, equipWeapon, addItem, toast, loadGame } = useGameStore();
  const [showTitle, setShowTitle] = useState(true);
  const [ready, setReady] = useState(false);

  // Initialize starter weapon (only on fresh new game)
  const initNewGame = useCallback(() => {
    const starterGenome = GeneticEngine.createRandomGenome();
    starterGenome[0] = 0.7;
    starterGenome[1] = 0.6;
    starterGenome[4] = 0.8;
    starterGenome[5] = 0.6;
    const starter = {
      id: 'starter_weapon',
      genome: starterGenome,
      fitness: 10,
      generation: 1,
    };
    addItem(starter);
    equipWeapon(starter);
  }, [addItem, equipWeapon]);

  const handleNewGame = useCallback(async () => {
    await SaveManager.deleteSave();
    initNewGame();
    setShowTitle(false);
  }, [initNewGame]);

  const handleContinue = useCallback(async () => {
    const loaded = await loadGame();
    if (!loaded) {
      initNewGame();
    }
    setShowTitle(false);
  }, [loadGame, initNewGame]);

  // On mount: determine if we should show title
  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return null;

  const equippedRating = equippedWeapon ? ItemDecoder.getRating(equippedWeapon) : '—';

  // TITLE SCREEN
  if (showTitle) {
    return <TitleScreen onNewGame={handleNewGame} onContinue={handleContinue} />;
  }

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div className="header-logo">
            Chimera Gear
            <span>Text Edition</span>
          </div>
          <nav className="header-nav desktop-nav">
            <button
              className={`header-tab ${activeTab === 'battle' ? 'active' : ''}`}
              onClick={() => setActiveTab('battle')}
            >
              ⚔️ Battle
            </button>
            <button
              className={`header-tab ${activeTab === 'lab' ? 'active' : ''}`}
              onClick={() => setActiveTab('lab')}
            >
              🧬 Lab
            </button>
            <button
              className={`header-tab ${activeTab === 'database' ? 'active' : ''}`}
              onClick={() => setActiveTab('database')}
            >
              💾 Database
            </button>
          </nav>
        </div>

        <div className="header-info">
          <div className="header-stat">
            <span className="header-stat-label">Stage</span>
            <span className="header-stat-value">{stage}</span>
          </div>
          <div className="header-stat">
            <span className="header-stat-label">Genes</span>
            <span className="header-stat-value">{inventory.length}</span>
          </div>
          <div className="header-stat">
            <span className="header-stat-label">Energy</span>
            <span className="header-stat-value" style={{ color: 'var(--accent-green)' }}>
              ⚡{geneEnergy}
            </span>
          </div>
          <div className="header-stat">
            <span className="header-stat-label">Equipped</span>
            <span className="header-stat-value" style={{
              color: equippedRating === 'S' ? 'var(--accent-magenta)' :
                equippedRating === 'A' ? 'var(--accent-cyan)' :
                  'var(--text-primary)'
            }}>
              {equippedRating}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === 'battle' && (
          <div className="battle-view">
            <BattleLogPanel />
            <BattleStatsPanel />
          </div>
        )}
        {activeTab === 'lab' && <BreedingLab />}
        {activeTab === 'database' && <DatabasePanel />}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button
          className={`bottom-tab ${activeTab === 'battle' ? 'active' : ''}`}
          onClick={() => setActiveTab('battle')}
        >
          <span className="bottom-tab-icon">⚔️</span>
          <span className="bottom-tab-label">Battle</span>
        </button>
        <button
          className={`bottom-tab ${activeTab === 'lab' ? 'active' : ''}`}
          onClick={() => setActiveTab('lab')}
        >
          <span className="bottom-tab-icon">🧬</span>
          <span className="bottom-tab-label">Lab</span>
        </button>
        <button
          className={`bottom-tab ${activeTab === 'database' ? 'active' : ''}`}
          onClick={() => setActiveTab('database')}
        >
          <span className="bottom-tab-icon">💾</span>
          <span className="bottom-tab-label">Database</span>
        </button>
      </nav>

      {/* Toast Notification */}
      {toast && (
        <div className="toast-notification">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
