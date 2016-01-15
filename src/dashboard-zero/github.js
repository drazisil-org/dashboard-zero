var async = require('async')
var VError = require('verror')
var GitHubApi = require('github')

var USER_AGENT = 'drazisil'

var logger
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
      'user-agent': USER_AGENT // GitHub is happy with a unique user agent
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
        if (err.message === '504: Gateway Timeout') {
          setToken(callback)
        } else {
          console.trace()
          throw new VError(err, 'Unknown error setting github api token')
        }
      } else {
        // console.info('GitHub Login: Success')
        callback()
      }
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
  var user = ''
  if (REPO_LIST[repo_index].org) {
    user = REPO_LIST[repo_index].org
  } else {
    user = REPO_LIST[repo_index].user
  }
  var repo = REPO_LIST[repo_index].repo
  var msg = {
    user: user,
    repo: repo,
    per_page: 100
  }

  // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
  github.issues.repoIssues(msg, function gotFromOrg (err, res) {
    if (err) {
      console.trace()
      throw new VError(err, 'unnknown error getting issues from repo')
    }
    // this has loaded the first page of results
    // get the values we want out of this response
    getSelectedIssueValues(user, repo, res)

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
            console.trace()
            throw new VError(err, 'unknown error checking next page of issues from repo')
          }
          // get the values we want out of this response
          getSelectedIssueValues(user, repo, res)

          // update the variables used in the whilst logic
          ghResult = res
          hasNextPage = truthy(githubClient.hasNextPage(res))

          callback(null)
        })
      },
      function done (err) {
        if (err) {
          console.trace()
          throw new VError(err, 'unknown error fetching page of issues from repo')
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
function getSelectedIssueValues (user, repo, ghRes) {
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
        'org': user,
        'repository': repo,
        'id': element.id,
        'title': element.title.replace(/"/g, '&quot;'),
        'created_at': element.created_at,
        'updated_at': element.updated_at,
        'comments': element.comments,
        'state': element.state,
        'is_pullrequest': is_pr,
        'milestone_id': milestone_id,
        'labels': labels,
        'html_url': element.html_url.replace(/"/g, '&quot;').replace(/,/g, '%2C'),
        'url': element.url
      }

      // Add to list to be saved to csv
      json_issues.push(issue_line)

      // Process comments
      getCommentsFromIssue(user, repo, element.number)

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
  var user = ''
  if (REPO_LIST[repo_index].org) {
    user = REPO_LIST[repo_index].org
  } else {
    user = REPO_LIST[repo_index].user
  }
  var msg = {
    user: user,
    repo: REPO_LIST[repo_index].repo,
    per_page: 100
  }

  // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
  github.issues.getAllMilestones(msg, function gotFromOrg (err, res) {
    if (err) {
      console.trace()
      throw new VError(err, 'unknown error getting milestones from repo')
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
            console.trace()
            throw new VError(err, 'unknown error check for next page of milestones from repo')
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
          console.trace()
          throw new VError(err, 'unknown error fetching milestones from repo')
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
  var user = ''
  if (REPO_LIST[repo_index].org) {
    user = REPO_LIST[repo_index].org
  } else {
    user = REPO_LIST[repo_index].user
  }
  var msg = {
    user: user,
    repo: REPO_LIST[repo_index].repo,
    per_page: 100
  }

  // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
  github.issues.getLabels(msg, function gotFromOrg (err, res) {
    if (err) {
      console.trace()
      throw new VError(err, 'unknown error getting labels from repo')
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
            console.trace()
            throw new VError(err, 'unknown error checking for next page of labels from repo')
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
          console.trace()
          throw new VError(err, 'unknown error fetching page of labels from repo')
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

function getCommentsFromIssue (user, repo, issue_id) {
  // console.info('Fetching issue comments for ' + REPO_LIST[repo_index].repo)
  var msg = {
    user: user,
    repo: repo,
    number: issue_id,
    per_page: 100
  }

  github.issues.getComments(msg, function cb_get_comments_from_issue (err, res) {
    try {
      fetchIssueComments(err, processIssueComments(err, res))
    } catch (e) {
      if (e.message === '504: Gateway Timeout') {
        console.log(e.message + ': Retrying...')
        getCommentsFromIssue(user, repo, issue_id)
      } else if (e.message === 'Not Found') {
        throw new VError(e, 'Unable to fetch issue comments for issue id: ' + issue_id + ' in repository ' + user + '/' + repo)
      } else if (e.message === 'API Rate Exceeded') {
        console.error(e.message)
        getRateLeft(function () {
          process.exit(1)
        })
      } else {
        console.log(e)
        throw new VError(e, 'unknown error fetching comments')
      }
    }
  })
}

function fetchIssueComments (err, res) {
  if (err) {
    if (err.message === '{"message":"Not Found","documentation_url":"https://developer.github.com/v3"}') {
      throw new VError('Not Found')
    } else if (err.message === '{"message":"API rate limit exceeded for ' + USER_AGENT + '.","documentation_url":"https://developer.github.com/v3/#rate-limiting"}') {
      throw new VError('API Rate Exceeded')
    } else {
      console.log('Error x: =' + err.message + '=')
      throw new VError(err)
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
      return err
    } else if (err.message === 'Not Found') {
      return err
    } else {
      // Why does this error?
      return new VError(err, 'unknown error processing issue comments')
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
    } else if (err.message === '504: Gateway Timeout') {
      processIssueCommentsPage(err.message)
    } else {
      console.trace()
      throw new VError(err, 'unknown error processing issue comments from repo')
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
  var msg
  var type = 'org'
  if (REPO_LIST[repo_index].org) {
    msg = {
      org: REPO_LIST[repo_index].org,
      type: 'public',
      per_page: 100
    }
  } else {
    msg = {
      user: REPO_LIST[repo_index].user,
      repo: REPO_LIST[repo_index].repo,
      per_page: 100
    }
    type = 'user'
  }

  if (type === 'org') {
    // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
    github.orgs.getMembers(msg, function gotMembersFromOrg (err, res) {
      if (err) {
        if (err.message === '{"message":"API rate limit exceeded for ' + USER_AGENT + '.","documentation_url":"https://developer.github.com/v3/#rate-limiting"}') {
          console.error('API Rate Exceeded')
          module.exports.getRateLeft(process.exit(1))
        } else {
          console.trace()
          throw new VError(err, 'unknown error getting members from org')
        }
      } else {
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
                console.trace()
                throw new VError(err, 'unknown error checking for next page of members from org')
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
              console.trace()
              throw new VError(err, 'unknown error fetching list if members from org')
            }
            if (repo_index < (REPO_LIST.length - 1)) {
              repo_index++
              getOrgMembers(callback)
            } else {
              repo_index = 0
              callback()
            }
          })
      }
    })
  } else {
    // To see the data from github: curl -i https://api.github.com/orgs/mozilla/repos?per_page=1
    github.repos.getContributors(msg, function gotMembersFromRepo (err, res) {
      if (err) {
        console.trace()
        throw new VError(err, 'unknown error getting list of contributors from repo')
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
              console.trace()
              throw new VError(err, 'unknown error checking for next page of contributors from repo')
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
            console.trace()
            throw new VError(err, 'unknown error fetching contributors from repo')
          }
          if (repo_index < (REPO_LIST.length - 1)) {
            repo_index++
            getOrgMembers(callback)
          } else {
            repo_index = 0
            callback()
          }
        })
    })
  }
}

/**
 * Extract the values we want from all the data available in the API
 * @param  {JSON} ghRes, a single respsonse from the github API
 * @return {Array}
 */
function getSelectedMemberValues (ghRes) {
  if (ghRes) {
    ghRes.forEach(function fe_repo (element, index, array) {
      var user = ''
      if (REPO_LIST[repo_index].org) {
        user = REPO_LIST[repo_index].org
      } else {
        user = REPO_LIST[repo_index].user
      }
      var member_line = {
        'org': user,
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
  console.log('moo')
  github.misc.rateLimit({}, function cb_rateLimit (err, res) {
    if (err) {
      console.trace()
      throw new VError(err, 'unknown error fetching number of api calls left')
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
