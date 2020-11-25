'use strict';
const express = require('express'),
      router = express.Router(),
      crypto = require('crypto'),
      request = require('request'),
      Parser = require('rss-parser'),
      parseFavicon = require('parse-favicon').parseFavicon,
      generateRSAKeypair = require('generate-rsa-keypair');

router.get('/convert', function (req, res) {
  let db = req.app.get('db');
  console.log(req.query);
  let username = req.query.username;
  let feed = req.query.feed;
  // reject if username is invalid
  if (username.match(/^[a-zA-Z0-9_]+$/) === null) {
    return res.status(400).json('Invalid username! Only alphanumerics and underscore (_) allowed.');
  }
  // check to see if feed exists
  let result = db.prepare('select * from feeds where feed = ? or username = ?').get(feed, username);
  // see if we already have an entry for this feed
  if (result) {
    // return feed
    res.status(200).json(result);
  }
  else if(feed && username) {
    console.log('VALIDATING');
    // validate the RSS
    let parser = new Parser();
    parser.parseURL(feed, function(err, feedData) {
      if (err) {
        if (err.message === 'Status code 400') {
          err.message = `That doesn't look like a valid RSS feed. Check <a href="${feed}">the URL you provided</a> in a feed validator. You can <a href="https://validator.w3.org/feed/check.cgi?url=${feed}" target="_blank">click here</a> to pop up a test immediately.`
        }
        res.status(400).json({err: err.message});
      }
      else {
        console.log(feedData.title);
        console.log('end!!!!');
        res.status(200).json(feedData);
        let displayName = feedData.title;
        let description = feedData.description;
        let account = username;
        // create new user
        let db = req.app.get('db');
        let domain = req.app.get('domain');
        // create keypair
        var pair = generateRSAKeypair();
        getImage(feed, feedData, imageUrl => {
          let actorRecord = createActor(account, domain, pair.public, displayName, imageUrl, description);
          let webfingerRecord = createWebfinger(account, domain);
          const apikey = crypto.randomBytes(16).toString('hex');
          db.prepare('insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)').run( `${account}@${domain}`, JSON.stringify(actorRecord), apikey, pair.public, pair.private, JSON.stringify(webfingerRecord));
          let content = JSON.stringify(feedData);
          db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run( feed, username, content);
        });
      }
    });
  }
  else {
    res.status(404).json({msg: 'unknown error'});
  }
});

// https://portal.0svc.com/api/convert/douban/?feedid=1234567&username=abc_mirror
router.get('/convert/douban', function (req, res) {
  let db = req.app.get('db');
  console.log(req.query);
  let username = req.query.username;
  let feedid = req.query.feedid;
  let feed = `http://rsshub.0svc.com/douban/people/${feedid}/status/readable=true&showAuthorInTitle=false&showEmojiForRetweet=true`
  // reject if username is invalid
  if (username.match(/^[a-zA-Z0-9_]+$/) === null) {
    return res.status(400).json('Invalid username! Only alphanumerics and underscore (_) allowed.');
  }
  // check to see if feed exists
  let result = db.prepare('select * from feeds where feed = ? or username = ?').get(feed, username);
  // see if we already have an entry for this feed
  if (result) {
    // return feed
    res.status(200).json(result);
  }
  else if(feed && username) {
    console.log('VALIDATING');
    // validate the RSS
    let parser = new Parser();
    parser.parseURL(feed, function(err, feedData) {
      if (err) {
        if (err.message === 'Status code 400') {
          err.message = `That doesn't look like a valid RSS feed. Check <a href="${feed}">the URL you provided</a> in a feed validator. You can <a href="https://validator.w3.org/feed/check.cgi?url=${feed}" target="_blank">click here</a> to pop up a test immediately.`
        }
        res.status(400).json({err: err.message});
      }
      else {
        console.log(feedData.title);
        console.log('end!!!!');
        res.status(200).json(feedData);
        let displayName = feedData.title;
        let description = feedData.description;
        let account = username;
        // create new user
        let db = req.app.get('db');
        let domain = req.app.get('domain');
        // create keypair
        var pair = generateRSAKeypair();
        getImage(feed, feedData, imageUrl => {
          let actorRecord = createActor(account, domain, pair.public, displayName, imageUrl, description);
          let webfingerRecord = createWebfinger(account, domain);
          const apikey = crypto.randomBytes(16).toString('hex');
          db.prepare('insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)').run( `${account}@${domain}`, JSON.stringify(actorRecord), apikey, pair.public, pair.private, JSON.stringify(webfingerRecord));
          let content = JSON.stringify(feedData);
          db.prepare('insert or replace into feeds(feed, username, content) values(?, ?, ?)').run( feed, username, content);
        });
      }
    });
  }
  else {
    res.status(404).json({msg: 'unknown error'});
  }
});

function getImage(feed, feedData, cb) {
  let imageUrl = null;
  // if image exists set image
  if (feedData.image && feedData.image.url) {
    imageUrl = feedData.image.url;
    return cb(imageUrl);
  }
  // otherwise parse the HTML for the favicon
  else {
    let favUrl = new URL(feed);
    request(favUrl.origin, (err, resp, body) => {
      parseFavicon(body, {baseURI: favUrl.origin}).then(result => {
        if (result && result.length) {
          return cb(result[0].url);
        }
        else {
          return cb(null);
        }
      });
    });
  }
}

function createActor(name, domain, pubkey, displayName, imageUrl, description) {
  displayName = displayName || name;
  let actor =  {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    'id': `https://${domain}/u/${name}`,
    'type': 'Service',
    'preferredUsername': `${name}`,
    'inbox': `https://${domain}/api/inbox`,
    'followers': `https://${domain}/u/${name}/followers`,
    'name': displayName,
    'publicKey': {
      'id': `https://${domain}/u/${name}#main-key`,
      'owner': `https://${domain}/u/${name}`,
      'publicKeyPem': pubkey
    }
  };
  if (imageUrl) {
    actor.icon = {
      'type': 'Image',
      'mediaType': 'image/png',
      'url': imageUrl,
    };
  }
  if (description) {
    actor.summary = `<p>${description}</p>`;
  }
  return actor;
}

function createWebfinger(name, domain) {
  return {
    'subject': `acct:${name}@${domain}`,

    'links': [
      {
        'rel': 'self',
        'type': 'application/activity+json',
        'href': `https://${domain}/u/${name}`
      }
    ]
  };
}

module.exports = router;
