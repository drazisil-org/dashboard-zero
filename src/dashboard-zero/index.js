var Promise = require('bluebird')
var fs = require('fs')
Promise.promisifyAll(fs)
var GitHubApi = require('github')

// Holds the total number of issues
var total_issues = 0

var total_comments = 0

// The issues list in csv form
var csv_issues = []

var csv_comments = []

var repo_index = 0

var github
var ORG_NAME
var REPO_LIST

function init (org_name, repo_list) {
  github = new GitHubApi({
    // required
    version: '3.0.0',
    // optional
    protocol: 'https',
    host: 'api.github.com', // should be api.github.com for GitHub
    pathPrefix: '', // for some GHEs; none for GitHub
    timeout: 5000,
    headers: {
      'user-agent': 'drazisil' // GitHub is happy with a unique user agent
    }
  })
  ORG_NAME = org_name
  REPO_LIST = repo_list
}

function setToken (callback) {
  if (process.env.GH_TOKEN !== undefined) {
    github.authenticate({
      type: 'token',
      token: process.env.GH_TOKEN
    })

    github.misc.rateLimit({}, function cb_rateLimit (err, res) {
      if (err) {
        throw err
      }
      console.info('GitHub Login: Success')
      callback()
    })
  } else {
    console.error('GutHub Login: No Token')
    callback()
  }
}

// ********************************
// ISSUES
// ********************************
function getIssuesFromRepo () {
  github.issues.repoIssues({'user': ORG_NAME, 'repo': REPO_LIST[repo_index], 'per_page': 100}, function cb_1 (err, res) {
    fetchIssues(null, processIssues(err, res))
  })
}

function processIssues (err, res) {
  if (err) {
    if (err.message === 'No next page found') {
      return 'Done with this repo'
    } else {
      throw err
    }
  }
  res.forEach(function fe_repo (element, index, array) {
    var issue_line =
      element.id + ',"' +
      element.title.replace(/"/g, '&quot;') + '",' +
      element.created_at + ',' +
      element.updated_at + ',' +
      element.comments + ','
    if (element.pull_request) {
      issue_line += 'true' + ','
    } else {
      issue_line += 'false' + ','
    }
    issue_line += element.html_url + ',' +
      element.url +
      '\n'

    // Add to list to be saved to csv
    csv_issues += issue_line

    // Process comments
    if (typeof element.number === 'number') {
      getCommentsFromIssue(element.number)
    } else {
      console.log('ID: ' + element.id + ' = ' + typeof element.id)
      process.exit()
    }

    total_issues++
  })
  return res
}

function fetchIssues (err, res) {
  if (err) {
    throw err
  }
  if (github.hasNextPage(res)) {
    github.getNextPage(res, function cb_1 (err, res) {
      processIssuesPage(null, processIssues(err, res))
    })
  } else {
    processIssuesPage('No more pages')
  }
}

function processIssuesPage (err, res) {
  if (err) {
    if (err === 'No more pages') {
      // We are done with this repo
      if (repo_index !== (REPO_LIST.length - 1)) {
        // Do the next one
        repo_index++
        getIssuesFromRepo(fetchIssues)
      } else {
        // We should be done and this should only get called once
        saveFileIssues()
        saveFileComments()
        console.log('Done 3-i: ' + total_issues)
        console.log('Done 3-c: ' + total_comments)
      }
    } else {
      throw err
    }
  } else {
    if (github.hasNextPage(res)) {
      github.getNextPage(res, function cb_1 (err, res) {
        processIssuesPage(null, processIssues(err, res))
      })
    } else {
      processIssuesPage('No more pages')
    }
  }
}

// ********************************
// COMMENTS
// ********************************

function fetchIssueComments (err, res) {
  if (err) {
    throw err
  }
  if (github.hasNextPage(res)) {
    github.getNextPage(res, function cb_1 (err, res) {
      processIssueCommentsPage(null, processIssueComments(err, res))
    })
  } else {
    processIssueCommentsPage('No more pages')
  }
}

function getCommentsFromIssue (issue_id) {
  github.issues.getComments({'user': ORG_NAME, 'repo': REPO_LIST[repo_index], 'number': issue_id, 'per_page': 100}, function cb_1 (err, res) {
    fetchIssueComments(null, processIssueComments(err, res))
  })
}

function processIssueComments (err, res) {
  // console.log('ProcessIssues: ' + REPO_LIST[repo_index])
  if (err) {
    if (err.message === 'No next page found') {
      return 'Done with this repo'
    } else {
      // Why does this error?
      console.log('=' + err.message + '=')
      console.trace(err)
      throw err
    }
  }
  res.forEach(function fe_repo (element, index, array) {
    var comment_line =
      element.id + ',"' +
      element.user.login + '",' +
      element.updated_at + ',' +
      element.html_url + ',' +
      element.issue_url +
      '\n'

    // Add to list to be saved to csv
    csv_comments += comment_line

    total_comments++
  })
  return res
}

function processIssueCommentsPage (err, res) {
  if (err) {
    if (err === 'No more pages') {
      // We are done with this repo
    } else {
      throw err
    }
  } else {
    if (github.hasNextPage(res)) {
      github.getNextPage(res, function cb_1 (err, res) {
        processIssueCommentsPage(null, processIssueComments(err, res))
      })
    } else {
      processIssueCommentsPage('No more pages')
    }
  }
}

// ********************************
// SAVING
// ********************************

function saveFileIssues () {
  console.info('All Repos processed')
  var repo_header = 'id,title,created_date,updated_date,comments_count,is_pullrequest,html_url,url'
  updateFile(repo_header, csv_issues, 'data/issues.csv', function cb_update_file (err, res) {
    if (err) {
      console.error('Error updating file: ' + err)
      process.exit(1)
    }
    github.misc.rateLimit({}, function cb_rateLimit (err, res) {
      if (err) {
        console.log('Error getting rate: ' + err)
        throw err
      }
    })
  })
}

function saveFileComments () {
  console.info('All Comments processed')
  var repo_header = 'id,creator,updated_date,html_url,issue_url'
  updateFile(repo_header, csv_comments, 'data/comments.csv', function cb_update_file (err, res) {
    if (err) {
      console.error('Error updating file: ' + err)
      process.exit(1)
    }
    github.misc.rateLimit({}, function cb_rateLimit (err, res) {
      if (err) {
        console.log('Error getting rate: ' + err)
        throw err
      }
      console.log(res.rate.remaining + ' calls remaining, resets at ' + new Date(res.rate.reset * 1000))
      process.exit()
    })
  })
}

// ***********************************
// save the file
// ***********************
function updateFile (header, contents, file_name, callback) {
  fs.writeFile(file_name, header + '\n' + contents, function (err) {
    if (err) callback(err)
    // console.info('It\'s saved!')
    callback(null)
  })
}

module.exports.init = init
module.exports.setToken = setToken
module.exports.getIssuesFromRepo = getIssuesFromRepo
// module.exports.getIssuesFromRepoPage = getIssuesFromRepoPage
// module.exports.processRepoIssueResults = processRepoIssueResults
module.exports.saveFileIssues = saveFileIssues
module.exports.csv_issues = csv_issues
module.exports.processIssues = processIssues
module.exports.fetchIssues = fetchIssues
