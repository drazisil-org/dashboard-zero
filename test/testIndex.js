var dz = require('../src/dashboard-zero/index.js')
/* global describe it */

var Promise = require('bluebird')
var fs = require('fs')
Promise.promisifyAll(fs)

var assert = require('assert')
describe('API', function () {
  it('can create tables', function (done) {
    dz.dbCreateTables(function (err, res) {
      if (err) {
        assert.equal('ENOENT', err.message)
        done()
      } else {
        assert.equal('Success: tables created', res)
        done()
      }
    })
  })

  it('can fetch all comments', function (done) {
    dz.apiAllComments(false, function (err, res) {
      if (err) {
        assert.equal('ENOENT', err.message)
        done()
      } else {
        assert.equal('', res)
        done()
      }
    })
  })

  it('can export all comments', function (done) {
    dz.apiAllComments(true, function (err, res) {
      if (err) {
        assert.equal('ENOENT', err.message)
        done()
      } else {
        assert.equal('Export not supported yet', res)
        done()
      }
    })
  })

  it('can fetch all issues', function (done) {
    dz.apiAllIssues(false, function (err, res) {
      if (err) {
        assert.equal('ENOENT', err.message)
        done()
      } else {
        assert.equal('', res)
        done()
      }
    })
  })

  it('can export all issues', function (done) {
    dz.apiAllIssues(true, function (err, res) {
      if (err) {
        assert.equal('ENOENT', err.message)
        done()
      } else {
        assert.equal('Export not supported yet', res)
        done()
      }
    })
  })
})
