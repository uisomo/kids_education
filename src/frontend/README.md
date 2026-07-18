# Frontend Directory

## 🎨 **Purpose**
React-based frontend components for the Kids Education gamified dashboard system.

## 📁 **Directory Structure**

### `/components/`
**Purpose**: Reusable UI components for the character dashboard
- `CharacterDashboard.tsx` - Main dashboard orchestrator component
- `StatBar.tsx` - Individual stat visualization and interaction
- `ExperienceBar.tsx` - Experience progress and level advancement
- `ItemSlot.tsx` - Individual item display and interaction
- `NotificationPanel.tsx` - User feedback and achievement notifications

### `/hooks/`
**Purpose**: Custom React hooks for shared functionality
- `useCharacterData.ts` - Character data fetching and state management
- `useStatProgression.ts` - Stat calculation and progression logic
- `useItemUnlocks.ts` - Item availability and unlock detection
- `useLocalization.ts` - Multi-language support integration
- `useCSVOperations.ts` - CSV file interaction and persistence

### `/screens/`
**Purpose**: Page-level components and route containers
- `Dashboard.tsx` - Main dashboard screen wrapper
- `CharacterSelection.tsx` - Character creation and selection
- `Settings.tsx` - Application settings and preferences
- `HelpGuide.tsx` - User assistance and tutorial system

### `/utils/`
**Purpose**: Frontend-specific utility functions
- `animation-helpers.ts` - CSS animation and transition utilities
- `responsive-helpers.ts` - Screen size and device detection
- `theme-manager.ts` - Dashboard theme switching logic
- `validation-helpers.ts` - Client-side input validation

## 🎯 **Key Features**

### 🎮 **Interactive Dashboard**
- Real-time stat bar animations with smooth transitions
- Click-to-increase functionality with visual feedback
- Dynamic item collection display with unlock notifications
- Experience bar with level progression celebration effects

### 🌐 **Localization Support**
- Japanese and English language switching
- Cultural adaptation for themes and visual elements
- Context-aware translation with proper grammar handling

### 📱 **Responsive Design**
- Mobile-first approach with touch-friendly interactions
- Adaptive layouts for tablet and desktop environments
- Accessibility features for keyboard navigation and screen readers

### 🎨 **Theme System**
- Multiple visual themes (Fantasy, Anime, Medieval, Space, Magical Academy)
- Dynamic color schemes and animation styles
- User preference persistence across sessions

## 🔧 **Development Guidelines**

### Component Structure
```typescript
// Standard component template
interface ComponentProps {
  // Clear prop definitions with types
}

const ComponentName: React.FC<ComponentProps> = ({ props }) => {
  // State management with typed hooks
  const [state, setState] = useState<StateType>(initialState);

  // Custom hooks for shared logic
  const { data, loading, error } = useCharacterData();

  // Event handlers with useCallback optimization
  const handleEvent = useCallback(() => {
    // Handler implementation
  }, [dependencies]);

  // Render with clear JSX structure
  return <div className="component-wrapper">{/* Content */}</div>;
};
```

### Styling Conventions
- Use CSS modules or styled-components for component isolation
- Follow BEM naming convention for CSS classes
- Implement smooth animations with CSS transitions
- Ensure responsive design with mobile-first approach

### Performance Optimization
- Implement React.memo for expensive components
- Use useCallback and useMemo for optimization
- Lazy load non-critical components
- Optimize re-renders with proper dependency arrays

## 📊 **Performance Targets**
- **Initial Render**: < 200ms for dashboard components
- **Stat Updates**: < 50ms for visual feedback
- **Theme Switching**: < 100ms for complete re-render
- **Memory Usage**: < 50MB for entire frontend application

## 🧪 **Testing Strategy**
- Unit tests for all components using React Testing Library
- Integration tests for user interaction flows
- Visual regression tests for theme consistency
- Performance tests for animation smoothness

## 🔗 **Dependencies**
- React 18+ for component architecture
- TypeScript for type safety
- CSS modules for styling isolation
- React Router for navigation (if multi-page)
- Testing Library for component testing