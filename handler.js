'use strict';

const sugoi = require('sugoi-search').default;
const aws = require('aws-sdk');
const _ = require('lodash');
const dateformat = require('dateformat');
const sprintf = require('sprintf-js').sprintf;
const Bucket = 'snapshot-mmd-kancolle';
const TopicArn = 'arn:aws:sns:us-east-1:009775665146:snapshot-fetch-trigger';
const word = 'MMD艦これ';

module.exports.register = (event, context, cb) => {
  const date = dateformat(new Date(), 'yyyy-mm-dd');
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

module.exports.server = (event, context, cb) => {
  const s3 = new aws.S3();
  const date = event.pathParameters.date;
  const page = Number(event.queryStringParameters.page);

  const Key = sprintf('%s/%02d.json', date, page);
  const response = (json) => {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://www.nicovideo.jp',
        'Access-Control-Allow-Credentials': true
      },
      body: JSON.stringify({
        page,
        count: 3000,
        list: json,
        status: 'ok',
        tags: [word],
        has_ng_video_for_adsense_on_listing: true,
        is_tagrepo_target_tag: true,
        related_tags: []
      })
    };
  };

  s3.getObject({Bucket, Key}, (err, res) => {
    const body = JSON.parse(new Buffer(res.Body).toString());
    const json = body.map(item => {
      return {
        id: item.id,
        title: item.title,
        title_short: item.title,
        thumbnail_style: null,
        thumbnail_url: item.thumbnail,
        description_short: '',
        first_retrieve: item.created_at,
        is_middle_thumbnail: true,
        last_res_body: '',
        length: '1:00',
        mylist_counter: item.counts && item.counts.mylist || 0,
        num_res: item.counts && item.counts.comment || 0,
        view_counter: item.counts && item.counts.view || 0
      };
    });
    cb(null, response(json));
  });
};
