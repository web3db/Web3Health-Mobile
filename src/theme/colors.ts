// src/theme/colors.ts

export const palette = {
  dark: {
    // UGA-inspired dark surfaces with Arch Black vibes
    bg: '#0B0B0B',
    surface: '#111316',
    elevated: '#16191D',
    border: '#1F1F1F',
    muted: '#20232A',

    // Bulldog Red (primary brand color)
    primary: '#BA0C2F',

    // Functional statuses (kept readable in dark)
    success: '#2ECC71',
    warning: '#F5C04E',
    danger: '#FF6B6B',

    // Text on dark
    text: {
      primary: '#FFFFFF',   // Chapel Bell White
      secondary: '#9EA2A2', // Stegeman (neutral) tone for readability
      muted: '#6B7280',
      inverse:   '#FFFFFF',
    },

    overlay: 'rgba(0,0,0,0.5)',

    // Activity rings (functional, not brand-locked)
    rings: { move: '#BA0C2F', exercise: '#30D158', stand: '#64D2FF' },
  },

  light: {
    // UGA light base using Chapel Bell White
    bg: '#FFFFFF',
    surface: '#F7F7F9',
    elevated: '#FFFFFF',
    border: '#E6E6E6',
    muted: '#EEF0F3',

    // Bulldog Red (primary brand color)
    primary: '#BA0C2F',

    // Functional statuses tuned for contrast on light
    success: '#23B26D',
    warning: '#E3A82B',
    danger: '#E15555',

    // Text on light (Arch Black primary)
    text: {
      primary: '#000000',   // Arch Black
      secondary: '#4B5563',
      muted: '#6B7280',
      inverse:   '#FFFFFF',
    },

    overlay: 'rgba(0,0,0,0.35)',

    // Activity rings
    rings: { move: '#BA0C2F', exercise: '#30D158', stand: '#64D2FF' },
  },
} as const;

export type AppTheme = typeof palette.dark;
