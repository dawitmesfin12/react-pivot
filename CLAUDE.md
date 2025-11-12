# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Running Examples
- `npm run example` - Run the main demo with live reload (uses PORT env var, defaults to 9966)
- `npm run example-basic` - Run basic example
- `npm run example-persist` - Run persistence example

### Building
- `npm run build` - Build library distribution files (ES and UMD)
- `npm run build:demo` - Build demo site for GitHub Pages

### Deployment
The demo automatically deploys to GitHub Pages via GitHub Actions:
- Workflow: `.github/workflows/deploy-demo.yml`
- Triggers: Push to any branch
- Output: `https://dawitmesfin12.github.io/react-pivot/`
- Each push overwrites the previous deployment (no per-branch previews)
- First-time setup: Enable GitHub Pages in repo Settings → Pages, source: `gh-pages` branch

## Recent Features

### Multi-Column Hierarchical Sorting (v6.1.0)
Implemented hierarchical multi-column sorting with shift-click interaction:

**Key Implementation Details:**
- **State Management**: New `sortStack` state (array of `{title, direction}`)
- **User Interaction**: 
  - Shift+Click = add/remove column from stack
  - Click on column in stack = toggle direction (asc/desc)
  - Click on column not in stack = clear entire stack & add clicked column as single sort (asc)
- **Visual Indicators**: Light blue background on sorted columns
- **Hierarchical Algorithm**: `hierarchicalSort()` and `applyMultiColumnSort()` preserve grouping
- **Stable Sort**: Uses `_key` as final tie-breaker to prevent jitter
- **Backwards Compatibility**: Legacy `sortBy`/`sortDir` props convert to single-item `sortStack`
- **Persistence**: `sortStack` persists via eventBus and localStorage

**Modified Files:**
- `index.jsx`: Core logic, state, `setSort()`, `updateRows()`, hierarchical sorting functions
- `lib/pivot-table.jsx`: Header rendering with badges, shift-click detection
- `style.css`: Badge and multi-sort indicator styles
- `example/demo.jsx`: Demo integration with persistence
- `README.md`: API documentation and usage examples
- `TESTING.md`: Comprehensive test cases

**Testing:** Run `npm run example` and see TESTING.md for detailed test cases

**Bug Fixes (Post v6.1.0):**
- Fixed critical bug where multi-column sorting broke after dimension changes
- Added `cleanSortStack()` helper to validate sortStack against current columns
- Enhanced `setDimensions()` and `setHiddenColumns()` to clean sortStack when columns change
- Improved `applyHierarchicalMultiSort()` with comprehensive edge case handling
- Added defensive null checks throughout hierarchical sorting algorithm
- Updated `componentDidUpdate()` to handle dimension prop changes with sortStack validation

## Project Architecture

### Core Component Structure
The main ReactPivot component (`index.jsx`) orchestrates the entire pivot table functionality:
- Uses DataFrame library for data processing and calculations
- Manages state for dimensions, sorting, filtering, and pagination
- Renders three main sub-components: Dimensions, ColumnControl, and PivotTable

### Key Components
- **ReactPivot** (`index.jsx`) - Main component that handles data processing and state management
- **PivotTable** (`lib/pivot-table.jsx`) - Renders the actual table with pagination and sorting
- **Dimensions** (`lib/dimensions.jsx`) - Handles dimension selection and grouping controls
- **ColumnControl** (`lib/column-control.jsx`) - Manages column visibility

### Data Flow
1. Raw data (`rows`) is processed through DataFrame with `dimensions` and `reduce` function
2. User interactions (sorting, filtering, dimension changes) update state
3. `updateRows()` recalculates the DataFrame based on current state
4. Processed data flows to PivotTable for rendering

### Key Libraries
- **dataframe** - Core data processing and pivot calculations
- **lodash** - Utility functions (uses individual imports for better tree-shaking)
- **wildemitter** - Event bus for component communication
- **create-react-class** - React class component creation (legacy syntax)

### Build System
- Uses **browserify** with **budo** for development server
- **Reactify**, **envify**, and **cssify** transforms
- Standalone builds use **uglify-js** for minification
- Port configuration respects PORT environment variable

### Development Server
The project uses a local jump.sh proxy system. Check `pivot.jump.sh.log` for the current development URL (typically https://pivot.jump.sh).