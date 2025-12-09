export const COLORS = [
    { name: 'Ruby', hex: '#FF0055', glow: 'rgba(255, 0, 85, 0.6)' },
    { name: 'Emerald', hex: '#00FF66', glow: 'rgba(0, 255, 102, 0.6)' },
    { name: 'Sapphire', hex: '#00CCFF', glow: 'rgba(0, 204, 255, 0.6)' },
    { name: 'Amethyst', hex: '#CC00FF', glow: 'rgba(204, 0, 255, 0.6)' },
    { name: 'Amber', hex: '#FFAA00', glow: 'rgba(255, 170, 0, 0.6)' }
];

export const GAME_CONFIG = {
    lanes: 7,
    baseGrowthRate: 0.13,
    sporeExpandRate: 8,
    maxSporeSize: 60,
    penaltyGrowth: 40,
    matchShrink: 150,
};
