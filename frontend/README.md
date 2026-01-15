# Collaborative Revision Status Application

A real-time collaborative document review platform built with Next.js, Socket.IO, and Zustand.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Testing Multi-User Collaboration

### Method 1: Onboarding Modal
Simply enter your Organization ID and User ID in the onboarding modal when you first visit the app.

### Method 2: Cookie-Based Authentication (Console)
For testing multiple users across tabs:

**Tab 1:**
```js
document.cookie = "userId=alice";
document.cookie = "orgId=testOrg";
```
Then refresh the page.

**Tab 2:**
```js
document.cookie = "userId=bob";
document.cookie = "orgId=testOrg";
```
Then refresh the page.

Each tab maintains its own session after the first load. Users with the same `orgId` will share state in real-time, while different organizations have isolated states.

---

## Design Rationale

### Visual Design Philosophy

The application adopts a **terminal/CLI-inspired aesthetic** that creates a distinctive, professional atmosphere while maintaining excellent usability. This design choice was intentional for several reasons:

1. **Technical Context**: A revision status system is inherently a technical tool. The terminal aesthetic reinforces the professional, developer-focused nature of the application.

2. **Focus on Content**: The monochromatic palette keeps attention on the actual content and status information rather than decorative elements.

3. **Modern Retro**: The design balances nostalgic terminal elements with modern UX patterns, creating something both familiar and fresh.

### Color Palette

```
Primary:      #e4e4e7 (zinc-200) - Main accent, text, buttons
Background:   #09090b (zinc-950) - Deep dark base
Card BG:      #1f1f23            - Elevated surfaces
Border:       #27272a (zinc-800) - Subtle boundaries
```

**Why Grey/Monochrome?**
- **High contrast**: Primary text (#fafafa) against background (#09090b) achieves a contrast ratio >15:1, far exceeding WCAG AAA requirements
- **Status clarity**: The neutral base allows status colors (green/amber/red) to stand out distinctly
- **Reduced eye strain**: Dark backgrounds with soft highlights reduce fatigue during extended use
- **Professional tone**: Grey conveys neutrality and objectivity, appropriate for review/approval workflows

**Status Colors:**
- `#22c55e` (green) - Online/Approved - Universal positive indicator
- `#f59e0b` (amber) - Warning/Pending - Attention without alarm
- `#ef4444` (red) - Error/Rejected - Clear negative feedback

### Typography

**Space Grotesk** (Display font)
- Geometric sans-serif with technical character
- Excellent readability at both large and small sizes
- The slight quirkiness adds personality without sacrificing legibility

**JetBrains Mono** (Monospace font)
- Industry-standard developer font
- Clear distinction between similar characters (0/O, 1/l)
- Used for code elements, IDs, and timestamps

**Font Features:**
- `font-feature-settings: "ss01", "ss02"` - Enables stylistic alternates for more distinctive character shapes
- Letter spacing increased on headings (`tracking-[0.2em]`) for that classic terminal feel

### Layout Architecture

**Three-Column Structure:**
```
┌─────────────────────────────────────────┐
│ HEADER (connection status, user info)   │
├──────┬──────────────────────────────────┤
│      │                                  │
│ SIDE │         MAIN CONTENT             │
│ BAR  │    (review panels, editor)       │
│      │                                  │
├──────┴──────────────────────────────────┤
│ COMMAND BAR (status, actions)           │
└─────────────────────────────────────────┘
```

**Why this layout?**
- **Sidebar navigation**: Quick access to different views without losing context
- **Persistent header**: Always-visible connection status is critical for collaborative apps
- **Command bar**: Echoes terminal/IDE patterns; shows keyboard shortcuts and quick actions
- **Responsive**: Sidebar collapses on mobile, content reflows appropriately

### Animation Strategy

Animations are intentional and functional, not decorative:

**Framer Motion Choices:**
1. **Page transitions** (`scale: 0.9 -> 1, opacity: 0 -> 1`): Subtle zoom-fade provides spatial context
2. **Status changes**: Smooth color transitions (300ms) give feedback without jarring jumps
3. **Presence indicators**: Gentle pulse animation for online status reinforces "live" nature
4. **Toast notifications**: Slide-up animation draws attention naturally

**Terminal-Specific Effects:**
- **Cursor blink**: Classic terminal cursor animation on active elements
- **Scanlines**: Optional CRT-style overlay (subtle, can be disabled)
- **Glow effects**: Soft box-shadows create depth without harsh edges

**Performance Considerations:**
- All animations use `transform` and `opacity` (GPU-accelerated)
- `will-change` applied sparingly to hint browser optimization
- Reduced motion media query respected for accessibility

### Accessibility Considerations

1. **Color Contrast**: All text meets WCAG AAA standards (>7:1 ratio minimum)
2. **Focus States**: Visible focus rings on all interactive elements
3. **Keyboard Navigation**: Full tab navigation through all controls
4. **Screen Reader Support**: Semantic HTML, ARIA labels where needed
5. **Reduced Motion**: `prefers-reduced-motion` respected for users who need it

### Component Design Patterns

**Cards (ASCII-bordered):**
- The `+` corner markers create visual hierarchy without heavy shadows
- Reinforces the terminal aesthetic while maintaining clear boundaries

**Buttons:**
- High-contrast primary buttons (light on dark)
- Outline variants for secondary actions
- Uppercase text with letter-spacing for terminal feel

**Inputs:**
- Dark backgrounds to match theme
- Clear focus states with glow effect
- Placeholder text provides guidance without clutter

**Status Badges:**
- Color-coded with clear labels
- Uppercase for emphasis
- Monospace font for consistency

### Usability Enhancements

1. **Real-time Feedback**: Toast notifications for all state changes
2. **Presence Awareness**: See who's online before making changes
3. **History Tracking**: Full audit trail of who changed what and when
4. **Keyboard Shortcuts**: Power-user efficiency (documented in command bar)
5. **Error Recovery**: Graceful handling of connection drops with auto-reconnect

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Real-time**: Socket.IO
- **State**: Zustand with persist middleware
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **UI Components**: Custom components with shadcn/ui patterns

## Project Structure

```
src/
├── app/                  # Next.js app router pages
│   └── review/          # Review page and components
├── components/
│   ├── layout/          # Header, Sidebar, CommandBar
│   └── ui/              # Reusable UI components
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and socket manager
└── stores/              # Zustand state stores
```
