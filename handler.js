'use strict';

const sugoi = require('sugoi-search').default;
const aws = require('aws-sdk');
const _ = require('lodash');
const dateformat = require('dateformat');
const sprintf = require('sprintf-js').sprintf;
const Bucket = 'snapshot-mmd-kancolle';
const TopicArn = 'arn:aws:sns:us-east-1:009775665146:snapshot-fetch-trigger';

module.exports.register = (event, context, cb) => {
  const date = dateformat(new Date(), 'yyyy-mm-dd');
  const word = 'MMD艦これ';
  const sns = new aws.SNS();

  const publish = (word, date, page) => {
    return new Promise((resolve, reject) => {
      const Message = JSON.stringify({ word, date, page});

      sns.publish({ Message, TopicArn }, function(err, res) {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  };

  Promise.all(_.range(0, 50).map(i => publish(word, date, i + 1)))
    .then(() => cb(null, { message: 'registered' }))
    .catch(err => cb(err, {}));
};

module.exports.fetch = (event, context, cb) => {
  const message = JSON.parse(event.Records[0].Sns.Message);
  const search = sugoi.tag(message.word).page(message.page || 1);
  const s3 = new aws.S3();

  return search.then(videos => {
    const Key = sprintf('%s/%02d.json', message.date, message.page);
    const Body = JSON.stringify(videos);
    const ACL = 'public-read';
    const ContentType = 'application/json';

    s3.putObject({Bucket, Key, Body, ACL, ContentType}, (err, res) => {
      cb(err, videos);
    });
  });
};
