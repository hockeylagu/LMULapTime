/**
 * Colors say what they mean, not which hue they are (DESIGN.md, Colors). Signal and data families share four steps:
 * `soft` (secondary text on dark), the bare name (primary text, icons, lines), `strong` (fills and borders, usually
 * with an opacity modifier), `deep` (tinted wells) and `faded` (the base hue at low chroma, for unselected filters: still
 * 4.5:1 on lmu-bg, unlike an opacity fade). The hue values are Tailwind v4's own, so a role renders exactly
 * as the hue it replaced; retune a role here, never in a component.
 */
const hueOf = (oklch) => oklch.match(/([\d.]+)\)$/)[1];
const family = ([soft, base, strong, deep]) => ({ soft, DEFAULT: base, strong, deep, faded: `oklch(62% 0.06 ${hueOf(base)})` });

// [soft, base, strong, deep] = Tailwind v4 [300, 400, 500, 950] of the hue named in the comment
const FAMILIES = {
  gain: ['oklch(84.5% 0.143 164.978)', 'oklch(76.5% 0.177 163.223)', 'oklch(69.6% 0.17 162.48)', 'oklch(26.2% 0.051 172.552)'], // emerald
  loss: ['oklch(81% 0.117 11.638)', 'oklch(71.2% 0.194 13.428)', 'oklch(64.5% 0.246 16.439)', 'oklch(27.1% 0.105 12.094)'], // rose
  warn: ['oklch(87.9% 0.169 91.605)', 'oklch(82.8% 0.189 84.429)', 'oklch(76.9% 0.188 70.08)', 'oklch(27.9% 0.077 45.635)'], // amber
  info: ['oklch(82.8% 0.111 230.318)', 'oklch(74.6% 0.16 232.661)', 'oklch(68.5% 0.169 237.323)', 'oklch(29.3% 0.066 243.157)'], // sky
  aqua: ['oklch(86.5% 0.127 207.078)', 'oklch(78.9% 0.154 211.53)', 'oklch(71.5% 0.143 215.221)', 'oklch(30.2% 0.056 229.695)'], // cyan
  azure: ['oklch(80.9% 0.105 251.813)', 'oklch(70.7% 0.165 254.624)', 'oklch(62.3% 0.214 259.815)', 'oklch(28.2% 0.091 267.935)'], // blue
  indigo: ['oklch(78.5% 0.115 274.713)', 'oklch(67.3% 0.182 276.935)', 'oklch(58.5% 0.233 277.117)', 'oklch(25.7% 0.09 281.288)'], // indigo
  violet: ['oklch(81.1% 0.111 293.571)', 'oklch(70.2% 0.183 293.541)', 'oklch(60.6% 0.25 292.717)', 'oklch(28.3% 0.141 291.089)'], // violet
  purple: ['oklch(82.7% 0.119 306.383)', 'oklch(71.4% 0.203 305.504)', 'oklch(62.7% 0.265 303.9)', 'oklch(29.1% 0.149 302.717)'], // purple
  orange: ['oklch(83.7% 0.128 66.29)', 'oklch(75% 0.183 55.934)', 'oklch(70.5% 0.213 47.604)', 'oklch(26.6% 0.079 36.259)'], // orange
  teal: ['oklch(85.5% 0.138 181.071)', 'oklch(77.7% 0.152 181.912)', 'oklch(70.4% 0.14 182.503)', 'oklch(27.7% 0.046 192.524)'], // teal
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lmu: {
          // Surfaces, from recessed to raised
          deep: '#060910',
          dark: '#080A0F',
          badge: '#070C18',
          surface: '#080C14',
          strip: '#0A0E17',
          bg: '#0B0E14',
          card: '#151A23',
          cardHover: '#1A202C',
          raised: 'oklch(27.9% 0.041 260.031)',
          // Rules and borders
          border: '#232A36',
          rule: {
            DEFAULT: 'oklch(37.2% 0.044 257.287)',
            strong: 'oklch(44.6% 0.043 257.281)',
          },
          // Text tiers: every tier passes 4.5:1 on lmu-bg and lmu-card
          text: {
            DEFAULT: '#F8F9FA',
            soft: 'oklch(86.9% 0.022 252.894)',
          },
          muted: '#8D99AE',
          faint: '#7F8BA1',
          // Brand: the fill carries white text at 4.5:1; red text on dark uses accent-text
          accent: {
            DEFAULT: '#DC3441',
            text: '#FF4D55',
          },
          // Sectors 1, 2, 3 (SECTOR_COLORS)
          gold: '#FFB703',
          blue: '#219EBC',
          cyan: '#8ECAE6',
          green: '#2A9D8F',
          // Signals: one fixed meaning each
          gain: family(FAMILIES.gain),
          loss: family(FAMILIES.loss),
          warn: family(FAMILIES.warn),
          info: family(FAMILIES.info),
          // Data categories: channels, pace categories, car classes, conditions
          aqua: family(FAMILIES.aqua),
          azure: family(FAMILIES.azure),
          indigo: family(FAMILIES.indigo),
          violet: family(FAMILIES.violet),
          purple: family(FAMILIES.purple),
          orange: family(FAMILIES.orange),
          teal: family(FAMILIES.teal),
        }
      },
      // The faces LMU's own platform renders (Windows): named first so a bare `monospace` never triggers the
      // browsers' 13px generic-monospace quirk; system-ui stands in for Segoe UI off Windows.
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
