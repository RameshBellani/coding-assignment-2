const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const getFollowingPeoplesIdsOfUser = async (username) => {
  const getFollowerPeopleQuery = `SELECT following_user_id FROM follower
    INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE user.username = '${username}';`;

  const followingPeoples = await db.all(getFollowerPeopleQuery);
  const arrayOfIds = followingPeoples.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken) {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `SELECT * FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
    WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//api 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO user (name, username, password, gender)
            VALUES (
                '${name}',
                '${username}',
                '${hashPassword}',
                '${gender}'
            );`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

//api 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username, userId: dbUser.userId };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//api 3

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const followingUserIds = await getFollowingPeoplesIdsOfUser(username);

    const getTweetsFeedQuery = `SELECT 
    username,tweet,date_time AS dateTime
    FROM
    user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE
       user.user_id IN (${followingUserIds})
        ORDER BY 
        date_time DESC
        LIMIT 4;`;
    const tweetFeedArray = await db.all(getTweetsFeedQuery);
    response.send(tweetFeedArray);
  }
);

//api 4

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const userFollowsQuery = `SELECT name
    FROM 
        follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE
        follower_user_id = '${userId}';`;
  const userFollowerArray = await db.all(userFollowsQuery);
  response.send(userFollowerArray);
});

//api 5

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username, userId } = request;

  const userFollowsQuery = `SELECT DISTINCT name
    FROM 
        follower INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE
        following_user_id = '${userId}';`;
  const userFollowerArray = await db.all(userFollowsQuery);
  response.send(userFollowerArray);
});

//api 6

app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;

    const getTweetDetailsQuery = `SELECT tweet,
    (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
    date_time AS dateTime
    FROM tweet
    WHERE tweet.tweet_id = '${tweetId}';
      `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  }
);

//api 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikedUSerQuery = `SELECT username FROM 
    user INNER JOIN like ON user.user_id = like.user_id
    WHERE 
    tweet_id = '${tweetId}';`;
    const likedUsers = await db.all(getLikedUSerQuery);
    const usersArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: usersArray });
  }
);

// api 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    getReplayedUserQuery = `SELECT name, reply FROM 
    user INNER JOIN reply ON user.user_id = reply.user_id
     WHERE
     tweet_id = '${tweetId}';`;
    const repliedUser = await db.all(getReplayedUserQuery);
    response.send({ replies: repliedUser });
  }
);

// api 9

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { userId } = request;
  const getTweetDetailsQuery = `SELECT tweet,
      COUNT(DISTINCT like_id) AS likes,
      COUNT(DISTINCT reply_id) AS replies,
      date_time AS dateTime
      FROM
      tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      WHERE tweet.user_id = ${userId}
      GROUP BY 
      tweet.tweet_id;`;
  const tweetsDetails = await db.all(getTweetDetailsQuery);
  response.send(tweetsDetails);
});

//api 10

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");

  const postQuery = `INSERT INTO tweet(tweet, user_id, date_time)
    VALUES
    ('${tweet}', '${userId}', '${dateTime}');`;
  await db.run(postQuery);
  response.send("Created a Tweet");
});

//api 11

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const selectUserQuery = `SELECT * FROM tweet WHERE
    user_id = '${userId}' AND tweet_id = '${tweetId}';`;
    const tweetUser = await db.get(selectUserQuery);

    if (tweetUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet
        WHERE 
    tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
