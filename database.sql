
-- =====================================
-- VYBE SOCIAL PLATFORM DATABASE
-- =====================================

CREATE DATABASE IF NOT EXISTS vybe_db;

USE vybe_db;


-- 1. USERS TABLE
-- Stores registered user accounts

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    username VARCHAR(50) NOT NULL UNIQUE,

    email VARCHAR(150) NOT NULL UNIQUE,

    password_hash VARCHAR(255) NOT NULL,

    bio TEXT,

    profile_image VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- 2. USER INTERESTS TABLE
-- Stores interests selected by each user

CREATE TABLE IF NOT EXISTS user_interests (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    interest VARCHAR(100) NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    UNIQUE KEY unique_user_interest (user_id, interest)
);


-- 3. POSTS TABLE
-- Stores posts created by registered users

CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    title VARCHAR(200) NOT NULL,

    content TEXT,

    category VARCHAR(100),

    likes INT DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- 4. FOLLOWS TABLE
-- Stores follower and following relationships

CREATE TABLE IF NOT EXISTS follows (
    id INT AUTO_INCREMENT PRIMARY KEY,

    follower_id INT NOT NULL,

    following_id INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_follow (follower_id, following_id),

    FOREIGN KEY (follower_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (following_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CHECK (follower_id <> following_id)
);


-- 5. COMMUNITIES TABLE
-- Stores communities created on VYBE

CREATE TABLE IF NOT EXISTS communities (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    description TEXT,

    category VARCHAR(100),

    created_by INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);


-- 6. COMMUNITY MEMBERS TABLE
-- Stores users who join communities

CREATE TABLE IF NOT EXISTS community_members (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    community_id INT NOT NULL,

    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_membership (user_id, community_id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (community_id)
        REFERENCES communities(id)
        ON DELETE CASCADE
);


-- 7. SEARCH INDEXES

CREATE INDEX idx_posts_category
ON posts(category);

CREATE INDEX idx_posts_likes
ON posts(likes);

CREATE INDEX idx_users_username
ON users(username);

CREATE INDEX idx_interests_user
ON user_interests(user_id);

CREATE INDEX idx_follows_follower
ON follows(follower_id);

CREATE INDEX idx_community_members
ON community_members(community_id);


-- DATABASE CREATED SUCCESSFULLY
