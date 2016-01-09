var dz = require('./src/dashboard-zero/index.js')
/* global describe it */

var Promise = require('bluebird')
var fs = require('fs')
Promise.promisifyAll(fs)

var assert = require('assert')
describe('API', function () {
  it('can fetch all comments', function (done) {
    dz.apiAllComments(true, function (err, stats) {
      if (err) {
        assert.equal('ENOENT', err.code)
        done()
      } else {
        assert.equal(true, stats.isFile())
        done()
      }
    })
  })

  it('Ccan export all comments', function (done) {
    dz.apiAllComments(false, function (err, stats) {
      if (err) {
        assert.equal('ENOENT', err.code)
        done()
      } else {
        assert.equal(true, stats.isFile())
        done()
      }
    })
  })
})
