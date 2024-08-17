DROP DATABASE IF EXISTS memelaunch;
CREATE DATABASE memelaunch;
\c memelaunch
CREATE TABLE foo (
	id SERIAL PRIMARY KEY,
	datum TEXT
);
