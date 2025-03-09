require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');
const app = express();

// Проверяем наличие необходимых переменных окружения
if (!process.env.NODE_ENV) {
    console.log('NODE_ENV not set, defaulting to development');
    process.env.NODE_ENV = 'development';
}

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
}

if (process.env.NODE_ENV !== 'development' && !process.env.BOT_TOKEN) {
    console.error('BOT_TOKEN is required in production mode');
    process.exit(1);
}

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data']
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
        console.log('Starting database initialization...');
        
        // Удаляем существующие таблицы
        console.log('Dropping existing tables...');
        await client.query(`
            DROP TABLE IF EXISTS Journal CASCADE;
            DROP TABLE IF EXISTS PuzzlesTags CASCADE;
            DROP TABLE IF EXISTS PuzzleAttempts CASCADE;
            DROP TABLE IF EXISTS SolvedPuzzles CASCADE;
            DROP TABLE IF EXISTS Puzzles CASCADE;
            DROP TABLE IF EXISTS Users CASCADE;
            DROP TABLE IF EXISTS Settings CASCADE;
            DROP TABLE IF EXISTS Tags CASCADE;
            DROP TABLE IF EXISTS Types CASCADE;
            DROP TABLE IF EXISTS Complexity CASCADE;
        `);
        console.log('Tables dropped successfully');

        // Создаем таблицы заново
        console.log('Creating new tables...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS Types (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS Tags (
                id SERIAL PRIMARY KEY,
                tag TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS Users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                telegram_id BIGINT,
                rating NUMERIC(12,8) DEFAULT 1500.00,
                rd NUMERIC(12,8) DEFAULT 350.00,
                volatility NUMERIC(8,8) DEFAULT 0.06000000,
                status BOOLEAN DEFAULT true,
                performance NUMERIC(12,8)
            );
            
            CREATE TABLE IF NOT EXISTS Puzzles (
                id SERIAL PRIMARY KEY,
                unique_task INTEGER NOT NULL,
                rating NUMERIC(12,8) DEFAULT 1500.0000,
                rd NUMERIC(12,8) DEFAULT 350.0000,
                volatility NUMERIC(8,8) DEFAULT 0.06000000,
                number INTEGER DEFAULT 0,
                fen1 TEXT NOT NULL,
                fen2 TEXT NOT NULL,
                move1 TEXT,
                move2 TEXT,
                solution BOOLEAN,
                type_id INTEGER REFERENCES Types(id),
                color BOOLEAN
            );
        `);
        console.log('Tables created successfully');

        // Добавляем типы
        console.log('Inserting types...');
        await client.query(`
            INSERT INTO Types (id, type) VALUES
            (1, 'лучший'),
            (2, 'защита'),
            (3, 'обычный'),
            (4, 'пропуск'),
            (5, 'фейк'),
            (6, 'нет защиты'),
            (7, 'подстава')
            ON CONFLICT (id) DO UPDATE 
            SET type = EXCLUDED.type;
        `);
        console.log('Types inserted successfully');

        // Добавляем тестового пользователя
        console.log('Inserting test user...');
        await client.query(`
            INSERT INTO Users (username, rating, rd, volatility, status) 
            VALUES ('test_user', 1500.00, 350.00, 0.06000000, true)
            ON CONFLICT (username) DO NOTHING;
        `);
        console.log('Test user inserted successfully');

        // Добавляем базовые задачи
        console.log('Inserting puzzles...');
        await client.query(`
            INSERT INTO Puzzles (id, unique_task, rating, rd, volatility, number, fen1, fen2, move1, move2, solution, type_id, color) VALUES
            (1, 1, 1500.0000, 350.0000, 0.06000000, 0, '2B5/2r5/1p1k2pp/p1r5/P1P2P2/6P1/2K4P/4R3 w - - 0 2', '2B5/2r5/1p1k2pp/p1r5/P1P2P2/6P1/2K4P/4R3 w - - 0 2', 'e7d6', 'c8a6', false, 4, true),
            (2, 2, 1500.0000, 350.0000, 0.06000000, 0, 'r1bqk2r/ppp1bpp1/2n2n2/6B1/4p3/2P2NPp/PPQNPP1P/R3KB1R w KQkq - 0 2', 'r1bqk2r/ppp1bpp1/2n2n2/6B1/4p3/2P2NPp/PPQNPP1P/R3KB1R w KQkq - 0 2', 'd5e4', 'd2e4', true, 3, true)
            ON CONFLICT (id) DO UPDATE 
            SET unique_task = EXCLUDED.unique_task,
                rating = EXCLUDED.rating,
                rd = EXCLUDED.rd,
                volatility = EXCLUDED.volatility,
                number = EXCLUDED.number,
                fen1 = EXCLUDED.fen1,
                fen2 = EXCLUDED.fen2,
                move1 = EXCLUDED.move1,
                move2 = EXCLUDED.move2,
                solution = EXCLUDED.solution,
                type_id = EXCLUDED.type_id,
                color = EXCLUDED.color;
        `);
        console.log('Puzzles inserted successfully');

        // Проверяем количество задач
        const puzzleCount = await client.query('SELECT COUNT(*) FROM Puzzles');
        console.log(`Total puzzles in database: ${puzzleCount.rows[0].count}`);

        console.log('Database initialization completed successfully');
    } catch (err) {
        console.error('Error during database initialization:', err);
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
        // Проверяем существование пользователя
        const userResult = await pool.query(
            'SELECT username, status FROM Users WHERE username = $1',
            [username]
        );

        // Если пользователь не найден, создаем его
        if (userResult.rows.length === 0) {
            console.log(`Creating new user: ${username}`);
            await pool.query(
                `INSERT INTO Users (username, rating, rd, volatility, status) 
                 VALUES ($1, 1500.00, 350.00, 0.06000000, true)`,
                [username]
            );
            return true;
        }

        return userResult.rows[0].status;
    } catch (err) {
        console.error('Error checking user access:', err);
        // В случае ошибки разрешаем доступ в режиме разработки
        return process.env.NODE_ENV === 'development';
    }
}

// Заменяем функцию generatePuzzlesList на getPuzzles
async function getPuzzles() {
    try {
        const result = await pool.query('SELECT * FROM Puzzles');
        console.log(`Found ${result.rows.length} puzzles in database`);
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

// Функция для получения нерешенных задач (обновленная версия)
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
        const puzzles = await pool.query('SELECT * FROM Puzzles');
        console.log(`Total available puzzles: ${puzzles.rows.length}`);
        
        // Возвращаем только те задачи, которые пользователь еще не пытался решить
        const unsolvedPuzzles = puzzles.rows.filter(puzzle => !attemptedFens.includes(puzzle.fen1));
        console.log(`Unsolved puzzles: ${unsolvedPuzzles.length}`);
        
        return unsolvedPuzzles;
    } catch (err) {
        console.error('Error getting unsolved puzzles:', err);
        throw err;
    }
}

// Обновляем функцию findPuzzleForUser
async function findPuzzleForUser(username) {
    try {
        console.log(`Finding puzzle for user: ${username}`);
        
        // Получаем рейтинг пользователя
        const userRating = await getUserRating(username);
        
        // Получаем случайную задачу в пределах ±300 от рейтинга пользователя
        const result = await pool.query(
            `SELECT p.*, t.type as type_name 
            FROM Puzzles p 
            LEFT JOIN Types t ON p.type_id = t.id
            WHERE p.id NOT IN (
                SELECT j.puzzle_id 
                FROM Journal j 
                JOIN Users u ON j.user_id = u.id 
                WHERE u.username = $1
            )
            AND p.rating BETWEEN $2 AND $3
            ORDER BY RANDOM()
            LIMIT 1`,
            [username, userRating.rating - 300, userRating.rating + 300]
        );
        
        if (result.rows.length === 0) {
            // Если не нашли задачу в диапазоне, расширяем диапазон
            const resultWider = await pool.query(
                `SELECT p.*, t.type as type_name 
                FROM Puzzles p 
                LEFT JOIN Types t ON p.type_id = t.id
                WHERE p.id NOT IN (
                    SELECT j.puzzle_id 
                    FROM Journal j 
                    JOIN Users u ON j.user_id = u.id 
                    WHERE u.username = $1
                )
                ORDER BY RANDOM()
                LIMIT 1`,
                [username]
            );
            
            if (resultWider.rows.length === 0) {
                // Если все задачи решены, очищаем только самые старые 50% решений
                await pool.query(`
                    DELETE FROM Journal 
                    WHERE user_id IN (SELECT id FROM Users WHERE username = $1)
                    AND id IN (
                        SELECT id FROM (
                            SELECT id, ROW_NUMBER() OVER (ORDER BY date ASC) as rn,
                            COUNT(*) OVER () as total
                            FROM Journal 
                            WHERE user_id IN (SELECT id FROM Users WHERE username = $1)
                        ) t 
                        WHERE rn <= total/2
                    )`,
                    [username]
                );
                return findPuzzleForUser(username);
            }
            
            return resultWider.rows[0];
        }
        
        console.log('Found puzzle:', result.rows[0]);
        return result.rows[0];
    } catch (err) {
        console.error('Error in findPuzzleForUser:', err);
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
                INSERT INTO Puzzles (fen, move_1, move_2, solution, rating, rd, volatility, type, color, number) VALUES
                ('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', 'h5f7', 'e8f7', 'Good', 1500, 350, 0.06, 'usual', 'w', 0),
                ('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', 'f3e5', 'c6e5', 'Blunder', 1500, 350, 0.06, 'missed', 'b', 0),
                ('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', 'f1c4', 'd7d6', 'Good', 1500, 350, 0.06, 'best', 'w', 0)
            `);
            console.log('Added initial puzzles');
        }
    } catch (err) {
        console.error('Error initializing puzzles:', err);
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

// Функция для получения рейтинга пользователя
async function getUserRating(username) {
    try {
        const result = await pool.query(
            `SELECT rating, rd, volatility 
            FROM Users 
            WHERE username = $1`,
            [username]
        );

        if (result.rows.length === 0) {
            // Если пользователь не найден, возвращаем начальные значения
            return {
                rating: 1500.00,
                rd: 350.00,
                volatility: 0.06000000
            };
        }

        return result.rows[0];
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
        
        return result.rows[0];
    } catch (err) {
        console.error('Error getting puzzle rating:', err);
        throw err;
    }
}

// Функция для получения настроек
async function getSettings() {
    try {
        const result = await pool.query('SELECT id, setting, meaning FROM Settings ORDER BY id');
        if (result.rows.length === 0) {
            // Возвращаем значения по умолчанию, если настройки не найдены
            return {
                'Period, days': 5,
                'Норма решения 1 задачи, секунд': 30,
                'Стандартное отклонение': 100,
                'Время до предварительного хода, секунд': 1,
                'Время анализа 1 линии, секунд': 1
            };
        }
        return result.rows.reduce((acc, row) => {
            acc[row.setting] = row.meaning;
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

        // Получаем id пользователя
        const userResult = await client.query(
            'SELECT id FROM Users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }
        const userId = userResult.rows[0].id;

        // Проверяем, не решал ли пользователь эту задачу раньше
        const existingAttempt = await client.query(
            'SELECT id FROM Journal WHERE user_id = $1 AND puzzle_id = $2',
            [userId, puzzleId]
        );

        if (existingAttempt.rows.length > 0) {
            throw new Error('Эта задача уже была решена');
        }

        // Получаем текущий рейтинг пользователя и задачи
        const userRating = await getUserRating(username);
        const puzzleRating = await getPuzzleRating(puzzleId);
        
        // Рассчитываем новые рейтинги
        const newUserRating = calculateNewRatings(userRating, puzzleRating, success ? 1 : 0);
        const newPuzzleRating = calculateNewRatings(puzzleRating, userRating, success ? 0 : 1);
        
        // Если задача решена успешно, увеличиваем счетчик решений
        if (success) {
            await client.query(
                'UPDATE Puzzles SET number = number + 1 WHERE id = $1',
                [puzzleId]
            );
        }
        
        // Обновляем рейтинг задачи
        await client.query(
            'UPDATE Puzzles SET rating = $1, rd = $2, volatility = $3 WHERE id = $4',
            [newPuzzleRating.userRating, newPuzzleRating.userRD, newPuzzleRating.userVolatility, puzzleId]
        );
        
        // Обновляем рейтинг пользователя
        await client.query(
            'UPDATE Users SET rating = $1, rd = $2, volatility = $3 WHERE id = $4',
            [newUserRating.userRating, newUserRating.userRD, newUserRating.userVolatility, userId]
        );
        
        // Записываем результат в журнал
        const journalResult = await client.query(
            `INSERT INTO Journal 
            (user_id, puzzle_id, success, time, puzzle_rating_before, user_rating_after, complexity_id, date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
                userId,
                puzzleId,
                success,
                time,
                puzzleRating.rating,
                newUserRating.userRating,
                4, // средняя сложность по умолчанию
                // CURRENT_TIMESTAMP добавляется автоматически
            ]
        );

        await client.query('COMMIT');
        return journalResult.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.message === 'Эта задача уже была решена' || err.message === 'User not found') {
            throw err;
        }
        console.error('Error recording solution:', err);
        throw new Error('Ошибка при записи решения');
    } finally {
        client.release();
    }
}

// Добавляем middleware для проверки авторизации
app.use('/api', (req, res, next) => {
    // В режиме разработки пропускаем проверку
    if (process.env.NODE_ENV === 'development') {
        console.log('Development mode: skipping authorization check');
        return next();
    }

    // Для OPTIONS запросов пропускаем проверку
    if (req.method === 'OPTIONS') {
        return next();
    }

    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
        console.log('Authorization failed: missing init data');
        return res.status(401).json({ error: 'Unauthorized - Missing init data' });
    }

    try {
        if (!validateTelegramWebAppData(initData)) {
            console.log('Authorization failed: invalid init data');
            return res.status(401).json({ error: 'Unauthorized - Invalid init data' });
        }

        console.log('Authorization successful');
        next();
    } catch (err) {
        console.error('Error during authorization:', err);
        return res.status(401).json({ 
            error: 'Unauthorized - Invalid init data', 
            details: err.message 
        });
    }
});

// Обновляем API endpoint для получения случайной задачи
app.get('/api/random-puzzle/:username', async (req, res) => {
    try {
        const username = req.params.username;
        console.log(`Getting random puzzle for user: ${username}`);
        
        // Проверяем доступ пользователя
        const hasAccess = await checkUserAccess(username);
        if (!hasAccess) {
            console.log(`Access denied for user: ${username}`);
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Получаем случайную задачу
        const puzzle = await findPuzzleForUser(username);
        if (!puzzle) {
            console.log(`No available puzzles found for user: ${username}`);
            return res.status(404).json({ error: 'No available puzzles found' });
        }
        
        // Форматируем ответ
        const response = {
            id: puzzle.id,
            unique_task: puzzle.unique_task,
            rating: puzzle.rating,
            rd: puzzle.rd,
            volatility: puzzle.volatility,
            fen1: puzzle.fen1,
            fen2: puzzle.fen2,
            move1: puzzle.move1,
            move2: puzzle.move2,
            solution: puzzle.solution,
            type: puzzle.type_name,
            color: puzzle.color
        };
        
        console.log(`Successfully found puzzle for user: ${username}`, response);
        res.json(response);
    } catch (err) {
        console.error('Error in /api/random-puzzle:', err);
        res.status(500).json({ 
            error: err.message,
            details: 'Ошибка при получении задачи'
        });
    }
});

// Обновляем API endpoint для записи решения
app.post('/api/record-solution', async (req, res) => {
    try {
        const { username, puzzleId, success, time } = req.body;
        console.log(`Recording solution for user: ${username}, puzzle: ${puzzleId}, success: ${success}`);
        
        if (!username || !puzzleId || success === undefined || !time) {
            console.log('Missing required parameters:', { username, puzzleId, success, time });
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Проверяем доступ пользователя
        const hasAccess = await checkUserAccess(username);
        if (!hasAccess) {
            console.log(`Access denied for user: ${username}`);
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Получаем задачу
        const puzzleResult = await pool.query(
            'SELECT fen1 FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        
        if (!puzzleResult.rows[0]) {
            console.log(`Puzzle not found: ${puzzleId}`);
            return res.status(404).json({ error: 'Puzzle not found' });
        }

        // Записываем попытку решения
        await pool.query(
            `INSERT INTO PuzzleAttempts (username, puzzle_fen, success) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (username, puzzle_fen) DO UPDATE SET 
             success = $3, 
             attempted_at = CURRENT_TIMESTAMP`,
            [username, puzzleResult.rows[0].fen1, success]
        );
        
        // Записываем результат решения
        const result = await recordPuzzleSolution(username, puzzleId, success, time);
        
        console.log(`Successfully recorded solution for user: ${username}`);
        res.json(result);
    } catch (err) {
        console.error('Error in /api/record-solution:', err);
        res.status(500).json({ 
            error: err.message,
            details: 'Ошибка при записи решения'
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

// Добавляем middleware для проверки авторизации
app.use('/api', (req, res, next) => {
    // В режиме разработки пропускаем проверку
    if (process.env.NODE_ENV === 'development') {
        console.log('Development mode: skipping authorization check');
        return next();
    }

    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
        console.log('Authorization failed: missing init data');
        return res.status(401).json({ error: 'Unauthorized - Missing init data' });
    }

    if (!validateTelegramWebAppData(initData)) {
        console.log('Authorization failed: invalid init data');
        return res.status(401).json({ error: 'Unauthorized - Invalid init data' });
    }

    console.log('Authorization successful');
    next();
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

// Функция проверки данных от Telegram
function validateTelegramWebAppData(telegramInitData) {
    try {
        console.log('Validating Telegram data...');
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash');
        const botToken = process.env.BOT_TOKEN;

        if (!hash || !botToken) {
            console.log('Missing hash or bot token:', { hash: !!hash, botToken: !!botToken });
            return false;
        }

        // Удаляем hash из проверяемых данных
        initData.delete('hash');
        
        // Сортируем оставшиеся поля
        const dataCheckString = Array.from(initData.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        console.log('Data check string:', dataCheckString);

        // Создаем HMAC-SHA256
        const secret = crypto.createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();
        
        const calculatedHash = crypto.createHmac('sha256', secret)
            .update(dataCheckString)
            .digest('hex');

        console.log('Hash comparison:', { 
            received: hash,
            calculated: calculatedHash,
            match: calculatedHash === hash
        });

        return calculatedHash === hash;
    } catch (err) {
        console.error('Error validating Telegram data:', err);
        return false;
    }
}
