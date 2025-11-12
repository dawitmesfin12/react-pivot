# ReactPivot #

ReactPivot is a data-grid component with pivot-table-like functionality for data display, filtering, and exploration. 

**Now compatible with React 19+ and modern build tools!**

Demo: [http://davidguttman.github.io/react-pivot/](http://davidguttman.github.io/react-pivot/)

![Demo](http://i.imgur.com/BhPF2Cv.gif)

## Installation & Usage ##

```bash
npm install react-pivot
```

### Modern ES Modules (Recommended)

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import ReactPivot from 'react-pivot'

const root = createRoot(document.getElementById('root'))
root.render(
  <ReactPivot 
    rows={rows}
    dimensions={dimensions}
    reduce={reduce}
    calculations={calculations}
    nPaginateRows={25} 
  />
)
```

### CommonJS (Legacy Support)

```js
const React = require('react')
const { createRoot } = require('react-dom/client')
const ReactPivot = require('react-pivot')

const root = createRoot(document.getElementById('root'))
root.render(
  React.createElement(ReactPivot, {
    rows: rows,
    dimensions: dimensions,
    reduce: reduce,
    calculations: calculations,
    nPaginateRows: 25
  })
)
```

### UMD (Browser Global)

```html
<script src="https://unpkg.com/react-pivot/dist/react-pivot.umd.js"></script>
<script>
  const root = ReactDOM.createRoot(document.getElementById('root'))
  root.render(
    React.createElement(ReactPivot, {
      rows: rows,
      dimensions: dimensions,
      calculations: calculations,
      reduce: reduce
    })
  )
</script>
## Example ##

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import ReactPivot from 'react-pivot'

const root = createRoot(document.getElementById('root'))
root.render(
  <ReactPivot 
    rows={rows}
    dimensions={dimensions}
    reduce={reduce}
    calculations={calculations} 
  />
)
```

`ReactPivot` requires four arguments: `rows`, `dimensions`, `reduce` and `calculations`

`rows` is your data, just an array of objects:
```js
var rows = [
  {"firstName":"Francisco","lastName":"Brekke","state":"NY","transaction":{"amount":"399.73","date":"2012-02-02T08:00:00.000Z","business":"Kozey-Moore","name":"Checking Account 2297","type":"deposit","account":"82741327"}},
  {"firstName":"Francisco","lastName":"Brekke","state":"NY","transaction":{"amount":"768.84","date":"2012-02-02T08:00:00.000Z","business":"Herman-Langworth","name":"Money Market Account 9344","type":"deposit","account":"95753704"}}
]
```

`dimensions` is how you want to group your data. Maybe you want to get the total $$ by `firstName` and have the column title be `First Name`:

```js
var dimensions = [
  {value: 'firstName', title: 'First Name'}
]
```

`reduce` is how you calculate numbers for each group:

```js
var reduce = function(row, memo) {
  memo.amountTotal = (memo.amountTotal || 0) + parseFloat(row.transaction.amount)
  return memo
}
```

`calculations` is how you want to display the calculations done in `reduce`:

```js
var calculations = [
  {
    title: 'Amount', value: 'amountTotal',
    template: function(val, row) {
      return '$' + val.toFixed(2)
    },
    sortBy: function(row) {
      return isNaN(row.amountTotal) ? 0 : row.amountTotal
    }
  }
]
```

Plug them in and you're good to go!

```js

// Optional: set a default grouping with "activeDimensions"
React.render(
  <ReactPivot rows={rows}
              dimensions={dimensions}
              reduce={reduce}
              calculations={calculations}
              activeDimensions={['First Name']} />,
  document.body
)
```

See it all together in [example/basic.jsx](https://github.com/davidguttman/react-pivot/blob/master/example/basic.jsx)

## Multi-Column Sorting

ReactPivot supports hierarchical multi-column sorting, allowing you to sort data by multiple columns simultaneously while maintaining the grouped structure.

### User Interaction

- **Shift+Click** any column header to add it to the sort stack (or remove it if already added)
- **Click** a column in the sort stack to toggle its sort direction (asc ↔ desc)
- **Click** a column not in the sort stack to:
  - Clear the entire sort stack
  - Add the clicked column as a single-column sort (starting with asc)
- Columns in the sort stack are highlighted with a light blue background

### API

```jsx
<ReactPivot
  sortStack={[
    {title: 'State', direction: 'asc'},
    {title: 'Amount', direction: 'desc'},
    {title: 'Transaction Date', direction: 'desc'}
  ]}
  onSortStackChange={(sortStack) => {
    console.log('New sort order:', sortStack)
  }}
  // ... other props
/>
```

The sort is applied hierarchically at every grouping level, meaning:
- When grouped by State → First Name, the sort applies within each State
- Each State's children (First Names) are sorted by the same multi-column criteria
- This preserves the hierarchical structure while applying consistent sorting

**Note:** For backwards compatibility, the legacy `sortBy` and `sortDir` props still work. If `sortStack` is not provided, a single-column sort will be initialized from `sortBy`/`sortDir`.

### Optional Arguments ###
parameter | type | description | default
--------- | ---- | ----------- | -------
compact | boolean | compact rows | false
csvDownloadFileName | string | assign name of document created when user clicks to 'Export CSV' | 'table.csv'
csvTemplateFormat | boolean | apply template formatting to data before csv export | false
defaultStyles | boolean | apply default styles from style.css | true
hiddenColumns | array | columns that should not display | []
nPaginateRows | number | items per page setting | 25
solo | object | active solo filters by dimension | {}
sortBy | string | (legacy) name of column to use for record sort; use `sortStack` for multi-column | null
sortDir | string | (legacy) sort direction, either 'asc' or 'desc'; use `sortStack` for multi-column | 'asc'
sortStack | array | array of `{title: string, direction: 'asc'\|'desc'}` for multi-column sorting | []
onSortStackChange | function | callback when sort stack changes, receives new sortStack array | no-op
tableClassName | string | assign css class to table containing react-pivot elements | ''
hideDimensionFilter | boolean | do not render the dimension filter | false
hideRows | function | if provided, rows that are passed to the function will not render unless the return value is true | null

### TODO ###

* Better Pagination
* Responsive Table

## License ##

MIT
