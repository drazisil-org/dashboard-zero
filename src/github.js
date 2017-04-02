var async = require('async')
var GitHubApi = require('github')

var logger = require('winston')

var github
var REPO_LIST
var CONFIG

// Holds the totals
var total_repositories = 0
var total_issues = 0
var total_comments = 0
var total_members = 0
var total_milestones = 0
var total_labels = 0

// The lists in json form
var json_issues = []
var json_comments = []
var json_members = []
var json_milestones = []
var json_labels = []

// Index of the repo currently being processed
var repo_index = 0

function init (config, logger, callback) {
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
  CONFIG = config
  logger = logger
  REPO_LIST = config['repo_list']
  total_repositories = REPO_LIST.length
  callback()
}

function setToken (callback) {
  if (CONFIG['token'] !== undefined) {
    github.authenticate({
      type: 'token',
      token: CONFIG['token']
    })

    github.misc.rateLimit({}, function cb_rateLimit (err, res) {
      if (err) {
        logger.error('Error checking rate limit: ' + err)
        process.exit(1)
      }
      // console.info('GitHub Login: Success')
      callback()
    })
  } else {
    logger.error('GetHub Login: No Token')
    process.exit(1)
  }
}

// ********************************
// ISSUES
// ********************************

/**
 * Get a list of the members linked to an org
 * @param  {String}   org      github org name
 * @param  {Function} callback
 * @return {Object}
 */
function getRepoIssues (callback) {
  var githubClient = github
  // console.info('Fetching issues for ' + REPO_LIST[repo_index].repo)

  // The options msg we send to the client http://mikedeboer.github.io/node-github/#repos.prototype.getFromOrg
  var msg = {
    user: REPO_LIST[repo_index].org,
    repo: REPO_LIST[repo_index].repo,
    per_page: 100
  }

  // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
  github.issues.repoIssues(msg, function gotFromOrg (err, res) {
    if (err) {
      logger.error('Error getting issues from org: ' + REPO_LIST[repo_index].org + ' ' + err)
      process.exit(1)
    }
    // this has loaded the first page of results
    // get the values we want out of this response
    getSelectedIssueValues(res)

    // setup variables to use in the whilst loop below
    var ghResult = res
    var hasNextPage = truthy(githubClient.hasNextPage(res))

    // now we work through any remaining pages
    async.whilst(
      function test () {
        return hasNextPage
      },
      function doThis (callback) {
        githubClient.getNextPage(ghResult, function gotNextPage (err, res) {
          if (err) {
            logger.error('Error getting next page of issues from org: ' + REPO_LIST[repo_index].org + ' ' + err)
            process.exit(1)
          }
          // get the values we want out of this response
          getSelectedIssueValues(res)

          // update the variables used in the whilst logic
          ghResult = res
          hasNextPage = truthy(githubClient.hasNextPage(res))

          callback(null)
        })
      },
      function done (err) {
        if (err) {
          logger.error('Error getting issues from org: ' + REPO_LIST[repo_index].org + ' ' + err)
          process.exit(1)
        }
        if (repo_index < (REPO_LIST.length - 1)) {
          repo_index++
          getRepoIssues(callback)
        } else {
          repo_index = 0
          callback()
        }
      })
  })
}

/**
 * Extract the values we want from all the data available in the API
 * @param  {JSON} ghRes, a single respsonse from the github API
 * @return {Array}
 */
function getSelectedIssueValues (ghRes) {
  if (ghRes) {
    ghRes.forEach(function fe_repo (element, index, array) {
      // Check if PR
      var is_pr = 'false'
      if (element.pull_request) {
        is_pr = 'true'
      }
      var milestone_id = 'none'
      if (element.milestone) {
        milestone_id = element.milestone.id
      }
      var labels = 'none'
      if (element.labels.length > 0) {
        var arrLabels = []
        element.labels.forEach(function fe_repo (element, index, array) {
          arrLabels.push(element.name)
        })
        labels = arrLabels.join('|')
      }
      var issue_line = {
        'org': REPO_LIST[repo_index].org,
        'repository': REPO_LIST[repo_index].repo,
        'id': element.id,
        'title': element.title.replace(/"/g, '&quot;'),
        'created_at': element.created_at,
        'updated_at': element.updated_at,
        'comments': element.comments,
        'is_pullrequest': is_pr,
        'milestone_id': milestone_id,
        'labels': labels,
        'html_url': element.html_url.replace(/"/g, '&quot;').replace(/,/g, '%2C'),
        'url': element.url
      }

      // Add to list to be saved to csv
      json_issues.push(issue_line)

      // Process comments
      getCommentsFromIssue(element.number)

      total_issues++
    })
  }
  return ghRes
}

// ********************************
// MILESTONES
// ********************************

/**
 * Get a list of the members linked to an org
 * @param  {String}   org      github org name
 * @param  {Function} callback
 * @return {Object}
 */
function getRepoMilestones (callback) {
  var githubClient = github
  // console.info('Fetching milestones for ' + REPO_LIST[repo_index].repo)

  // The options msg we send to the client http://mikedeboer.github.io/node-github/#repos.prototype.getFromOrg
  var msg = {
    user: REPO_LIST[repo_index].org,
    repo: REPO_LIST[repo_index].repo,
    per_page: 100
  }

  // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
  github.issues.getAllMilestones(msg, function gotFromOrg (err, res) {
    if (err) {
      logger.error('Error getting milestones from org: ' + REPO_LIST[repo_index].org + ' ' + err)
      process.exit(1)
    }
    // this has loaded the first page of results
    // get the values we want out of this response
    getSelectedMilestoneValues(res)

    // setup variables to use in the whilst loop below
    var ghResult = res
    var hasNextPage = truthy(githubClient.hasNextPage(res))

    // now we work through any remaining pages
    async.whilst(
      function test () {
        return hasNextPage
      },
      function doThis (callback) {
        githubClient.getNextPage(ghResult, function gotNextPage (err, res) {
          if (err) {
            logger.error('Error getting next page of milestones from org: ' + REPO_LIST[repo_index].org + ' ' + err)
            process.exit(1)
          }
          // get the values we want out of this response
          getSelectedMilestoneValues(res)

          // update the variables used in the whilst logic
          ghResult = res
          hasNextPage = truthy(githubClient.hasNextPage(res))

          callback(null)
        })
      },
      function done (err) {
        if (err) {
          logger.error('Error getting milestones from org: ' + REPO_LIST[repo_index].org + ' ' + err)
          process.exit(1)
        }
        if (repo_index < (REPO_LIST.length - 1)) {
          repo_index++
          getRepoMilestones(callback)
        } else {
          repo_index = 0
          callback()
        }
      })
  })
}

/**
 * Extract the values we want from all the data available in the API
 * @param  {JSON} ghRes, a single respsonse from the github API
 * @return {Array}
 */
function getSelectedMilestoneValues (ghRes) {
  if (ghRes) {
    ghRes.forEach(function fe_repo (element, index, array) {
      var milestone_line = {
        'org': REPO_LIST[repo_index].org,
        'repository': REPO_LIST[repo_index].repo,
        'id': element.id,
        'title': element.title.replace(/"/g, '&quot;'),
        'state': element.state,
        'open_issues': element.open_issues,
        'due_on': element.due_on,
        'html_url': element.html_url.replace(/"/g, '&quot;').replace(/,/g, '%2C'),
        'url': element.url
      }

      // Add to list to be saved to csv
      json_milestones.push(milestone_line)

      total_milestones++
    })
  }
  return ghRes
}

// ********************************
// LABELS
// ********************************

/**
 * Get a list of the labels linked to a repository
 * @param  {String}   org      github org name
 * @param  {Function} callback
 * @return {Object}
 */
function getRepoLabels (callback) {
  var githubClient = github
  // console.info('Fetching labels for ' + REPO_LIST[repo_index].repo)

  // The options msg we send to the client http://mikedeboer.github.io/node-github/#repos.prototype.getFromOrg
  var msg = {
    user: REPO_LIST[repo_index].org,
    repo: REPO_LIST[repo_index].repo,
    per_page: 100
  }

  // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
  github.issues.getLabels(msg, function gotFromOrg (err, res) {
    if (err) {
      logger.error('Error getting labels from org: ' + REPO_LIST[repo_index].org + ' ' + err)
      process.exit(1)
    }
    // this has loaded the first page of results
    // get the values we want out of this response
    getSelectedLabelValues(res)

    // setup variables to use in the whilst loop below
    var ghResult = res
    var hasNextPage = truthy(githubClient.hasNextPage(res))

    // now we work through any remaining pages
    async.whilst(
      function test () {
        return hasNextPage
      },
      function doThis (callback) {
        githubClient.getNextPage(ghResult, function gotNextPage (err, res) {
          if (err) {
            logger.error('Error getting next page of labels from org: ' + REPO_LIST[repo_index].org + ' ' + err)
            process.exit(1)
          }
          // get the values we want out of this response
          getSelectedMilestoneValues(res)

          // update the variables used in the whilst logic
          ghResult = res
          hasNextPage = truthy(githubClient.hasNextPage(res))

          callback(null)
        })
      },
      function done (err) {
        if (err) {
          logger.error('Error getting labels from org: ' + REPO_LIST[repo_index].org + ' ' + err)
          process.exit(1)
        }
        if (repo_index < (REPO_LIST.length - 1)) {
          repo_index++
          getRepoLabels(callback)
        } else {
          repo_index = 0
          callback()
        }
      })
  })
}

/**
 * Extract the values we want from all the data available in the API
 * @param  {JSON} ghRes, a single respsonse from the github API
 * @return {Array}
 */
function getSelectedLabelValues (ghRes) {
  if (ghRes) {
    ghRes.forEach(function fe_repo (element, index, array) {
      var label_line = {
        'org': REPO_LIST[repo_index].org,
        'repository': REPO_LIST[repo_index].repo,
        'name': element.name.replace(/"/g, '&quot;'),
        'url': element.url
      }

      // Add to list to be saved to csv
      json_labels.push(label_line)

      total_labels++
    })
  }
  return ghRes
}

// ********************************
// COMMENTS
// ********************************

function getCommentsFromIssue (issue_id) {
  // console.info('Fetching issue comments for ' + REPO_LIST[repo_index].repo)

  github.issues.getComments({'user': REPO_LIST[repo_index].org, 'repo': REPO_LIST[repo_index].repo, 'number': issue_id, 'per_page': 100}, function cb_get_comments_from_issue (err, res) {
    fetchIssueComments(err, processIssueComments(err, res))
  })
}

function fetchIssueComments (err, res) {
  if (err) {
    if (err.code == 404) {
      //  This should not occur, as all repos should exist.
      // Does this error on no comments?
      logger.warn(`Unable to fetch issue comments from ${REPO_LIST[repo_index].org}, are you sure you typed the org name correctly? Skipping...`)
      callback(err)
    } else {
      logger.error('Error getting issue comments from org: ' + REPO_LIST[repo_index].org + ' ' + err)
      callback(err)
    }
  }
  if (github.hasNextPage(res)) {
    github.getNextPage(res, function cb_fetch_issue_comments (err, res) {
      processIssueCommentsPage(null, processIssueComments(err, res))
    })
  } else {
    processIssueCommentsPage('No more pages')
  }
}

function processIssueComments (err, res) {
  if (err) {
    if (err.message === 'No next page found') {
      console.log('Done with this repo')
      return 'Done with this repo'
    } else if (err.message === '504: Gateway Timeout') {
      logger.error('Gateway timeout getting issue comments from org: ' + REPO_LIST[repo_index].org + ' ' + err)
      process.exit(1)
    } else {
      // Why does this error?
      if (err.code == 404) {
        //  This should not occur, as all repos should exist.
        // Does this error on no comments?
        logger.warn(`Unable to fetch issue comments from ${REPO_LIST[repo_index].org}, are you sure you typed the org name correctly? Skipping...`)
        callback(err)
      } else {
        logger.error('Error getting issue comments from org: ' + REPO_LIST[repo_index].org + ' ' + err)
        callback(err)
      }
    }
  }
  res.forEach(function fe_repo (element, index, array) {
    var comment_line = {
      'org': REPO_LIST[repo_index].org,
      'repository': REPO_LIST[repo_index].repo,
      'id': element.id,
      'creator': element.user.login.replace(/"/g, '&quot;'),
      'updated_date': element.updated_at,
      'html_url': element.html_url.replace(/"/g, '&quot;').replace(/,/g, '%2C'),
      'issue_url': element.issue_url.replace(/"/g, '&quot;').replace(/,/g, '%2C')
    }

    // Add to list to be saved to csv
    json_comments.push(comment_line)

    total_comments++
  })
  return res
}

function processIssueCommentsPage (err, res) {
  if (err) {
    if (err === 'No more pages') {
      // We are done with this repo
      return
    } else {
      logger.error('Error processing issue comments from org: ' + REPO_LIST[repo_index].org + ' ' + err)
      process.exit(1)
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
// MEMBERS
// ********************************

/**
 * Get a list of the members linked to an org
 * @param  {String}   org      github org name
 * @param  {Function} callback
 * @return {Object}
 */
function getOrgMembers (callback) {
  var githubClient = github

  // The options msg we send to the client http://mikedeboer.github.io/node-github/#repos.prototype.getFromOrg
  var msg = {
    org: REPO_LIST[repo_index].org,
    type: 'public',
    per_page: 100
  }

  // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
  github.orgs.getMembers(msg, function gotFromOrg (err, res) {
    if (err) {
      if (err.code == 404) {
        //  Possibly a user and not an org
        logger.warn(`Unable to fetch members from ${REPO_LIST[repo_index].org}, are you sure you typed the org name correctly? Skipping...`)
        callback(err)
      } else {
        logger.error('Error getting members from org: ' + REPO_LIST[repo_index].org + ' ' + err)
        callback(err)
      }
    }
    // this has loaded the first page of results
    // get the values we want out of this response
    getSelectedMemberValues(res)

    // setup variables to use in the whilst loop below
    var ghResult = res
    var hasNextPage = truthy(githubClient.hasNextPage(res))

    // now we work through any remaining pages
    async.whilst(
      function test () {
        return hasNextPage
      },
      function doThis (callback) {
        githubClient.getNextPage(ghResult, function gotNextPage (err, res) {
          if (err) {
            logger.error('Error getting next page of members from org: ' + REPO_LIST[repo_index].org + ' ' + err)
            process.exit(1)
          }
          // get the values we want out of this response
          getSelectedMemberValues(res)

          // update the variables used in the whilst logic
          ghResult = res
          hasNextPage = truthy(githubClient.hasNextPage(res))

          callback(null)
        })
      },
      function done (err) {
        if (err) {
          logger.error('Error getting members from org: ' + REPO_LIST[repo_index].org + ' ' + err)
          process.exit(1)
        }
        callback()
      })
  })
}

/**
 * Extract the values we want from all the data available in the API
 * @param  {JSON} ghRes, a single respsonse from the github API
 * @return {Array}
 */
function getSelectedMemberValues (ghRes) {
  if (ghRes) {
    ghRes.forEach(function fe_repo (element, index, array) {
      var member_line = {
        'org': REPO_LIST[repo_index].org,
        'id': element.id,
        'login': element.login,
        'due_on': element.due_on,
        'avatar_url': element.avatar_url.replace(/"/g, '&quot;').replace(/,/g, '%2C'),
        'type': element.type
      }

      // Add to list to be saved to csv
      json_members.push(member_line)

      total_members++
    })
  }
  return ghRes
}

function getRateLeft (callback) {
  github.misc.rateLimit({}, function cb_rateLimit (err, res) {
    if (err) {
      logger.error('Error getting rate limit: ' + err)
      process.exit(1)
    }
    callback(res.rate.remaining + ' calls remaining, resets at ' + new Date(res.rate.reset * 1000))
  })
}

/**
 * A util
 */
function truthy (o) {
  if (o) {
    return true
  }
  return false
}

module.exports = {
  init: init,
  setToken: setToken,
  getRateLeft: getRateLeft,
  getOrgMembers: getOrgMembers,
  getRepoIssues: getRepoIssues,
  getRepoMilestones: getRepoMilestones,
  getRepoLabels: getRepoLabels,
  total_repositories: total_repositories,
  total_issues: total_issues,
  total_comments: total_comments,
  total_members: total_members,
  total_milestones: total_milestones,
  total_labels: total_labels,
  json_issues: json_issues,
  json_comments: json_comments,
  json_members: json_members,
  json_milestones: json_milestones,
  json_labels: json_labels
}
