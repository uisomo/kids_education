import React, { useState, useEffect } from 'react';
import './CharacterDashboard.css';

interface CharacterStat {
  name: string;
  icon: string;
  currentValue: number;
  maxValue: number;
  color: string;
}

interface Item {
  category: string;
  level: number;
  imagePath: string;
  requiredStatLevel: number;
}

interface CharacterLevel {
  level: number;
  expThreshold: number;
  characterImagePath: string;
}

interface CharacterData {
  stats: CharacterStat[];
  items: Item[];
  levels: CharacterLevel[];
  currentExp: number;
  currentLevel: number;
  characterName: string;
  characterTitle: string;
}

const CharacterDashboard: React.FC = () => {
  const [characterData, setCharacterData] = useState<CharacterData>({
    stats: [
      { name: 'Hit Points', icon: '❤️', currentValue: 100, maxValue: 100, color: '#ff6b6b' },
      { name: 'Power', icon: '💪', currentValue: 15, maxValue: 50, color: '#ff9ff3' },
      { name: 'Agility', icon: '⚡', currentValue: 12, maxValue: 50, color: '#54a0ff' },
      { name: 'Toughness', icon: '🛡️', currentValue: 8, maxValue: 50, color: '#5f27cd' },
      { name: 'Equity', icon: '⚖️', currentValue: 20, maxValue: 50, color: '#00d2d3' },
      { name: 'Logic', icon: '🧠', currentValue: 18, maxValue: 50, color: '#feca57' },
      { name: 'Acting', icon: '🎭', currentValue: 5, maxValue: 50, color: '#48dbfb' },
      { name: 'Martial Arts', icon: '🥋', currentValue: 3, maxValue: 50, color: '#ff6348' }
    ],
    items: [
      { category: 'weapon', level: 1, imagePath: '⚔️', requiredStatLevel: 5 },
      { category: 'armor', level: 1, imagePath: '🛡️', requiredStatLevel: 3 },
      { category: 'accessory', level: 1, imagePath: '💍', requiredStatLevel: 8 }
    ],
    levels: [
      { level: 1, expThreshold: 0, characterImagePath: '🧙‍♂️' },
      { level: 2, expThreshold: 3000, characterImagePath: '🧙‍♂️' },
      { level: 3, expThreshold: 6000, characterImagePath: '🧙‍♂️' }
    ],
    currentExp: 150,
    currentLevel: 1,
    characterName: 'Young Hero',
    characterTitle: 'Level 1 Apprentice'
  });

  const [notification, setNotification] = useState<string | null>(null);

  // Calculate the maximum stat value for scaling bars
  const maxStatValue = Math.max(...characterData.stats.map(stat => stat.currentValue));
  const scaledMaxValue = Math.max(maxStatValue, 50);

  const handleStatIncrease = (statIndex: number) => {
    setCharacterData(prev => {
      const newStats = [...prev.stats];
      const stat = newStats[statIndex];

      if (stat.currentValue < stat.maxValue) {
        newStats[statIndex] = {
          ...stat,
          currentValue: stat.currentValue + 1
        };

        // Add experience
        const newExp = prev.currentExp + 50;

        // Check for level up
        const newLevel = prev.levels.find(level =>
          newExp >= level.expThreshold &&
          level.level > prev.currentLevel
        );

        // Check for item upgrades
        const availableItems = prev.items.filter(item =>
          newStats[statIndex].currentValue >= item.requiredStatLevel
        );

        // Show notification
        showNotification(
          `${stat.name} increased! +50 XP gained! ${availableItems.length > 0 ? 'New item available!' : ''}`
        );

        return {
          ...prev,
          stats: newStats,
          currentExp: newExp,
          currentLevel: newLevel ? newLevel.level : prev.currentLevel
        };
      }

      return prev;
    });
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const getExpPercentage = () => {
    const currentLevelThreshold = characterData.levels.find(l => l.level === characterData.currentLevel)?.expThreshold || 0;
    const nextLevelThreshold = characterData.levels.find(l => l.level === characterData.currentLevel + 1)?.expThreshold || 3000;
    const progress = characterData.currentExp - currentLevelThreshold;
    const total = nextLevelThreshold - currentLevelThreshold;
    return Math.min((progress / total) * 100, 100);
  };

  const getCurrentCharacterImage = () => {
    const currentLevelData = characterData.levels.find(l => l.level === characterData.currentLevel);
    return currentLevelData?.characterImagePath || '🧙‍♂️';
  };

  const getAvailableItems = () => {
    return characterData.items.filter(item => {
      const relevantStat = characterData.stats.find(stat =>
        stat.name.toLowerCase().includes('power') ||
        stat.name.toLowerCase().includes('toughness') ||
        stat.name.toLowerCase().includes('agility')
      );
      return relevantStat && relevantStat.currentValue >= item.requiredStatLevel;
    });
  };

  return (
    <div className="character-dashboard">
      {notification && (
        <div className="notification">
          {notification}
        </div>
      )}

      <div className="dashboard-header">
        <div className="character-avatar">
          {getCurrentCharacterImage()}
        </div>
        <div className="character-info">
          <h1 className="character-name">{characterData.characterName}</h1>
          <div className="character-title">{characterData.characterTitle}</div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="stats-section">
          <h2 className="section-title">Character Stats</h2>
          <div className="stats-grid">
            {characterData.stats.map((stat, index) => (
              <div key={stat.name} className="stat-item">
                <div className="stat-header">
                  <span className="stat-icon">{stat.icon}</span>
                  <span className="stat-name">{stat.name}</span>
                  <span className="stat-value">{stat.currentValue}/{stat.maxValue}</span>
                </div>
                <div className="stat-bar">
                  <div
                    className="stat-fill"
                    style={{
                      width: `${(stat.currentValue / scaledMaxValue) * 100}%`,
                      backgroundColor: stat.color
                    }}
                  />
                  <button
                    className="stat-button"
                    onClick={() => handleStatIncrease(index)}
                    disabled={stat.currentValue >= stat.maxValue}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="side-panel">
          <div className="items-section">
            <h2 className="section-title">Items & Equipment</h2>
            <div className="items-grid">
              {getAvailableItems().map((item, index) => (
                <div key={index} className="item-slot">
                  {item.imagePath}
                </div>
              ))}
              {/* Empty slots */}
              {Array(6 - getAvailableItems().length).fill(null).map((_, index) => (
                <div key={`empty-${index}`} className="item-slot empty">
                  ?
                </div>
              ))}
            </div>
          </div>

          <div className="experience-section">
            <h2 className="section-title">Experience Progress</h2>
            <div className="experience-bar">
              <div
                className="exp-fill"
                style={{ width: `${getExpPercentage()}%` }}
              />
              <div className="exp-text">
                {characterData.currentExp} / {characterData.levels.find(l => l.level === characterData.currentLevel + 1)?.expThreshold || 3000} XP
              </div>
            </div>
            <div className="next-level-info">
              Next Level: {characterData.currentLevel + 1} | {((characterData.levels.find(l => l.level === characterData.currentLevel + 1)?.expThreshold || 3000) - characterData.currentExp)} XP needed
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterDashboard;