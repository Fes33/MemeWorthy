--drop existing database in case there is one and create a new one
DROP DATABASE IF EXISTS memelaunch;
CREATE DATABASE memelaunch;

--connect to database
\c memelaunch

--create'decks' table
--this table will store the names of the decks
CREATE TABLE decks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

--create 'prompts' table
--these will actually contain the prompts and connect them back to the deck
CREATE TABLE prompts (
    id SERIAL PRIMARY KEY,
    deck_id INT REFERENCES decks(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL
);

--insert to the deck table the deck names
INSERT INTO decks (name) VALUES
    ('Everyday Situations'),
    ('Pop Culture & Trends'),
    ('Fantastical & Imaginative');

--insert prompts for deck 1
INSERT INTO prompts (deck_id, prompt) VALUES
    (1, 'A cat trying to use a computer'),
    (1, 'Someone trying to juggle fruit'),
    (1, 'A person dancing in the rain'),
    (1, 'A dog dressed as a superhero'),
    (1, 'A surprise party gone wrong'),
    (1, 'An epic fail while cooking'),
    (1, 'A toddler playing with a giant balloon'),
    (1, 'A person getting caught in a windstorm'),
    (1, 'An awkward family photo'),
    (1, 'Someone trying to fix a broken gadget'),
    (1, 'A pet trying to get a treat'),
    (1, 'A person reacting to a bad haircut'),
    (1, 'A group of friends doing karaoke'),
    (1, 'An over-the-top birthday celebration'),
    (1, 'A person on a shopping spree'),
    (1, 'A dog wearing sunglasses'),
    (1, 'An epic Halloween costume'),
    (1, 'A person trying to do yoga'),
    (1, 'A comical gym workout'),
    (1, 'A surprise proposal');

--insert prompts for deck 2
INSERT INTO prompts (deck_id, prompt) VALUES
    (2, 'A celebrity’s embarrassing moment'),
    (2, 'A viral dance challenge'),
    (2, 'A fictional character’s awkward encounter'),
    (2, 'An epic movie scene reenacted'),
    (2, 'A meme come to life'),
    (2, 'A new fashion trend gone wrong'),
    (2, 'A popular TV show’s dramatic scene'),
    (2, 'A funny TikTok challenge'),
    (2, 'A viral internet prank'),
    (2, 'A celebrity trying a new trend'),
    (2, 'An awkward red carpet moment'),
    (2, 'A famous sports blooper'),
    (2, 'A viral product commercial'),
    (2, 'An out-of-context interview moment'),
    (2, 'A legendary music video dance move'),
    (2, 'A celebrity’s quirky habit'),
    (2, 'A meme-worthy reaction'),
    (2, 'A popular book’s unexpected twist'),
    (2, 'A fictional tech gadget in action'),
    (2, 'A famous quote taken literally');

--insert prompts for deck 3
INSERT INTO prompts (deck_id, prompt) VALUES
    (3, 'A dragon learning to fly'),
    (3, 'An alien’s first visit to Earth'),
    (3, 'A wizard casting a spell'),
    (3, 'A robot trying to dance'),
    (3, 'A mermaid’s underwater adventure'),
    (3, 'A time traveler’s surprise'),
    (3, 'A magical creature’s mischief'),
    (3, 'A superhero’s daily routine'),
    (3, 'A fairytale character in the modern world'),
    (3, 'A pirate searching for treasure'),
    (3, 'An enchanted forest’s secret'),
    (3, 'A mythical creature’s selfie'),
    (3, 'A space explorer’s discovery'),
    (3, 'A ghost haunting a new place'),
    (3, 'A futuristic cityscape'),
    (3, 'A talking animal’s adventure'),
    (3, 'A superhero’s funny sidekick'),
    (3, 'A magical duel between wizards'),
    (3, 'A time machine malfunction'),
    (3, 'An alien’s first taste of Earth food');
