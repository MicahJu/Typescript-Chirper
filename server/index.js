const express = require('express');
const cors = require('cors');
const monk = require('monk');
const Filter = require('bad-words');
const rateLimit = require('express-rate-limit');

const app = express();

const db = monk(process.env.MONGO_URI || 'localhost/chirper');
const chirps = db.get('chirps');
const filter = new Filter();

app.enable('trust proxy');

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Chirper!'
  });
});

app.get('/chirps', (req, res, next) => {
  chirps
    .find()
    .then(chirps => {
      res.json(chirps);
    }).catch(next);
});

app.get('/v2/chirps', (req, res, next) => {
  // let skip = Number(req.query.skip) || 0;
  // let limit = Number(req.query.limit) || 10;
  let { skip = 0, limit = 5, sort = 'desc' } = req.query;
  skip = parseInt(skip) || 0;
  limit = parseInt(limit) || 5;

  skip = skip < 0 ? 0 : skip;
  limit = Math.min(50, Math.max(1, limit));

  Promise.all([
    chirps
      .count(),
    chirps
      .find({}, {
        skip,
        limit,
        sort: {
          created: sort === 'desc' ? -1 : 1
        }
      })
  ])
    .then(([ total, chirps ]) => {
      res.json({
        chirps,
        meta: {
          total,
          skip,
          limit,
          has_more: total - (skip + limit) > 0,
        }
      });
    }).catch(next);
});

function isValidChirp(chirp) {
  return chirp.name && chirp.name.toString().trim() !== '' && chirp.name.toString().trim().length <= 50 &&
    chirp.content && chirp.content.toString().trim() !== '' && chirp.content.toString().trim().length <= 140;
}

app.use(rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 1
}));

const createChirp = (req, res, next) => {
  if (isValidChirp(req.body)) {
    const chirp = {
      name: filter.clean(req.body.name.toString().trim()),
      content: filter.clean(req.body.content.toString().trim()),
      created: new Date()
    };

    chirps
      .insert(chirp)
      .then(createdChirp => {
        res.json(createdChirp);
      }).catch(next);
  } else {
    res.status(422);
    res.json({
      message: ' Name/Content are required! Name has 50 character limit. Content cannot be longer than 140 characters.'
    });
  }
};

app.post('/chirps', createdChirp);
app.post('/v2/chirps', createdChirp);

app.use((error, req, res, next) => {
  res.status(500);
  res.json({
    message: error.message
  });
});

app.listen(3000, () => {
  console.log('Listening on http://localhost:3000');
});