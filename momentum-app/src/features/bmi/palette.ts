/* BMI category palette (ported from weight-tracker/css/bmi.css --bmi-*). Illustration colors the shared tokens don't carry. */
import type { BmiCat } from '@/lib/calc';

export type BmiKey = BmiCat['key'];
export interface BmiSwatch { band: string; tint: string; ink: string }
const light: Record<BmiKey, BmiSwatch> = {
  under: { band: '#B9C7E6', tint: '#ECF0F9', ink: '#3F5585' },
  healthy: { band: '#3FB8A8', tint: '#E6F7F4', ink: '#0F766E' },
  over: { band: '#F3C063', tint: '#FEF5E7', ink: '#B45309' },
  obese: { band: '#E08A78', tint: '#FCEDE9', ink: '#A3402C' },
};
const dark: Record<BmiKey, BmiSwatch> = {
  under: { band: '#8D9DC6', tint: 'rgba(141,157,198,0.18)', ink: '#B4C3EA' },
  healthy: { band: '#2EA595', tint: 'rgba(45,212,191,0.10)', ink: '#2DD4BF' },
  over: { band: '#D9A846', tint: 'rgba(251,191,36,0.10)', ink: '#FBBF24' },
  obese: { band: '#C97A67', tint: 'rgba(224,138,120,0.13)', ink: '#F2A694' },
};
/** text drawn on top of a band */
export const onBand = (isDark: boolean) => (isDark ? '#0E1018' : '#12141C');
export const bmiColors = (isDark: boolean) => (isDark ? dark : light);
