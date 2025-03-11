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
    origin: ['https://chess-puzzles-bot.onrender.com', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// Обновляем middleware для логирования запросов
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`, {
        body: req.body,
        query: req.query,
        params: req.params
    });
    next();
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
        sslmode: 'require'
    }
});

// Проверяем подключение при запуске
pool.connect(async (err, client, release) => {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Successfully connected to database');
    await client.query(`
        CREATE TABLE IF NOT EXISTS Journal (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES Users(id),
            puzzle_id INTEGER REFERENCES Puzzles(id),
            success BOOLEAN NOT NULL,
            time NUMERIC(10,3) NOT NULL,
            puzzle_rating_before NUMERIC(12,8),
            puzzle_rd_before NUMERIC(12,8),
            puzzle_volatility_before NUMERIC(8,8),
            user_rating_before NUMERIC(12,8),
            user_rd_before NUMERIC(12,8),
            user_volatility_before NUMERIC(8,8),
            user_rating_after NUMERIC(12,8),
            user_rd_after NUMERIC(12,8),
            user_volatility_after NUMERIC(8,8),
            complexity_id INTEGER REFERENCES Complexity(id),
            date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
    release();
});

// Добавим логирование в API endpoints
app.get('/api/random-puzzle/:username', async (req, res) => {
    try {
        console.log('Getting random puzzle for user:', req.params.username);
        const result = await pool.query(
            'SELECT * FROM Puzzles ORDER BY RANDOM() LIMIT 1'
        );
        console.log('Found puzzle:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting random puzzle:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user-rating/:username', async (req, res) => {
    try {
        console.log('Getting rating for user:', req.params.username);
        const result = await pool.query(
            'SELECT rating, rd, volatility FROM Users WHERE username = $1',
            [req.params.username]
        );
        console.log('Found user rating:', result.rows[0]);
        res.json(result.rows[0] || { rating: 1500, rd: 350, volatility: 0.06 });
    } catch (err) {
        console.error('Error getting user rating:', err);
        res.status(500).json({ error: err.message });
    }
});

// Функция для проверки доступа пользователя
async function checkUserAccess(username) {
    try {
        let result = await pool.query(
            'SELECT username, status FROM Users WHERE username = $1',
            [username]
        );

        // Если пользователь не найден, создаем его
        if (result.rows.length === 0) {
            console.log(`Creating new user: ${username}`);
            result = await pool.query(
                `INSERT INTO Users (username, rating, rd, volatility, status) 
                 VALUES ($1, 1500.00, 350.00, 0.06000000, true)
                 RETURNING username, status`,
                [username]
            );
        }

        return true; // Всегда возвращаем true, пока нет авторизации
    } catch (err) {
        console.error('Error checking user access:', err);
        return true; // Всегда возвращаем true, пока нет авторизации
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
        const userResult = await pool.query(
            'SELECT rating FROM Users WHERE username = $1',
            [username]
        );
        
        const userRating = userResult.rows.length > 0 ? userResult.rows[0].rating : 1500;
        
        // Получаем случайную задачу в пределах ±300 от рейтинга пользователя
        const result = await pool.query(
            `SELECT p.*, t.type as type_name 
            FROM Puzzles p 
            LEFT JOIN Types t ON p.type_id = t.id
            WHERE p.fen1 NOT IN (
                SELECT puzzle_fen 
                FROM PuzzleAttempts 
                WHERE username = $1
            )
            AND p.rating BETWEEN $2 AND $3
            ORDER BY RANDOM()
            LIMIT 1`,
            [username, userRating - 300, userRating + 300]
        );
        
        if (result.rows.length === 0) {
            // Если не нашли задачу в диапазоне, берем любую нерешенную
            const resultWider = await pool.query(
                `SELECT p.*, t.type as type_name 
                FROM Puzzles p 
                LEFT JOIN Types t ON p.type_id = t.id
                WHERE p.fen1 NOT IN (
                    SELECT puzzle_fen 
                    FROM PuzzleAttempts 
                    WHERE username = $1
                )
                ORDER BY RANDOM()
                LIMIT 1`,
                [username]
            );
            
            if (resultWider.rows.length === 0) {
                // Если все задачи решены, очищаем историю попыток
                await pool.query(
                    'DELETE FROM PuzzleAttempts WHERE username = $1',
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
        console.log(`Getting rating for user: ${username}`);
        
        // Проверяем, существует ли пользователь
        let result = await pool.query(
            'SELECT rating, rd, volatility FROM Users WHERE username = $1',
            [username]
        );

        // Если пользователь не найден, создаем его
        if (result.rows.length === 0) {
            console.log(`Creating new user: ${username}`);
            result = await pool.query(
                `INSERT INTO Users (username, rating, rd, volatility, status) 
                 VALUES ($1, 1500.00, 350.00, 0.06000000, true)
                 RETURNING rating, rd, volatility`,
                [username]
            );
        }

        const userRating = result.rows[0];
        console.log(`User rating data:`, userRating);
        
        return {
            rating: parseFloat(userRating.rating),
            rd: parseFloat(userRating.rd),
            volatility: parseFloat(userRating.volatility)
        };
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

        // Получаем или создаем пользователя
        let userResult = await client.query(
            'SELECT id, rating, rd, volatility FROM Users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            userResult = await client.query(
                `INSERT INTO Users (username, rating, rd, volatility, status) 
                 VALUES ($1, 1500.00, 350.00, 0.06000000, true)
                 RETURNING id, rating, rd, volatility`,
                [username]
            );
        }
        
        const userId = userResult.rows[0].id;
        const userRating = userResult.rows[0];

        // Получаем задачу
        const puzzleResult = await client.query(
            'SELECT id, fen1, rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        
        if (puzzleResult.rows.length === 0) {
            throw new Error('Puzzle not found');
        }
        
        const puzzle = puzzleResult.rows[0];

        // Проверяем, не решал ли пользователь эту задачу раньше
        const existingAttempt = await client.query(
            'SELECT id FROM PuzzleAttempts WHERE username = $1 AND puzzle_fen = $2',
            [username, puzzle.fen1]
        );

        if (existingAttempt.rows.length > 0) {
            throw new Error('Эта задача уже была решена');
        }

        // Записываем попытку решения
        await client.query(
            `INSERT INTO PuzzleAttempts (username, puzzle_fen, success) 
             VALUES ($1, $2, $3)`,
            [username, puzzle.fen1, success]
        );

        // Если задача решена успешно, увеличиваем счетчик решений
        if (success) {
            await client.query(
                'UPDATE Puzzles SET number = number + 1 WHERE id = $1',
                [puzzleId]
            );
        }

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
                puzzle.rating,
                userRating.rating,
                4, // средняя сложность по умолчанию
            ]
        );

        await client.query('COMMIT');
        return {
            success: true,
            newRating: userRating.rating,
            ratingChange: 0 // рейтинг пока не меняем
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error recording solution:', err);
        throw err;
    } finally {
        client.release();
    }
}

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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Получаем текущий рейтинг пользователя
        const userResult = await client.query(
            'SELECT id, rating, rd, volatility FROM Users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            throw new Error('User not found');
        }
        
        const userId = userResult.rows[0].id;
        const userRating = {
            rating: parseFloat(userResult.rows[0].rating),
            rd: parseFloat(userResult.rows[0].rd),
            volatility: parseFloat(userResult.rows[0].volatility)
        };

        // Получаем рейтинг задачи
        const puzzleResult = await client.query(
            'SELECT rating, rd, volatility FROM Puzzles WHERE id = $1',
            [puzzleId]
        );
        
        if (puzzleResult.rows.length === 0) {
            throw new Error('Puzzle not found');
        }
        
        const puzzleRating = {
            rating: parseFloat(puzzleResult.rows[0].rating),
            rd: parseFloat(puzzleResult.rows[0].rd),
            volatility: parseFloat(puzzleResult.rows[0].volatility)
        };

        // Преобразуем рейтинги в шкалу Глико-2
        const { mu: userMu, phi: userPhi } = convertToGlicko2Scale(userRating.rating, userRating.rd);
        const { mu: puzzleMu, phi: puzzlePhi } = convertToGlicko2Scale(puzzleRating.rating, puzzleRating.rd);
        
        const opponents = [{
            mu: puzzleMu,
            phi: puzzlePhi,
            s: success ? 1 : 0
        }];
        
        const v = calculateV(opponents, userMu);
        const delta = calculateDelta(opponents, userMu);
        
        const sigma = userRating.volatility;
        const A = findA(sigma, userPhi, v, delta);
        const newVolatility = Math.exp(A/2);
        
        const newPhi = calculateNewPhi(userPhi, newVolatility, v);
        const newMu = calculateNewMu(userMu, newPhi, opponents);
        
        const { rating: finalRating, rd: finalRD } = convertFromGlicko2Scale(newMu, newPhi);

        // Записываем в журнал
        await client.query(
            `INSERT INTO Journal 
            (user_id, puzzle_id, success, time, 
             puzzle_rating_before, puzzle_rd_before, puzzle_volatility_before,
             user_rating_before, user_rd_before, user_volatility_before,
             user_rating_after, user_rd_after, user_volatility_after,
             complexity_id, date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)`,
            [
                userId, puzzleId, success, 0,
                puzzleRating.rating, puzzleRating.rd, puzzleRating.volatility,
                userRating.rating, userRating.rd, userRating.volatility,
                finalRating, Math.min(finalRD, 350), newVolatility,
                4
            ]
        );

        // Обновляем рейтинг пользователя
        await client.query(
            `UPDATE Users 
             SET rating = $1, rd = $2, volatility = $3
             WHERE id = $4`,
            [finalRating, Math.min(finalRD, 350), newVolatility, userId]
        );

        await client.query('COMMIT');

        return {
            rating: finalRating,
            rd: Math.min(finalRD, 350),
            volatility: newVolatility
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating rating:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Исправляем маршрут для записи решения
app.post('/api/record-solution', async (req, res) => {
    try {
        const { username, puzzleId, success, time } = req.body;
        
        console.log('Recording solution:', {
            username,
            puzzleId,
            success,
            time
        });

        // Проверяем входные данные
        if (!username || puzzleId === undefined || success === undefined || time === undefined) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        // Объявляем userId в правильной области видимости
        let userId;

        // Получаем ID пользователя
        const userResult = await pool.query(
            'SELECT id FROM Users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            // Создаем нового пользователя если не существует
            const newUserResult = await pool.query(
                `INSERT INTO Users (username, rating, rd, volatility) 
                 VALUES ($1, 1500, 350, 0.06) 
                 RETURNING id`,
                [username]
            );
            userId = newUserResult.rows[0].id;
        } else {
            userId = userResult.rows[0].id;
        }

        // Записываем решение в журнал
        await pool.query(
            `INSERT INTO Journal 
            (user_id, puzzle_id, success, time, date)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id`, // Добавляем RETURNING для проверки успешности вставки
            [userId, puzzleId, success, time]
        );

        // Обновляем рейтинг пользователя
        const newRating = await updateRating(username, puzzleId, success);

        console.log('Successfully recorded solution and updated rating:', {
            userId,
            puzzleId,
            success,
            time,
            newRating
        });

        res.json({
            success: true,
            newRating: newRating.rating,
            newRD: newRating.rd,
            newVolatility: newRating.volatility
        });

    } catch (err) {
        console.error('Error recording solution:', err);
        res.status(500).json({ 
            error: 'Internal server error',
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Обновляем обработчик ошибок
app.use((err, req, res, next) => {
    console.error('Error handling request:', {
        method: req.method,
        url: req.url,
        error: err.message,
        stack: err.stack
    });
    
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});
