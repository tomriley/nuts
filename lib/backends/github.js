var _ = require('lodash');
var Q = require('q');
var util = require('util');
// JDC 2023.01.30 - removing octocat dependency based on its dependency on deprecated request library
// currently we don't use the github backend, if we go back to this we will need to
// replace the octocat dep.
// var GitHub = require('octocat');
var GitHub = { mock: true };
var request = require('request');
var githubWebhook = require('github-webhook-handler');

var Backend = require('./backend');


function GitHubBackend() {
    var that = this;
    Backend.apply(this, arguments);

    this.opts = _.defaults(this.opts || {}, {
        proxyAssets: true
    });

    this.client = new GitHub({
        token:    this.opts.token,
        endpoint: this.opts.endpoint,
        username: this.opts.username,
        password: this.opts.password
    });

    this.ghrepo = this.client.repo(this.opts.repository);
    this.releases = this.memoize(this.releases);

    // GitHub webhook to refresh list of versions
    this.webhookHandler = githubWebhook({
        path: '/refresh',
        secret: this.opts.refreshSecret
    });

    // Webhook from GitHub
    this.webhookHandler.on('release', function(event) {
        that.onRelease();
    });
    this.nuts.router.use(this.webhookHandler);
}
util.inherits(GitHubBackend, Backend);

/**
 * List all releases for this repository
 * @return {Promise<Array<Release>>}
 */
GitHubBackend.prototype.releases = function() {
    return this.ghrepo.releases()
    .then(function(page) {
        return page.all();
    });
};

/**
 * Return stream for an asset
 * @param {Asset} asset
 * @param {Request} req
 * @param {Response} res
 * @return {Promise}?
 */
GitHubBackend.prototype.serveAsset = function(asset, req, res) {
    if (!this.opts.proxyAssets) {
        res.redirect(asset.raw.browser_download_url);
    } else {
        return Backend.prototype.serveAsset.apply(this, arguments);
    }
};

/**
 * Return stream for an asset
 * @param {Asset} asset
 * @return {Promise<Stream>}
 */
GitHubBackend.prototype.getAssetStream = function(asset) {
    var headers = {
        'User-Agent': 'nuts',
        'Accept': 'application/octet-stream'
    };
    var httpAuth;

    if (this.opts.token) {
        headers['Authorization'] = 'token '+this.opts.token;
    } else if (this.opts.username) {
        httpAuth = {
            user: this.opts.username,
            pass: this.opts.password,
            sendImmediately: true
        };
    }

    return Q(request({
        uri: asset.raw.url,
        method: 'get',
        headers: headers,
        auth: httpAuth
    }));
};

module.exports = GitHubBackend;
