var config = require('./config.json');
var dz = require('./src/index.js')

// *******************************
// Start of code
// ****************************

POST()

function POST () {
  dz.init(function done (err) {
    if (err) {
      throw err
    }
    dz.checkDataFiles(function done (err) {
      if (err) {
        throw err
      }
      dz.updateData(function done (err) {
        if (err) {
          throw err
        }
        dz.timerId = setTimeout(dz.updateData, 1800000, function done () { // 30 minutes
        })
        dz.startServer()
      })
    })
  })
}
