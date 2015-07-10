var _ = require('lodash');
var fs = require('fs');
var models = require('../census/models');
var moment = require('moment');
var Promise = require('bluebird');
var csv = require('csv');
var uuid = require('node-uuid');
var validator = require('validator');
var submissionsData = fs.readFileSync(process.argv[2], {encoding: 'utf-8'});
var questions = [
  'exists',
  'digital',
  'public',
  'machinereadable',
  'bulk',
  'openlicense',
  'uptodate',
  'online',
  'free',
  'url',
  'format',
  'licenseurl',
  'dateavailable',
  'officialtitle',
  'publisher',
  'qualityinfo',
  'qualitystructure',
  'details'
];

var anonymousUserId = '0e7c393e-71dd-4368-93a9-fcfff59f9fff';
var userQuery = models.User.findAll();


userQuery
  .then(function(users) {

    csv.parse(submissionsData, {columns: true}, function(R, D) {

      console.log('Submission count:');
      console.log(D.length);

      Promise.each(D, function(obj) {

        var submissionData = {},
            normalized_timestamp,
            subId,
            subName,
            submitter,
            revId,
            revName,
            reviewer,
            revLookup;

        // fix old ids that are ints as strings
        if (!validator.isUUID(obj.submissionid, 4)) {
          obj.submissionid = uuid.v4();
        }

        // normalize timestamps
        normalized_timestamp = moment(obj.timestamp.trim());
        if (normalized_timestamp.format() === "Invalid date") {
          normalized_timestamp = moment(obj.timestamp.trim(), 'DD/MM/YYYY HH:mm:ss');
        }
        obj.timestamp = normalized_timestamp.format();

        // assign year correctly to fix old issues with mistmatched submission timestamp + year
        if (normalized_timestamp.year() <= 2013) {
          obj.year = 2013;
        } else {
          obj.year = normalized_timestamp.year();
        }

        // manipulate the submitter and reviewer data so we can reference the User table
        // submitter can be anonymous, and we created an anonymous user for this
        // backwards compat of anonymous
        // reviewer can be empty, as some submissions can immediately become entries.
        // in this case, we set the reviewer to the same user as the submitter.
        subId = obj.submitterid.split(':');
        subName = obj.submitter.split(' ');
        revId = obj.reviewerid.split(':');
        revName = obj.reviewer.split(' ');

        // resolve our info on submitters and reviewers into user objects
        if (subId[1] === 'anonymous' || subId[0] === '') {
          submitter = _.find(users, function(user) {return user.id === anonymousUserId;});
        } else {
          submitter = _.find(users, function(user) {return user.providers === {'google': subId[1]};});
        }

        if (!revId[0]) {
          revLookup = subId[1];
        } else {
          revLookup = revId[1];
        }

        if (revLookup === 'anonymous' || revId[0] === '' && subId[0] === '') {
          reviewer = _.find(users, function(user) {return user.id === anonymousUserId;});
        } else {
          reviewer = _.find(users, function(user) {return user.providers === {'google': revLookup};});
        }

        // now let's explicitly set the data we want to save
        submissionData.id = obj.submissionid;
        submissionData.site = obj.censusid;
        submissionData.createdAt = obj.timestamp;
        submissionData.year = obj.year;
        submissionData.place = obj.place;
        submissionData.dataset = obj.dataset;
        submissionData.answers = _.chain(questions).map(function(Q) { return [Q, obj[Q]]; }).object().value();
        submissionData.submissionNotes = obj.details;
        submissionData.reviewed = parseInt(obj.reviewed) === 1;
        submissionData.reviewResult = obj.reviewresult === 'accepted';
        submissionData.reviewComments = obj.reviewcomments;
        submissionData.details = obj.details;
        submissionData.isCurrent = false;
        submissionData.submitter = submitter;
        submissionData.reviewer = reviewer;

        return models.Entry.create(submissionData)
          .then(function(entry) {

            console.log('saved new entry');
            console.log(entry.createdAt);
            console.log(' --- ');

          })
          .catch(function(error) {console.log('error::::');console.log(error);});

      });

    });

  })
  .catch(function(error) {console.log(error);});