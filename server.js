require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Проверяем подключение при запуске
pool.connect(async (err, client, release) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Successfully connected to database');
    
    try {
        // Создаем таблицы если они не существуют
        await client.query(`
            CREATE TABLE IF NOT EXISTS Users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                telegram_id INTEGER,
                rating NUMERIC(12,8) DEFAULT 1500,
                rd NUMERIC(12,8) DEFAULT 350,
                volatility NUMERIC(8,8) DEFAULT 0.06,
                status BOOLEAN DEFAULT true
            );

            CREATE TABLE IF NOT EXISTS Settings (
                id SERIAL PRIMARY KEY,
                setting VARCHAR(255),
                meaning NUMERIC(10,3)
            );

            CREATE TABLE IF NOT EXISTS Tags (
                id SERIAL PRIMARY KEY,
                tag VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS Types (
                id SERIAL PRIMARY KEY,
                type VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS Puzzles (
                id SERIAL PRIMARY KEY,
                unique_task INTEGER,
                rating NUMERIC(12,8) DEFAULT 1500,
                rd NUMERIC(12,8) DEFAULT 350,
                volatility NUMERIC(8,8) DEFAULT 0.06,
                number INTEGER DEFAULT 0,
                fen1 VARCHAR(255),
                move1 VARCHAR(10),
                fen2 VARCHAR(255),
                move2 VARCHAR(10),
                solution BOOLEAN,
                type_id INTEGER REFERENCES Types(id),
                color BOOLEAN
            );

            CREATE TABLE IF NOT EXISTS Puzzles_Tags (
                id SERIAL PRIMARY KEY,
                puzzle_id INTEGER REFERENCES Puzzles(id),
                tag_id INTEGER REFERENCES Tags(id)
            );

            CREATE TABLE IF NOT EXISTS Complexity (
                id SERIAL PRIMARY KEY,
                complexity_type VARCHAR(255)
            );

            CREATE TABLE IF NOT EXISTS Journal (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES Users(id),
                puzzle_id INTEGER REFERENCES Puzzles(id),
                success BOOLEAN,
                time_success NUMERIC(5,2),
                puzzle_rating_before NUMERIC(12,8),
                user_rating_after NUMERIC(12,8),
                complexity_id INTEGER REFERENCES Complexity(id),
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Добавляем базовые типы если их нет
        await client.query(`
            INSERT INTO Types (type) VALUES 
            ('missed'),
            ('usual'),
            ('fake'),
            ('worst'),
            ('best'),
            ('not defense')
            ON CONFLICT DO NOTHING;
        `);

        // Добавляем базовые уровни сложности если их нет
        await client.query(`
            INSERT INTO Complexity (complexity_type) VALUES 
            ('easy'),
            ('medium'),
            ('hard')
            ON CONFLICT DO NOTHING;
        `);

        // Добавляем базовые настройки если их нет
        await client.query(`
            INSERT INTO Settings (setting, meaning) VALUES 
            ('normal_time', 60),
            ('tau', 0.5),
            ('epsilon', 0.000001)
            ON CONFLICT DO NOTHING;
        `);

        // Добавляем тестового пользователя если его нет
        await client.query(`
            INSERT INTO Users (username, rating, rd, volatility, status)
            VALUES ('test_user', 1500, 350, 0.06, true)
            ON CONFLICT (username) DO NOTHING;
        `);

        // Проверяем, есть ли задачи в базе
        const puzzlesCount = await client.query('SELECT COUNT(*) FROM Puzzles');
        if (parseInt(puzzlesCount.rows[0].count) === 0) {
            // Добавляем базовые тестовые задачи только если таблица пустая
            await client.query(`
                INSERT INTO Puzzles (fen1, move1, fen2, move2, solution, type_id, color, rating, rd, volatility, number) VALUES
                ('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', 'h5f7', 'e8f7', '', true, (SELECT id FROM Types WHERE type = 'usual'), true, 1500, 350, 0.06, 0),
                ('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', 'f3e5', 'c6e5', '', false, (SELECT id FROM Types WHERE type = 'missed'), false, 1500, 350, 0.06, 0),
                ('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', 'f1c4', 'd7d6', '', true, (SELECT id FROM Types WHERE type = 'best'), true, 1500, 350, 0.06, 0)
            `);
            console.log('Added initial test puzzles');
        }

    } catch (err) {
        console.error('Error initializing database:', err);
        console.error(err.stack);
    } finally {
        release();
    }
});

// Добавляем обработчик ошибок для пула
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Функция для проверки доступа пользователя
async function checkUserAccess(username) {
    try {
        const result = await pool.query(
            'SELECT username FROM Users WHERE username = $1',
            [username]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking user access:', err);
        return false;
    }
}

// Временно заменяем функцию generatePuzzlesList для отладки
async function generatePuzzlesList() {
    try {
        const result = await pool.query('SELECT * FROM Puzzles');
        console.log(`Found ${result.rows.length} puzzles in database`);
        
        if (result.rows.length === 0) {
            console.warn('No puzzles found in Puzzles table!');
            await initializePuzzles();
            return pool.query('SELECT * FROM Puzzles');
        }
        
        return result.rows;
    } catch (err) {
        console.error('Error getting puzzles from database:', err);
        console.error(err.stack);
        throw err;
    }
}

// Упрощаем generateRandomPuzzle, так как он больше не нужен
async function generateRandomPuzzle() {
    // Эта функция больше не используется
    throw new Error('Use findPuzzleForUser instead');
}

// Функция для проверки, пытался ли пользователь решить задачу
async function hasPuzzleAttempt(username, fen) {
    try {
        const result = await pool.query(
            'SELECT id FROM PuzzleAttempts WHERE username = $1 AND puzzle_fen = $2',
            [username, fen]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking puzzle attempt:', err);
        return false;
    }
}

// Функция для получения нерешенных задач (упрощенная версия)
async function getUnsolvedPuzzles(username) {
    try {
        console.log(`Getting unsolved puzzles for user: ${username}`);
        
        // Получаем все попытки пользователя
        const attemptedResult = await pool.query(
            'SELECT puzzle_fen FROM PuzzleAttempts WHERE username = $1',
            [username]
        );
        const attemptedFens = attemptedResult.rows.map(row => row.puzzle_fen);
        console.log(`User has attempted ${attemptedFens.length} puzzles`);
        
        // Получаем все доступные задачи
        const puzzles = await generatePuzzlesList();
        console.log(`Total available puzzles: ${puzzles.length}`);
        
        // Возвращаем только те задачи, которые пользователь еще не пытался решить
        const unsolvedPuzzles = puzzles.filter(puzzle => !attemptedFens.includes(puzzle.fen));
        console.log(`Unsolved puzzles: ${unsolvedPuzzles.length}`);
        
        return unsolvedPuzzles;
    } catch (err) {
        console.error('Error getting unsolved puzzles:', err);
        throw err;
    }
}

// Функция для инициализации базовых задач
async function initializePuzzles() {
    try {
        // Проверяем, есть ли уже задачи
        const count = await pool.query('SELECT COUNT(*) FROM Puzzles');
        if (count.rows[0].count === '0') {
            // Сбрасываем последовательность
            await pool.query('ALTER SEQUENCE puzzles_id_seq RESTART WITH 1');
            
            // Добавляем базовые задачи с разными цветами
            await pool.query(`
                INSERT INTO Puzzles (fen, move_1, move_2, solution, rating, rd, volatility, type, color, difficulty) VALUES
                ('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', 'h5f7', 'e8f7', 'Good', 1500, 350, 0.06, 'Good', 'w', 'normal'),
                ('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', 'f3e5', 'c6e5', 'Blunder', 1500, 350, 0.06, 'Blunder', 'b', 'normal'),
                ('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', 'f1c4', 'd7d6', 'Good', 1500, 350, 0.06, 'Good', 'w', 'normal')
            `);
            console.log('Added initial puzzles');
        }
    } catch (err) {
        console.error('Error initializing puzzles:', err);
    }
}

// Вызываем инициализацию при запуске
initializePuzzles();

// Обновляем функцию findPuzzleForUser
async function findPuzzleForUser(username) {
    try {
        console.log(`Finding puzzle for user: ${username}`);
        
        // Получаем ID пользователя
        const userResult = await pool.query(
            'SELECT id, rating FROM Users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }
        
        const userId = userResult.rows[0].id;
        const userRating = userResult.rows[0].rating;

        // Получаем случайную задачу в пределах ±300 от рейтинга пользователя,
        // которую пользователь еще не решал
        const result = await pool.query(
            `SELECT p.*, t.type as puzzle_type 
             FROM Puzzles p
             LEFT JOIN Types t ON p.type_id = t.id
             WHERE p.id NOT IN (
                 SELECT puzzle_id FROM Journal WHERE user_id = $1
             )
             AND p.rating BETWEEN $2 AND $3
             ORDER BY RANDOM()
             LIMIT 1`,
            [userId, userRating - 300, userRating + 300]
        );

        if (result.rows.length === 0) {
            // Если не нашли задачу в диапазоне, берем любую нерешенную
            const resultWider = await pool.query(
                `SELECT p.*, t.type as puzzle_type 
                 FROM Puzzles p
                 LEFT JOIN Types t ON p.type_id = t.id
                 WHERE p.id NOT IN (
                     SELECT puzzle_id FROM Journal WHERE user_id = $1
                 )
                 ORDER BY RANDOM()
                 LIMIT 1`,
                [userId]
            );

            if (resultWider.rows.length === 0) {
                // Если все задачи решены, очищаем историю старых решений
                await pool.query(
                    `DELETE FROM Journal 
                     WHERE user_id = $1 
                     AND id IN (
                         SELECT id FROM Journal 
                         WHERE user_id = $1 
                         ORDER BY date ASC 
                         LIMIT (SELECT COUNT(*)/2 FROM Journal WHERE user_id = $1)
                     )`,
                    [userId]
                );
                return findPuzzleForUser(username);
            }

            return resultWider.rows[0];
        }

        return result.rows[0];
    } catch (err) {
        console.error('Error in findPuzzleForUser:', err);
        throw err;
    }
}

// Функция для инициализации рейтинга нового пользователя
async function initializeUserRating(username) {
    try {
        const result = await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility)
            VALUES ($1, 0, true, 0, 1500, 350, 0.06)
            RETURNING rating, rd, volatility`,
            [username]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error initializing user rating:', err);
        throw err;
    }
}

// Обновляем функцию getUserRating
async function getUserRating(username) {
    try {
        // Получаем пользователя по username
        const userResult = await pool.query(
            'SELECT id, rating, rd, volatility FROM Users WHERE username = $1',
            [username]
        );

        // Если пользователь не найден, создаем нового
        if (userResult.rows.length === 0) {
            const newUser = await pool.query(
                `INSERT INTO Users (username, rating, rd, volatility, status) 
                 VALUES ($1, 1500, 350, 0.06, true) 
                 RETURNING id, rating, rd, volatility`,
                [username]
            );
            return newUser.rows[0];
        }

        return userResult.rows[0];
    } catch (err) {
        console.error('Error getting user rating:', err);
        throw err;
    }
}

// Функция для получения рейтинга задачи
async function getPuzzleRating(puzzleId) {
    try {
        const result = await pool.query(
            'SELECT rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        
        if (result.rows.length === 0) {
            throw new Error('Puzzle not found');
        }
        
        return {
            rating: result.rows[0].rating,
            rd: result.rows[0].rd,
            volatility: result.rows[0].volatility
        };
    } catch (err) {
        console.error('Error getting puzzle rating:', err);
        throw err;
    }
}

// Функция для получения настроек
async function getSettings() {
    try {
        const result = await pool.query('SELECT * FROM Settings');
        if (result.rows.length === 0) {
            return {
                normal_time: 60,
                tau: 0.5,
                epsilon: 0.000001
            };
        }
        return result.rows.reduce((acc, row) => {
            acc[row.parameter_name] = row.parameter_value;
            return acc;
        }, {});
    } catch (err) {
        console.error('Error getting settings:', err);
        throw err;
    }
}

// Обновляем функцию recordPuzzleSolution
async function recordPuzzleSolution(username, puzzleId, success, time) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Starting transaction for solution recording');

        // Получаем ID пользователя и его текущий рейтинг
        const userResult = await client.query(
            'SELECT id, rating, rd, volatility FROM Users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            throw new Error(`User ${username} not found`);
        }

        const userId = userResult.rows[0].id;
        const userRating = userResult.rows[0];

        // Получаем информацию о задаче
        const puzzleResult = await client.query(
            'SELECT rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );

        if (puzzleResult.rows.length === 0) {
            throw new Error(`Puzzle ${puzzleId} not found`);
        }

        const puzzleRating = puzzleResult.rows[0];
        console.log('Current ratings:', { user: userRating, puzzle: puzzleRating });

        // Рассчитываем новые рейтинги
        const newRatings = calculateNewRatings(userRating, puzzleRating, success ? 1 : 0);
        console.log('New ratings calculated:', newRatings);

        // Обновляем рейтинг пользователя
        await client.query(
            `UPDATE Users 
             SET rating = $1, rd = $2, volatility = $3 
             WHERE id = $4`,
            [newRatings.userRating, newRatings.userRD, newRatings.userVolatility, userId]
        );

        // Обновляем рейтинг задачи
        await client.query(
            `UPDATE Puzzles 
             SET rating = $1, rd = $2, volatility = $3, number = number + 1 
             WHERE id = $4`,
            [newRatings.puzzleRating, newRatings.puzzleRD, newRatings.puzzleVolatility, puzzleId]
        );

        // Определяем сложность на основе времени
        const complexityType = time < 30 ? 'easy' : time < 90 ? 'medium' : 'hard';
        
        // Записываем результат в журнал
        await client.query(
            `INSERT INTO Journal 
             (user_id, puzzle_id, success, time_success, puzzle_rating_before, user_rating_after, complexity_id) 
             VALUES ($1, $2, $3, $4, $5, $6, 
                    (SELECT id FROM Complexity WHERE complexity_type = $7))`,
            [
                userId,
                puzzleId,
                success,
                time,
                puzzleRating.rating,
                newRatings.userRating,
                complexityType
            ]
        );

        await client.query('COMMIT');
        console.log('Transaction committed successfully');
        
        return {
            userRating: newRatings.userRating,
            userRD: newRatings.userRD,
            userVolatility: newRatings.userVolatility
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in recordPuzzleSolution:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Обновляем функцию calculateNewRatings без жесткого ограничения
function calculateNewRatings(userRating, puzzleRating, R) {
    // Константы
    const q = Math.log(10) / 400;
    const c = 34.6;
    
    // Шаг 1: Определение отклонения рейтинга (RD)
    const RD = Math.min(Math.sqrt(userRating.rd * userRating.rd + c * c), 350);
    
    // Шаг 2: Определение нового рейтинга
    const g = 1 / Math.sqrt(1 + 3 * q * q * puzzleRating.rd * puzzleRating.rd / (Math.PI * Math.PI));
    const E = 1 / (1 + Math.pow(10, g * (userRating.rating - puzzleRating.rating) / -400));
    const d2 = 1 / (q * q * g * g * E * (1 - E));
    
    // Вычисляем изменение рейтинга без ограничений
    const ratingChange = (q / (1 / (RD * RD) + 1 / d2)) * g * (R - E);
    
    // Новый рейтинг без ограничения
    const newRating = userRating.rating + ratingChange;
    
    // Шаг 3: Определение нового отклонения рейтинга
    const newRD = Math.sqrt(1 / (1 / (RD * RD) + 1 / d2));
    
    return {
        userRating: newRating,
        userRD: newRD,
        userVolatility: userRating.volatility
    };
}

// API endpoints
app.get('/api/user-rating/:username', async (req, res) => {
    try {
        const result = await getUserRating(req.params.username);
        res.json({
            rating: result.rating,
            rd: result.rd,
            volatility: result.volatility
        });
    } catch (err) {
        console.error('Error getting user rating:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/check-access/:username', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT status FROM Users WHERE username = $1',
            [req.params.username]
        );
        res.json({ hasAccess: result.rows.length > 0 && result.rows[0].status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/random-puzzle/:username', async (req, res) => {
    try {
        const username = req.params.username;
        console.log(`Getting random puzzle for user: ${username}`);
        
        // Получаем случайную задачу
        const puzzle = await findPuzzleForUser(username);
        
        if (!puzzle) {
            throw new Error('No available puzzles found');
        }

        // Преобразуем boolean в строку для solution и color
        const response = {
            ...puzzle,
            solution: puzzle.solution ? 'Good' : 'Blunder',
            color: puzzle.color ? 'w' : 'b'
        };

        res.json(response);
    } catch (err) {
        console.error('Error in /api/random-puzzle:', err);
        res.status(500).json({ 
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

app.post('/api/record-solution', async (req, res) => {
    try {
        const { username, puzzleId, success, time } = req.body;
        console.log('Received solution data:', { username, puzzleId, success, time });
        
        // Проверяем наличие всех необходимых параметров
        if (!username || puzzleId === undefined || success === undefined || time === undefined) {
            console.log('Missing parameters:', { username, puzzleId, success, time });
            return res.status(400).json({ 
                error: 'Missing required parameters',
                received: { username, puzzleId, success, time }
            });
        }

        // Проверяем существование пользователя
        const userExists = await pool.query('SELECT id FROM Users WHERE username = $1', [username]);
        if (userExists.rows.length === 0) {
            // Если пользователя нет, создаем его
            await pool.query(
                'INSERT INTO Users (username, rating, rd, volatility, status) VALUES ($1, 1500, 350, 0.06, true)',
                [username]
            );
        }

        // Проверяем существование задачи
        const puzzleExists = await pool.query('SELECT id FROM Puzzles WHERE id = $1', [puzzleId]);
        if (puzzleExists.rows.length === 0) {
            return res.status(404).json({ error: 'Puzzle not found' });
        }

        const result = await recordPuzzleSolution(username, puzzleId, success, time);
        
        res.json({
            status: 'success',
            rating: result.userRating,
            rd: result.userRD,
            volatility: result.userVolatility
        });
    } catch (err) {
        console.error('Error in /api/record-solution:', err);
        res.status(500).json({ 
            error: 'Internal server error',
            message: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Добавляем обработку favicon.ico
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Добавляем раздачу статических файлов
app.use(express.static(path.join(__dirname)));

// Добавляем маршрут для index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Добавляем функцию getSettings
async function getSettings() {
    try {
        const result = await pool.query('SELECT * FROM Settings LIMIT 1');
        return result.rows[0] || { normal_time: 60 };
    } catch (err) {
        console.error('Error getting settings:', err);
        return { normal_time: 60 };
    }
}

// Добавляем функцию getPuzzleRating
async function getPuzzleRating(puzzleId) {
    try {
        const result = await pool.query(
            'SELECT rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error getting puzzle rating:', err);
        throw err;
    }
}

// Функция проверки данных от Telegram
function validateTelegramWebAppData(telegramInitData) {
    const initData = new URLSearchParams(telegramInitData);
    const hash = initData.get('hash');
    const botToken = process.env.BOT_TOKEN; // Токен вашего бота

    // Удаляем hash из проверяемых данных
    initData.delete('hash');
    
    // Сортируем оставшиеся поля
    const dataCheckString = Array.from(initData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Создаем HMAC-SHA256
    const secret = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
    
    const calculatedHash = crypto.createHmac('sha256', secret)
        .update(dataCheckString)
        .digest('hex');

    return calculatedHash === hash;
}

// Добавляем middleware для проверки авторизации
app.use('/api', (req, res, next) => {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData || !validateTelegramWebAppData(initData)) {
        // В режиме разработки пропускаем проверку
        if (process.env.NODE_ENV === 'development') {
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Добавляем тестовый эндпоинт для проверки БД
app.get('/api/test-db', async (req, res) => {
    try {
        // Проверяем подключение к БД
        const dbCheck = await pool.query('SELECT NOW()');
        
        // Проверяем основные таблицы
        const tablesCheck = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as users_count,
                (SELECT COUNT(*) FROM puzzles) as puzzles_count,
                (SELECT COUNT(*) FROM types) as types_count,
                (SELECT COUNT(*) FROM tags) as tags_count,
                (SELECT COUNT(*) FROM puzzles_tags) as puzzles_tags_count,
                (SELECT COUNT(*) FROM journal) as journal_count,
                (SELECT COUNT(*) FROM complexity) as complexity_count,
                (SELECT COUNT(*) FROM settings) as settings_count
        `);
        
        res.json({
            status: 'success',
            timestamp: dbCheck.rows[0].now,
            tables: tablesCheck.rows[0]
        });
    } catch (err) {
        console.error('Database test failed:', err);
        res.status(500).json({
            status: 'error',
            message: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Изменим порт на переменную окружения
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Функция для проверки, решал ли пользователь эту задачу
async function isPuzzleSolved(username, fen) {
    try {
        const result = await pool.query(
            'SELECT id FROM SolvedPuzzles WHERE username = $1 AND puzzle_fen = $2',
            [username, fen]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error checking solved puzzle:', err);
        return false;
    }
}

// Обновляем функцию markPuzzleAsSolved, чтобы она возвращала Promise
async function markPuzzleAsSolved(username, fen) {
    try {
        await pool.query(
            `INSERT INTO SolvedPuzzles (username, puzzle_fen) 
             VALUES ($1, $2) 
             ON CONFLICT (username, puzzle_fen) DO NOTHING`,
            [username, fen]
        );
        console.log(`Marked puzzle ${fen} as solved for user ${username}`);
    } catch (err) {
        console.error('Error marking puzzle as solved:', err);
        throw err; // Пробрасываем ошибку дальше
    }
}

// Функция для расчёта нового отклонения рейтинга (RD) по алгоритму Глико
function calculateNewRD(RD0, t, c = 34.6) {
    // Формула: RD = min(sqrt(RD0^2 + c^2*t), 350)
    const newRD = Math.sqrt(Math.pow(RD0, 2) + Math.pow(c, 2) * t);
    return Math.min(newRD, 350);
}

// Константа q для алгоритма Глико
const q = Math.log(10) / 400; // = 0.00575646273

// Функция g(RD) для алгоритма Глико
function g(RD) {
    return 1 / Math.sqrt(1 + 3 * q * q * RD * RD / (Math.PI * Math.PI));
}

// Функция E для алгоритма Глико
function E(r0, ri, RDi) {
    return 1 / (1 + Math.pow(10, (-g(RDi) * (r0 - ri)) / 400));
}

// Функция для расчёта d^2
function calculateD2(opponents) {
    let sum = 0;
    for (const opp of opponents) {
        const gRD = g(opp.RD);
        const eValue = E(opp.r, opp.r0, opp.RD);
        sum += Math.pow(gRD, 2) * eValue * (1 - eValue);
    }
    return 1 / (Math.pow(q, 2) * sum);
}

// Функция для расчёта нового рейтинга
function calculateNewRating(r0, RD, opponents) {
    // Рассчитываем d^2
    const d2 = calculateD2(opponents);
    
    // Рассчитываем сумму в числителе
    let sum = 0;
    for (const opp of opponents) {
        sum += g(opp.RD) * (opp.s - E(r0, opp.r, opp.RD));
    }
    
    // Рассчитываем новый рейтинг по формуле
    const newRating = r0 + (q / (1/Math.pow(RD, 2) + 1/d2)) * sum;
    
    return newRating;
}

// Функция для расчёта нового отклонения рейтинга по Глико-2
function calculateNewRDPrime(RD, d2) {
    // Формула: RD' = sqrt(1 / (1/RD² + 1/d²))
    return Math.sqrt(1 / (1/Math.pow(RD, 2) + 1/d2));
}

// Функция g(φ) для Глико-2
function gPhi(phi) {
    return 1 / Math.sqrt(1 + 3 * Math.pow(phi, 2) / (Math.PI * Math.PI));
}

// Функция E(μ, μj, φj) для Глико-2
function expectation(mu, muJ, phiJ) {
    return 1 / (1 + Math.exp(-gPhi(phiJ) * (mu - muJ)));
}

// Функция для вычисления v (вспомогательная величина)
function calculateV(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += Math.pow(gPhiJ, 2) * E * (1 - E);
    }
    return Math.pow(sum, -1);
}

// Функция для вычисления Δ (вспомогательная величина)
function calculateDelta(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += gPhiJ * (opp.s - E);
    }
    return calculateV(opponents, mu) * sum;
}

// Функция для преобразования рейтинга в шкалу Глико-2
function convertToGlicko2Scale(rating, rd) {
    const mu = (rating - 1500) / 173.7178;
    const phi = rd / 173.7178;
    return { mu, phi };
}

// Функция для преобразования обратно в шкалу рейтинга
function convertFromGlicko2Scale(mu, phi) {
    const rating = 173.7178 * mu + 1500;
    const rd = 173.7178 * phi;
    return { rating, rd };
}

// Константа τ для алгоритма Глико-2
const TAU = 0.2;
const EPSILON = 0.000001;

// Функция f(x) для итерационного процесса
function f(x, delta, phi, v, sigma2, tau2) {
    const ex = Math.exp(x);
    return (ex * (delta*delta - phi*phi - v - ex)) / (2 * Math.pow(phi*phi + v + ex, 2)) - (x - Math.log(sigma2)) / tau2;
}

// Функция для поиска значения A методом половинного деления
function findA(sigma, phi, v, delta) {
    const tau2 = TAU * TAU;
    const sigma2 = sigma * sigma;
    
    // Начальное значение a = ln(σ²)
    const a = Math.log(sigma2);
    
    // Находим подходящее значение для b
    let b;
    if (delta*delta > phi*phi + v) {
        b = Math.log(delta*delta - phi*phi - v);
    } else {
        k = 1;
        while (f(a - k * TAU, delta, phi, v, sigma2, tau2) < 0) {
            k = k + 1;
        }
        b = a - k * TAU;
    }
    
    // Метод половинного деления
    let c;
    let fa = f(a, delta, phi, v, sigma2, tau2);
    let fb = f(b, delta, phi, v, sigma2, tau2);
    
    while (Math.abs(b - a) > EPSILON) {
        c = (a + b) / 2;
        let fc = f(c, delta, phi, v, sigma2, tau2);
        if (fc * fa < 0) {
            b = c;
            fb = fc;
        } else {
            a = c;
            fa = fc;
        }
    }
    
    return (a + b) / 2;
}

// Функция для вычисления нового рейтинга μ'
function calculateNewMu(mu, phi, opponents) {
    let sum = 0;
    for (const opp of opponents) {
        sum += gPhi(opp.phi) * (opp.s - expectation(mu, opp.mu, opp.phi));
    }
    return mu + Math.pow(phi, 2) * sum;
}

// Функция для вычисления нового φ'
function calculateNewPhi(phi, sigma, v) {
    return 1 / Math.sqrt(1 / (phi*phi + sigma*sigma) + 1/v);
}

// Обновляем функцию updateRating для использования правильного алгоритма Глико-2
async function updateRating(username, puzzleId, success) {
    try {
        // Получаем текущий рейтинг пользователя
        const userRating = await getUserRating(username);
        
        // Получаем рейтинг задачи
        const puzzleRating = await getPuzzleRating(puzzleId);
        
        // Шаг 1: Преобразуем рейтинги в шкалу Глико-2
        const { mu: userMu, phi: userPhi } = convertToGlicko2Scale(userRating.rating, userRating.rd);
        const { mu: puzzleMu, phi: puzzlePhi } = convertToGlicko2Scale(puzzleRating.rating, puzzleRating.rd);
        
        // Формируем массив противников (в данном случае одна задача)
        const opponents = [{
            mu: puzzleMu,
            phi: puzzlePhi,
            s: success ? 1 : 0
        }];
        
        // Шаг 1: Вычисляем вспомогательные величины v и Δ
        const v = calculateV(opponents, userMu);
        const delta = calculateDelta(opponents, userMu);
        
        // Шаг 2: Вычисляем новую волатильность
        const sigma = userRating.volatility;
        const A = findA(sigma, userPhi, v, delta);
        const newVolatility = Math.exp(A/2);
        
        // Шаг 3: Вычисляем новое φ'
        const newPhi = calculateNewPhi(userPhi, newVolatility, v);
        
        // Шаг 4: Вычисляем новый рейтинг μ'
        const newMu = calculateNewMu(userMu, newPhi, opponents);
        
        // Преобразуем обратно в обычную шкалу
        const { rating: finalRating, rd: finalRD } = convertFromGlicko2Scale(newMu, newPhi);
        
        // Обновляем рейтинг в базе данных
        await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                username,
                puzzleId,
                success,
                0, // время пока не используем
                finalRating,
                Math.min(finalRD, 350),
                newVolatility
            ]
        );
        
        // Добавляем задачу в список решённых
        await markPuzzleAsSolved(username, puzzleRating.fen);
        
        // Возвращаем обновленные значения
        return {
            rating: finalRating,
            rd: Math.min(finalRD, 350),
            volatility: newVolatility
        };
    } catch (err) {
        console.error('Error updating rating:', err);
        throw err;
    }
}

// Обновляем функцию calculateV для точного соответствия формуле
function calculateV(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += Math.pow(gPhiJ, 2) * E * (1 - E);
    }
    return Math.pow(sum, -1);
}

// Обновляем функцию calculateDelta для точного соответствия формуле
function calculateDelta(opponents, mu) {
    let sum = 0;
    for (const opp of opponents) {
        const gPhiJ = gPhi(opp.phi);
        const E = expectation(mu, opp.mu, opp.phi);
        sum += gPhiJ * (opp.s - E);
    }
    return calculateV(opponents, mu) * sum;
}

// Обновляем функцию calculateNewPhi для точного соответствия формуле
function calculateNewPhi(phi, sigma, v) {
    return 1 / Math.sqrt(1 / (phi*phi + sigma*sigma) + 1/v);
}

// Обновляем функцию calculateNewMu для точного соответствия формуле
function calculateNewMu(mu, phi, opponents) {
    let sum = 0;
    for (const opp of opponents) {
        sum += gPhi(opp.phi) * (opp.s - expectation(mu, opp.mu, opp.phi));
    }
    return mu + Math.pow(phi, 2) * sum;
}
