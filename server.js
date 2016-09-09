var config = require('./config.json')
var dz = require('./src/index.js')
var fs = require('fs')
var logger = require('winston')

// *******************************
// Start of code
// ****************************

if (!config.configured) {
  logger.info('Please configure the application')
  process.exit()
}

POST()

function POST () {
  dz.init(function done () {
    dz.checkDataFiles(function done () {
      dz.updateData(function done () {
        dz.timerId = setTimeout(dz.updateData, 1800000, function done () { // 30 minutes
        })
        dz.startServer()
      })
    })
  })
}

function isConfigured (config, config_file_path) {
  if (!config.configured) {
    config.configured = true
    fs.writeFileSync(config_file_path, JSON.stringify(config, null, 2))
  }
}
