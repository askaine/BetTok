// theme.js — Premium dark-mode design system
export const COLORS = {
  // Backgrounds
  bg:           '#080810',   // near-black with blue tint
  surface:      '#0F0F1A',   // card surface
  surfaceHigh:  '#161625',   // elevated surface
  surfaceGlass: '#1A1A2E99', // glassmorphism

  // Brand accents
  accent:       '#FF3B5C',   // viral red — primary CTA, "flop" indicator
  accentGlow:   '#FF3B5C18',
  yes:          '#00E87A',   // neon green — viral/win
  yesGlow:      '#00E87A18',
  spark:        '#FFB800',   // gold — sparks currency
  sparkGlow:    '#FFB80018',
  purple:       '#7C3AED',   // premium purple — streaks, badges
  purpleGlow:   '#7C3AED18',
  blue:         '#3B82F6',   // info, leaderboard
  blueGlow:     '#3B82F618',

  // Text
  text:         '#F0F0FF',   // primary text
  textSub:      '#A0A0C0',   // secondary text
  muted:        '#606080',   // muted/placeholder
  mutedHigh:    '#8080A0',

  // Borders
  border:       '#1E1E35',
  borderHigh:   '#2A2A45',

  // Gradients (used as array for LinearGradient)
  gradientViral:  ['#00E87A', '#00A855'],
  gradientFlop:   ['#FF3B5C', '#CC1F3F'],
  gradientSpark:  ['#FFB800', '#FF8C00'],
  gradientPurple: ['#7C3AED', '#5B21B6'],
  gradientCard:   ['#0F0F1A', '#080810'],
};

export const FONTS = {
  display: 'Oswald_600SemiBold',    // headers, numbers, display
  body:    'SpaceMono_400Regular',  // body text
  mono:    'SpaceMono_400Regular',  // monospace
};

export const RADIUS = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  18,
  xl:  24,
  full: 999,
};

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
};

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: (color) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  }),
};
