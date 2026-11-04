/* Today art-direction palette (hero + mountain), ported from weight-tracker/css/today.css (--tdy-*).
   These are illustration colors that the shared tokens don't carry; everything else uses useTheme().c. */
import { useTheme } from '@/theme';

const base = {
  on: '#FFFFFF', on2: 'rgba(255,255,255,0.72)', on3: 'rgba(255,255,255,0.60)',
  glowA: '#4F46E5', glowB: '#0F766E', glow: '#6D63FF',
  foodA: '#C4C1FF', foodZ: '#6D63FF', foodDot: '#A5A1FF', foodTrack: 'rgba(139,135,255,0.20)',
  overA: '#FDE68A', overZ: '#F59E0B', overDot: '#FBBF24',
  moveA: '#5EEAD4', moveZ: '#0D9488', moveDot: '#2DD4BF', moveTrack: 'rgba(45,212,191,0.17)',
  stepsA: '#F0FDFA', stepsZ: '#99E6DA', stepsDot: '#CCF5EE', stepsTrack: 'rgba(153,230,218,0.15)',
  flameO: '#F59E0B', flameI: '#FEF3C7', streakBg: 'rgba(251,191,36,0.16)', streakFg: '#FCD34D',
};
const light = {
  ...base,
  hero: '#1E1B4B',
  skyA: '#E4E7FF', skyZ: '#F7F8FF', sun: '#FDE68A',
  farA: '#B9BEFF', farZ: '#DADDFF', midA: '#BFEBE3', midZ: '#E6F7F4', nearA: '#A7E3D8', nearZ: '#D3F2EC',
  snow: '#FFFFFF', cloud: '#FFFFFF', cloudO: 0.9, starO: 0, tree: '#0F766E', treeO: 0.55,
  bed: 'rgba(255,255,255,0.92)', bedShadow: 'rgba(18,20,28,0.06)',
  trailA: '#5EEAD4', trailZ: '#0F766E', ahead: '#4F46E5', goalA: '#F59E0B', goalZ: '#FBBF24',
  pill: '#FFFFFF', pillInk: '#12141C', pillNext: '#474C5E', goalPill: '#FEF5E7', goalPillLine: '#F59E0B',
  pole: '#12141C', tip: '#12141C', tipInk: '#FFFFFF', me: '#4F46E5', meRing: '#FFFFFF',
  passed: '#0F766E', passedFill: '#14B8A6', aheadFill: '#EEF0FF', bmiUnder: '#C9CDD8', bmiMark: '#12141C',
};
const dark: typeof light = {
  ...base,
  hero: '#1C1946',
  skyA: '#1D2045', skyZ: '#191C2E', sun: '#8B87FF',
  farA: '#3B3F86', farZ: '#262A52', midA: '#1E4B4E', midZ: '#1A2B37', nearA: '#1F5D57', nearZ: '#17333A',
  snow: '#DDE0FF', cloud: '#FFFFFF', cloudO: 0, starO: 0.7, tree: '#2DD4BF', treeO: 0.32,
  bed: 'rgba(255,255,255,0.10)', bedShadow: 'rgba(0,0,0,0.18)',
  trailA: '#99F6E4', trailZ: '#2DD4BF', ahead: '#A5A1FF', goalA: '#F59E0B', goalZ: '#FBBF24',
  pill: '#2A2F42', pillInk: 'rgba(255,255,255,0.92)', pillNext: 'rgba(255,255,255,0.72)', goalPill: '#3A2E14', goalPillLine: '#FBBF24',
  pole: 'rgba(255,255,255,0.85)', tip: '#F1F2F6', tipInk: '#12141C', me: '#8B87FF', meRing: '#F1F2F6',
  passed: '#2DD4BF', passedFill: '#2DD4BF', aheadFill: 'rgba(139,135,255,0.22)', bmiUnder: 'rgba(255,255,255,0.28)', bmiMark: '#FFFFFF',
};
export type TodayPalette = typeof light;
export const useTodayPalette = (): TodayPalette => (useTheme().dark ? dark : light);
