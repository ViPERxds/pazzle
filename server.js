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
        // Удаляем существующие таблицы
        await client.query(`
            DROP TABLE IF EXISTS Journal;
            DROP TABLE IF EXISTS Puzzles;
            DROP TABLE IF EXISTS Users;
            DROP TABLE IF EXISTS Settings;
            DROP TABLE IF EXISTS PuzzleAttempts;
        `);

        // Создаем таблицы заново
        await client.query(`
            CREATE TABLE IF NOT EXISTS Users (
                username VARCHAR(255) PRIMARY KEY
            );
            
            CREATE TABLE IF NOT EXISTS Puzzles (
                id SERIAL PRIMARY KEY,
                rating FLOAT DEFAULT 1500,
                rd FLOAT DEFAULT 350,
                volatility FLOAT DEFAULT 0.06,
                fen TEXT NOT NULL,
                move_1 VARCHAR(10),
                move_2 VARCHAR(10),
                solution VARCHAR(10),
                type VARCHAR(50),
                color CHAR(1),
                difficulty VARCHAR(20)
            );
            
            CREATE TABLE IF NOT EXISTS Journal (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                puzzle_id INT,
                success BOOLEAN,
                time INT,
                rating FLOAT,
                rd FLOAT,
                volatility FLOAT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS Settings (
                parameter_name VARCHAR(50) PRIMARY KEY,
                parameter_value FLOAT
            );

            CREATE TABLE IF NOT EXISTS PuzzleAttempts (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                puzzle_fen TEXT,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN,
                UNIQUE(username, puzzle_fen)
            );
        `);

        // Добавляем тестового пользователя
        await client.query(`
            INSERT INTO Users (username)
            VALUES ('test_user')
            ON CONFLICT (username) DO NOTHING;
        `);

        // Добавляем таблицу SolvedPuzzles
        await client.query(`
            CREATE TABLE IF NOT EXISTS SolvedPuzzles (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255),
                puzzle_fen TEXT,
                solved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(username, puzzle_fen)
            );
        `);

    } catch (err) {
        console.error('Error creating tables:', err);
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
        const result = await pool.query('SELECT * FROM PuzzlesList');
        console.log(`Found ${result.rows.length} puzzles in database`);
        
        if (result.rows.length === 0) {
            console.warn('No puzzles found in PuzzlesList table!');
            // Возвращаем хотя бы одну тестовую задачу
            return [{
                fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
                move_1: 'h5f7',
                move_2: 'e8f7',
                solution: 'Good',
                type: 'tactical'
            }];
        }
        
        // Преобразуем результаты, убирая поле difficulty
        return result.rows.map(puzzle => ({
            fen: puzzle.fen,
            move_1: puzzle.move_1,
            move_2: puzzle.move_2,
            solution: puzzle.solution,
            type: puzzle.type || 'tactical'
        }));
    } catch (err) {
        console.error('Error getting puzzles from database:', err);
        console.error(err.stack);
        // Возвращаем хотя бы одну тестовую задачу в случае ошибки
        return [{
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
            move_1: 'h5f7',
            move_2: 'e8f7',
            solution: 'Good',
            type: 'tactical'
        }];
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
            // Добавляем базовые задачи
            await pool.query(`
                INSERT INTO Puzzles (fen, move_1, move_2, solution, rating, rd, volatility) VALUES
                ('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', 'h5f7', 'e8f7', 'Good', 1500, 350, 0.06),
                ('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', 'f3e5', 'c6e5', 'Blunder', 1500, 350, 0.06),
                ('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', 'f1c4', 'd7d6', 'Good', 1500, 350, 0.06)
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
        
        // Проверяем наличие задач
        const puzzleCount = await pool.query('SELECT COUNT(*) FROM Puzzles');
        if (puzzleCount.rows[0].count === '0') {
            await initializePuzzles();
        }
        
        // Получаем случайную задачу
        const result = await pool.query(
            `SELECT * FROM Puzzles 
            WHERE id NOT IN (
                SELECT puzzle_id FROM Journal WHERE username = $1
            )
            ORDER BY RANDOM() 
            LIMIT 1`,
            [username]
        );
        
        if (result.rows.length === 0) {
            // Если все задачи решены, очищаем историю
            await pool.query('DELETE FROM Journal WHERE username = $1', [username]);
            return findPuzzleForUser(username);
        }
        
        console.log('Found puzzle:', result.rows[0]);
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
        // Получаем последнюю запись рейтинга пользователя
        const result = await pool.query(
            `SELECT rating, rd, volatility 
            FROM Journal 
            WHERE username = $1 
            ORDER BY date DESC 
            LIMIT 1`,
            [username]
        );

        // Если записей нет - инициализируем рейтинг
        if (result.rows.length === 0) {
            return await initializeUserRating(username);
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
    try {
        // Проверяем, не решал ли пользователь эту задачу раньше
        const existingAttempt = await pool.query(
            'SELECT id FROM Journal WHERE username = $1 AND puzzle_id = $2',
            [username, puzzleId]
        );

        if (existingAttempt.rows.length > 0) {
            throw new Error('Эта задача уже была решена');
        }

        // Получаем текущий рейтинг пользователя
        const userRating = await getUserRating(username);
        const puzzleRating = await getPuzzleRating(puzzleId);
        
        // Рассчитываем новый рейтинг
        const newRatings = calculateNewRatings(userRating, puzzleRating, success ? 1 : 0);
        
        // Записываем результат
        const result = await pool.query(
            `INSERT INTO Journal 
            (username, puzzle_id, success, time, rating, rd, volatility)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING rating, rd, volatility`,
            [
                username,
                puzzleId,
                success,
                time,
                newRatings.userRating,
                newRatings.userRD,
                newRatings.userVolatility
            ]
        );

        return result.rows[0];
    } catch (err) {
        if (err.message === 'Эта задача уже была решена') {
            throw err;
        }
        console.error('Error recording solution:', err);
        throw new Error('Ошибка при записи решения');
    }
}

// Функция для расчета новых рейтингов
function calculateNewRatings(userRating, puzzleRating, R) {
    // Константы
    const q = Math.log(10) / 400; // = 0.00575646273
    const c = 34.6;  // Константа для изменения RD со временем
    
    // Шаг 1: Определение отклонения рейтинга (RD)
    const RD = Math.min(Math.sqrt(userRating.rd * userRating.rd + c * c), 350);
    
    // Шаг 2: Определение нового рейтинга
    const g = 1 / Math.sqrt(1 + 3 * q * q * puzzleRating.rd * puzzleRating.rd / (Math.PI * Math.PI));
    const E = 1 / (1 + Math.pow(10, g * (userRating.rating - puzzleRating.rating) / -400));
    const d2 = 1 / (q * q * g * g * E * (1 - E));
    
    // Ограничиваем максимальное изменение рейтинга
    const maxRatingChange = 32;
    const ratingChange = (q / (1 / (RD * RD) + 1 / d2)) * g * (R - E);
    const limitedRatingChange = Math.max(Math.min(ratingChange, maxRatingChange), -maxRatingChange);
    
    // Новый рейтинг с ограничением
    const newRating = userRating.rating + limitedRatingChange;
    
    // Шаг 3: Определение нового отклонения рейтинга
    const newRD = Math.sqrt(1 / (1 / (RD * RD) + 1 / d2));
    
    return {
        userRating: newRating,
        userRD: newRD,
        userVolatility: userRating.volatility // Оставляем волатильность без изменений
    };
}

// API endpoints
app.get('/api/user-rating/:username', async (req, res) => {
    try {
        const result = await getUserRating(req.params.username);
        console.log('Returning user rating:', result);
        res.json(result);
    } catch (err) {
        console.error('Error getting user rating:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/check-access/:username', async (req, res) => {
    try {
        const result = await checkUserAccess(req.params.username);
        res.json({ hasAccess: result });
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
        console.log('Found puzzle:', puzzle);
        
        res.json(puzzle);
    } catch (err) {
        console.error('Error in /api/random-puzzle:', err);
        
        // Более подробная информация об ошибке
        res.status(500).json({ 
            error: err.message,
            stack: err.stack,
            details: 'Ошибка при получении задачи'
        });
    }
});

app.post('/api/record-solution', async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, puzzleId, success, time } = req.body;
        
        await client.query('BEGIN');
        
        // Получаем FEN задачи
        const puzzleResult = await client.query(
            'SELECT fen FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        
        if (!puzzleResult.rows[0]) {
            throw new Error('Puzzle not found');
        }

        // Записываем попытку решения
        await client.query(
            `INSERT INTO PuzzleAttempts (username, puzzle_fen, success) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (username, puzzle_fen) DO UPDATE SET 
             success = $3, 
             attempted_at = CURRENT_TIMESTAMP`,
            [username, puzzleResult.rows[0].fen, success]
        );
        
        // Записываем результат решения
        const result = await recordPuzzleSolution(username, puzzleId, success, time);
        
        await client.query('COMMIT');
        
        res.json(result);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in /api/record-solution:', err);
        res.status(500).json({ 
            error: err.message,
            details: err.stack
        });
    } finally {
        client.release();
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

// Обновляем функцию updateRating для обновления рейтинга и задачи, и пользователя
async function updateRating(username, puzzleId, success) {
    try {
        // Получаем текущий рейтинг пользователя
        const userRating = await getUserRating(username);
        
        // Получаем рейтинг задачи
        const puzzleRating = await getPuzzleRating(puzzleId);
        
        // Преобразуем рейтинги в шкалу Глико-2
        const { mu: userMu, phi: userPhi } = convertToGlicko2Scale(userRating.rating, userRating.rd);
        const { mu: puzzleMu, phi: puzzlePhi } = convertToGlicko2Scale(puzzleRating.rating, puzzleRating.rd);
        
        // Обновляем рейтинг пользователя
        const userOpponents = [{
            mu: puzzleMu,
            phi: puzzlePhi,
            s: success ? 1 : 0
        }];
        
        // Обновляем рейтинг задачи
        const puzzleOpponents = [{
            mu: userMu,
            phi: userPhi,
            s: success ? 0 : 1 // Инвертируем результат для задачи
        }];
        
        // Вычисляем новые значения для пользователя
        const userV = calculateV(userOpponents, userMu);
        const userDelta = calculateDelta(userOpponents, userMu);
        const userA = findA(userRating.volatility, userPhi, userV, userDelta);
        const userNewVolatility = Math.exp(userA/2);
        const userNewPhi = calculateNewPhi(userPhi, userNewVolatility, userV);
        const userNewMu = calculateNewMu(userMu, userNewPhi, userOpponents);
        
        // Вычисляем новые значения для задачи
        const puzzleV = calculateV(puzzleOpponents, puzzleMu);
        const puzzleDelta = calculateDelta(puzzleOpponents, puzzleMu);
        const puzzleA = findA(puzzleRating.volatility, puzzlePhi, puzzleV, puzzleDelta);
        const puzzleNewVolatility = Math.exp(puzzleA/2);
        const puzzleNewPhi = calculateNewPhi(puzzlePhi, puzzleNewVolatility, puzzleV);
        const puzzleNewMu = calculateNewMu(puzzleMu, puzzleNewPhi, puzzleOpponents);
        
        // Преобразуем обратно в обычную шкалу
        const { rating: userFinalRating, rd: userFinalRD } = convertFromGlicko2Scale(userNewMu, userNewPhi);
        const { rating: puzzleFinalRating, rd: puzzleFinalRD } = convertFromGlicko2Scale(puzzleNewMu, puzzleNewPhi);
        
        // Добавляем задачу в список решённых
        await markPuzzleAsSolved(username, puzzleRating.fen);
        
        // Обновляем рейтинг задачи в базе данных
        await pool.query(
            `UPDATE Puzzles 
             SET rating = $1, rd = $2, volatility = $3 
             WHERE id = $4`,
            [
                puzzleFinalRating,
                Math.min(puzzleFinalRD, 350),
                puzzleNewVolatility,
                puzzleId
            ]
        );
        
        // Возвращаем обновленные значения пользователя
        return {
            rating: userFinalRating,
            rd: Math.min(userFinalRD, 350),
            volatility: userNewVolatility
        };
    } catch (err) {
        console.error('Error updating rating:', err);
        throw err;
    }
}
