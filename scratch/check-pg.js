const fs = require('fs')
const path = require('path')

try {
  const pg = require('pg')
  console.log('pg package is available!')
} catch (e) {
  console.log('pg package not in node_modules')
}

try {
  const postgres = require('postgres')
  console.log('postgres package is available!')
} catch (e) {
  console.log('postgres package not in node_modules')
}
