import filter from 'lodash/filter'
import map from 'lodash/map'
import find from 'lodash/find'
import React from 'react'
import createReactClass from 'create-react-class'
import DataFrame from 'dataframe'
import Emitter from 'wildemitter'

import partial from './lib/partial'
import download from './lib/download'
import getValue from './lib/get-value'
import PivotTable from './lib/pivot-table.jsx'
import Dimensions from './lib/dimensions.jsx'
import ColumnControl from './lib/column-control.jsx'
import SoloControl from './lib/solo-control.jsx'
import {
  serializeSoloValue,
  createSoloFilter,
  soloEntries
} from './lib/solo-utils.js'

const _ = { filter, map, find }

export default createReactClass({
  displayName: 'ReactPivot',
  getDefaultProps: function() {
    return {
      rows: [],
      dimensions: [],
      activeDimensions: [],
      reduce: function() {},
      tableClassName: '',
      csvDownloadFileName: 'table.csv',
      csvTemplateFormat: false,
      defaultStyles: true,
      nPaginateRows: 25,
      solo: {},
      hiddenColumns: [],
      hideRows: null,
      sortBy: null,
      sortDir: 'asc',
      sortStack: [],
      onSortStackChange: function() {},
      eventBus: new Emitter,
      compact: false,
      excludeSummaryFromExport: false,
      onData: function () {},
      soloText: "solo",
      unsoloText: "unsolo",
      subDimensionText: "Sub Dimension..."
    }
  },

  getInitialState: function() {
    var self = this
    var allDimensions = this.props.dimensions
    var activeDimensions =  _.filter(this.props.activeDimensions, function (title) {
      return _.find(allDimensions, function(col) {
        return col.title === title
      })
    })

    // Initialize sortStack from prop or convert legacy sortBy/sortDir
    var sortStack = this.props.sortStack.length > 0 ? this.props.sortStack :
                    (this.props.sortBy ? [{title: this.props.sortBy, direction: this.props.sortDir}] : [])

    // Clean sortStack to remove any calculation columns (e.g., from persisted state)
    // Only dimension columns are allowed in multi-column sort
    if (sortStack.length > 0) {
      sortStack = sortStack.filter(function(sortItem) {
        var dimension = _.find(allDimensions, function(dim) {
          return dim.title === sortItem.title
        })
        return dimension !== undefined
      })
    }

    return {
      dimensions: activeDimensions,
      calculations: {},
      sortBy: this.props.sortBy,
      sortDir: this.props.sortDir,
      sortStack: sortStack,
      hiddenColumns: this.props.hiddenColumns,
      solo: this.props.solo,
      filtersPaused: false,
      hideRows: this.props.hideRows,
      rows: []
    }
  },

  componentDidMount: function() {
    if (this.props.defaultStyles) loadStyles()

    this.dataFrame = DataFrame({
      rows: this.props.rows,
      dimensions: this.props.dimensions,
      reduce: this.props.reduce
    })

    this.updateRows()
  },

  componentDidUpdate: function(prevProps) {
     if(this.props.hiddenColumns !== prevProps.hiddenColumns) {
         this.setHiddenColumns(this.props.hiddenColumns);
      }

    if(this.props.rows !== prevProps.rows) {
      this.dataFrame = DataFrame({
        rows: this.props.rows,
        dimensions: this.props.dimensions,
        reduce: this.props.reduce
      })

      this.updateRows()
    }
    
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
 
    if (this.props.solo !== prevProps.solo) {
      this.setState({solo: this.props.solo}, this.updateRows)
    }

    if (this.props.sortStack !== prevProps.sortStack && this.props.sortStack.length > 0) {
      this.setState({ sortStack: this.props.sortStack }, this.updateRows)
    }
  },

  getColumns: function() {
    var self = this
    var columns = []

    this.state.dimensions.forEach(function(title) {
      var d =  _.find(self.props.dimensions, function(col) {
        return col.title === title
      })

      columns.push({
        type: 'dimension', title: d.title, value: d.value,
        className: d.className, template: d.template, sortBy: d.sortBy
      })
    })

    this.props.calculations.forEach(function(c) {
      if (self.state.hiddenColumns.indexOf(c.title) >= 0) return

      columns.push({
        type:'calculation', title: c.title, template: c.template,
        value: c.value, className: c.className, sortBy: c.sortBy
      })
    })

    return columns
  },

  renderFiltersToggle: function() {
    if (soloEntries(this.state.solo).length === 0) return null

    var buttonText = this.state.filtersPaused ? 'Resume Filters' : 'Pause Filters'

    return (
      <div className='reactPivot-filtersToggle'>
        <button onClick={this.toggleFilters}>
          {buttonText}
        </button>
      </div>
    )
  },

  render: function() {
    var html = (
      <div className='reactPivot'>

        <div className='reactPivot-toolbar'>
          { this.props.hideDimensionFilter ? null :
            <Dimensions
              dimensions={this.props.dimensions}
              subDimensionText={this.props.subDimensionText}
              selectedDimensions={this.state.dimensions}
              onChange={this.setDimensions} />
          }

          <div className='reactPivot-controls'>
            <ColumnControl
              hiddenColumns={this.state.hiddenColumns}
              onChange={this.setHiddenColumns} />

            <SoloControl
              solo={this.state.solo}
              onToggle={this.setSolo}
            />

            {this.renderFiltersToggle()}

            <div className="reactPivot-csvExport">
              <button onClick={partial(this.downloadCSV, this.state.rows)}>
                Export CSV
              </button>
            </div>
          </div>
        </div>

        <PivotTable
          columns={this.getColumns()}
          rows={this.state.rows}
          sortBy={this.state.sortBy}
          sortDir={this.state.sortDir}
          sortStack={this.state.sortStack}
          onSort={this.setSort}
          onColumnHide={this.hideColumn}
          nPaginateRows={this.props.nPaginateRows}
          tableClassName={this.props.tableClassName}
          onSolo={this.setSolo}
          soloText={this.props.soloText}
          unsoloText={this.props.unsoloText}
          solo={this.state.solo}
        />
      </div>
    )

    return html
  },

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
  },

  updateRows: function () {
    var columns = this.getColumns()
    var sortStack = this.state.sortStack || []
    var hideRows = this.state.hideRows

    // Validate sortStack against current columns
    var validatedSortStack = this.cleanSortStack(sortStack, columns)
    if (validatedSortStack.length !== sortStack.length) {
      // sortStack was cleaned, update state
      sortStack = validatedSortStack
      this.setState({ sortStack: sortStack })
    }

    // For backwards compatibility, use sortBy/sortDir if sortStack is empty
    var sortByTitle = sortStack.length > 0 ? sortStack[0].title : this.state.sortBy
    var sortCol = _.find(columns, function(col) {
      return col.title === sortByTitle
    }) || {}
    var sortBy = sortCol.sortBy || (sortCol.type === 'dimension' ? sortCol.title : sortCol.value);
    var sortDir = sortStack.length > 0 ? sortStack[0].direction : this.state.sortDir

    var calcOpts = {
      dimensions: this.state.dimensions,
      sortBy: sortBy,
      sortDir: sortDir,
      compact: this.props.compact
    }

    if (!this.state.filtersPaused) {
      calcOpts.filter = createSoloFilter(this.state.solo, this.state.dimensions)
    }

    var rows = this.dataFrame.calculate(calcOpts)
    
    // Apply multi-column sorting if sortStack has multiple items
    // We can do this by sorting siblings at each level while preserving hierarchy
    if (sortStack.length > 1) {
      rows = this.applyHierarchicalMultiSort(rows, sortStack, columns)
    }
    
    rows = rows.filter(function (row) { return hideRows ? !hideRows(row) : true })

    this.setState({rows: rows})
    this.props.onData(rows)
  },

  setDimensions: function (updatedDimensions) {
    var self = this
    this.props.eventBus.emit('activeDimensions', updatedDimensions)
    
    // Update dimensions first, then clean sortStack based on new columns
    this.setState({dimensions: updatedDimensions}, function() {
      var columns = self.getColumns()
      var cleanedSortStack = self.cleanSortStack(self.state.sortStack, columns)
      
      // If sortStack changed, update it and emit event
      if (JSON.stringify(cleanedSortStack) !== JSON.stringify(self.state.sortStack)) {
        self.setState({ sortStack: cleanedSortStack })
        self.props.eventBus.emit('sortStack', cleanedSortStack)
        if (self.props.onSortStackChange) {
          self.props.onSortStackChange(cleanedSortStack)
        }
      }
      
      setTimeout(self.updateRows, 0)
    })
  },

  setHiddenColumns: function (hidden) {
    var self = this
    this.props.eventBus.emit('hiddenColumns', hidden)
    
    // Update hidden columns first, then clean sortStack based on visible columns
    this.setState({hiddenColumns: hidden}, function() {
      var columns = self.getColumns()
      var cleanedSortStack = self.cleanSortStack(self.state.sortStack, columns)
      
      // If sortStack changed, update it and emit event
      if (JSON.stringify(cleanedSortStack) !== JSON.stringify(self.state.sortStack)) {
        self.setState({ sortStack: cleanedSortStack })
        self.props.eventBus.emit('sortStack', cleanedSortStack)
        if (self.props.onSortStackChange) {
          self.props.onSortStackChange(cleanedSortStack)
        }
      }
      
      setTimeout(self.updateRows, 0)
    })
  },

  setSort: function(cTitle, shiftKey) {
    var sortStack = this.state.sortStack.slice()
    var columns = this.getColumns()
    var clickedCol = _.find(columns, function(col) {
      return col.title === cTitle
    })
    var newDirection = 'asc'  // Default direction for new sorts
    
    if (shiftKey) {
      // Shift-click: toggle membership in stack
      // Only allow dimension columns in multi-column sort stack
      
      // Ignore shift+click on calculation columns
      if (!clickedCol || clickedCol.type !== 'dimension') {
        return
      }
      
      var existingIndex = -1
      for (var i = 0; i < sortStack.length; i++) {
        if (sortStack[i].title === cTitle) {
          existingIndex = i
          break
        }
      }
      
      if (existingIndex >= 0) {
        // Remove from stack
        sortStack.splice(existingIndex, 1)
      } else {
        // Add to stack with default asc direction
        sortStack.push({ title: cTitle, direction: 'asc' })
      }
    } else {
      // Regular click
      var existingIndex = -1
      for (var i = 0; i < sortStack.length; i++) {
        if (sortStack[i].title === cTitle) {
          existingIndex = i
          break
        }
      }
      
      if (existingIndex >= 0) {
        // Column is in stack, toggle its direction
        sortStack[existingIndex].direction = sortStack[existingIndex].direction === 'asc' ? 'desc' : 'asc'
      } else {
        // Column not in stack
        // For calculation columns, check current sortBy/sortDir to toggle
        // For dimension columns, start fresh with asc
        if (clickedCol && clickedCol.type === 'calculation' && this.state.sortBy === cTitle) {
          // Calculation column being clicked again, toggle direction
          newDirection = this.state.sortDir === 'asc' ? 'desc' : 'asc'
        }
        
        // Clear stack and set as single sort
        sortStack = []
        
        // For dimensions, we can add to sortStack
        if (clickedCol && clickedCol.type === 'dimension') {
          sortStack = [{ title: cTitle, direction: newDirection }]
        }
        // For calculations, sortStack stays empty, handled by sortBy/sortDir
      }
    }
    
    this.props.eventBus.emit('sortStack', sortStack)
    if (this.props.onSortStackChange) {
      this.props.onSortStackChange(sortStack)
    }
    
    // Determine sortBy and sortDir
    var sortBy, sortDir
    if (sortStack.length > 0) {
      // Use first item in sortStack (dimension column)
      sortBy = sortStack[0].title
      sortDir = sortStack[0].direction
    } else {
      // Empty sortStack means calculation column or no sort
      // Use the clicked column title and computed direction
      sortBy = cTitle
      sortDir = newDirection || 'asc'
    }
    
    // Backwards compat: emit legacy events
    this.props.eventBus.emit('sortBy', sortBy)
    this.props.eventBus.emit('sortDir', sortDir)
    
    var self = this
    this.setState({ 
      sortStack: sortStack, 
      sortBy: sortBy, 
      sortDir: sortDir
    }, function() {
      self.updateRows()
    })
  },

  applyHierarchicalMultiSort: function(rows, sortStack, columns) {
    // Edge case: empty inputs
    if (!rows || rows.length === 0) return rows ? rows.slice() : []
    if (!sortStack || sortStack.length === 0) return rows.slice()
    if (!columns || columns.length === 0) return rows.slice()
    if (!this.state.dimensions) return rows.slice()
    
    var self = this
    
    // Helper: get sort value for a row, respecting dimension availability at row's level
    function getSortValue(row, columnTitle) {
      var col = _.find(columns, function(c) { return c.title === columnTitle })
      if (!col) return null  // Column doesn't exist, return null to sort to end
      
      var value
      if (col.type === 'dimension') {
        // Dimensions are only available at their level and below
        var dimensionIndex = -1
        for (var i = 0; i < self.state.dimensions.length; i++) {
          if (self.state.dimensions[i] === columnTitle) {
            dimensionIndex = i
            break
          }
        }
        value = (dimensionIndex >= 0 && dimensionIndex <= row._level) ? row[col.title] : null
      } else {
        value = getValue(col, row)
      }
      
      // Normalize for comparison
      if (value == null) return null
      if (!isNaN(parseFloat(value)) && isFinite(value)) return +value
      if (typeof value === 'string') return value.toLowerCase()
      return value
    }
    
    // Helper: extract dimension-value pairs from key
    function extractDimensionPairs(key) {
      if (!key || typeof key !== 'string') return {}
      var normalized = key.replace(/ÿ+$/, '')
      var segments = normalized.split('ÿ').filter(function(s) { return s.length > 0 })
      var pairs = {}
      for (var i = 0; i < segments.length; i += 2) {
        if (i + 1 < segments.length) {
          pairs[segments[i]] = segments[i + 1]
        }
      }
      return pairs
    }
    
    // Helper: check if candidate is a parent of row by matching dimension values
    function candidateMatchesAsParent(candidate, row) {
      if (!candidate || !row) return false
      if (typeof candidate._level === 'undefined' || typeof row._level === 'undefined') return false
      if (candidate._level !== row._level - 1) return false
      
      var candidatePairs = extractDimensionPairs(candidate._key)
      var rowPairs = extractDimensionPairs(row._key)
      
      if (Object.keys(candidatePairs).length >= Object.keys(rowPairs).length) return false
      
      for (var dim in candidatePairs) {
        if (rowPairs[dim] !== candidatePairs[dim]) return false
      }
      return true
    }
    
    // Build parent-child map
    var childrenByParent = {}
    var rootRows = []
    
    rows.forEach(function(row) {
      if (!row || typeof row._level === 'undefined' || !row._key) return
      if (row._level === 0) {
        rootRows.push(row)
        childrenByParent[row._key] = []
      }
    })
    
    // Edge case: no root rows found
    if (rootRows.length === 0) {
      console.warn('No root rows found in hierarchical sort. Returning original order.')
      return rows.slice()
    }
    
    // Find parent for each non-root row
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
    
    // Build reverse mapping: row key -> parent key (for sibling verification)
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
        parentKeyByRowKey[row._key] = null
      }
    })
    
    // Compare function: only compares siblings (rows with same parent)
    function compareRows(a, b) {
      if (!a || !b) return 0
      if (typeof a._level === 'undefined' || typeof b._level === 'undefined') return 0
      if (!a._key || !b._key) return 0
      if (a._level !== b._level || parentKeyByRowKey[a._key] !== parentKeyByRowKey[b._key]) {
        return 0
      }
      
      // Apply sort stack
      for (var i = 0; i < sortStack.length; i++) {
        var sortItem = sortStack[i]
        if (!sortItem || !sortItem.title) continue
        
        var aVal = getSortValue(a, sortItem.title)
        var bVal = getSortValue(b, sortItem.title)
        
        if (aVal === null && bVal === null) continue
        if (aVal === null) return 1
        if (bVal === null) return -1
        
        var comparison = (aVal < bVal) ? -1 : (aVal > bVal) ? 1 : 0
        if (comparison !== 0) {
          return sortItem.direction === 'desc' ? -comparison : comparison
        }
      }
      
      // Stable sort tie-breaker
      return (a._key < b._key) ? -1 : (a._key > b._key) ? 1 : 0
    }
    
    // Recursively build sorted result
    var result = []
    var addedRows = {}
    
    function addSortedRow(row) {
      if (!row || !row._key) return
      if (addedRows[row._key]) return
      
      result.push(row)
      addedRows[row._key] = true
      
      var children = childrenByParent[row._key] || []
      if (children.length > 0) {
        try {
          children.sort(compareRows)
          children.forEach(addSortedRow)
        } catch (err) {
          console.warn('Error sorting children:', err)
        }
      }
    }
    
    try {
      rootRows.sort(compareRows)
      rootRows.forEach(addSortedRow)
    } catch (err) {
      console.warn('Error in hierarchical sort:', err)
      return rows.slice()
    }
    
    // Safety check: ensure all rows preserved
    if (result.length !== rows.length) {
      console.warn('Hierarchical sort lost rows. Expected:', rows.length, 'Got:', result.length)
      return rows.slice()
    }
    
    return result
  },

  setSolo: function(solo) {
    if (!solo || typeof solo !== 'object') return

    var dimension = solo.title
    if (!dimension) return

    var valueKey = serializeSoloValue(solo.value)
    if (!valueKey) return

    var newSolo = Object.assign({}, this.state.solo)
    var valueMap = newSolo[dimension] || {}

    if (Object.prototype.hasOwnProperty.call(valueMap, valueKey)) {
      newSolo[dimension] = this.removeSoloValue(valueMap, valueKey)
      if (!newSolo[dimension]) delete newSolo[dimension]
    } else {
      newSolo[dimension] = this.addSoloValue(valueMap, valueKey)
    }

    this.props.eventBus.emit('solo', newSolo)

    // Auto-resume filters when adding or removing a solo value
    this.setState({solo: newSolo, filtersPaused: false}, this.updateRows)
  },

  addSoloValue: function(valueMap, key) {
    var updated = Object.assign({}, valueMap)
    updated[key] = true
    return updated
  },

  removeSoloValue: function(valueMap, key) {
    var updated = Object.assign({}, valueMap)
    delete updated[key]
    return Object.keys(updated).length > 0 ? updated : null
  },

  toggleFilters: function() {
    this.setState({filtersPaused: !this.state.filtersPaused}, this.updateRows)
  },

  hideColumn: function(cTitle) {
    var hidden = this.state.hiddenColumns.concat([cTitle])
    this.setHiddenColumns(hidden)
    setTimeout(this.updateRows, 0)
  },

  downloadCSV: function(rows) {
    var self = this

    var columns = this.getColumns()

    var csv = _.map(columns, 'title')
      .map(JSON.stringify.bind(JSON))
      .join(',') + '\n'

    var maxLevel = this.state.dimensions.length - 1
    var excludeSummary = this.props.excludeSummaryFromExport

    rows.forEach(function(row) {
      if (excludeSummary && (row._level < maxLevel)) return

      var vals = columns.map(function(col) {

        if (col.type === 'dimension') {
          var val = row[col.title]
        } else {
          var val = getValue(col, row)
        }

        if (col.template && self.props.csvTemplateFormat) {
          val = col.template(val)
        }

        return JSON.stringify(val)
      })
      csv += vals.join(',') + '\n'
    })

    download(csv, this.props.csvDownloadFileName, 'text/csv')
  }
})

function loadStyles() {
  if (typeof document === 'undefined') return // SSR safety
  if (document.getElementById('react-pivot-styles')) return // Already loaded
  
  const css = `.reactPivot {
  margin-top: 40px;
  padding: 10px 20px 20px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.reactPivot select {
  color: #555;
  height: 28px;
  border: none;
  margin-right: 5px;
  margin-top: 5px;
  background-color: #FFF;
  border: 1px solid #CCC;
}

.reactPivot-results table {
  width: 100%;
  clear: both;
  text-align: left;
  border-spacing: 0;
}

.reactPivot-results th.asc:after,
.reactPivot-results th.desc:after {
  font-size: 50%;
  opacity: 0.5;
}

.reactPivot-results th.asc:after { content: ' ▲' }
.reactPivot-results th.desc:after { content: ' ▼' }

.reactPivot-results td {
  border-top: 1px solid #ddd;
  padding: 8px;
}

.reactPivot-results td.reactPivot-indent {
  border: none;
}

.reactPivot-results tr:hover td {
  background: #f5f5f5
}

.reactPivot-results tr:hover td.reactPivot-indent {
  background: none;
}

.reactPivot-solo {
  opacity: 0;
  margin-left: 6px;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.reactPivot-solo:hover {font-weight: bold}
td:hover .reactPivot-solo {opacity: 0.5}

.reactPivot-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0;
}

.reactPivot-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: flex-start;
  justify-content: flex-end;
  flex: 0 0 auto;
}

.reactPivot-controls > * {
  margin: 0;
}

.reactPivot-controls select {
  margin: 0;
  width: 120px;
}

.reactPivot-toolbar select {
  margin-top: 0;
}

.reactPivot-csvExport {
  display: flex;
  align-items: flex-start;
  flex: 0 0 auto;
}

.reactPivot-csvExport button {
  background-color: #FFF;
  border: 1px solid #CCC;
  height: 28px;
  color: #555;
  cursor: pointer;
  padding: 0 12px;
  border-radius: 0;
  margin-top: 0;
  white-space: nowrap;
  flex-shrink: 0;
}

.reactPivot-filtersToggle {
  display: flex;
  align-items: flex-start;
  flex: 0 0 auto;
}

.reactPivot-filtersToggle button {
  background-color: #FFF;
  border: 1px solid #CCC;
  height: 28px;
  color: #555;
  cursor: pointer;
  padding: 0 12px;
  border-radius: 0;
  margin-top: 0;
  white-space: nowrap;
  flex-shrink: 0;
}

.reactPivot-dimensions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 0;
  text-align: left;
  flex: 1 1 300px;
  min-width: 0;
}

.reactPivot-dimensions select {
  margin: 0;
}

.reactPivot-hideColumn { opacity: 0 }

th:hover .reactPivot-hideColumn {
  opacity: 0.5;
  margin-right: 4px;
  margin-bottom: 2px;
}

.reactPivot-hideColumn:hover {
  font-weight: bold;
  cursor: pointer;
}

.reactPivot-pageNumber {
  padding: 2px;
  margin: 4px;
  cursor: pointer;
  color: gray;
  font-size: 14px;
}

.reactPivot-pageNumber:hover {
  font-weight: bold;
  border-bottom: black solid 1px;
  color: black;
}

.reactPivot-pageNumber.is-selected {
  font-weight: bold;
  border-bottom: black solid 1px;
  color: black;
}

.reactPivot-paginate {
  margin-top: 24px;
}

.reactPivot-results th.reactPivot-multiSort {
  background-color: #e3f2fd;
}`
  
  const style = document.createElement('style')
  style.id = 'react-pivot-styles'
  style.textContent = css
  document.head.appendChild(style)
}
