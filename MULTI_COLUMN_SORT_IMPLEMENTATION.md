# Multi-Column Hierarchical Sorting Implementation

## Table of Contents
1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Architecture](#architecture)
4. [Implementation Details](#implementation-details)
5. [Bug Fixes and Edge Cases](#bug-fixes-and-edge-cases)
6. [Usage Examples](#usage-examples)
7. [Testing Scenarios](#testing-scenarios)

---

## Overview

Multi-column hierarchical sorting allows users to sort pivot table data by multiple columns simultaneously while preserving the hierarchical (grouped) structure of the data. Unlike flat table sorting, this implementation ensures that:

1. **Hierarchy is preserved**: Parent-child relationships remain intact
2. **Sort applies at every level**: The same sort criteria apply to siblings at each hierarchy level
3. **Interactive control**: Users can build a sort stack using Shift+Click interactions

### Why This Feature?

In pivot tables with multiple dimensions (e.g., State → First Name → Transaction Type), users often need to sort by multiple criteria:
- Primary sort: by State (alphabetically)
- Secondary sort: by Amount (descending)
- Tertiary sort: by Count (descending)

This allows finding patterns like "Which states have the highest transaction amounts, and within each state, which customers contribute most?"

---

## Core Concepts

### 1. Hierarchical Data Structure

The DataFrame library produces rows with hierarchy metadata:

```javascript
{
  _key: "Stateÿ NYÿ First Nameÿ John",  // Unique identifier
  _level: 1,                             // 0=root, 1=first child level, etc.
  State: "NY",                           // Dimension values
  "First Name": "John",
  amountTotal: 15234.50,                 // Calculated values
  count: 42
}
```

**Key Properties:**
- `_key`: Encodes the full path from root using `ÿ` (U+00FF) as delimiter
- `_level`: Indicates depth in hierarchy (0 = root rows like States)
- Dimension values are only present at their level and below

### 2. Sort Stack

The sort stack is an ordered array defining multi-column sort priority:

```javascript
sortStack: [
  { title: 'State', direction: 'asc' },       // Sort 1st by State ascending
  { title: 'First Name', direction: 'asc' },  // Then by First Name ascending
  { title: 'Transaction Type', direction: 'desc' }  // Then by Transaction Type descending
]
```

**Why an array?** Order matters! The first item has highest priority, second breaks ties, etc.

**Important Restriction**: Only **dimension columns** can be in the sortStack. Calculation columns (like Amount, Count) cannot be added to multi-column sort because:
- Calculations are aggregate values that exist at all hierarchy levels
- Dimensions define the hierarchical structure and only exist at specific levels
- Multi-column hierarchical sorting is semantically about sorting tree branches by dimension criteria
- Calculations can still be used as the primary sort (via regular click), handled by DataFrame.calculate()

### 3. Sibling-Only Sorting

**Critical Concept**: We only sort siblings (rows with the same parent), never across different branches.

Example hierarchy:
```
NY (State)
  ├─ Alice (First Name)
  └─ Bob (First Name)
CA (State)
  ├─ Charlie (First Name)
  └─ Diana (First Name)
```

When sorting by Amount:
- NY and CA are sorted relative to each other (both at level 0)
- Alice and Bob are sorted within NY (both children of NY)
- Charlie and Diana are sorted within CA (both children of CA)
- But Alice is NEVER compared to Charlie (different parents)

This preserves the hierarchical grouping structure.

---

## Architecture

### Component Flow

```
User Interaction (Shift+Click header)
         ↓
    setSort() - Update sortStack state
         ↓
    updateRows() - Trigger recalculation
         ↓
    DataFrame.calculate() - Get hierarchical data (single-column sorted)
         ↓
    applyHierarchicalMultiSort() - Apply multi-column sort to siblings
         ↓
    Render sorted table
```

### State Management

```javascript
state: {
  sortStack: [                    // Multi-column sort configuration
    { title: string, direction: 'asc'|'desc' }
  ],
  sortBy: string,                 // Legacy: first sort column
  sortDir: 'asc'|'desc',          // Legacy: first sort direction
  dimensions: [string],           // Active grouping dimensions
  hiddenColumns: [string],        // Hidden calculation columns
  rows: [object]                  // Processed and sorted data
}
```

**Why maintain both `sortStack` and `sortBy/sortDir`?**
- Backwards compatibility with existing code
- `sortBy/sortDir` are derived from `sortStack[0]`
- Legacy event listeners still work

---

## Implementation Details

### 1. User Interaction Handler: `setSort()`

**Location**: `index.jsx`, lines 320-378

**Purpose**: Handle column header clicks and build the sort stack.

**Logic**:

```javascript
setSort: function(cTitle, shiftKey) {
  var sortStack = this.state.sortStack.slice()  // Clone to avoid mutation
  
  if (shiftKey) {
    // SHIFT+CLICK: Toggle column in/out of stack
    // Only allow dimension columns in multi-column sort
    var columns = this.getColumns()
    var clickedCol = _.find(columns, function(col) {
      return col.title === cTitle
    })
    
    // Ignore shift+click on calculation columns
    if (!clickedCol || clickedCol.type !== 'dimension') {
      return  // Silent ignore
    }
    
    var existingIndex = findInStack(sortStack, cTitle)
    
    if (existingIndex >= 0) {
      sortStack.splice(existingIndex, 1)  // Remove if present
    } else {
      sortStack.push({ title: cTitle, direction: 'asc' })  // Add with default asc
    }
  } else {
    // REGULAR CLICK
    var existingIndex = findInStack(sortStack, cTitle)
    
    if (existingIndex >= 0) {
      // Column in stack: toggle its direction
      sortStack[existingIndex].direction = 
        sortStack[existingIndex].direction === 'asc' ? 'desc' : 'asc'
    } else {
      // Column not in stack: clear stack and start fresh
      sortStack = [{ title: cTitle, direction: 'asc' }]
    }
  }
  
  // Update state and emit events
  this.setState({ sortStack: sortStack }, this.updateRows)
}
```

**Why this interaction pattern?**
- **Shift+Click to add**: Intuitive for multi-selection (like file selection)
- **Only dimensions allowed**: Calculations are aggregates, not hierarchical structure
- **Silent ignore on calculations**: No error message, just no effect (clean UX)
- **Click to toggle direction**: Standard sorting UX (click header repeatedly)
- **Click outside stack clears**: Prevents confusion, gives users a "reset" action
- **Regular click works on any column**: Both dimensions and calculations can be primary sort

### 2. Sort Stack Validation: `cleanSortStack()`

**Location**: `index.jsx`, lines 211-228

**Purpose**: Ensure sortStack only references columns that currently exist.

**Why needed?**
When dimensions change (e.g., user removes "State" dimension), columns disappear. If sortStack still references "State", sorting breaks with undefined column errors.

**Implementation**:

```javascript
cleanSortStack: function(sortStack, columns) {
  if (!sortStack || sortStack.length === 0) return []
  if (!columns || columns.length === 0) return []
  
  // Filter: keep only dimension columns that exist
  // Multi-column sort only makes sense for dimensions (hierarchical structure)
  // Calculations are aggregates available at all levels
  var validSortStack = sortStack.filter(function(sortItem) {
    var col = _.find(columns, function(col) {
      return col.title === sortItem.title
    })
    return col && col.type === 'dimension'
  })
  
  // Empty sortStack is valid - means single-column sort via DataFrame
  return validSortStack
}
```

**Edge cases handled**:
1. Empty sortStack → return empty array (single-column sort via DataFrame)
2. Empty columns → return empty array (nothing to sort)
3. Calculation columns in stack → filtered out (only dimensions allowed)
4. Non-existent columns → filtered out
5. Some sorts invalid → keep valid dimension sorts only

**Why no fallback to first column?**
Empty sortStack is valid and means single-column sort handled by DataFrame.calculate(). This allows calculation columns to be used as primary sort.

### 3. Dimension Change Handler: `setDimensions()`

**Location**: `index.jsx`, lines 276-296

**Purpose**: Update active dimensions and validate sortStack.

**The Bug This Fixes**:
Original code:
```javascript
setDimensions: function (updatedDimensions) {
  this.setState({dimensions: updatedDimensions})
  setTimeout(this.updateRows, 0)
}
```

**Problem**: If sortStack contains `[{title: 'State', ...}]` and user removes State dimension, `getColumns()` no longer includes State, but sortStack still references it → crash or incorrect sorting.

**Fixed Implementation**:

```javascript
setDimensions: function (updatedDimensions) {
  var self = this
  this.props.eventBus.emit('activeDimensions', updatedDimensions)
  
  // Update dimensions first (affects getColumns() output)
  this.setState({dimensions: updatedDimensions}, function() {
    var columns = self.getColumns()  // Get NEW column list
    var cleanedSortStack = self.cleanSortStack(self.state.sortStack, columns)
    
    // If sortStack changed, update it
    if (JSON.stringify(cleanedSortStack) !== JSON.stringify(self.state.sortStack)) {
      self.setState({ sortStack: cleanedSortStack })
      self.props.eventBus.emit('sortStack', cleanedSortStack)
      if (self.props.onSortStackChange) {
        self.props.onSortStackChange(cleanedSortStack)
      }
    }
    
    setTimeout(self.updateRows, 0)
  })
}
```

**Why the callback?**
`setState` is asynchronous. We need to wait for `dimensions` state to update before calling `getColumns()`, otherwise we'd validate against the OLD column list.

**Why JSON.stringify comparison?**
Deep equality check for arrays of objects. Avoids unnecessary state updates and event emissions.

### 4. Column Hiding Handler: `setHiddenColumns()`

**Location**: `index.jsx`, lines 298-318

**Purpose**: Hide calculation columns and validate sortStack.

**Similar Logic to setDimensions**:
When a column is hidden, it's removed from the columns array. If sortStack references it, we need to clean it out.

**Why this matters**:
User might:
1. Sort by [State, Amount, Count]
2. Hide Amount column
3. Expected result: Sort by [State, Count] only

Without validation, the hidden Amount would still be in sortStack, causing confusion or errors.

### 5. Data Update Handler: `updateRows()`

**Location**: `index.jsx`, lines 230-274

**Purpose**: Recalculate data and apply sorting.

**Enhanced Implementation**:

```javascript
updateRows: function () {
  var columns = this.getColumns()
  var sortStack = this.state.sortStack || []
  
  // VALIDATION: Clean sortStack against current columns
  var validatedSortStack = this.cleanSortStack(sortStack, columns)
  if (validatedSortStack.length !== sortStack.length) {
    sortStack = validatedSortStack
    this.setState({ sortStack: sortStack })  // Update if cleaned
  }
  
  // Get first sort for DataFrame (backwards compat)
  var sortByTitle = sortStack.length > 0 ? sortStack[0].title : this.state.sortBy
  var sortCol = _.find(columns, function(col) {
    return col.title === sortByTitle
  }) || {}
  var sortBy = sortCol.sortBy || (sortCol.type === 'dimension' ? sortCol.title : sortCol.value)
  var sortDir = sortStack.length > 0 ? sortStack[0].direction : this.state.sortDir
  
  // Calculate with DataFrame (single-column sort)
  var rows = this.dataFrame.calculate({
    dimensions: this.state.dimensions,
    sortBy: sortBy,
    sortDir: sortDir,
    compact: this.props.compact,
    filter: this.state.filtersPaused ? null : createSoloFilter(this.state.solo, this.state.dimensions)
  })
  
  // Apply multi-column sort if needed
  if (sortStack.length > 1) {
    rows = this.applyHierarchicalMultiSort(rows, sortStack, columns)
  }
  
  this.setState({rows: rows})
}
```

**Why validate here too?**
Defense in depth. Even if setDimensions/setHiddenColumns missed something, this catches it before sorting.

**Why only apply hierarchical sort when `sortStack.length > 1`?**
Single-column sort is already handled by DataFrame.calculate(). No need for the expensive hierarchical algorithm.

### 6. Hierarchical Multi-Sort Algorithm: `applyHierarchicalMultiSort()`

**Location**: `index.jsx`, lines 380-589

**Purpose**: Sort siblings at each hierarchy level by multiple columns.

This is the most complex part. Let's break it down step by step.

#### Step 1: Input Validation

```javascript
applyHierarchicalMultiSort: function(rows, sortStack, columns) {
  // Edge case: empty inputs
  if (!rows || rows.length === 0) return rows ? rows.slice() : []
  if (!sortStack || sortStack.length === 0) return rows.slice()
  if (!columns || columns.length === 0) return rows.slice()
  if (!this.state.dimensions) return rows.slice()
  
  var self = this
  // ... continue
}
```

**Why return `rows.slice()`?**
Always return a new array (not mutate input). If we can't sort, return original order.

**Why check `this.state.dimensions`?**
The algorithm needs dimension information to determine row levels. Without it, we can't proceed.

#### Step 2: Helper Function - `getSortValue()`

```javascript
function getSortValue(row, columnTitle) {
  var col = _.find(columns, function(c) { return c.title === columnTitle })
  if (!col) return null  // Column doesn't exist
  
  var value
  if (col.type === 'dimension') {
    // Dimensions are only available at their level
    var dimensionIndex = -1
    for (var i = 0; i < self.state.dimensions.length; i++) {
      if (self.state.dimensions[i] === columnTitle) {
        dimensionIndex = i
        break
      }
    }
    // Only use dimension value if row is at or below that dimension's level
    value = (dimensionIndex >= 0 && dimensionIndex <= row._level) ? row[col.title] : null
  } else {
    // Calculations are always available
    value = getValue(col, row)
  }
  
  // Normalize for comparison
  if (value == null) return null
  if (!isNaN(parseFloat(value)) && isFinite(value)) return +value
  if (typeof value === 'string') return value.toLowerCase()
  return value
}
```

**Why check dimension level?**

Consider this hierarchy:
```
Row 1: { _level: 0, State: "NY", amountTotal: 5000 }
Row 2: { _level: 1, State: "NY", "First Name": "Alice", amountTotal: 3000 }
```

If we're at State level (level 0), "First Name" doesn't exist yet. Trying to sort by it would give undefined. We return `null` to sort it to the end.

**Why normalize values?**
- Numbers: Convert to actual numbers for numeric comparison
- Strings: Lowercase for case-insensitive sorting
- Null: Consistent handling (sorts to end)

#### Step 3: Helper Function - `extractDimensionPairs()`

```javascript
function extractDimensionPairs(key) {
  if (!key || typeof key !== 'string') return {}
  var normalized = key.replace(/ÿ+$/, '')  // Remove trailing delimiters
  var segments = normalized.split('ÿ').filter(function(s) { return s.length > 0 })
  var pairs = {}
  for (var i = 0; i < segments.length; i += 2) {
    if (i + 1 < segments.length) {
      pairs[segments[i]] = segments[i + 1]
    }
  }
  return pairs
}
```

**What does this do?**

Parse the `_key` to extract dimension-value pairs:

```
Input:  "Stateÿ NYÿ First Nameÿ Alice"
Output: { "State": "NY", "First Name": "Alice" }
```

**Why needed?**
To determine parent-child relationships. A parent's key is a subset of its children's keys.

#### Step 4: Helper Function - `candidateMatchesAsParent()`

```javascript
function candidateMatchesAsParent(candidate, row) {
  if (!candidate || !row) return false
  if (typeof candidate._level === 'undefined' || typeof row._level === 'undefined') return false
  if (candidate._level !== row._level - 1) return false  // Must be one level up
  
  var candidatePairs = extractDimensionPairs(candidate._key)
  var rowPairs = extractDimensionPairs(row._key)
  
  if (Object.keys(candidatePairs).length >= Object.keys(rowPairs).length) return false
  
  // All candidate dimensions must match in row
  for (var dim in candidatePairs) {
    if (rowPairs[dim] !== candidatePairs[dim]) return false
  }
  return true
}
```

**What does this check?**

Example:
```javascript
candidate: { _level: 0, _key: "Stateÿ NY" }
row:       { _level: 1, _key: "Stateÿ NYÿ First Nameÿ Alice" }

candidatePairs: { "State": "NY" }
rowPairs:       { "State": "NY", "First Name": "Alice" }

Check: candidate._level (0) === row._level - 1 (0) ✓
Check: "NY" === "NY" ✓
Result: candidate IS parent of row
```

**Why this matters?**
We need to group siblings (rows with same parent) to sort them together.

#### Step 5: Build Parent-Child Map

```javascript
var childrenByParent = {}
var rootRows = []

rows.forEach(function(row) {
  if (!row || typeof row._level === 'undefined' || !row._key) return
  if (row._level === 0) {
    rootRows.push(row)
    childrenByParent[row._key] = []
  }
})

if (rootRows.length === 0) {
  console.warn('No root rows found in hierarchical sort. Returning original order.')
  return rows.slice()
}
```

**Purpose**: Identify all root-level rows (e.g., all States).

**Why check for root rows?**
If there are no level-0 rows, the hierarchy is malformed. Can't proceed safely.

#### Step 6: Find Parents for Non-Root Rows

```javascript
var parentMissing = false
rows.forEach(function(row) {
  if (!row || typeof row._level === 'undefined') return
  if (row._level === 0 || parentMissing) return
  
  var bestMatch = null
  var bestMatchDimensionCount = -1
  var targetLevel = row._level - 1
  
  for (var i = 0; i < rows.length; i++) {
    var candidate = rows[i]
    if (!candidate) continue
    if (candidate._level !== targetLevel) continue
    
    if (candidateMatchesAsParent(candidate, row)) {
      var dimensionCount = Object.keys(extractDimensionPairs(candidate._key)).length
      if (dimensionCount > bestMatchDimensionCount) {
        bestMatch = candidate
        bestMatchDimensionCount = dimensionCount
      }
    }
  }
  
  if (bestMatch) {
    var parentKey = bestMatch._key
    if (!childrenByParent[parentKey]) {
      childrenByParent[parentKey] = []
    }
    childrenByParent[parentKey].push(row)
  } else {
    parentMissing = true
  }
})

if (parentMissing) {
  console.warn('Could not find parents for some rows. Skipping multi-column sort.')
  return rows.slice()
}
```

**What's happening?**

For each non-root row, find its parent by:
1. Looking at rows one level up (`row._level - 1`)
2. Checking if they match as parent (dimension values align)
3. Choosing the "best" match (most specific)

**Why "best match"?**
In complex hierarchies, multiple candidates might match. We want the most specific parent.

**Why bail if parent missing?**
If we can't build the complete hierarchy, sorting would be incorrect. Better to return original order.

#### Step 7: Build Reverse Mapping

```javascript
var parentKeyByRowKey = {}
for (var parentKey in childrenByParent) {
  if (!childrenByParent[parentKey]) continue
  childrenByParent[parentKey].forEach(function(child) {
    if (child && child._key) {
      parentKeyByRowKey[child._key] = parentKey
    }
  })
}
rootRows.forEach(function(row) {
  if (row && row._key) {
    parentKeyByRowKey[row._key] = null  // Root rows have no parent
  }
})
```

**Purpose**: Quick lookup to check if two rows are siblings.

```javascript
// Later used in compareRows:
if (parentKeyByRowKey[a._key] !== parentKeyByRowKey[b._key]) {
  return 0  // Not siblings, don't compare
}
```

#### Step 8: Compare Function

```javascript
function compareRows(a, b) {
  if (!a || !b) return 0
  if (typeof a._level === 'undefined' || typeof b._level === 'undefined') return 0
  if (!a._key || !b._key) return 0
  
  // Only compare siblings (same level, same parent)
  if (a._level !== b._level || parentKeyByRowKey[a._key] !== parentKeyByRowKey[b._key]) {
    return 0
  }
  
  // Apply sort stack in order
  for (var i = 0; i < sortStack.length; i++) {
    var sortItem = sortStack[i]
    if (!sortItem || !sortItem.title) continue
    
    var aVal = getSortValue(a, sortItem.title)
    var bVal = getSortValue(b, sortItem.title)
    
    if (aVal === null && bVal === null) continue  // Both null, try next sort
    if (aVal === null) return 1   // Nulls sort to end
    if (bVal === null) return -1
    
    var comparison = (aVal < bVal) ? -1 : (aVal > bVal) ? 1 : 0
    if (comparison !== 0) {
      return sortItem.direction === 'desc' ? -comparison : comparison
    }
  }
  
  // Stable sort tie-breaker
  return (a._key < b._key) ? -1 : (a._key > b._key) ? 1 : 0
}
```

**Key Points**:

1. **Sibling check**: Return 0 if not siblings (don't reorder)
2. **Multi-column logic**: Loop through sortStack, first difference wins
3. **Null handling**: Nulls always sort to end
4. **Direction**: Flip comparison for descending
5. **Stable sort**: Use `_key` as final tie-breaker (prevents jitter)

#### Step 9: Recursive Result Building

```javascript
var result = []
var addedRows = {}

function addSortedRow(row) {
  if (!row || !row._key) return
  if (addedRows[row._key]) return  // Already added
  
  result.push(row)
  addedRows[row._key] = true
  
  var children = childrenByParent[row._key] || []
  if (children.length > 0) {
    try {
      children.sort(compareRows)  // Sort siblings
      children.forEach(addSortedRow)  // Recursively add
    } catch (err) {
      console.warn('Error sorting children:', err)
    }
  }
}

try {
  rootRows.sort(compareRows)  // Sort root level
  rootRows.forEach(addSortedRow)  // Build result recursively
} catch (err) {
  console.warn('Error in hierarchical sort:', err)
  return rows.slice()
}

// Safety check
if (result.length !== rows.length) {
  console.warn('Hierarchical sort lost rows. Expected:', rows.length, 'Got:', result.length)
  return rows.slice()
}

return result
```

**The Algorithm**:

1. Sort root rows by multi-column criteria
2. For each root row:
   - Add it to result
   - Get its children
   - Sort children by same multi-column criteria
   - Recursively add each child (which adds their children, etc.)

**Result**: Hierarchical structure preserved, but siblings at each level are sorted.

**Why try-catch?**
If compareRows throws (malformed data), we catch it and return original order rather than crashing.

**Why check result length?**
Sanity check that we didn't lose or duplicate rows.

### 7. Component Lifecycle: `componentDidUpdate()`

**Location**: `index.jsx`, lines 92-136

**Purpose**: Handle prop changes from parent component.

**Added Handler**:

```javascript
// Handle dimension prop changes - need to validate sortStack
if (this.props.dimensions !== prevProps.dimensions) {
  var self = this
  this.dataFrame = DataFrame({
    rows: this.props.rows,
    dimensions: this.props.dimensions,
    reduce: this.props.reduce
  })
  
  // Validate sortStack against new dimensions
  var columns = this.getColumns()
  var cleanedSortStack = this.cleanSortStack(this.state.sortStack, columns)
  
  if (JSON.stringify(cleanedSortStack) !== JSON.stringify(this.state.sortStack)) {
    this.setState({ sortStack: cleanedSortStack }, function() {
      self.updateRows()
    })
  } else {
    this.updateRows()
  }
}
```

**Why needed?**
If parent component changes `dimensions` prop (controlled component pattern), we need to:
1. Rebuild DataFrame with new dimensions
2. Validate sortStack against new column set
3. Update state if sortStack changed
4. Recalculate rows

---

## Bug Fixes and Edge Cases

### Bug #1: Sorting Breaks After Dimension Change

**Symptom**: User sets multi-column sort, then changes dimensions → table shows incorrect order or crashes.

**Root Cause**: sortStack references columns that no longer exist after dimension change.

**Fix**: Validate sortStack in `setDimensions()`, `setHiddenColumns()`, `componentDidUpdate()`, and `updateRows()`.

### Bug #2: Null/Undefined Crashes

**Symptom**: Occasional crashes with "Cannot read property '_key' of undefined".

**Root Cause**: Insufficient null checks in hierarchical sort algorithm.

**Fix**: Added defensive checks throughout:
- Check row existence before accessing properties
- Check _level and _key before using them
- Check column existence before getting sort values
- Validate all inputs at function entry

### Bug #3: Parent-Child Mapping Fails

**Symptom**: Console error "Could not find parents for some rows", sorting skipped.

**Root Cause**: Malformed data or edge case in parent matching logic.

**Fix**: 
- Enhanced `candidateMatchesAsParent()` with null checks
- Added early return if no root rows found
- Graceful fallback to original order instead of crashing

### Bug #4: Sort Jitter

**Symptom**: Rows with identical sort values randomly reorder on each sort.

**Root Cause**: Unstable sort (no tie-breaker).

**Fix**: Use `_key` as final tie-breaker in `compareRows()`:
```javascript
return (a._key < b._key) ? -1 : (a._key > b._key) ? 1 : 0
```

### Edge Case #1: Empty Data

**Scenario**: No rows to sort.

**Handling**: Return empty array immediately.

### Edge Case #2: Single Column

**Scenario**: sortStack has only one item.

**Handling**: Skip hierarchical sort, use DataFrame's built-in sort (more efficient).

### Edge Case #3: All Sorts Invalid

**Scenario**: sortStack = `[{title: 'NonExistent', direction: 'asc'}]`

**Handling**: `cleanSortStack()` returns `[{title: firstColumn, direction: 'asc'}]`.

### Edge Case #4: Hidden Column in Sort

**Scenario**: User sorts by Amount, then hides Amount column.

**Handling**: `setHiddenColumns()` validates and removes Amount from sortStack.

---

## Usage Examples

### Example 1: Basic Multi-Column Sort

```javascript
<ReactPivot
  rows={data}
  dimensions={dimensions}
  calculations={calculations}
  reduce={reduce}
  sortStack={[
    { title: 'State', direction: 'asc' },
    { title: 'First Name', direction: 'asc' }
  ]}
/>
```

Result: States sorted A-Z, within each state, first names sorted A-Z.

**Note**: Only dimension columns can be in sortStack. To sort by calculations (like Amount), use the primary sort:

```javascript
<ReactPivot
  rows={data}
  dimensions={dimensions}
  calculations={calculations}
  reduce={reduce}
  sortBy="Amount"
  sortDir="desc"
/>
```

### Example 2: Interactive Sorting

User actions:
1. Click "State" header → Sort by State ascending
2. Shift+Click "First Name" header → Add First Name ascending to stack
3. Click "First Name" header → Toggle First Name to descending
4. Click "State" header → Toggle State to descending
5. Shift+Click "Amount" header → **No effect** (calculations can't be added to stack)

Final sortStack:
```javascript
[
  { title: 'State', direction: 'desc' },
  { title: 'First Name', direction: 'desc' }
]
```

### Example 3: Controlled Component

```javascript
function MyComponent() {
  const [sortStack, setSortStack] = useState([
    { title: 'State', direction: 'asc' }
  ])
  
  return (
    <ReactPivot
      rows={data}
      dimensions={dimensions}
      calculations={calculations}
      reduce={reduce}
      sortStack={sortStack}
      onSortStackChange={setSortStack}
    />
  )
}
```

Parent component controls sort state, receives updates via callback.

### Example 4: Persistence

```javascript
// Save to localStorage
eventBus.on('sortStack', function(sortStack) {
  localStorage.setItem('sortStack', JSON.stringify(sortStack))
})

// Load from localStorage
const persistedSortStack = JSON.parse(localStorage.getItem('sortStack') || '[]')

<ReactPivot
  sortStack={persistedSortStack}
  eventBus={eventBus}
  // ... other props
/>
```

---

## Testing Scenarios

### Test 1: Basic Multi-Column Sort

**Setup**: 
- Dimensions: [State, First Name]
- Calculations: [Count, Amount]
- Data: 50 rows across 5 states

**Steps**:
1. Click "State" → Verify states sorted A-Z
2. Shift+Click "Amount" → Verify states still A-Z, amounts within each state sorted ascending
3. Click "Amount" → Verify amounts now descending within each state

**Expected**: Hierarchy preserved, sorts apply at each level.

### Test 2: Dimension Change with Active Sort

**Setup**:
- Active sort: [State asc, First Name asc]
- Dimensions: [State, First Name, Transaction Type]

**Steps**:
1. Remove "State" dimension
2. Verify sortStack cleaned to [First Name asc]
3. Verify table still renders correctly

**Expected**: No crashes, sort adapts to new columns.

### Test 3: Shift+Click on Calculation Column

**Setup**:
- Active sort: [State asc]
- Dimensions: [State, First Name]
- Calculations: [Amount, Count]

**Steps**:
1. Shift+Click "Amount" column header
2. Verify sortStack unchanged [State asc]
3. Verify no error messages or visual feedback

**Expected**: Calculation columns silently ignored in multi-column sort.

### Test 4: Regular Click on Calculation Column

**Setup**:
- Active sort: [State asc, First Name asc]
- Calculations: [Amount, Count]

**Steps**:
1. Regular click "Amount" column header
2. Verify sortStack cleared to []
3. Verify primary sort set to Amount ascending
4. Verify table sorts by Amount globally

**Expected**: Calculation columns work as primary sort, clearing multi-column stack.

### Test 5: Persisted SortStack with Calculations

**Setup**:
- Persisted sortStack from old version: [State asc, Amount desc, First Name asc]
- Load component

**Steps**:
1. Component initializes
2. Verify sortStack cleaned to [State asc, First Name asc]
3. Verify Amount removed (calculation column)

**Expected**: Automatic cleanup of invalid persisted data.

### Test 6: Edge Case - Single Row

**Setup**:
- Active sort: [State asc, Amount desc]
- Data: [single row]

**Steps**:
1. Render component
2. Change sort
3. Verify single row always displays

**Expected**: No errors, single row unaffected by sort.

### Test 7: Persistence Across Sessions

**Setup**:
- Active sort: [State desc, Amount desc, Count asc]
- localStorage enabled

**Steps**:
1. Set sort as above
2. Refresh page
3. Verify sort restored

**Expected**: Sort persists via localStorage.

### Test 8: Sort Stability

**Setup**:
- Data with many identical values
- Active sort: [Amount desc]

**Steps**:
1. Sort by Amount
2. Note row order
3. Click another column, then back to Amount
4. Verify row order identical to step 2

**Expected**: Stable sort, no jitter.

---

## Performance Considerations

### Complexity Analysis

**Time Complexity**: O(n log n) per level
- Building parent-child map: O(n²) worst case, O(n) average
- Sorting each level: O(n log n)
- Total: O(n² + n log n) = O(n²) worst case

**Space Complexity**: O(n)
- Parent-child map: O(n)
- Result array: O(n)
- Recursion depth: O(depth) = O(log n) average

### Optimization Opportunities

1. **Cache parent-child map**: Rebuild only when dimensions change
2. **Memoize getSortValue**: Cache computed values per row
3. **Skip sort if unchanged**: Compare sortStack before/after
4. **Web Worker**: Offload sorting to background thread for large datasets

### When to Worry

- **< 1000 rows**: No performance issues
- **1000-10000 rows**: Noticeable delay (100-500ms)
- **> 10000 rows**: Consider pagination or virtualization

---

## Backwards Compatibility

### Legacy Props Still Work

```javascript
<ReactPivot
  sortBy="State"      // Still works
  sortDir="desc"      // Still works
  // Converted to: sortStack={[{title: 'State', direction: 'desc'}]}
/>
```

### Legacy Events Still Emit

```javascript
eventBus.on('sortBy', function(columnTitle) {
  // Still fires when sortStack[0] changes
})

eventBus.on('sortDir', function(direction) {
  // Still fires when sortStack[0].direction changes
})
```

### Migration Path

Old code:
```javascript
<ReactPivot sortBy="State" sortDir="asc" />
```

New code (equivalent):
```javascript
<ReactPivot sortStack={[{title: 'State', direction: 'asc'}]} />
```

Multi-column (new capability):
```javascript
<ReactPivot 
  sortStack={[
    {title: 'State', direction: 'asc'},
    {title: 'Amount', direction: 'desc'}
  ]} 
/>
```

---

## Future Enhancements

### Potential Improvements

1. **Visual sort indicators**: Show sort position (1, 2, 3) next to column headers
2. **Drag-to-reorder**: Drag column headers to change sort priority
3. **Sort presets**: Save/load named sort configurations
4. **Custom comparators**: Allow per-column custom sort functions
5. **Performance mode**: Simplified sort for very large datasets
6. **Async sorting**: Use Web Workers for non-blocking sort

### API Extensions

```javascript
<ReactPivot
  sortStack={sortStack}
  sortMode="hierarchical" | "flat"  // Toggle between modes
  sortComparators={{                 // Custom sort functions
    Amount: (a, b) => customCompare(a, b)
  }}
  maxSortColumns={5}                 // Limit sort stack size
/>
```

---

## Conclusion

The multi-column hierarchical sorting implementation provides:

✅ **Intuitive UX**: Shift+Click to build sort stack
✅ **Robust**: Handles dimension changes, column hiding, edge cases
✅ **Performant**: Efficient algorithm, skips unnecessary work
✅ **Backwards Compatible**: Legacy props and events still work
✅ **Maintainable**: Clear separation of concerns, defensive coding

The key insight is **sibling-only sorting**: we never compare rows from different branches of the hierarchy, preserving the grouped structure while allowing flexible multi-column sorting at each level.

