# PR #225: Update Theme

## Summary

This PR introduces a comprehensive theme system for the Archestra desktop application. The changes implement a modern CSS architecture using CSS custom properties (variables) for both light and dark modes.

## Changes

- **Added `desktop_app/src/ui/index.css`**: New CSS file that establishes the theme foundation for the application
  - Imports Tailwind CSS and tw-animate-css for styling framework
  - Implements CSS custom properties for theme tokens
  - Uses OKLCH color space for improved color manipulation and accessibility
  - Provides complete light and dark mode theme configurations
  - Includes typography, shadows, spacing, and radius design tokens

## Technical Details

### Color System
- Migrated to OKLCH color space (Oklab Lightness Chroma Hue) for:
  - Better perceptual uniformity
  - More predictable color transformations
  - Improved accessibility with consistent lightness values

### Theme Variables
The theme system includes:
- **Colors**: background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring
- **Chart colors**: 5 chart color variations for data visualization
- **Sidebar colors**: Dedicated color set for sidebar components
- **Typography**: Font stacks for sans-serif, serif, and monospace
- **Shadows**: Comprehensive shadow system from 2xs to 2xl
- **Spacing & Radius**: Consistent spacing and border radius tokens

### Dark Mode Support
- Implemented via `.dark` class selector
- All color values are properly adjusted for dark mode
- Maintains consistent contrast ratios for accessibility

This theme system provides a solid foundation for consistent UI design across the application and enables easy theme customization through CSS variables.