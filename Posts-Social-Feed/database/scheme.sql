
CREATE DATABASE IF NOT EXISTS vybe_social_feed;

USE vybe_social_feed;

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FOLLOWERS TABLE
CREATE TABLE IF NOT EXISTS follows (
    follower_id INT NOT NULL,
    followed_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (follower_id, followed_id),

    FOREIGN KEY (follower_id)
        REFERENCES users(id) ON DELETE CASCADE,

    FOREIGN KEY (followed_id)
        REFERENCES users(id) ON DELETE CASCADE
);

-- POSTS TABLE
CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    caption TEXT,
    media_filename VARCHAR(255),
    media_type VARCHAR(100),
    share_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

-- LIKES TABLE
CREATE TABLE IF NOT EXISTS likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_post_like (post_id, user_id),

    FOREIGN KEY (post_id)
        REFERENCES posts(id) ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

-- COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (post_id)
        REFERENCES posts(id) ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);

-- DEMO USERS
INSERT IGNORE INTO users
(id, username, display_name)
VALUES
(1, 'vybe_user', 'You'),
(2, 'alexm', 'Alex Morgan'),
(3, 'sophial', 'Sophia Lee');

-- DEMO FOLLOWING
INSERT IGNORE INTO follows
(follower_id, followed_id)
VALUES
(1, 2),
(1, 3);

-- SAMPLE POSTS
INSERT INTO posts (user_id, caption)
SELECT 2, 'A little progress every day adds up to big results!'
WHERE NOT EXISTS (
    SELECT 1 FROM posts WHERE user_id = 2
);

INSERT INTO posts (user_id, caption)
SELECT 3, 'Collect moments, not things. What made you smile today?'
WHERE NOT EXISTS (
    SELECT 1 FROM posts WHERE user_id = 3
);
